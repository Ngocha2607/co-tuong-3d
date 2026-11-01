// account.js — the signed-in player: Google sign-in button, nickname, ratings (ordinary and Tam Quốc), the two
// leaderboards and player profiles.
// The Worker does the real work (worker/api.js); this file only talks to it and draws the menus.
'use strict';
const ACCOUNT = (() => {
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const KNAME = ['Thục', 'Ngô', 'Ngụy'], PLACE = ['', 'Nhất', 'Nhì', 'Ba'];
  const SG_REASON = { unite: 'Thống nhất', repetition: 'Lặp thế cờ', quiet: '50 vòng không ăn quân' };
  const REASON = { checkmate: 'Chiếu bí', stalemate: 'Hết nước', repetition: 'Lặp thế cờ', quiet: '60 nước không ăn quân', resign: 'Xin thua', time: 'Hết giờ', abandon: 'Bỏ ván', agreement: 'Thỏa thuận hòa', 'perpetual-check': 'Chiếu dai', 'perpetual-chase': 'Đuổi dai' };
  const sign = n => (n > 0 ? '+' : n < 0 ? '−' : '±') + Math.abs(n);
  let user = null, enabled = false, provisional = 10, toast = () => { };
  const subs = [];
  const emit = () => { render(); for (const f of subs) f(user); };

  async function call(path, body) {
    const r = await fetch(path, body === undefined ? { cache: 'no-store' } : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j.error || 'HTTP ' + r.status), { status: r.status });
    return j;
  }

  // ---------- signing in ----------
  async function init(info, opts = {}) {
    toast = opts.toast || toast;
    enabled = !!(info && info.accounts && info.clientId);
    if (!enabled) return;
    try { user = (await call('api/me')).user; } catch (e) { user = null; }
    emit();
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
    s.onload = () => {
      google.accounts.id.initialize({ client_id: info.clientId, callback: onCredential, auto_select: false, cancel_on_tap_outside: true });
      renderButton();
    };
    s.onerror = () => toast('Không tải được nút đăng nhập Google. Kiểm tra mạng rồi tải lại trang.');
    document.head.appendChild(s);
  }
  function renderButton() {
    if (!window.google || user) return;
    const box = $('#gBtn'); box.innerHTML = '';
    // in the navbar: a small "Đăng nhập" pill, just the G on a phone
    const phone = innerWidth <= 760;
    google.accounts.id.renderButton(box, { theme: 'filled_black', size: 'medium', shape: phone ? 'circle' : 'pill', type: phone ? 'icon' : 'standard', text: 'signin', locale: 'vi' });
  }
  async function onCredential(r) {
    try { user = (await call('auth/google', { credential: r.credential })).user; emit(); toast(`Chào ${user.name}!`); }
    catch (e) { toast('Đăng nhập không thành công, thử lại nhé'); }
  }
  async function logout() {
    try { await call('auth/logout', {}); } catch (e) { }
    user = null;
    if (window.google) google.accounts.id.disableAutoSelect();
    emit(); renderButton();
  }
  async function refresh() {
    if (!enabled) return;
    try { user = (await call('api/me')).user; emit(); } catch (e) { }
  }
  // saves fields of the signed-in player (name, title, hero, stage); throws with the server's message if refused
  async function save(fields) { user = (await call('api/me', fields)).user; emit(); return user; }

  // ---------- the account in the navbar ----------
  // a title (titles.js: the campaign's, an achievement's or a season's), shown with the player's name
  const titleOf = u => (u && TITLES.text(u.title)) || '';
  // the boards are the season's (seasons.js): ten ranked games in it to be on one
  function statLine(u) {
    const n = u.season_games | 0;
    if (n >= provisional) return `${u.rating} điểm · hạng ${u.rank} mùa này · ${n} ván trong mùa`;
    return `${u.rating} điểm · còn ${provisional - n} ván để có tên trên bảng mùa này`;
  }
  function sgLine(u) {
    const n = u.sg_season_games | 0;
    if (n >= provisional) return `Tam Quốc: ${u.sg_rating} điểm · hạng ${u.sg_rank} mùa này · ${n} ván trong mùa`;
    return `Tam Quốc: ${u.sg_rating} điểm · còn ${provisional - n} ván để có tên trên bảng mùa này`;
  }
  function render() {
    $('#acOut').hidden = !!user; $('#acIn').hidden = !user;
    if (!user) return;
    $('#meAv').textContent = user.name.slice(0, 1).toUpperCase();
    $('#meName').textContent = user.name;
    $('#meStat').textContent = (titleOf(user) ? titleOf(user) + ' · ' : '') + statLine(user) + (user.sg_games ? ` · Tam Quốc ${user.sg_rating}` : '');
  }
  function startRename() {
    const f = $('#renameForm');
    f.hidden = false; $('#inName').value = user.name; $('#inName').focus(); $('#inName').select();
  }
  async function saveName(e) {
    e.preventDefault();
    try { user = (await call('api/me', { name: $('#inName').value })).user; $('#renameForm').hidden = true; emit(); toast('Đã đổi tên'); }
    catch (err) { toast(err.status === 400 ? err.message : 'Chưa đổi được tên, thử lại nhé'); }
  }
  $('#bRename').addEventListener('click', startRename);
  $('#renameForm').addEventListener('submit', saveName);
  $('#inName').addEventListener('keydown', e => { if (e.key === 'Escape') $('#renameForm').hidden = true; });
  $('#bLogout').addEventListener('click', logout);

  // ---------- leaderboard and profiles ----------
  // tabs: 0 the ordinary leaderboard, 2 the Tam Quốc one, 1 a profile (one's own unless another player was picked)
  let tab = 0;
  function openRanks(which = 0) { $('#ranks').hidden = false; pastSeason = 0; show(which); }
  function show(which, id) {
    tab = which;
    const mine = !id || (user && id === user.id);
    $('#rkTabs').querySelectorAll('button').forEach(b => b.classList.toggle('on', +b.dataset.v === which && mine));
    $('#rkTabs').querySelector('[data-v="1"]').hidden = !user;
    const body = $('#rkBody');
    body.innerHTML = '<p class="note">Đang tải…</p>';
    (which !== 1 && !id ? board(which === 2) : profile(id || (user && user.id))).then(h => { body.innerHTML = h; }, () => { body.innerHTML = '<p class="note">Không tải được, thử lại sau.</p>'; });
  }
  let pastSeason = 0;                                      // a season before this one, being looked at (0 = this one)
  async function board(sg) {
    const r = await call('api/leaderboard?' + new URLSearchParams({ v: sg ? 'sg' : 'xq', ...(pastSeason ? { season: pastSeason } : {}) }));
    const { top = [], past, provisional: p, season } = r;
    provisional = p;
    const R = u => (sg ? { rating: u.sg_rating, games: u.sg_season_games, wins: u.sg_wins } : { rating: u.rating, games: u.season_games, wins: u.wins });
    const days = Math.max(0, Math.ceil((season.end - Date.now()) / 86400e3));
    let h = `<div class="shead"><b>${esc(season.name)}</b><small>${season.past ? 'Bảng xếp hạng lúc kết thúc mùa' : `Còn ${days} ngày · hết mùa, top 10 nhận danh hiệu và điểm kéo về gần 1200`}</small>`
      + `<span>${season.n > 1 && !season.past ? `<button type="button" class="linkish" data-season="${season.n - 1}">Mùa trước</button>` : ''}${season.past ? `${season.n > 1 ? `<button type="button" class="linkish" data-season="${season.n - 1}">Mùa trước nữa</button>` : ''}<button type="button" class="linkish" data-season="0">Mùa này</button>` : ''}</span></div>`;
    if (past) {
      if (!past.length) return h + '<p class="note">Mùa đó chưa ai có tên trên bảng.</p>';
      return h + `<table class="lb"><thead><tr><th>#</th><th>Kỳ thủ</th><th>Điểm</th><th>Ván</th></tr></thead><tbody>${past.map(u => {
        const t = SEASONS.tierOf(u.rank);
        return `<tr data-id="${u.id}"${user && u.id === user.id ? ' class="me"' : ''}><td>${u.rank}</td><td class="nm">${esc(u.name)}${t ? `<small class="ttl">${esc(SEASONS.title(SEASONS.titleId(season.n, t.tier, sg ? 'sg' : 'xq')))}</small>` : ''}</td><td><b>${u.rating}</b></td><td>${u.games}</td></tr>`;
      }).join('')}</tbody></table>`;
    }
    if (!top.length) h += `<p class="note">Mùa này chưa ai chơi đủ ${p} ván xếp hạng${sg ? ' Tam Quốc' : ''}. Hãy là người đầu tiên có tên trên bảng!</p>`;
    else {
      h += `<table class="lb"><thead><tr><th>#</th><th>Kỳ thủ</th><th>Điểm</th><th>Ván</th><th>${sg ? 'Thống nhất' : 'Thắng'}</th></tr></thead><tbody>`;
      top.forEach((u, i) => {
        const r = R(u);
        h += `<tr data-id="${u.id}"${user && u.id === user.id ? ' class="me"' : ''}><td>${i + 1}</td><td class="nm">${esc(u.name)}${titleOf(u) ? `<small class="ttl">${esc(titleOf(u))}</small>` : ''}</td><td><b>${r.rating}</b></td><td>${r.games}</td><td>${Math.round(100 * r.wins / Math.max(1, sg ? u.sg_games : u.games))}%</td></tr>`;
      });
      h += '</tbody></table>';
    }
    if (user) h += `<p class="note mine">Bạn: ${esc(sg ? sgLine(user) : statLine(user))}</p>`;
    else h += '<p class="note">Đăng nhập Google rồi chơi trận xếp hạng để có tên trên bảng.</p>';
    return h;
  }
  // on someone else's profile: where the two stand as friends, and what can be done about it (friends.js does it)
  const FR = { none: ['ask', 'Kết bạn', 'gold'], asked: ['remove', 'Hủy lời mời kết bạn', ''], incoming: ['accept', 'Đồng ý kết bạn', 'gold'], friends: ['remove', 'Xóa bạn', ''] };
  async function profile(id) {
    const { user: u, games, sg = [], friend, achievements = [], seasons = [] } = await call('api/user/' + id);
    const fr = friend && FR[friend];
    let h = `<div class="phead"><span class="av big">${esc(u.name.slice(0, 1).toUpperCase())}</span><div><h3>${esc(u.name)}</h3>${titleOf(u) ? `<small class="ttl">${esc(titleOf(u))}</small>` : ''}<small>${esc(statLine(u))}</small></div></div>
      ${fr ? `<div class="pacts">${friend === 'friends' ? `<span class="badge">Bạn bè</span><button class="btn primary" type="button" data-fchallenge="${u.id}" data-name="${esc(u.name)}">Thách đấu</button>` : ''}<button class="btn ${fr[2]}" type="button" data-fact="${fr[0]}" data-fid="${u.id}">${fr[1]}</button></div>` : ''}
      <div class="stats"><div><b>${u.games}</b>Ván</div><div><b>${u.wins}</b>Thắng</div><div><b>${u.draws}</b>Hòa</div><div><b>${u.losses}</b>Thua</div></div>
      ${achievements.length ? `<h4>Thành tựu · ${achievements.length}/${ACHIEVEMENTS.LIST.length}</h4><div class="medals small">${achievements.filter(a => ACHIEVEMENTS.has(a.id)).map(a => { const d = ACHIEVEMENTS.byId[a.id]; return `<span class="medal got" title="${esc(d.name)}: ${esc(d.desc)}"><i>${d.han}</i></span>`; }).join('')}</div>` : ''}
      ${seasons.length ? `<h4>Các mùa giải</h4><ul class="slist">${seasons.map(r => `<li><b>${esc(SEASONS.name(r.season))}</b> · ${r.v === 'sg' ? 'Tam Quốc' : 'Cờ tướng'} · hạng ${r.rank} · ${r.rating} điểm${SEASONS.tierOf(r.rank) ? ` <small class="ttl">${esc(SEASONS.title(SEASONS.titleId(r.season, SEASONS.tierOf(r.rank).tier, r.v)))}</small>` : ''}</li>`).join('')}</ul>` : ''}
      <h4>Ván gần đây</h4>`;
    if (!games.length) h += '<p class="note">Chưa có ván xếp hạng nào.</p>';
    else {
      h += '<ul class="glist">';
      for (const g of games) {
        const res = g.result > 0 ? ['win', '勝'] : g.result < 0 ? ['lose', '敗'] : ['draw', '和'];
        h += `<li class="${res[0]}"><span class="r">${res[1]}</span>
          <span class="vs">gặp <a href="#" data-id="${g.opp.id}">${esc(g.opp.name)}</a> <small>${g.opp.rating}</small><br>
          <small>${g.side > 0 ? 'Đỏ' : 'Đen'} · ${REASON[g.reason] || ''} · ${Math.ceil(g.plies / 2)} nước · ${new Date(g.at).toLocaleDateString('vi-VN')}</small>${g.replay ? `<br><button type="button" class="linkish" data-game="${g.id}">Xem lại · phân tích</button>` : ''}</span>
          <span class="d">${sign(g.delta)}<small>${g.rating}</small></span></li>`;
      }
      h += '</ul>';
    }
    // Tam Quốc: its own rating, record and games
    if (u.sg_games || sg.length) {
      h += `<h4>Tam Quốc</h4><p class="note">${esc(sgLine(u))}</p>
        <div class="stats"><div><b>${u.sg_games}</b>Ván</div><div><b>${u.sg_wins}</b>Thống nhất</div><div><b>${u.sg_draws}</b>Hòa</div><div><b>${u.sg_losses}</b>Mất nước</div></div><ul class="glist">`;
      for (const g of sg) {
        const res = g.place === 1 ? (g.others.some(o => o.place === 1) ? ['draw', '和'] : ['win', '勝']) : ['lose', PLACE[g.place] === 'Nhì' ? '二' : '三'];
        h += `<li class="${res[0]}"><span class="r">${res[1]}</span>
          <span class="vs">${KNAME[g.k]} · gặp ${g.others.map(o => `<a href="#" data-id="${o.id}">${esc(o.name)}</a>`).join(', ')}<br>
          <small>Hạng ${PLACE[g.place]} · ${SG_REASON[g.reason] || ''} · ${Math.ceil(g.plies / 3)} vòng · ${new Date(g.at).toLocaleDateString('vi-VN')}</small></span>
          <span class="d">${sign(g.delta)}<small>${g.rating}</small></span></li>`;
      }
      h += '</ul>';
    }
    return h;
  }
  $('#rkTabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) show(+b.dataset.v); });
  // a ranked game to watch again (game.js opens it)
  let replay = () => { }, removeArm = 0;
  const friendOf = b => !!b.closest('.pacts') && !!b.closest('.pacts').querySelector('.badge');   // a friend's profile (its Xóa bạn asks twice)
  $('#rkBody').addEventListener('click', async e => {
    const ss = e.target.closest('[data-season]');
    if (ss) { pastSeason = +ss.dataset.season; show(tab); return; }
    const gm = e.target.closest('[data-game]');
    if (gm) { replay(+gm.dataset.game); return; }
    const fa = e.target.closest('[data-fact]'), fc = e.target.closest('[data-fchallenge]');
    if (fc) { FRIENDS.challenge(+fc.dataset.fchallenge, fc.dataset.name); return; }
    if (fa) {
      // unfriending asks twice
      if (fa.dataset.fact === 'remove' && friendOf(fa) && Date.now() - removeArm > 3000) { removeArm = Date.now(); fa.textContent = 'Chắc chắn xóa?'; return; }
      fa.disabled = true;
      await FRIENDS.act(+fa.dataset.fid, fa.dataset.fact);
      show(tab, +fa.dataset.fid);
      return;
    }
    const t = e.target.closest('[data-id]');
    if (!t) return;
    e.preventDefault();
    const id = +t.dataset.id;
    show(user && id === user.id ? 1 : tab, id);
  });
  $('#bRanksClose').addEventListener('click', () => { $('#ranks').hidden = true; });

  return {
    init, refresh, save, openRanks, esc, sign,
    openProfile(id) { $('#ranks').hidden = false; show(1, id); },
    onChange(f) { subs.push(f); },
    onReplay(f) { replay = f; },
    get user() { return user; },
    get enabled() { return enabled; },
  };
})();
