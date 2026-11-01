// mate.js — an exhaustive forced-mate prover for checking puzzles (test and content tools only, never shipped).
// "Mate" is the xiangqi win: the side to move has no legal move. With strict, only a checkmate counts (a puzzle's
// intended finish); without it a stalemate counts too, which is what the game rules say.
// Each question remembers the positions it has settled (memo), which makes the long puzzles (mate in 4 or 5)
// provable in seconds: the same position comes up again and again by different move orders.
'use strict';
const XQ = require('../src/xiangqi.js');

// moves worth trying first: checks, then captures (only ordering — every move is still searched)
function ordered(pos) {
  const side = pos.turn, scored = pos.legal().map(m => {
    const cap = pos.make(m), check = pos.checked(-side); pos.unmake(m, cap);
    return [m, (check ? 2 : 0) + (cap ? 1 : 0)];
  });
  return scored.sort((a, b) => b[1] - a[1]).map(x => x[0]);
}
// a question may come with a budget: memo.limit moves tried (counted in memo.nodes) before it gives up with OVER
const OVER = new Error('mate.js: over budget');
// does m (by the side to move) force mate within n of its own moves, counting m?
function forces(pos, m, n, strict, memo = new Map()) {
  if (memo.limit && ++memo.nodes > memo.limit) throw OVER;
  const cap = pos.make(m);
  const replies = pos.legal();
  let ok = !replies.length && (!strict || pos.inCheck());
  if (!ok && replies.length && n > 1) {
    ok = true;
    for (const r of replies) {
      const c = pos.make(r), w = mateIn(pos, n - 1, strict, memo);
      pos.unmake(r, c);
      if (!w) { ok = false; break; }
    }
  }
  pos.unmake(m, cap);
  return ok;
}
// can the side to move force mate within n moves?
function mateIn(pos, n, strict, memo = new Map()) {
  const k = `${pos.key()}|${n}|${strict ? 1 : 0}`;
  if (memo.has(k)) return memo.get(k);
  let w = false;
  for (const m of ordered(pos)) if (forces(pos, m, n, strict, memo)) { w = true; break; }
  memo.set(k, w);
  return w;
}
// the shortest forced mate up to max moves (0 if none)
function shortest(pos, max) {
  const memo = new Map();
  for (let n = 1; n <= max; n++) if (mateIn(pos, n, false, memo)) return n;
  return 0;
}
// every first move that forces mate within n
function keys(pos, n, strict, memo = new Map()) { return pos.legal().filter(m => forces(pos, m, n, strict, memo)); }

// is this a position that could arise in a game? (pieces on their own squares, generals apart, the side not to
// move not in check)
function legalSetup(pos) {
  const b = pos.b, row = XQ.row, col = XQ.col;
  let kings = 0;
  for (let s = 0; s < 90; s++) {
    const p = b[s]; if (!p) continue;
    const side = Math.sign(p), t = Math.abs(p), r = row(s), c = col(s), home = side > 0 ? r >= 5 : r <= 4;
    const palace = c >= 3 && c <= 5 && (side > 0 ? r >= 7 : r <= 2);
    if (t === XQ.K) { kings++; if (!palace) return false; }
    if (t === XQ.A && !(palace && (r + c) % 2 === (side > 0 ? 0 : 1))) return false;
    const rr = side > 0 ? 9 - r : r;                       // rows counted from the side's own back rank
    if (t === XQ.B && !(home && rr % 2 === 0 && (rr % 4 === 2 ? c % 4 === 0 : c % 4 === 2))) return false;
    if (t === XQ.P && (side > 0 ? r > 6 || (home && c % 2) : r < 3 || (home && c % 2))) return false;
  }
  if (kings !== 2) return false;
  return !pos.checked(-pos.turn);
}
module.exports = { mateIn, shortest, keys, forces, legalSetup, OVER };
