// daily-ui.js — the daily puzzle's page (Bát Trận Đồ, 八陣圖, a battle formation to break each day): today's position on a small board, the player's streak,
// the time to the next puzzle and the board of the fastest; and the day's attempts, kept in the browser. The puzzle
// is played in game.js like a campaign battle. Signed in, the Worker hands out a ticket the first time the day's
// puzzle is opened (the clock runs from then, through every retry) and replays the solution before it goes on the
// board (worker/api.js); signed out, the streak lives in this browser only.
'use strict';
const DAILY_UI = (() => {
  const $ = s => document.querySelector(s);
  const KEY = 'cotuong_daily';
  let toast = () => { }, onStart = () => { }, online = false, board = null, tick = 0;
  const subs = [];

  // ---------- this browser's record ----------
  // { solved: { [day]: { ms, tries, help } }, day, tries, started, ticket, ticketFor (user id) }: the open day's attempts
  let local = { solved: {} };
  try { const v = JSON.parse(localStorage.getItem(KEY)); if (v && v.solved) local = v; } catch (e) { }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(local)); } catch (e) { } };
  function today() {
    const d = DAILY.dayOf();
    if (local.day !== d) Object.assign(local, { day: d, tries: 0, started: 0, ticket: '', ticketFor: 0 });
    return d;
  }
  const mine = () => local.solved[today()] || null;
  const streak = () => (board && board.me && board.day === today() ? board.me.streak : DAILY.streak(Object.keys(local.solved).map(Number), today()));
  const emit = () => { for (const f of subs) f(); };

  async function call(path, body) {
    const r = await fetch(path, body === undefined ? { cache: 'no-store' } : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j.error || 'HTTP ' + r.status), { status: r.status });
    return j;
  }
  const accounts = () => online && ACCOUNT.enabled;
  async function loadBoard() {
    if (!accounts()) return;
    try { board = await call('api/daily'); } catch (e) { return; }
    // the account remembers what this browser may not (another device): its solve counts here too
    if (board.me && board.me.solved && !local.solved[board.day]) { local.solved[board.day] = { ...board.me.solved }; save(); }
    if (!$('#daily').hidden) render();
    emit();
  }

  // ---------- an attempt ----------
  // the puzzle is about to be played: one more try, the clock started (once a day), a ticket when signed in
  async function begin() {
    const day = today();
    local.tries = (local.tries | 0) + 1;
    if (!local.started) local.started = Date.now();
    const u = ACCOUNT.user;
    if (u && accounts() && (!local.ticket || local.ticketFor !== u.id) && !mine()) {
      try {
        const t = await Promise.race([call('api/daily/start', {}), new Promise((_, no) => setTimeout(() => no(new Error('slow')), 2500))]);
        if (t.day === day) { local.ticket = t.ticket; local.ticketFor = u.id; }
      } catch (e) { }
    }
    save();
    return DAILY.level(day);
  }
  // the puzzle solved (moves from its position): kept here, sent with the ticket; → what to tell the player
  async function solved(lv, moves, help) {
    const first = !local.solved[lv.day], ms = Date.now() - (local.started || Date.now());
    if (first) { local.solved[lv.day] = { ms, tries: local.tries | 0 || 1, help: help ? 1 : 0 }; save(); }
    const res = { first, ...local.solved[lv.day], rank: null, sent: false };
    if (first && local.ticket && ACCOUNT.user && local.ticketFor === ACCOUNT.user.id) {
      try {
        board = await call('api/daily', { ticket: local.ticket, moves, tries: local.tries, help: !!help });
        if (board.me && board.me.solved) Object.assign(res, board.me.solved, { rank: board.me.rank, sent: true });
      } catch (e) { toast(e.status === 410 ? e.message : 'Chưa ghi được lên bảng Bát Trận Đồ'); }
    }
    res.streak = streak();
    emit();
    return res;
  }

  // ---------- the page ----------
  // the position on a small flat board: Red below, the river between, the palaces' diagonals
  function mini(fen) {
    const p = XQ.Pos.fromFen(fen), S = 30, X = c => 20 + c * S, Y = r => 20 + r * S;
    let g = '';
    for (let r = 0; r < 10; r++) g += `<line x1="${X(0)}" y1="${Y(r)}" x2="${X(8)}" y2="${Y(r)}"/>`;
    for (let c = 0; c < 9; c++) {
      if (c === 0 || c === 8) g += `<line x1="${X(c)}" y1="${Y(0)}" x2="${X(c)}" y2="${Y(9)}"/>`;
      else g += `<line x1="${X(c)}" y1="${Y(0)}" x2="${X(c)}" y2="${Y(4)}"/><line x1="${X(c)}" y1="${Y(5)}" x2="${X(c)}" y2="${Y(9)}"/>`;
    }
    for (const [a, b] of [[0, 2], [7, 9]]) g += `<line x1="${X(3)}" y1="${Y(a)}" x2="${X(5)}" y2="${Y(b)}"/><line x1="${X(5)}" y1="${Y(a)}" x2="${X(3)}" y2="${Y(b)}"/>`;
    g += `<text class="river" x="${X(4)}" y="${Y(4.5) + 6}">楚 河　　漢 界</text>`;
    for (let s = 0; s < 90; s++) {
      const pc = p.b[s]; if (!pc) continue;
      const x = X(XQ.col(s)), y = Y(XQ.row(s));
      g += `<g class="${pc > 0 ? 'r' : 'b'}"><circle cx="${x}" cy="${y}" r="13"/><text x="${x}" y="${y + 6}">${XQ.HAN[pc]}</text></g>`;
    }
    return `<svg viewBox="0 0 280 310" role="img" aria-label="Trận đồ hôm nay">${g}</svg>`;
  }
  const clock = DAILY.clock;
  function render() {
    const day = today(), lv = DAILY.level(day), m = mine();
    $('#dyDate').textContent = `${DAILY.dateText(day)} · Trận ${lv.no}`;
    $('#dyBoard').innerHTML = mini(lv.fen);
    $('#dyGoal').textContent = `Chiếu bí trong ${lv.n} nước`;
    $('#dyRank').textContent = DAILY.rank(lv.tier);
    $('#dyStreak').textContent = streak();
    $('#dyMine').textContent = m
      ? `Bạn đã phá trận trong ${clock(m.ms)}${m.tries > 1 ? ` sau ${m.tries} lần thử` : ' ngay lần đầu'}${m.help ? ' (có dùng gợi ý)' : ''}.${board && board.me && board.me.rank ? ` Hạng ${board.me.rank} hôm nay.` : ''}`
      : local.tries ? `Đã thử ${local.tries} lần. Đồng hồ chạy từ lần mở đầu tiên.` : 'Đồng hồ bắt đầu khi bạn bấm Phá trận, và chạy tiếp qua mỗi lần thử lại.';
    $('#bDailyGo').textContent = m ? 'Phá lại để luyện tay' : local.tries ? 'Thử lại' : 'Phá trận';
    renderNext();
    // the fastest today
    const box = $('#dyTop');
    if (!accounts()) { box.innerHTML = `<p class="note">${online ? 'Bảng nhanh nhất cần tài khoản: chưa bật trên máy chủ này.' : 'Đang chơi offline: chuỗi ngày vẫn được giữ trên máy này.'}</p>`; return; }
    if (!board || board.day !== day) { box.innerHTML = '<p class="note">Đang tải…</p>'; return; }
    let h = '';
    if (!board.top.length) h = `<p class="note">Chưa ai phá được trận hôm nay. Hãy là người đầu tiên!</p>`;
    else {
      h = '<table class="lb"><thead><tr><th>#</th><th>Kỳ thủ</th><th>Thời gian</th><th>Lần thử</th></tr></thead><tbody>';
      board.top.forEach((u, i) => {
        const ttl = u.title && CAMPAIGN.TITLES[u.title];
        h += `<tr${ACCOUNT.user && u.id === ACCOUNT.user.id ? ' class="me"' : ''}><td>${i + 1}</td><td class="nm">${ACCOUNT.esc(u.name)}${ttl ? `<small class="ttl">${ACCOUNT.esc(ttl)}</small>` : ''}</td><td><b>${clock(u.ms)}</b></td><td>${u.tries}</td></tr>`;
      });
      h += '</tbody></table>';
    }
    h += `<p class="note mine">${board.solvers ? `${board.solvers} kỳ thủ đã phá trận hôm nay.` : ''}${ACCOUNT.user ? '' : ' Đăng nhập Google để có tên trên bảng và giữ chuỗi ngày khi đổi máy.'}${m && m.help ? ' Lời giải có dùng Đi lại hay Gợi ý không vào bảng nhanh nhất.' : ''}</p>`;
    box.innerHTML = h;
  }
  function renderNext() { $('#dyNext').textContent = `Trận mới sau ${clock(DAILY.untilNext())}`; }
  function open() {
    $('#daily').hidden = false; render(); loadBoard();
    clearInterval(tick);
    tick = setInterval(() => {
      if ($('#daily').hidden) { clearInterval(tick); return; }
      if (local.day !== DAILY.dayOf()) { board = null; render(); loadBoard(); emit(); } else renderNext();
    }, 1000);
  }
  function close() { $('#daily').hidden = true; clearInterval(tick); }

  function init(opts) { toast = opts.toast || toast; onStart = opts.onStart || onStart; emit(); }
  // once the page knows it has the Worker behind it (and whether accounts are on): the board can be fetched
  function setOnline(on) { online = on; loadBoard(); }
  $('#bDailyGo').addEventListener('click', () => { SFX.init(); SFX.pick(); onStart(); });
  $('#bDailyClose').addEventListener('click', close);
  ACCOUNT.onChange(() => { board = null; loadBoard(); });

  return {
    init, setOnline, open, close, begin, solved, streak, render: () => { if (!$('#daily').hidden) render(); },
    get solvedToday() { return !!mine(); },
    onChange(f) { subs.push(f); },
  };
})();
