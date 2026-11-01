// review.js — looking back at a finished game: the games kept on this device, and the computer's verdict on each
// move. Every position of the game is searched (game.js runs the searches in the AI worker, one after another); a
// move is judged by how much of the mover's chance of winning it gave away compared with the best move, and the
// chances are drawn as a chart over the game. This file is the arithmetic, the words and the chart; it is shared
// with the tests (test/review.test.js).
'use strict';
const REVIEW = (() => {
  const X = typeof XQ !== 'undefined' ? XQ : require('./xiangqi.js');
  const MATE = X.MATE, MATED = MATE - 200;
  const isMate = s => Math.abs(s) > MATED;
  // a score (the side to move's view) in points, a mate as far beyond any material
  const cp = s => (isMate(s) ? Math.sign(s) * 2000 : Math.max(-2000, Math.min(2000, s)));
  // chance of winning for a score, 0..100: a chariot up is about 87, a horse up about 70
  const win = s => 50 + 50 * (2 / (1 + Math.exp(-0.0032 * cp(s))) - 1);
  // moves to a mate a score stands for (> 0: the side to move mates, < 0: it is mated)
  const mateIn = s => (isMate(s) ? Math.sign(s) * Math.ceil((MATE - Math.abs(s)) / 2) : 0);

  // ---------- the verdict on each move ----------
  // evals[i]: the search of the position after i moves, { s: score for the side to move, b: its best move,
  // a: the score of the second best (asked for only when the move played was the best) }. A move needs the
  // positions before and after it searched; until then its verdict is null.
  const MARK = {
    blunder: ['??', 'Nước hớ'], mistake: ['?', 'Sai lầm'], inaccuracy: ['?!', 'Chưa chính xác'],
    good: ['!', 'Nước hay'], best: ['', 'Đúng nước máy chọn'], '': ['', ''],
  };
  function verdicts(fen0, moves, evals) {
    const pos = X.Pos.fromFen(fen0), out = [];
    for (let i = 0; i < moves.length; i++) {
      const e = evals[i], f = evals[i + 1], m = moves[i], side = pos.turn;
      if (!e || !f) { out.push(null); pos.make(m); continue; }
      const top = m === e.b, best = win(e.s), played = top ? best : win(-f.s), drop = Math.max(0, best - played);
      let mark = drop >= 20 ? 'blunder' : drop >= 13 ? 'mistake' : drop >= 7 ? 'inaccuracy' : top ? 'best' : '';
      // a good move: the only one that keeps the game where it stands, in a game still to be decided; taking back
      // a piece that was just taken, or a reply when there is hardly another, is no find
      const retake = i > 0 && X.to(m) === X.to(moves[i - 1]) && pos.b[X.to(m)];
      if (top && e.a != null && best - win(e.a) >= 15 && best > 15 && best < 93 && !retake && pos.legal().length > 2) mark = 'good';
      out.push({ side, drop, mark, best: e.b, bestText: e.b ? X.notation(pos, e.b) : '', lost: cp(e.s) - (top ? cp(e.s) : cp(-f.s)), was: e.s, now: top ? e.s : -f.s });
      pos.make(m);
    }
    return out;
  }
  // a side's play in one number, 0..100 (the shape of lichess's accuracy, from the average chance given away)
  function accuracy(vs, side) {
    const mine = vs.filter(v => v && v.side === side);
    if (!mine.length) return null;
    const avg = mine.reduce((n, v) => n + v.drop, 0) / mine.length;
    return Math.max(0, Math.min(100, Math.round(103.1668 * Math.exp(-0.04354 * avg) - 3.1669)));
  }
  const counts = (vs, side) => {
    const c = { blunder: 0, mistake: 0, inaccuracy: 0, good: 0 };
    for (const v of vs) if (v && v.side === side && v.mark in c) c[v.mark]++;
    return c;
  };
  // what a move gave away, in words: a mate missed or allowed, or the material it is worth
  function lossText(v) {
    const before = mateIn(v.was), after = mateIn(v.now);
    if (before > 0 && after <= 0) return `bỏ lỡ đường chiếu bí trong ${before} nước`;
    if (after < 0 && before >= 0) return `để đối phương có đường chiếu bí trong ${-after} nước`;
    if (before > 0 && after > before) return `chiếu bí chậm hơn (${after} nước thay vì ${before})`;
    const l = v.lost;
    return 'mất lợi thế ' + (l >= 500 ? 'cỡ một cỗ Xe' : l >= 230 ? 'cỡ một quân Mã hay Pháo' : l >= 100 ? 'cỡ một Sĩ hay Tượng' : 'vài Tốt');
  }
  // the comment under the board for one move
  function comment(v) {
    if (!v) return '';
    const name = MARK[v.mark][1];
    if (v.mark === 'good') return `${name}: nước duy nhất giữ được thế cờ.`;
    if (v.mark === 'best') return `${name}.`;
    if (!v.mark) return v.bestText ? `Được. Máy chọn ${v.bestText}.` : '';
    return `${name}: ${lossText(v)}. Nên đi ${v.bestText}.`;
  }
  // how a position stands, in words, from the scores: "Đỏ hơn 2,7", "Đen chiếu bí trong 3 nước"
  function standText(s, turn) {
    const red = s * turn, m = mateIn(red);
    if (m) return `${m > 0 ? 'Đỏ' : 'Đen'} chiếu bí trong ${Math.abs(m)} nước`;
    if (Math.abs(red) < 40) return 'Cân bằng';
    return `${red > 0 ? 'Đỏ' : 'Đen'} hơn ${(Math.abs(red) / 100).toFixed(1).replace('.', ',')}`;
  }

  // ---------- the chart ----------
  // Red's chance of winning across the game (Red's share above the middle line, Black's below), what is analysed so
  // far, the blunders and mistakes as dots, and the move being looked at. viewBox 1000 × 100; the page stretches it.
  function chart(fen0, moves, evals, vs, ply) {
    const n = Math.max(1, moves.length), t0 = X.Pos.fromFen(fen0).turn;
    const x = i => ((i / n) * 1000).toFixed(1), y = i => (100 - win(evals[i].s * (i % 2 ? -t0 : t0))).toFixed(1);
    let k = 0; while (k < evals.length && evals[k]) k++;
    let area = '', dots = '';
    if (k) {
      const pts = []; for (let i = 0; i < k; i++) pts.push(`${x(i)},${y(i)}`);
      area = `M0,50 L${pts.join(' L')} L${x(k - 1)},50 Z`;
      vs.forEach((v, i) => {
        // a dot is a line of no length with round ends: it stays round however the chart is stretched
        if (v && (v.mark === 'blunder' || v.mark === 'mistake') && evals[i + 1]) dots += `<line class="dot ${v.mark}" x1="${x(i + 1)}" y1="${y(i + 1)}" x2="${x(i + 1)}" y2="${y(i + 1)}"/>`;
      });
    }
    return `<svg viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true">
      <clipPath id="rvTop"><rect width="1000" height="50"/></clipPath><clipPath id="rvBot"><rect y="50" width="1000" height="50"/></clipPath>
      ${area ? `<path class="red" d="${area}" clip-path="url(#rvTop)"/><path class="black" d="${area}" clip-path="url(#rvBot)"/>` : ''}
      <line class="mid" x1="0" y1="50" x2="1000" y2="50"/>
      <line class="at" x1="${x(ply)}" y1="0" x2="${x(ply)}" y2="100"/>${dots}</svg>`;
  }

  // ---------- games kept on this device ----------
  // newest first: { id, at, kind ('ai' | 'campaign' | 'daily' | 'online' | 'ranked'), title, fen0, moves (comma list),
  // me (the side this device played, 0 watching), names { 1, -1 }, winner, reason, heroes, evals (once analysed) }
  const KEY = 'cotuong_games', MAX = 30;
  const load = () => { try { const v = JSON.parse(localStorage.getItem(KEY)); return Array.isArray(v) ? v : []; } catch (e) { return []; } };
  const store = list => { try { localStorage.setItem(KEY, JSON.stringify(list)); return true; } catch (e) { return false; } };
  function add(g) {
    const list = load(), moves = g.moves.join(','), same = list.findIndex(x => x.fen0 === g.fen0 && x.moves === moves);
    if (same >= 0) return list[same];                       // the same game seen again (a reconnect, a second end screen)
    const e = { ...g, id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), moves };
    list.unshift(e);
    while (list.length > MAX) list.pop();
    while (!store(list) && list.length > 1) list.pop();      // storage full: let the oldest go
    return e;
  }
  const get = id => load().find(x => x.id === id) || null;
  const unpack = g => ({ ...g, moves: g.moves ? String(g.moves).split(',').map(Number) : [] });
  function saveEvals(id, evals) {
    const list = load(), g = list.find(x => x.id === id);
    if (!g) return;
    g.evals = evals.map(e => (e ? [e.s, e.b, e.a == null ? null : e.a] : null));
    store(list);
  }
  const evalsOf = g => (g && Array.isArray(g.evals) ? g.evals.map(e => (e ? { s: e[0], b: e[1], a: e[2] == null ? undefined : e[2] } : null)) : null);
  function remove(id) { store(load().filter(x => x.id !== id)); }

  return { MARK, win, cp, mateIn, verdicts, accuracy, counts, comment, standText, chart, list: load, add, get, unpack, saveEvals, evalsOf, remove };
})();
if (typeof module === 'object' && module.exports) module.exports = REVIEW;
