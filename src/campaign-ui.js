// campaign-ui.js — the campaign's pages: the map of chapters and battles, the briefing before a battle, rewards and
// titles, and the player's progress. Progress lives in the browser; once signed in it is also kept on the server
// (worker/api.js replays each battle won) and follows the player from one device to another.
'use strict';
const CAMPAIGN_UI = (() => {
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const KEY = 'cotuong_campaign';
  const starRow = (n, of = 3) => '★'.repeat(n) + '☆'.repeat(of - n);
  let toast = () => { }, onStart = () => { };
  const subs = [];

  // ---------- progress ----------
  // local: { levels: { [id]: { stars, moves, help } } }, the moves kept so they can be sent once the player signs in
  let local = { levels: {} }, server = null;              // server: { [id]: stars } while signed in
  try { const v = JSON.parse(localStorage.getItem(KEY)); if (v && v.levels) local = v; } catch (e) { }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(local)); } catch (e) { } };
  function progress() {
    const p = {};
    for (const l of CAMPAIGN.LEVELS) {
      const s = Math.max((local.levels[l.id] && local.levels[l.id].stars) | 0, (server && server[l.id]) | 0);
      if (s) p[l.id] = Math.min(3, s);
    }
    return p;
  }
  const unlocked = () => CAMPAIGN.unlocked(progress());
  const emit = () => { const u = unlocked(); for (const f of subs) f(u); if (!$('#campaign').hidden) render(); };

  async function call(path, body) {
    const r = await fetch(path, body === undefined ? { cache: 'no-store' } : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j.error || 'HTTP ' + r.status), { status: r.status });
    return j;
  }
  // signed in: fetch the server's progress and send it what this browser won while signed out (in battle order,
  // since the server only accepts a battle once the one before it is won)
  async function sync(user) {
    if (!user) { server = null; emit(); return; }
    try { server = (await call('api/campaign')).levels; } catch (e) { server = null; emit(); return; }
    for (const l of CAMPAIGN.LEVELS) {
      const e = local.levels[l.id];
      if (!e || !e.moves || (e.stars | 0) <= (server[l.id] | 0)) continue;
      try { server = (await call('api/campaign', { level: l.id, moves: e.moves, help: !!e.help })).levels; } catch (err) { break; }
    }
    emit();
  }
  // a battle finished with a win: keep it, send it, and say what it opened
  async function record(lv, moves, help) {
    const before = unlocked(), r = CAMPAIGN.judge(lv, moves), stars = CAMPAIGN.stars(lv, r, help);
    if (!stars) return { stars: 0, best: progress()[lv.id] | 0, opened: [] };
    const prev = local.levels[lv.id];
    if (!prev || stars > (prev.stars | 0)) { local.levels[lv.id] = { stars, moves: moves.slice(), help: !!help }; save(); }
    if (ACCOUNT.user) {
      try { server = (await call('api/campaign', { level: lv.id, moves, help: !!help })).levels; }
      catch (e) { toast('Chưa lưu được lên tài khoản, lần đăng nhập sau sẽ thử lại'); }
    }
    const after = unlocked(), opened = [];
    for (const h of after.heroes) if (!before.heroes.has(h)) opened.push(`chủ tướng ${HEROES.byId[h].name}`);
    for (const s of after.stages) if (!before.stages.has(s)) opened.push(`bối cảnh ${STAGES.byId[s].name}`);
    for (const t of after.titles) if (!before.titles.includes(t)) opened.push(`danh hiệu "${CAMPAIGN.TITLES[t]}"`);
    emit();
    return { stars, best: progress()[lv.id] | 0, opened };
  }

  // ---------- the map ----------
  function render() {
    const p = progress(), u = unlocked();
    $('#campSum').textContent = `${u.total}/${CAMPAIGN.MAX_STARS} sao · ${u.chapters.size}/${CAMPAIGN.CHAPTERS.length} chương`;
    // rewards: what each chapter and star count gives, ticked when earned
    $('#campRewards').innerHTML = CAMPAIGN.REWARDS.map(r => {
      const got = r.chapter ? u.chapters.has(r.chapter) : u.total >= r.stars;
      const what = [r.hero && `Chủ tướng ${HEROES.byId[r.hero].name}`, r.stage && `Bối cảnh ${STAGES.byId[r.stage].name}`, r.title && `Danh hiệu "${CAMPAIGN.TITLES[r.title]}"`].filter(Boolean).join(' · ');
      const han = r.hero ? HEROES.byId[r.hero].han : r.stage ? STAGES.byId[r.stage].han : '號';
      const when = r.chapter ? `Xong chương ${CAMPAIGN.chapter(r.chapter).name}` : got ? `${r.stars} sao` : `${u.total}/${r.stars} sao`;
      return `<li class="${got ? 'got' : ''}"><span class="hz">${han}</span><span><b>${esc(what)}</b><small>${esc(when)}${got ? ' · đã nhận' : ''}</small></span></li>`;
    }).join('');
    // title: shown on the leaderboard and in ranked games, for signed-in players
    const box = $('#campTitleBox');
    if (ACCOUNT.user && u.titles.length) {
      box.hidden = false;
      const cur = ACCOUNT.user.title || '';
      $('#campTitle').innerHTML = '<option value="">Không hiện danh hiệu</option>' + u.titles.map(t => `<option value="${t}"${t === cur ? ' selected' : ''}>${esc(CAMPAIGN.TITLES[t])}</option>`).join('');
    } else box.hidden = true;
    $('#campTitleNote').textContent = ACCOUNT.user ? (u.titles.length ? '' : 'Hoàn thành một chương để nhận danh hiệu đầu tiên.') : (ACCOUNT.enabled ? 'Đăng nhập Google để giữ tiến độ trên mọi thiết bị và hiện danh hiệu trên bảng xếp hạng.' : '');
    // chapters, each with its three battles
    $('#campMap').innerHTML = CAMPAIGN.CHAPTERS.map((c, i) => {
      const open = c.levels.some(l => u.levels.has(l.id)), done = u.chapters.has(c.id), st = STAGES.byId[c.stage];
      const levels = c.levels.map(l => {
        const can = u.levels.has(l.id), s = p[l.id] | 0, [tname, thz] = CAMPAIGN.TYPE[l.type];
        return `<button type="button" class="lv${can ? '' : ' locked'}${s ? ' won' : ''}" data-id="${l.id}"${can ? '' : ' aria-disabled="true"'}>
          <span class="hz">${can ? thz : '鎖'}</span><span class="lvt"><b>${l.id} · ${esc(l.name)}</b><small>${tname}</small></span>
          <span class="st" aria-label="${s} sao">${can ? starRow(s) : ''}</span></button>`;
      }).join('');
      // a heading where a new part of the campaign begins (the side stories)
      const part = c.part && c.part !== (CAMPAIGN.CHAPTERS[i - 1] || {}).part ? `<h3 class="part">${esc(c.part)}<small>Các trận khó hơn, máy suy nghĩ lâu hơn</small></h3>` : '';
      return `${part}<section class="chap${open ? '' : ' closed'}${done ? ' done' : ''}">
        <div class="chead"><span class="seal">${st ? st.han : '戰'}</span><div><small>Năm ${c.year}${done ? ' · đã hoàn thành' : ''}</small><h3>${esc(c.name)}</h3></div></div>
        <p class="intro">${esc(c.intro)}</p><div class="lvs">${levels}</div></section>`;
    }).join('');
  }
  function open() { render(); $('#campaign').hidden = false; }
  function close() { $('#campaign').hidden = true; $('#brief').hidden = true; }

  // ---------- the briefing ----------
  let briefed = null;
  function brief(id) {
    const lv = CAMPAIGN.level(id), c = CAMPAIGN.chapter(lv.chapter), best = progress()[id] | 0, foe = HEROES.byId[c.foe];
    briefed = id;
    $('#briefHead').textContent = `${c.name} · năm ${c.year}`;
    $('#briefTitle').textContent = `${lv.id} · ${lv.name}`;
    $('#briefType').textContent = CAMPAIGN.TYPE[lv.type][0];
    $('#briefStory').textContent = lv.story;
    $('#briefGoal').textContent = CAMPAIGN.goal(lv);
    $('#briefFoe').textContent = `Đối thủ: ${foe ? foe.name : c.foeName || 'Quân địch'} (máy, ${{ easy: 'dễ', normal: 'vừa', hard: 'mạnh', master: 'rất mạnh', defend: 'phòng thủ chặt' }[lv.ai]})`;
    $('#briefStars').innerHTML = CAMPAIGN.starGoals(lv).map((g, i) => `<li class="${best > i ? 'got' : ''}"><span>${best > i ? '★' : '☆'}</span>${esc(g)}</li>`).join('');
    $('#bBriefGo').textContent = best ? 'Đánh lại' : 'Xuất trận';
    $('#brief').hidden = false;
  }

  $('#campMap').addEventListener('click', e => {
    const b = e.target.closest('.lv'); if (!b) return;
    SFX.init();
    if (b.classList.contains('locked')) { SFX.error(); toast('Thắng trận trước để mở trận này'); return; }
    SFX.pick(); brief(b.dataset.id);
  });
  $('#bBriefGo').addEventListener('click', () => { const id = briefed; close(); onStart(id); });
  $('#bBriefBack').addEventListener('click', () => { $('#brief').hidden = true; });
  $('#bCampClose').addEventListener('click', close);
  $('#campTitle').addEventListener('change', async e => {
    try { await call('api/me', { title: e.target.value }); await ACCOUNT.refresh(); toast(e.target.value ? 'Đã đổi danh hiệu' : 'Đã ẩn danh hiệu'); }
    catch (err) { toast(err.status === 403 ? err.message : 'Chưa đổi được danh hiệu, thử lại nhé'); render(); }
  });

  return {
    progress, unlocked, record, sync, open, close, brief, starRow,
    init(o) { toast = o.toast || toast; onStart = o.onStart || onStart; },
    onChange(f) { subs.push(f); },
  };
})();
