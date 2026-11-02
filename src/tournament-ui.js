// tournament-ui.js — tournaments between friends on the Bạn bè page (worker/tournament.js keeps them, src/bracket.js
// draws the bracket): the player's tournaments and a button to open one; a tournament's page with its players, joining
// and leaving, the host's draw, then the bracket round by round, each match with Vào trận for its two players and Xem
// for everyone else. A link ?giai=ABC123 opens it. While shown it asks again every few seconds.
'use strict';
const TOUR_UI = (() => {
  const $ = s => document.querySelector(s);
  const esc = s => ACCOUNT.esc(s);
  const TC = ['10+5', '5+3'], TC_LABEL = { '10+5': '10′ + 5s', '5+3': '5′ + 3s' };
  const REASON = { bye: 'Miễn đấu', draw: 'Hòa, Đen đi tiếp', checkmate: 'Chiếu bí', resign: 'Xin thua', time: 'Hết giờ', abandon: 'Bỏ trận', noshow: 'Không vào trận', stalemate: 'Hết nước đi', 'perpetual-check': 'Chiếu dai', 'perpetual-chase': 'Đuổi dai' };
  let hooks = { toast() { }, play() { } }, shown = '', data = null, list = null, pollT = 0, making = false, tcPick = 0;

  async function call(path, body) {
    const r = await fetch(path, body === undefined ? { cache: 'no-store' } : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j.error || 'HTTP ' + r.status), { status: r.status });
    return j;
  }
  const link = id => `${location.origin}${location.pathname}?giai=${id}`;
  const me = () => (ACCOUNT.user ? ACCOUNT.user.id : 0);

  // ---------- the list, on the Bạn bè page ----------
  async function loadList() {
    if (!ACCOUNT.user) { list = []; renderList(); return; }
    try { list = (await call('api/tournaments')).list; } catch (e) { list = list || []; }
    renderList();
  }
  function renderList() {
    const box = $('#tourList');
    if (!list) { box.innerHTML = '<li class="empty"><p class="note">Đang tải…</p></li>'; return; }
    const word = t => (t.state === 'open' ? `Đang chờ người · ${t.players}/8` : t.state === 'playing' ? `Đang đấu · ${t.players} người` : `Vô địch: ${esc(t.champion)}`);
    box.innerHTML = list.length ? list.map(t => `<li><span class="av">${t.state === 'done' ? '冠' : '賽'}</span><span class="fi"><b>${esc(t.name)}</b><small>${word(t)}${t.host ? ' · Bạn là chủ giải' : ''}</small></span>`
      + `<span class="fa"><button class="btn" type="button" data-tour="${t.id}">Mở</button></span></li>`).join('')
      : '<li class="empty"><p class="note">Mở một giải cho 3 đến 8 người, gửi link cho bạn bè, rồi bốc thăm đấu loại trực tiếp.</p></li>';
  }

  // ---------- one tournament ----------
  function show(id) {
    shown = id; making = false; data = null;
    $('#friends').classList.add('touring'); $('#tourView').hidden = false;
    render(); load();
    clearInterval(pollT); pollT = setInterval(() => { if ($('#friends').hidden || !shown) clearInterval(pollT); else load(); }, 5000);
  }
  function back() {
    shown = ''; making = false; clearInterval(pollT);
    $('#friends').classList.remove('touring'); $('#tourView').hidden = true;
    if (/[?&]giai=/.test(location.search)) history.replaceState(null, '', location.pathname);
    loadList();
  }
  async function load() {
    const id = shown;
    try { const t = (await call('api/tournament/' + id)).tournament; if (id === shown) { data = t; render(); } }
    catch (e) { if (id === shown) { data = { missing: true }; render(); } }
  }
  async function act(what) {
    try { data = (await call('api/tournament/' + shown, { act: what })).tournament; render(); if (what === 'start') SFX.gong(); }
    catch (e) { hooks.toast(e.status === 401 ? 'Đăng nhập để vào giải' : e.message); }
  }
  function newForm() {
    shown = ''; making = true;
    $('#friends').classList.add('touring'); $('#tourView').hidden = false;
    const name = ACCOUNT.user ? `Giải của ${ACCOUNT.user.name}` : '';
    $('#tourView').innerHTML = `<button class="linkish" type="button" data-tback>‹ Bạn bè</button><h3 class="tname">Mở giải đấu</h3>`
      + `<label class="tfield">Tên giải<input class="search" id="inTourName" type="text" maxlength="40" value="${esc(name)}" autocomplete="off"></label>`
      + `<label class="tfield">Thời gian mỗi ván<div class="seg mini" id="tourTc">${TC.map((t, i) => `<button type="button" data-v="${i}" class="${i === tcPick ? 'on' : ''}">${TC_LABEL[t]}</button>`).join('')}</div></label>`
      + '<p class="note">Đấu loại trực tiếp, mỗi trận một ván. Hòa thì người cầm Đen đi tiếp. Ai không đi nước đầu trong 3 phút là thua trận đó.</p>'
      + '<button class="btn primary wide" type="button" id="bTourMake">Mở giải</button>';
  }
  async function make() {
    try {
      const t = (await call('api/tournaments', { name: $('#inTourName').value, tc: TC[tcPick] })).tournament;
      show(t.id); copy(t.id);
    } catch (e) { hooks.toast(e.status === 401 ? 'Đăng nhập để mở giải' : e.message); }
  }
  function copy(id) {
    const url = link(id);
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => hooks.toast('Đã chép link mời vào giải'), () => hooks.toast(url));
    else hooks.toast(url);
  }

  // the bracket: a column for each round, each match its two players (the winner in gold), how it ended or its buttons
  function bracket(d) {
    const name = i => (i === null ? '<i>…</i>' : esc(d.players[i].name)), you = d.players.findIndex(p => p.id === me());
    return `<div class="bracket">${d.rounds.map((round, r) => `<div class="tround"><h4 class="sub">${BRACKET.roundName(d, r)}</h4>${round.map(m => {
      const row = (i, side) => `<span class="tp${m.winner !== null && m.winner === i ? ' won' : ''}${i !== null && i === you ? ' you' : ''}"><i class="dot ${side}"></i>${m.reason === 'bye' && i === null ? '<i>Miễn đấu</i>' : name(i)}</span>`;
      const mine = m.room && m.winner === null && (m.a === you || m.b === you);
      const foot = m.reason === 'bye' ? '' : m.winner !== null ? `<small>${REASON[m.reason] || 'Đã xong'}</small>`
        : m.room ? `<button class="btn ${mine ? 'primary' : ''}" type="button" data-room="${m.room}">${mine ? 'Vào trận' : 'Xem'}</button>` : '<small>Chờ đối thủ</small>';
      return `<div class="tmatch${mine ? ' mine' : ''}">${row(m.a, 'r')}${row(m.b, 'b')}${foot}</div>`;
    }).join('')}</div>`).join('')}</div>`;
  }
  function render() {
    if (making || !shown) return;
    const v = $('#tourView'), d = data;
    const head = '<button class="linkish" type="button" data-tback>‹ Bạn bè</button>';
    if (!d) { v.innerHTML = head + '<p class="note">Đang tải…</p>'; return; }
    if (d.missing) { v.innerHTML = head + '<p class="note">Không tìm thấy giải đấu này.</p>'; return; }
    const host = d.players.find(p => p.id === d.host), inIt = d.players.some(p => p.id === me()), isHost = d.host === me();
    let h = head + `<h3 class="tname">${esc(d.name)}</h3><p class="note">Chủ giải ${esc(host ? host.name : '')} · ${TC_LABEL[d.tc] || ''} mỗi ván · ${d.players.length} người`
      + ` <button class="linkish" type="button" data-tcopy>Chép link mời</button></p>`;
    if (d.state === 'done') h += `<div class="tchamp"><span class="seal">冠</span><b>${esc(d.players[d.champion].name)}</b><small>Vô địch</small></div>`;
    if (d.state === 'open') {
      h += `<ul class="flist">${d.players.map(p => `<li><span class="av">${esc(p.name.slice(0, 1).toUpperCase())}</span><span class="fi"><b>${esc(p.name)}</b><small>${p.id === d.host ? 'Chủ giải' : 'Đã vào giải'}</small></span></li>`).join('')}</ul>`;
      h += '<div class="row2">';
      if (!ACCOUNT.user) h += '<p class="note">Đăng nhập để vào giải.</p>';
      else if (!inIt) h += `<button class="btn primary" type="button" data-tact="join"${d.players.length >= BRACKET.MAX ? ' disabled' : ''}>Vào giải</button>`;
      else if (!isHost) h += '<button class="btn" type="button" data-tact="leave">Rời giải</button>';
      if (isHost) h += `<button class="btn gold" type="button" data-tact="start"${d.players.length < BRACKET.MIN ? ' disabled' : ''}>Bốc thăm và bắt đầu</button>`;
      h += `</div><p class="note">${d.players.length < BRACKET.MIN ? `Cần ít nhất ${BRACKET.MIN} người (tối đa ${BRACKET.MAX}). ` : ''}Gửi link mời cho bạn bè. Khi chủ giải bốc thăm, mỗi trận có phòng riêng: vào từ trang này.</p>`;
    } else h += bracket(d);
    v.innerHTML = h;
  }
  $('#friends').addEventListener('click', e => {
    const t = e.target;
    const b = t.closest('[data-tour], [data-tback], [data-tact], [data-room], [data-tcopy], #bTourNew, #bTourMake, #tourTc button');
    if (!b) return;
    SFX.init(); SFX.pick();
    if (b.dataset.tour) show(b.dataset.tour);
    else if (b.hasAttribute('data-tback')) back();
    else if (b.dataset.tact) act(b.dataset.tact);
    else if (b.dataset.room) hooks.play(b.dataset.room, data && data.players.some(p => p.id === me()));
    else if (b.hasAttribute('data-tcopy')) copy(shown);
    else if (b.id === 'bTourNew') newForm();
    else if (b.id === 'bTourMake') make();
    else { tcPick = +b.dataset.v; $('#tourTc').querySelectorAll('button').forEach((x, i) => x.classList.toggle('on', i === tcPick)); }
  });

  // news from the Lobby (friends.js): a match ready, the draw, the champion
  function news(m) {
    hooks.toast(m.text || 'Giải đấu có tin mới');
    if (m.id === shown) load(); else if (!$('#friends').hidden) loadList();
  }
  return { init: h => { hooks = { ...hooks, ...h }; }, loadList, show, back, news, get shown() { return shown; } };
})();
