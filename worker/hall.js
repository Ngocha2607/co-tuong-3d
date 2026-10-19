// worker/hall.js — the waiting hall (sảnh chờ) of a friendly room, shared by room.js and sg-room.js. Before the first
// game, and again after each one, the players gather: each picks a general, the host (whoever opened the room) picks
// the battlefield and the time, the others say they are ready, and the host starts the game. Ranked rooms have no hall.
// Kept free of Workers APIs so `npm test` can run it. sides: the room's seat keys ([1, -1] or [0, 1, 2]); st.seats
// holds a token by side, st.host the host's token, st.ready a flag by side; present: connected, by side.
import STAGE_LIST from '../src/stage-list.js';

// the host's side, or null while they hold no seat
export function hostSide(st, sides) {
  const s = sides.find(k => st.host && st.seats[k] === st.host);
  return s === undefined ? null : s;
}
// what still keeps the game from starting ('' = nothing)
export function waitingFor(st, sides, present) {
  if (sides.some(k => !st.seats[k])) return 'Chờ đủ người vào phòng';
  if (sides.some(k => !present[k])) return 'Có người đang mất kết nối';
  const host = hostSide(st, sides);
  if (sides.some(k => k !== host && !st.ready[k])) return 'Chờ mọi người sẵn sàng';
  return '';
}
export const validStage = id => STAGE_LIST.valid(id);
// what the pages are told about the hall (seated: whether each seat is taken; the tokens stay on the server)
export const hallInfo = (st, sides) => ({
  phase: st.phase, host: hostSide(st, sides), ready: st.ready, stage: st.stage, public: st.public !== false,
  seated: Object.fromEntries(sides.map(k => [k, !!st.seats[k]])),
});
// a room saved before the hall existed: a game under way (or over, or ranked) is in play, an empty one waits
export const phaseOf = st => st.phase || (st.rated || st.over || (st.moves && st.moves.length) || (st.hist && st.hist.length) ? 'play' : 'lobby');
// the host walked out of the hall: the next player still there takes the room over (they start out not ready, as hosts
// need no ready). false when nobody is left to take it.
export function handOver(st, sides, present) {
  const host = hostSide(st, sides);
  if (host === null || present[host]) return false;
  const next = sides.find(k => k !== host && st.seats[k] && present[k]);
  if (next === undefined) return false;
  st.host = st.seats[next];
  st.ready = Array.isArray(st.ready) ? st.ready.map((r, k) => (k === next ? false : r)) : { ...st.ready, [next]: false };
  return true;
}
// the host asks a player to leave (from the hall only): the seat is freed and that browser, and that account when
// signed in, may not sit in this room again. false when the request does not stand.
const put = (st, key, k, v) => { st[key] = Array.isArray(st[key]) ? st[key].map((x, i) => (i === k ? v : x)) : { ...st[key], [k]: v }; };
export function kick(st, sides, by, side) {
  const host = hostSide(st, sides);
  if (st.phase !== 'lobby' || st.rated || by !== host || side === host || !sides.includes(side) || !st.seats[side]) return false;
  st.banned = [...(st.banned || []), st.seats[side]];
  if (st.info[side] && st.info[side].id) st.bannedIds = [...(st.bannedIds || []), st.info[side].id];
  put(st, 'seats', side, null); put(st, 'info', side, null); put(st, 'ready', side, false); put(st, 'heroes', side, '');
  return true;
}
export const isBanned = (st, token, user) => (st.banned || []).includes(token) || !!(user && (st.bannedIds || []).includes(user.id));
// a player leaves of their own accord: the seat is freed (they may come back); a host leaving hands the room to the
// next player, preferably one who is here
export function leave(st, sides, side, present) {
  if (!st.seats[side]) return false;
  const wasHost = hostSide(st, sides) === side;
  put(st, 'seats', side, null); put(st, 'info', side, null); put(st, 'ready', side, false); put(st, 'heroes', side, '');
  if (wasHost) {
    let next = sides.find(k => st.seats[k] && present[k]);
    if (next === undefined) next = sides.find(k => st.seats[k]);
    st.host = next === undefined ? '' : st.seats[next];
    if (next !== undefined) put(st, 'ready', next, false);
  }
  return true;
}
// the room as the list of open rooms shows it: v the game ('xq' two players, 'sg' three), count the players here now
// out of max seats, status 'waiting' in the hall (chờ kiện tướng) or 'playing' (đang chiến đấu)
export function listing(st, sides, present, v) {
  const host = hostSide(st, sides);
  return {
    code: st.code, v, max: sides.length,
    count: sides.filter(k => st.seats[k] && present[k]).length, seated: sides.filter(k => st.seats[k]).length,
    status: st.phase === 'lobby' ? 'waiting' : 'playing',
    host: host !== null && st.info[host] ? st.info[host].name : '', stage: st.stage || '',
    tc: st.tc ? `${st.tc.base / 60000}+${st.tc.inc / 1000}` : '',
  };
}
// whether a friendly room shows in the list: public (the host may make it private) and somebody in it
export const listed = (st, l) => !st.rated && st.public !== false && l.count > 0;
