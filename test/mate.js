// mate.js — an exhaustive forced-mate prover for checking puzzles (test and content tools only, never shipped).
// "Mate" is the xiangqi win: the side to move has no legal move. With strict, only a checkmate counts (a puzzle's
// intended finish); without it a stalemate counts too, which is what the game rules say.
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
// does m (by the side to move) force mate within n of its own moves, counting m?
function forces(pos, m, n, strict) {
  const cap = pos.make(m);
  const replies = pos.legal();
  let ok = !replies.length && (!strict || pos.inCheck());
  if (!ok && replies.length && n > 1) {
    ok = true;
    for (const r of replies) {
      const c = pos.make(r), w = mateIn(pos, n - 1, strict);
      pos.unmake(r, c);
      if (!w) { ok = false; break; }
    }
  }
  pos.unmake(m, cap);
  return ok;
}
// can the side to move force mate within n moves?
function mateIn(pos, n, strict) {
  for (const m of ordered(pos)) if (forces(pos, m, n, strict)) return true;
  return false;
}
// the shortest forced mate up to max moves (0 if none)
function shortest(pos, max) {
  for (let n = 1; n <= max; n++) if (mateIn(pos, n)) return n;
  return 0;
}
// every first move that forces mate within n
function keys(pos, n, strict) { return pos.legal().filter(m => forces(pos, m, n, strict)); }

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
module.exports = { mateIn, shortest, keys, forces, legalSetup };
