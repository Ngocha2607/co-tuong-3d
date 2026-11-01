// achievements-ui.js — the player's achievements (achievements.js): kept in the browser, and on the account once
// signed in. Each finished game of cờ tướng is looked over (game.js calls check); a feat earned while signed in is
// sent with its game, which the Worker replays. On signing in, feats earned before are sent with the games kept on
// this device that show them (review.js), and those the Worker's records prove come back. The medals and the title
// to wear are on the Chủ tướng page.
'use strict';
const ACH_UI = (() => {
  const $ = s => document.querySelector(s);
  const esc = s => ACCOUNT.esc(s);
  const KEY = 'cotuong_ach';
  let local = {}, server = null, toast = () => { };       // local: { [id]: when }; server: [{ id, at }] while signed in
  try { const v = JSON.parse(localStorage.getItem(KEY)); if (v && typeof v === 'object') local = v; } catch (e) { }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(local)); } catch (e) { } };
  const earned = () => new Set([...Object.keys(local), ...(server || []).map(a => a.id)].filter(ACHIEVEMENTS.has));

  async function call(path, body) {
    const r = await fetch(path, body === undefined ? { cache: 'no-store' } : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j.error || 'HTTP ' + r.status), { status: r.status });
    return j;
  }
  // the account learns of new ones: its titles may have grown
  function fromServer(list) {
    const before = earned();
    server = list;
    for (const a of list) if (!local[a.id]) local[a.id] = a.at;
    save();
    const fresh = list.map(a => a.id).filter(id => !before.has(id) && ACHIEVEMENTS.has(id));
    if (fresh.some(id => ACHIEVEMENTS.byId[id].title)) ACCOUNT.refresh();
    return fresh;
  }

  // a game just finished ({ fen0, moves, me }): → the achievements it brings for the first time
  function check(game) {
    const ids = ACHIEVEMENTS.fromGame(game), have = earned(), fresh = ids.filter(id => !have.has(id));
    for (const id of ids) if (!local[id]) local[id] = Date.now();
    save();
    if (ACCOUNT.user && ids.length) call('api/achievements', { game }).then(r => {
      fromServer(r.achievements); render();
      // a title among them: the account's titles to wear have grown
      if (ids.some(id => ACHIEVEMENTS.byId[id].title && !(ACCOUNT.user.titles || []).includes('a:' + id))) ACCOUNT.refresh();
    }).catch(() => { });
    if (fresh.length) render();
    return fresh;
  }
  // signing in: the account's, with what this browser earned before (proved by a kept game) and what the records show
  async function sync(user) {
    if (!user) { server = null; render(); return; }
    let r;
    try { r = await call('api/achievements'); } catch (e) { return; }
    const onServer = new Set(r.achievements.map(a => a.id));
    const missing = Object.keys(local).filter(id => ACHIEVEMENTS.has(id) && !onServer.has(id) && !ACHIEVEMENTS.byId[id].server);
    for (const g of missing.length ? REVIEW.list() : []) {
      const u = REVIEW.unpack(g), game = { fen0: u.fen0, moves: u.moves, me: u.me };
      if (!ACHIEVEMENTS.fromGame(game).some(id => missing.includes(id) && !onServer.has(id))) continue;
      try { r = await call('api/achievements', { game }); r.achievements.forEach(a => onServer.add(a.id)); } catch (e) { break; }
    }
    const fresh = fromServer(r.achievements);
    for (const id of fresh) if (ACHIEVEMENTS.byId[id].server) toast(`Thành tựu mới: ${ACHIEVEMENTS.byId[id].name}`);
    render();
  }

  // ---------- the Chủ tướng page: the medals, and the title to wear ----------
  function render() {
    const have = earned();
    $('#achSum').textContent = `${have.size}/${ACHIEVEMENTS.LIST.length}`;
    $('#achGrid').innerHTML = ACHIEVEMENTS.LIST.map(a => {
      const got = have.has(a.id);
      return `<div class="medal${got ? ' got' : ''}"><i>${got ? a.han : '?'}</i><span><b>${esc(a.name)}</b><small>${esc(a.desc)}${a.title ? ` · danh hiệu “${esc(a.title)}”` : ''}</small></span></div>`;
    }).join('');
    // every title the account may wear: the campaign's, the achievements', the seasons'
    const u = ACCOUNT.user, box = $('#achTitleBox');
    const all = u ? [...CAMPAIGN_UI.unlocked().titles, ...(u.titles || [])] : [];
    box.hidden = !u || !all.length;
    if (!box.hidden) $('#achTitle').innerHTML = '<option value="">Không hiện danh hiệu</option>' + all.map(t => `<option value="${esc(t)}"${t === (u.title || '') ? ' selected' : ''}>${esc(TITLES.text(t))}</option>`).join('');
    $('#achNote').textContent = !ACCOUNT.enabled ? 'Thành tựu được giữ trên máy này.'
      : u ? 'Danh hiệu hiện cạnh tên bạn trên bảng xếp hạng và trong các ván online.'
      : 'Thành tựu được giữ trên máy này. Đăng nhập Google để giữ chúng trên mọi thiết bị và đeo danh hiệu cạnh tên.';
  }
  $('#achTitle').addEventListener('change', async e => {
    try { await ACCOUNT.save({ title: e.target.value }); toast('Đã đổi danh hiệu'); }
    catch (err) { toast(err.status === 403 ? err.message : 'Chưa đổi được danh hiệu'); render(); }
  });

  function init(opts) { toast = opts.toast || toast; render(); }
  ACCOUNT.onChange(u => { if (!u) { server = null; } render(); });
  return { init, check, sync, render, get count() { return earned().size; } };
})();
