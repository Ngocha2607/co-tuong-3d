// account.js — the signed-in player: Google sign-in button, nickname, rating, the leaderboard and player profiles.
// The Worker does the real work (worker/api.js); this file only talks to it and draws the menus.
'use strict';
const ACCOUNT = (() => {
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const REASON = { checkmate: 'Chiếu bí', stalemate: 'Hết nước', repetition: 'Lặp thế cờ', quiet: '60 nước không ăn quân', resign: 'Xin thua', time: 'Hết giờ', abandon: 'Bỏ ván' };
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
    $('#account').hidden = !enabled;
    if (!enabled) return;
    try { user = (await call('api/me')).user; } catch (e) { user = null; }
    emit();
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
    s.onload = () => {
      google.accounts.id.initialize({ client_id: info.clientId, callback: onCredential, auto_select: false, cancel_on_tap_outside: true });
      renderButton();
    };
    s.onerror = () => { $('#gNote').textContent = 'Không tải được nút đăng nhập Google. Kiểm tra mạng rồi tải lại trang.'; };
    document.head.appendChild(s);
  }
  function renderButton() {
    if (!window.google || user) return;
    const box = $('#gBtn'); box.innerHTML = '';
    google.accounts.id.renderButton(box, { theme: 'filled_black', size: 'large', shape: 'pill', text: 'signin_with', locale: 'vi', width: 280 });
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

  // ---------- the account box in the menu ----------
  function statLine(u) {
    if (u.games >= provisional) return `${u.rating} điểm · hạng ${u.rank} · ${u.games} ván`;
    return `${u.rating} điểm · còn ${provisional - u.games} ván để có tên trên bảng`;
  }
  function render() {
    $('#acOut').hidden = !!user; $('#acIn').hidden = !user;
    if (!user) return;
    $('#meAv').textContent = user.name.slice(0, 1).toUpperCase();
    $('#meName').textContent = user.name;
    $('#meStat').textContent = statLine(user);
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
  let tab = 0;
  function openRanks(which = 0) { $('#ranks').hidden = false; show(which); }
  function show(which, id) {
    tab = which;
    const mine = !id || (user && id === user.id);
    $('#rkTabs').querySelectorAll('button').forEach(b => b.classList.toggle('on', +b.dataset.v === which && mine));
    $('#rkTabs').querySelector('[data-v="1"]').hidden = !user;
    const body = $('#rkBody');
    body.innerHTML = '<p class="note">Đang tải…</p>';
    (which === 0 && !id ? board() : profile(id || (user && user.id))).then(h => { body.innerHTML = h; }, () => { body.innerHTML = '<p class="note">Không tải được, thử lại sau.</p>'; });
  }
  async function board() {
    const { top, provisional: p } = await call('api/leaderboard');
    provisional = p;
    let h = '';
    if (!top.length) h = `<p class="note">Chưa ai chơi đủ ${p} ván xếp hạng. Hãy là người đầu tiên có tên trên bảng!</p>`;
    else {
      h = '<table class="lb"><thead><tr><th>#</th><th>Kỳ thủ</th><th>Điểm</th><th>Ván</th><th>Thắng</th></tr></thead><tbody>';
      top.forEach((u, i) => {
        h += `<tr data-id="${u.id}"${user && u.id === user.id ? ' class="me"' : ''}><td>${i + 1}</td><td class="nm">${esc(u.name)}</td><td><b>${u.rating}</b></td><td>${u.games}</td><td>${Math.round(100 * u.wins / u.games)}%</td></tr>`;
      });
      h += '</tbody></table>';
    }
    if (user) h += `<p class="note mine">Bạn: ${esc(statLine(user))}</p>`;
    else h += '<p class="note">Đăng nhập Google rồi chơi trận xếp hạng để có tên trên bảng.</p>';
    return h;
  }
  async function profile(id) {
    const { user: u, games } = await call('api/user/' + id);
    let h = `<div class="phead"><span class="av big">${esc(u.name.slice(0, 1).toUpperCase())}</span><div><h3>${esc(u.name)}</h3><small>${esc(statLine(u))}</small></div></div>
      <div class="stats"><div><b>${u.games}</b>Ván</div><div><b>${u.wins}</b>Thắng</div><div><b>${u.draws}</b>Hòa</div><div><b>${u.losses}</b>Thua</div></div>
      <h4>Ván gần đây</h4>`;
    if (!games.length) h += '<p class="note">Chưa có ván xếp hạng nào.</p>';
    else {
      h += '<ul class="glist">';
      for (const g of games) {
        const res = g.result > 0 ? ['win', '勝'] : g.result < 0 ? ['lose', '敗'] : ['draw', '和'];
        h += `<li class="${res[0]}"><span class="r">${res[1]}</span>
          <span class="vs">gặp <a href="#" data-id="${g.opp.id}">${esc(g.opp.name)}</a> <small>${g.opp.rating}</small><br>
          <small>${g.side > 0 ? 'Đỏ' : 'Đen'} · ${REASON[g.reason] || ''} · ${Math.ceil(g.plies / 2)} nước · ${new Date(g.at).toLocaleDateString('vi-VN')}</small></span>
          <span class="d">${sign(g.delta)}<small>${g.rating}</small></span></li>`;
      }
      h += '</ul>';
    }
    return h;
  }
  $('#rkTabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) show(+b.dataset.v); });
  $('#rkBody').addEventListener('click', e => {
    const t = e.target.closest('[data-id]');
    if (!t) return;
    e.preventDefault();
    const id = +t.dataset.id;
    show(user && id === user.id ? 1 : tab, id);
  });
  $('#bRanksClose').addEventListener('click', () => { $('#ranks').hidden = true; });

  return {
    init, refresh, openRanks, esc, sign,
    onChange(f) { subs.push(f); },
    get user() { return user; },
    get enabled() { return enabled; },
  };
})();
