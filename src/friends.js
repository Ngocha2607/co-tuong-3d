// friends.js — friends and challenges. A signed-in page keeps a socket open to the Lobby (worker/lobby.js) saying it is
// here and whether its player is in a game; through it come challenges from friends, the answers to one's own, and
// news of friend requests. The Bạn bè page lists friends (online first) with a Thách đấu button, the requests waiting
// both ways, and finds players by name to ask. Friendship needs a yes from both (worker/api.js); only friends see
// each other online. A challenge accepted puts both into a new private friendly room: game.js opens it (onGo).
'use strict';
const FRIENDS = (() => {
  const $ = s => document.querySelector(s);
  const esc = s => ACCOUNT.esc(s);
  const TC = ['', '10+5', '5+3'], TC_LABEL = { '': 'không giờ', '10+5': '10′ + 5s', '5+3': '5′ + 3s' };
  const STATUS = { online: ['on', 'Đang online'], playing: ['play', 'Đang chơi'], offline: ['', 'Offline'] };
  const tab = Math.random().toString(36).slice(2, 10);    // which of the player's pages this is
  let hooks = { toast() { }, onGo() { }, busy: () => '' }, online = false, ws = null, retryT = 0, tries = 0, status = 'online';
  let data = null, pollT = 0, out = null;                  // out: my challenge waiting { id, to, name, until }
  const incoming = new Map();                             // challenges to me: id → { from, tc, until, armed }
  let tcPick = 0;
  try { tcPick = Math.max(0, TC.indexOf(localStorage.getItem('cotuong_chtc') || '')); } catch (e) { }

  async function call(path, body) {
    const r = await fetch(path, body === undefined ? { cache: 'no-store' } : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j.error || 'HTTP ' + r.status), { status: r.status });
    return j;
  }

  // ---------- the socket ----------
  function connect() {
    clearTimeout(retryT);
    if (!online || !ACCOUNT.user || ws) return;
    const s = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/lobby`);
    ws = s;
    s.onopen = () => { tries = 0; send({ t: 'hi', tab, status }); };
    s.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch (x) { return; } onMsg(m); };
    s.onclose = () => {
      if (ws !== s) return;
      ws = null;
      if (online && ACCOUNT.user) retryT = setTimeout(connect, Math.min(30000, 2000 * 2 ** tries++));
    };
  }
  function disconnect() { clearTimeout(retryT); const s = ws; ws = null; if (s) try { s.close(); } catch (e) { } }
  const send = o => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); };
  function onMsg(m) {
    switch (m.t) {
      case 'friends':
        if (m.why === 'asked') hooks.toast(`${m.name} muốn kết bạn với bạn`);
        else if (m.why === 'accepted') hooks.toast(`${m.name} đã đồng ý kết bạn`);
        load();
        break;
      case 'challenged':
        incoming.set(m.id, { from: m.from, tc: m.tc || '', until: Date.now() + (m.ms || 30000) });
        SFX.init(); SFX.drum();
        renderCards();
        break;
      case 'challenge-sent': if (out && !out.id) out.id = m.id; renderCards(); break;
      case 'challenge-fail':
        hooks.toast(m.why === 'offline' ? 'Người này vừa rời đi, chưa thách đấu được' : 'Chỉ thách đấu được bạn bè');
        out = null; renderCards();
        break;
      case 'declined': hooks.toast(`${m.by} đã từ chối lời thách đấu`); out = null; renderCards(); break;
      case 'challenge-over':
        if (incoming.delete(m.id) && m.withdrawn) hooks.toast('Lời thách đấu đã được rút lại');
        if (out && out.id === m.id) out = null;
        renderCards();
        break;
      case 'go':
        incoming.clear(); out = null; renderCards(); close();
        hooks.onGo(m.room, m.tc || '', !!m.host);
        break;
    }
  }
  // the page's player is in a game, or free (game.js tells, whenever that changes)
  function setStatus(s) { if (s === status) return; status = s; send({ t: 'status', status }); }

  // ---------- challenges ----------
  function challenge(id, name) {
    if (!ws || ws.readyState !== 1) { hooks.toast('Chưa kết nối được máy chủ, thử lại sau giây lát'); return; }
    if (out) { hooks.toast('Đang chờ một lời thách đấu khác'); return; }
    out = { id: '', to: id, name, until: Date.now() + 30000 };
    send({ t: 'challenge', to: id, tc: TC[tcPick] });
    renderCards();
  }
  function withdraw() { if (out && out.id) send({ t: 'unchallenge', id: out.id }); out = null; renderCards(); }
  function answer(id, ok) {
    const c = incoming.get(id);
    if (!c) return;
    if (ok) {
      const why = hooks.busy();                             // e.g. a game under way that accepting would give up
      if (why && !c.armed) { c.armed = true; hooks.toast(why); renderCards(); return; }
    }
    incoming.delete(id); renderCards();
    send({ t: 'answer', id, ok });
  }
  // the cards at the top of the screen: challenges to me (Nhận / Từ chối), and mine while it waits (Hủy)
  // redrawn every second for the countdown: only a card not shown before slides in
  let cardT = 0, shown = new Set();
  function renderCards() {
    const now = Date.now();
    for (const [id, c] of incoming) if (c.until < now) incoming.delete(id);
    if (out && out.until < now) { hooks.toast(`${out.name} chưa trả lời lời thách đấu`); withdraw(); return; }
    const box = $('#challenges');
    let h = '';
    for (const [id, c] of incoming) {
      const s = Math.ceil((c.until - now) / 1000);
      h += `<div class="ch in${shown.has(id) ? '' : ' new'}"><span class="hz">戰</span><span class="ct"><b>${esc(c.from.name)}</b> <small>${c.from.rating || ''}</small> thách đấu bạn<small>Cờ tướng · ${TC_LABEL[c.tc] || 'không giờ'} · còn ${s}s</small></span>`
        + `<button class="btn primary" type="button" data-ch-yes="${id}">${c.armed ? 'Chắc chắn?' : 'Nhận'}</button><button class="btn" type="button" data-ch-no="${id}">Từ chối</button></div>`;
    }
    if (out) {
      const s = Math.ceil((out.until - now) / 1000);
      h += `<div class="ch out${shown.has('out') ? '' : ' new'}"><span class="hz">戰</span><span class="ct">Đang chờ <b>${esc(out.name)}</b> trả lời<small>${TC_LABEL[TC[tcPick]]} · còn ${s}s</small></span><button class="btn" type="button" data-ch-cancel>Hủy</button></div>`;
    }
    box.innerHTML = h; box.hidden = !h;
    shown = new Set([...incoming.keys(), ...(out ? ['out'] : [])]);
    clearTimeout(cardT);
    if (h) cardT = setTimeout(renderCards, 1000);
  }
  $('#challenges').addEventListener('click', e => {
    const y = e.target.closest('[data-ch-yes]'), n = e.target.closest('[data-ch-no]');
    SFX.init();
    if (y) answer(y.dataset.chYes, true);
    else if (n) answer(n.dataset.chNo, false);
    else if (e.target.closest('[data-ch-cancel]')) withdraw();
  });

  // ---------- the Bạn bè page ----------
  async function load() {
    if (!ACCOUNT.user || !online) { data = null; badge(); return; }
    try { data = await call('api/friends'); } catch (e) { return; }
    badge();
    if (!$('#friends').hidden) render();
  }
  function badge() {
    const n = data ? data.incoming.length : 0, b = $('#navFriendsN');
    b.textContent = n; b.hidden = !n;
  }
  const row = (u, acts, sub) => `<li><span class="av">${esc(u.name.slice(0, 1).toUpperCase())}</span><span class="fi"><b>${esc(u.name)}</b><small>${sub}</small></span><span class="fa">${acts}</span></li>`;
  const rating = u => `${u.rating} điểm${u.sg_rating && u.sg_rating !== 1200 ? ` · Tam Quốc ${u.sg_rating}` : ''}`;
  function render() {
    $('#frTc').querySelectorAll('button').forEach((b, i) => b.classList.toggle('on', i === tcPick));
    if (!data) { $('#frList').innerHTML = '<li class="empty"><p class="note">Đang tải…</p></li>'; return; }
    const order = { online: 0, playing: 1, offline: 2 }, list = data.friends.slice().sort((a, b) => order[a.status] - order[b.status]);
    const on = list.filter(f => f.status !== 'offline').length;
    $('#frSum').textContent = list.length ? `${list.length} bạn · ${on} đang online` : 'Chưa có bạn nào';
    $('#frIncoming').innerHTML = data.incoming.length ? `<h4 class="sub">Lời mời kết bạn</h4><ul class="flist">${data.incoming.map(u => row(u,
      `<button class="btn gold" type="button" data-act="accept" data-id="${u.id}">Đồng ý</button><button class="btn" type="button" data-act="decline" data-id="${u.id}">Từ chối</button>`, rating(u))).join('')}</ul>` : '';
    $('#frList').innerHTML = list.length ? list.map(f => {
      const [cls, word] = STATUS[f.status] || STATUS.offline;
      return row(f, `${f.status === 'offline' ? '' : `<button class="btn primary" type="button" data-challenge="${f.id}" data-name="${esc(f.name)}">Thách đấu</button>`}`
        + `<button class="btn" type="button" data-profile="${f.id}">Hồ sơ</button>`, `<i class="fdot ${cls}"></i>${word} · ${rating(f)}`);
    }).join('') : '<li class="empty"><p class="note">Tìm kỳ thủ theo tên ở trên, hoặc mở hồ sơ của ai đó trên bảng xếp hạng để kết bạn. Bạn bè thấy nhau đang online và thách đấu nhau được ngay.</p></li>';
    $('#frOutgoing').innerHTML = data.outgoing.length ? `<h4 class="sub">Đã gửi lời mời</h4><ul class="flist">${data.outgoing.map(u => row(u,
      `<button class="btn" type="button" data-act="remove" data-id="${u.id}">Hủy lời mời</button>`, 'Đang chờ đồng ý')).join('')}</ul>` : '';
  }
  async function find() {
    const q = $('#inFriend').value.trim();
    if (q.length < 2) { $('#frFound').innerHTML = '<p class="note">Gõ ít nhất 2 chữ của tên.</p>'; return; }
    let users = [];
    try { users = (await call('api/users?q=' + encodeURIComponent(q))).users; } catch (e) { $('#frFound').innerHTML = '<p class="note">Không tìm được, thử lại sau.</p>'; return; }
    const known = new Map();
    if (data) { for (const u of data.friends) known.set(u.id, 'friends'); for (const u of data.outgoing) known.set(u.id, 'asked'); for (const u of data.incoming) known.set(u.id, 'incoming'); }
    $('#frFound').innerHTML = users.length ? `<ul class="flist found">${users.map(u => {
      const k = known.get(u.id);
      const act = k === 'friends' ? '<span class="note">Bạn bè</span>' : k === 'asked' ? '<span class="note">Đã gửi lời mời</span>'
        : `<button class="btn gold" type="button" data-act="${k === 'incoming' ? 'accept' : 'ask'}" data-id="${u.id}">${k === 'incoming' ? 'Đồng ý' : 'Kết bạn'}</button>`;
      return row(u, act + `<button class="btn" type="button" data-profile="${u.id}">Hồ sơ</button>`, rating(u));
    }).join('')}</ul>` : '<p class="note">Không có kỳ thủ nào tên như vậy.</p>';
  }
  // asking, accepting, declining, removing (also from a profile, account.js): → the new relation
  async function act(id, what) {
    try {
      const r = await call('api/friends', { to: id, act: what });
      hooks.toast({ ask: 'Đã gửi lời mời kết bạn', accept: 'Đã thành bạn bè', decline: 'Đã từ chối', remove: 'Đã xóa' }[what] || '');
      await load();
      if ($('#inFriend').value.trim().length >= 2 && !$('#friends').hidden) find();
      return r.relation;
    } catch (e) { hooks.toast(e.status === 403 ? e.message : 'Chưa làm được, thử lại sau'); return null; }
  }
  $('#friends').addEventListener('click', e => {
    const a = e.target.closest('[data-act]'), c = e.target.closest('[data-challenge]'), p = e.target.closest('[data-profile]'), t = e.target.closest('#frTc button');
    if (!a && !c && !p && !t) return;
    SFX.init(); SFX.pick();
    if (a) act(+a.dataset.id, a.dataset.act);
    else if (c) challenge(+c.dataset.challenge, c.dataset.name);
    else if (p) { close(); ACCOUNT.openProfile(+p.dataset.profile); }
    else { tcPick = +t.dataset.v; try { localStorage.setItem('cotuong_chtc', TC[tcPick]); } catch (x) { } render(); }
  });
  $('#bFriendFind').addEventListener('click', find);
  $('#inFriend').addEventListener('keydown', e => { if (e.key === 'Enter') find(); });
  $('#bFriendsClose').addEventListener('click', () => close());
  function open() {
    $('#friends').hidden = false; render(); load();
    clearInterval(pollT); pollT = setInterval(() => { if ($('#friends').hidden) clearInterval(pollT); else load(); }, 15000);
  }
  function close() { $('#friends').hidden = true; clearInterval(pollT); }

  // the page knows it has the Worker behind it; signing in and out opens and closes the socket
  function init(h) { hooks = { ...hooks, ...h }; }
  function setOnline(on) { online = on; $('#navFriends').hidden = !(online && ACCOUNT.user); if (online) { connect(); load(); } }
  ACCOUNT.onChange(u => {
    $('#navFriends').hidden = !(u && online);
    if (u && online) { connect(); load(); }
    else { disconnect(); data = null; incoming.clear(); out = null; renderCards(); badge(); close(); }
  });
  return { init, setOnline, setStatus, open, close, act, challenge };
})();
