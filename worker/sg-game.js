// worker/sg-game.js — the rules of a three-kingdom room (sg-room.js), kept free of Workers APIs so `npm test` can run
// them: replaying the game, the clocks, the deadlines and where each kingdom finished.
// A room's history holds moves (numbers, see sanguo.js) and kingdoms leaving the game: { out: k, why } with why
// 'resign', 'time' or 'abandon'. Kingdoms are 0 Shu, 1 Wu, 2 Wei; per-kingdom values are arrays of three.
import SG from '../src/sanguo.js';
import { ABORT_MS, ABANDON_MS } from './clock.js';

export const fresh = () => ({
  seats: [null, null, null], hist: [], over: null, rematch: [false, false, false], game: 1,
  code: '', rated: false, info: [null, null, null],          // info: { id, name, rating?, title } of a signed-in player
  turn: 0, moves: 0,                                         // the kingdom to move, moves played so far
  tc: null, left: null, turnAt: 0, away: [0, 0, 0],          // clocks; when each ranked player lost their connection
  recorded: false, retryAt: 0,
  heroes: ['', '', ''],
  phase: 'lobby', host: '', ready: [false, false, false], stage: '',   // the hall: see hall.js
});

// the game so far: the position, earlier position keys, plies without a capture, kingdoms in the order they fell
export function replay(hist) {
  let pos = SG.Pos.start(), quiet = 0;
  const keys = [], out = [];
  for (const h of hist) {
    let r;
    if (typeof h === 'number') { keys.push(pos.key()); quiet = pos.b[SG.to(h)] ? 0 : quiet + 1; r = SG.play(pos, h); }
    else { out.push(h.out); r = SG.drop(pos, h.out); }
    for (const f of r.falls) out.push(f.k);
    pos = r.pos;
  }
  return { pos, keys, quiet, out };
}
// the game is over? { winner (kingdom, -1 for none), reason, places, out } or null
export function result(g) {
  const s = SG.status(g.pos, g.keys, g.quiet);
  return s.over ? { winner: s.winner, reason: s.reason, places: places(g.pos.alive, g.out), out: g.out } : null;
}
// where each kingdom finished, 1 to 3: those still standing share first place, the fallen come after them, the first
// to fall last
export function places(alive, out) {
  const p = alive.map(a => (a ? 1 : 3));
  out.forEach((k, i) => { p[k] = 3 - i; });
  return p;
}

// ---------- clocks: as in clock.js, they start once every kingdom has made its first move ----------
export const fullClock = tc => (tc ? [tc.base, tc.base, tc.base] : null);
export const running = st => (st.tc && !st.over && st.moves >= 3 ? st.turn : -1);
export function leftNow(st, now) {
  if (!st.tc) return null;
  const l = st.left.slice(), r = running(st);
  if (r >= 0) l[r] = Math.max(0, l[r] - (now - st.turnAt));
  return l;
}
// the kingdom to move has moved: charge its clock. false = its flag fell before the move arrived
export function charge(st, k, now) {
  if (running(st) === k) {
    const l = st.left[k] - (now - st.turnAt);
    if (l <= 0) return false;
    st.left[k] = l + st.tc.inc;
  }
  st.turnAt = now;
  return true;
}
// clocks stopped where they stand now (a kingdom leaves; whoever is to move then starts afresh from here)
export function freeze(st, now) { if (st.tc) st.left = leftNow(st, now); st.turnAt = now; }
// the first thing that will happen if nobody moves: { at, kind: 'time' | 'abort' | 'abandon', side } or null.
// 'abort' ends a ranked game nobody has really started; the other two put the kingdom to move out of the game.
export function deadline(st) {
  if (st.over) return null;
  const k = st.turn, list = [];
  if (running(st) >= 0) list.push({ at: st.turnAt + st.left[k], kind: 'time', side: k });
  if (st.rated && st.moves < 3) list.push({ at: st.turnAt + ABORT_MS, kind: 'abort', side: k });
  if (st.rated && st.away[k]) list.push({ at: Math.max(st.away[k], st.turnAt) + ABANDON_MS, kind: 'abandon', side: k });
  return list.sort((a, b) => a.at - b.at)[0] || null;
}
