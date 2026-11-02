// worker/tournament.js — tournaments between friends, in D1 (migrations/0008_tournaments.sql): a signed-in player opens
// one and shares its link, others join until the host draws the bracket (src/bracket.js). Each match is a room of its
// own, set up like a ranked one (room.js setup: the two players seated by account, the clocks running, no hall) but
// unrated; the room reports the result here, and the next round's rooms open as their players become known.
// Every write raises the row's ver and only lands on the ver it read: two games ending together both count.
import BRACKET from '../src/bracket.js';
import { CONTROLS } from './clock.js';

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newId = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), b => CHARS[b % CHARS.length]).join('');
export const validId = id => typeof id === 'string' && /^[A-Z0-9]{6}$/.test(id);
const MAX_OPEN = 5;                                        // tournaments a player may host at once (not yet finished)

export async function load(db, id) {
  const r = validId(id) ? await db.prepare('SELECT * FROM tournaments WHERE id = ?').bind(id).first() : null;
  return r && { ...r, data: JSON.parse(r.data) };
}
// as the page sees it
export const view = t => ({ id: t.id, name: t.name, host: t.host, tc: t.tc, ...t.data, at: t.created_at });

// change the tournament's data with fn (which returns { error, status } to refuse, false to leave it as it is), and
// write it back on the version it read, reading again if someone wrote meanwhile
async function change(env, id, fn) {
  for (let i = 0; i < 6; i++) {
    const t = await load(env.DB, id);
    if (!t) return { error: 'Không có giải đấu này', status: 404 };
    const r = fn(t.data, t);
    if (r && r.error) return r;
    if (r === false) return { t };
    const res = await env.DB.prepare('UPDATE tournaments SET data = ?, ver = ver + 1, updated_at = ? WHERE id = ? AND ver = ?')
      .bind(JSON.stringify(t.data), Date.now(), id, t.ver).run();
    const n = res && res.meta ? res.meta.changes : res && res.changes;
    if (n) return { t: { ...t, ver: t.ver + 1 }, changed: true };
  }
  return { error: 'Giải đấu đang bận, thử lại', status: 409 };
}

export async function create(env, user, name, tc) {
  if (!CONTROLS[tc]) tc = '10+5';
  const open = await env.DB.prepare(`SELECT COUNT(*) AS n FROM tournaments WHERE host = ? AND json_extract(data, '$.state') != 'done'`).bind(user.id).first();
  if ((open.n | 0) >= MAX_OPEN) return { error: `Bạn đang tổ chức ${MAX_OPEN} giải chưa xong`, status: 403 };
  const id = newId(), now = Date.now(), data = BRACKET.fresh({ id: user.id, name: user.name });
  await env.DB.batch([
    env.DB.prepare('INSERT INTO tournaments (id, name, host, tc, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(id, name, user.id, tc, JSON.stringify(data), now, now),
    env.DB.prepare('INSERT INTO tournament_players (tid, user_id) VALUES (?, ?)').bind(id, user.id),
  ]);
  return { t: await load(env.DB, id) };
}

// join, leave (before the draw; the host can't leave their own) or start (the host, with 3 to 8 players)
export async function act(env, user, id, what) {
  const r = await change(env, id, (d, t) => {
    const i = d.players.findIndex(p => p.id === user.id);
    if (what === 'join') {
      if (i >= 0) return false;
      if (d.state !== 'open') return { error: 'Giải đã bốc thăm, không vào thêm được', status: 409 };
      if (d.players.length >= BRACKET.MAX) return { error: `Giải đã đủ ${BRACKET.MAX} người`, status: 409 };
      d.players.push({ id: user.id, name: user.name });
    } else if (what === 'leave') {
      if (i < 0) return false;
      if (d.state !== 'open') return { error: 'Giải đã bốc thăm', status: 409 };
      if (t.host === user.id) return { error: 'Chủ giải không rời giải được', status: 403 };
      d.players.splice(i, 1);
    } else if (what === 'start') {
      if (t.host !== user.id) return { error: 'Chỉ chủ giải mới bốc thăm được', status: 403 };
      if (d.state !== 'open') return false;
      if (d.players.length < BRACKET.MIN) return { error: `Cần ít nhất ${BRACKET.MIN} người`, status: 409 };
      Object.assign(d, BRACKET.start(d, t.id));
    } else return { error: 'bad request', status: 400 };
  });
  if (r.error || !r.changed) return r;
  if (what === 'join') await env.DB.prepare('INSERT INTO tournament_players (tid, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING').bind(id, user.id).run();
  if (what === 'leave') await env.DB.prepare('DELETE FROM tournament_players WHERE tid = ? AND user_id = ?').bind(id, user.id).run();
  if (what === 'start') await openRooms(env, r.t, true);
  return r;
}

// a room's game is over (room.js): the bracket moves on, and the matches it makes ready get their rooms
export async function report(env, tour, winner, reason) {
  const r = await change(env, tour.id, d => (d.state === 'playing' && BRACKET.report(d, tour.r, tour.s, winner, reason, tour.id) ? true : false));
  if (r.changed) await openRooms(env, r.t, false);
  return !r.error;
}

// set up the room of every match ready to be played (a room that already has its game says so and is left alone),
// and tell its players; at the end, tell everyone who won
async function openRooms(env, t, all) {
  const d = t.data, sent = [];
  for (let r = 0; r < d.rounds.length; r++) for (let s = 0; s < d.rounds[r].length; s++) {
    const m = d.rounds[r][s];
    if (!m.room || m.winner !== null) continue;
    const info = { 1: d.players[m.a], '-1': d.players[m.b] };
    try {
      const res = await env.ROOMS.get(env.ROOMS.idFromName(m.room)).fetch('https://room/setup', { method: 'POST', body: JSON.stringify({ code: m.room, info, tc: t.tc, tour: { id: t.id, r, s, name: t.name } }) });
      if (res.ok) sent.push([m.a, `${BRACKET.roundName(d, r)} của bạn đã sẵn sàng: gặp ${d.players[m.b].name}`], [m.b, `${BRACKET.roundName(d, r)} của bạn đã sẵn sàng: gặp ${d.players[m.a].name}`]);
    } catch (e) { console.error('tournament room not set up', e); }
  }
  if (d.state === 'done') for (let i = 0; i < d.players.length; i++) sent.push([i, `${d.players[d.champion].name} vô địch ${t.name}!`]);
  else if (all) for (let i = 0; i < d.players.length; i++) if (!sent.some(x => x[0] === i)) sent.push([i, `${t.name} đã bốc thăm`]);
  for (const [i, text] of sent) await notify(env, d.players[i].id, { t: 'tour', id: t.id, text });
}
async function notify(env, to, msg) {
  try { await env.LOBBY.get(env.LOBBY.idFromName('lobby')).fetch('https://lobby/notify', { method: 'POST', body: JSON.stringify({ to, msg }) }); } catch (e) { }
}

// the tournaments a player is in, the newest first
export async function mine(env, user) {
  const { results } = await env.DB.prepare(`SELECT t.* FROM tournaments t JOIN tournament_players p ON p.tid = t.id
    WHERE p.user_id = ? ORDER BY t.updated_at DESC LIMIT 20`).bind(user.id).all();
  return results.map(r => { const d = JSON.parse(r.data); return { id: r.id, name: r.name, state: d.state, players: d.players.length, champion: d.champion === null ? null : d.players[d.champion].name, host: r.host === user.id }; });
}
