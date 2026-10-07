// worker/clock.js — time rules of a room, kept free of Workers APIs so `npm test` can run them.
// The clocks start after each side has made its first move (as on most chess servers). Until then a ranked game
// is aborted if the side to move does nothing for ABORT_MS. In a ranked game, a player who is disconnected while it is
// their turn loses after ABANDON_MS. All times are in milliseconds; `st` is the room state (see room.js).
export const ABORT_MS = 30000, ABANDON_MS = 60000;
export const CONTROLS = { '10+5': { base: 600000, inc: 5000 }, '5+3': { base: 300000, inc: 3000 } };
export const RANKED_TC = '10+5';

export const turnOf = st => st.moves.length % 2 ? -1 : 1;
export const running = st => st.tc && !st.over && st.moves.length >= 2 ? turnOf(st) : 0;
export const fullClock = tc => tc ? { 1: tc.base, '-1': tc.base } : null;

export function leftNow(st, now) {
  if (!st.tc) return null;
  const l = { ...st.left }, r = running(st);
  if (r) l[r] = Math.max(0, l[r] - (now - st.turnAt));
  return l;
}

// the side to move has moved: charge its clock. false = its flag fell before the move arrived (the move does not count)
export function charge(st, side, now) {
  if (running(st)) {
    const l = st.left[side] - (now - st.turnAt);
    if (l <= 0) return false;
    st.left[side] = l + st.tc.inc;
  }
  st.turnAt = now;
  return true;
}

// the first thing that will end the game if nobody moves: { at, kind: 'time' | 'abort' | 'abandon', side } or null
export function deadline(st) {
  if (st.over) return null;
  const side = turnOf(st), list = [];
  if (running(st)) list.push({ at: st.turnAt + st.left[side], kind: 'time', side });
  if (st.rated && st.moves.length < 2) list.push({ at: st.turnAt + ABORT_MS, kind: 'abort', side });
  if (st.rated && st.away && st.away[side]) list.push({ at: Math.max(st.away[side], st.turnAt) + ABANDON_MS, kind: 'abandon', side });
  return list.sort((a, b) => a.at - b.at)[0] || null;
}

// the result when deadline `d` passes. canMate(side): whether that side still has a piece that can give mate
export function expire(d, canMate) {
  if (d.kind === 'abort') return { winner: 0, reason: 'aborted' };
  if (d.kind === 'abandon') return { winner: -d.side, reason: 'abandon' };
  return canMate(-d.side) ? { winner: -d.side, reason: 'time' } : { winner: 0, reason: 'time' };
}

// Horse, Chariot, Cannon or Soldier: with only advisors and elephants left nobody can be checkmated
export const canMate = (board, side) => board.some(p => Math.sign(p) === side && Math.abs(p) >= 4);
