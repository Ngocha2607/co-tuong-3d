// worker/api.js — HTTP side of accounts: Google sign-in, the signed-in player (nickname, title, the hero and stage
// they picked), leaderboard, profiles, ranked games to watch again, campaign progress (each battle won is replayed
// here before it is saved) and the daily puzzle's board of the fastest.
// Accounts need three things configured (see README): the D1 database DB, GOOGLE_CLIENT_ID and the SESSION_SECRET
// secret. Without them the site still works, just without sign-in and ranked play.
import { verifyGoogle, makeSession, readSession, cookieOf, setCookie, sign, unsign } from './auth.js';
import { PROVISIONAL } from './elo.js';
import CAMPAIGN from '../src/campaign.js';
import DAILY from '../src/daily.js';
import HEROES from '../src/heroes.js';
import STAGE_LIST from '../src/stage-list.js';
import SKINS from '../src/skins.js';
import ACHIEVEMENTS from '../src/achievements.js';
import SEASONS from '../src/seasons.js';
import { titlesOf as seasonTitlesOf } from './seasons.js';

export const authReady = env => !!(env.DB && env.GOOGLE_CLIENT_ID && env.SESSION_SECRET);
const USER_COLS = 'id, name, rating, games, wins, draws, losses, title, hero, stage, skin, sg_rating, sg_games, sg_wins, sg_draws, sg_losses, season_games, sg_season_games';

const json = (body, init = {}) => Response.json(body, { ...init, headers: { 'cache-control': 'no-store', ...init.headers } });
const fail = (status, error) => json({ error }, { status });

export async function currentUser(req, env) {
  if (!authReady(env)) return null;
  const uid = await readSession(env.SESSION_SECRET, cookieOf(req));
  return uid ? env.DB.prepare(`SELECT ${USER_COLS} FROM users WHERE id = ?`).bind(uid).first() : null;
}

// nicknames: 2–20 letters, digits, spaces and . _ -, starting with a letter or digit
const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{M}\p{N} ._-]{0,18}[\p{L}\p{M}\p{N}.]$/u;
export function cleanName(s) {
  const n = String(s || '').normalize('NFC').replace(/\s+/g, ' ').trim();
  return NAME_RE.test(n) ? n : '';
}
// ranks on this season's boards (seasons.js): those with 10 ranked games in the season
const rankOf = async (env, u) => u.season_games >= PROVISIONAL
  ? (await env.DB.prepare('SELECT COUNT(*) + 1 AS r FROM users WHERE season_games >= 10 AND rating > ?').bind(u.rating).first()).r
  : null;
const sgRankOf = async (env, u) => u.sg_season_games >= PROVISIONAL
  ? (await env.DB.prepare('SELECT COUNT(*) + 1 AS r FROM users WHERE sg_season_games >= 10 AND sg_rating > ?').bind(u.sg_rating).first()).r
  : null;
// a player as the page sees them: both ranks with the rest
const withRanks = async (env, u) => ({ ...u, rank: await rankOf(env, u), sg_rank: await sgRankOf(env, u) });

// state-changing requests must come from our own page (the cookie is SameSite=Lax; this closes the rest)
const sameOrigin = (req, url) => req.headers.get('origin') === url.origin && (req.headers.get('content-type') || '').startsWith('application/json');
const body = async req => { try { return await req.json(); } catch (e) { return {}; } };

// campaign stars of a player: { [battle id]: stars }
async function progressOf(env, uid) {
  const { results } = await env.DB.prepare('SELECT level, stars FROM campaign WHERE user_id = ?').bind(uid).all();
  return Object.fromEntries(results.map(r => [r.level, r.stars]));
}

// ---------- friends (migrations/0005_friends.sql) ----------
const MAX_FRIENDS = 200, MAX_ASKED = 50;
const lobby = env => env.LOBBY.get(env.LOBBY.idFromName('lobby'));
// news for a player's open pages (lobby.js passes it on); nothing is lost if they have none open
async function notify(env, to, msg) {
  try { await lobby(env).fetch('https://lobby/notify', { method: 'POST', body: JSON.stringify({ to, msg }) }); } catch (e) { }
}
// how two players stand: 'friends', 'asked' (a asked b, waiting), 'incoming' (b asked a) or 'none'
async function relation(env, a, b) {
  const { results } = await env.DB.prepare('SELECT user_id, state FROM friends WHERE (user_id = ?1 AND friend_id = ?2) OR (user_id = ?2 AND friend_id = ?1)').bind(a, b).all();
  if (results.some(r => r.state === 1)) return 'friends';
  if (results.some(r => r.user_id === a)) return 'asked';
  if (results.some(r => r.user_id === b)) return 'incoming';
  return 'none';
}

// ---------- achievements (src/achievements.js) ----------
// a player's achievements; those the records now prove (Chân Long Kỳ Trận days in a row, ranked games, rating) are added
async function achievementsOf(env, u) {
  const db = env.DB;
  const { results: days } = await db.prepare('SELECT day FROM daily WHERE user_id = ? ORDER BY day').bind(u.id).all();
  let run = 0, best = 0;
  days.forEach((d, i) => { run = i && d.day === days[i - 1].day + 1 ? run + 1 : 1; best = Math.max(best, run); });
  const proven = ACHIEVEMENTS.fromRecords(u, best), now = Date.now();
  if (proven.length) await db.batch(proven.map(id => db.prepare('INSERT OR IGNORE INTO achievements (user_id, id, at) VALUES (?, ?, ?)').bind(u.id, id, now)));
  return (await db.prepare('SELECT id, at FROM achievements WHERE user_id = ? ORDER BY at').bind(u.id).all()).results;
}
// the titles a player may wear besides the campaign's: from achievements ('a:<id>') and season finishes ('s:...')
async function titlesBeyond(env, u) {
  const ach = (await achievementsOf(env, u)).filter(a => ACHIEVEMENTS.has(a.id) && ACHIEVEMENTS.byId[a.id].title).map(a => 'a:' + a.id);
  return [...ach, ...await seasonTitlesOf(env.DB, u.id)];
}

// a day's daily puzzle: the 20 fastest (without undo or hints), how many solved it, and the player's own result,
// rank and streak
async function dailyBoard(env, day, user) {
  const db = env.DB;
  const { results: top } = await db.prepare(`SELECT d.user_id AS id, u.name, u.title, d.ms, d.tries FROM daily d JOIN users u ON u.id = d.user_id
    WHERE d.day = ? AND d.help = 0 ORDER BY d.ms, d.solved_at LIMIT 20`).bind(day).all();
  const solvers = (await db.prepare('SELECT COUNT(*) AS n FROM daily WHERE day = ?').bind(day).first()).n;
  let me = null;
  if (user) {
    const mine = await db.prepare('SELECT ms, tries, help FROM daily WHERE user_id = ? AND day = ?').bind(user.id, day).first();
    const { results: days } = await db.prepare('SELECT day FROM daily WHERE user_id = ? AND day <= ? ORDER BY day DESC LIMIT 400').bind(user.id, day).all();
    const rank = mine && !mine.help ? (await db.prepare('SELECT COUNT(*) + 1 AS r FROM daily WHERE day = ? AND help = 0 AND ms < ?').bind(day, mine.ms).first()).r : null;
    me = { solved: mine || null, rank, streak: DAILY.streak(days.map(d => d.day), day), days: days.length };
  }
  return { day, top, solvers, me };
}

export async function api(req, env, url) {
  const p = url.pathname, post = req.method === 'POST';
  if (!authReady(env)) return fail(503, 'accounts are not configured');
  if (post && !sameOrigin(req, url)) return fail(403, 'cross-site request');
  const secure = url.protocol === 'https:';

  if (p === '/auth/google' && post) {
    let claims;
    try { claims = await verifyGoogle((await body(req)).credential, env.GOOGLE_CLIENT_ID); }
    catch (e) { return fail(401, 'invalid Google sign-in'); }
    const now = Date.now();
    let user = await env.DB.prepare(`UPDATE users SET seen_at = ? WHERE google_sub = ? RETURNING ${USER_COLS}`).bind(now, claims.sub).first();
    if (!user) {
      const name = cleanName(claims.given_name) || cleanName(String(claims.name || '').split(' ').pop()) || 'Kỳ thủ';
      user = await env.DB.prepare(`INSERT INTO users (google_sub, name, created_at, seen_at) VALUES (?, ?, ?, ?)
        ON CONFLICT (google_sub) DO UPDATE SET seen_at = excluded.seen_at RETURNING ${USER_COLS}`).bind(claims.sub, name, now, now).first();
    }
    return json({ user: await withRanks(env, user) }, { headers: { 'set-cookie': setCookie(await makeSession(env.SESSION_SECRET, user.id), secure) } });
  }
  if (p === '/auth/logout' && post) return json({ ok: true }, { headers: { 'set-cookie': setCookie('', secure, 0) } });

  if (p === '/api/me') {
    const user = await currentUser(req, env);
    if (!post) return json({ user: user && { ...await withRanks(env, user), titles: await titlesBeyond(env, user) } });
    if (!user) return fail(401, 'not signed in');
    const b = await body(req), next = { ...user };
    let won = null;                                            // what the campaign has given this player, when needed
    const earned = async () => won || (won = CAMPAIGN.unlocked(await progressOf(env, user.id)));
    if ('name' in b) {
      next.name = cleanName(b.name);
      if (!next.name) return fail(400, 'Tên dài 2–20 ký tự, chỉ gồm chữ, số, dấu cách và . _ -');
    }
    if ('title' in b) {                                        // '' takes the title off
      next.title = typeof b.title === 'string' ? b.title : '';
      if (next.title && !(await earned()).titles.includes(next.title) && !(await titlesBeyond(env, user)).includes(next.title)) return fail(403, 'Danh hiệu này chưa đạt được');
    }
    if ('hero' in b) {                                         // '' = the plain general
      if (b.hero !== '' && !HEROES.valid(b.hero)) return fail(400, 'no such hero');
      if (b.hero && HEROES.byId[b.hero].campaign && !(await earned()).heroes.has(b.hero)) return fail(403, 'Chủ tướng này chưa mở khóa');
      next.hero = b.hero;
    }
    if ('stage' in b) {
      if (!STAGE_LIST.valid(b.stage)) return fail(400, 'no such stage');
      if (STAGE_LIST.byId[b.stage].campaign && !(await earned()).stages.has(b.stage)) return fail(403, 'Bối cảnh này chưa mở khóa');
      next.stage = b.stage;
    }
    if ('skin' in b) {                                         // 'board/pieces/army' (skins.js)
      const s = SKINS.unpack(b.skin);
      if (SKINS.pack(s) !== b.skin) return fail(400, 'no such look');
      const rec = { stars: (await earned()).total, ach: new Set((await achievementsOf(env, user)).map(a => a.id)), season: (await seasonTitlesOf(env.DB, user.id)).length > 0 };
      if (SKINS.NAMES.some(k => !SKINS.earned(k, s[k], rec))) return fail(403, 'Trang phục này chưa mở khóa');
      next.skin = b.skin;
    }
    await env.DB.prepare('UPDATE users SET name = ?, title = ?, hero = ?, stage = ?, skin = ? WHERE id = ?').bind(next.name, next.title, next.hero, next.stage, next.skin ?? null, user.id).run();
    return json({ user: { ...await withRanks(env, next), titles: await titlesBeyond(env, next) } });
  }
  if (p === '/api/campaign') {
    const user = await currentUser(req, env);
    if (!user) return fail(401, 'not signed in');
    const progress = await progressOf(env, user.id);
    if (!post) return json({ levels: progress });
    // a battle won: replay it, then keep it if it earns more stars than before
    const b = await body(req), lv = CAMPAIGN.level(b.level);
    if (!lv) return fail(404, 'no such battle');
    if (!Array.isArray(b.moves) || b.moves.length > 400) return fail(400, 'bad moves');
    if (!CAMPAIGN.unlocked(progress).levels.has(lv.id)) return fail(403, 'Trận này chưa mở');
    const r = CAMPAIGN.judge(lv, b.moves);
    if (!r.over || !r.win) return fail(400, 'Ván cờ không phải một trận thắng');
    const stars = CAMPAIGN.stars(lv, r, !!b.help), before = progress[lv.id] | 0;
    if (stars > before) {
      await env.DB.prepare(`INSERT INTO campaign (user_id, level, stars, moves, help, updated_at) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT (user_id, level) DO UPDATE SET stars = excluded.stars, moves = excluded.moves, help = excluded.help, updated_at = excluded.updated_at
        WHERE excluded.stars > campaign.stars`).bind(user.id, lv.id, stars, b.moves.join(','), b.help ? 1 : 0, Date.now()).run();
      progress[lv.id] = stars;
    }
    return json({ stars, levels: progress });
  }
  // the daily puzzle: anyone sees the board; a signed-in player takes a ticket when they open the puzzle (the clock
  // runs from then, across retries) and hands it in with the solution, which is replayed before it is saved
  if (p === '/api/daily') {
    const user = await currentUser(req, env), today = DAILY.dayOf();
    if (!post) return json(await dailyBoard(env, today, user));
    if (!user) return fail(401, 'not signed in');
    const b = await body(req), t = await unsign(env.SESSION_SECRET, b.ticket);
    if (!t || t.u !== user.id || !Number.isInteger(t.d) || !Number.isInteger(t.t)) return fail(400, 'bad ticket');
    if (t.d > today || t.d < today - 1) return fail(410, 'Trận đồ này đã qua ngày');   // a day's grace across midnight
    if (!Array.isArray(b.moves) || b.moves.length > 40) return fail(400, 'bad moves');
    const r = CAMPAIGN.judge(DAILY.level(t.d), b.moves);
    if (!r.over || !r.win) return fail(400, 'Ván cờ không phải lời giải');
    const ms = Math.max(1000, Date.now() - t.t), tries = Math.max(1, Math.min(999, b.tries | 0));
    await env.DB.prepare(`INSERT INTO daily (user_id, day, ms, tries, help, moves, solved_at) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (user_id, day) DO NOTHING`).bind(user.id, t.d, ms, tries, b.help ? 1 : 0, b.moves.join(','), Date.now()).run();
    return json(await dailyBoard(env, t.d, user));
  }
  if (p === '/api/daily/start' && post) {
    const user = await currentUser(req, env), day = DAILY.dayOf(), now = Date.now();
    if (!user) return fail(401, 'not signed in');
    return json({ day, ticket: await sign(env.SESSION_SECRET, { u: user.id, d: day, t: now }) });
  }
  // a ranked game to watch again: both players and every move (games from before moves were kept have none)
  const gm = p.match(/^\/api\/game\/(\d{1,12})$/);
  if (gm) {
    const g = await env.DB.prepare(`SELECT g.*, r.name AS red_name, b.name AS black_name FROM games g
      JOIN users r ON r.id = g.red JOIN users b ON b.id = g.black WHERE g.id = ?`).bind(+gm[1]).first();
    if (!g || !g.moves) return fail(404, 'no such game');
    return json({
      id: g.id, winner: g.winner, reason: g.reason, at: g.ended_at, moves: g.moves.split(',').map(Number),
      red: { id: g.red, name: g.red_name, rating: g.red_rating, delta: g.red_delta },
      black: { id: g.black, name: g.black_name, rating: g.black_rating, delta: g.black_delta },
    });
  }
  // friends: the list (with who is online, from the Lobby), requests both ways; and asking, accepting, declining,
  // removing. The other player's open pages hear of it at once.
  if (p === '/api/friends') {
    const user = await currentUser(req, env);
    if (!user) return fail(401, 'not signed in');
    const me = user.id, db = env.DB;
    if (!post) {
      const { results } = await db.prepare(`SELECT f.user_id, f.state, u.id, u.name, u.title, u.rating, u.sg_rating FROM friends f
        JOIN users u ON u.id = CASE WHEN f.user_id = ?1 THEN f.friend_id ELSE f.user_id END
        WHERE f.user_id = ?1 OR (f.friend_id = ?1 AND f.state = 0) ORDER BY u.name COLLATE NOCASE`).bind(me).all();
      const who = r => ({ id: r.id, name: r.name, title: r.title, rating: r.rating, sg_rating: r.sg_rating });
      const friends = results.filter(r => r.user_id === me && r.state === 1).map(who);
      let online = { status: {}, rooms: {} };
      try { if (friends.length) online = await (await lobby(env).fetch('https://lobby/presence', { method: 'POST', body: JSON.stringify({ ids: friends.map(f => f.id) }) })).json(); } catch (e) { }
      return json({
        // room: the online room a friend plays in, to watch
        friends: friends.map(f => ({ ...f, status: online.status[f.id] || 'offline', ...(online.rooms[f.id] ? { room: online.rooms[f.id] } : {}) })),
        incoming: results.filter(r => r.user_id !== me).map(who),
        outgoing: results.filter(r => r.user_id === me && r.state === 0).map(who),
      });
    }
    const b = await body(req), to = Number(b.to), now = Date.now();
    if (!Number.isInteger(to) || to === me) return fail(400, 'bad player');
    const other = await db.prepare('SELECT id, name FROM users WHERE id = ?').bind(to).first();
    if (!other) return fail(404, 'no such player');
    let rel = await relation(env, me, to);
    if (b.act === 'ask' && rel === 'none') {
      const n = await db.prepare('SELECT SUM(state = 1) AS friends, SUM(state = 0) AS asked FROM friends WHERE user_id = ?').bind(me).first();
      if ((n.friends | 0) >= MAX_FRIENDS) return fail(403, `Danh sách bạn bè đã đủ ${MAX_FRIENDS} người`);
      if ((n.asked | 0) >= MAX_ASKED) return fail(403, 'Bạn đang chờ quá nhiều lời mời kết bạn');
      await db.prepare('INSERT INTO friends (user_id, friend_id, state, at) VALUES (?, ?, 0, ?) ON CONFLICT DO NOTHING').bind(me, to, now).run();
      rel = 'asked';
      await notify(env, to, { t: 'friends', why: 'asked', name: user.name });
    } else if ((b.act === 'accept' || b.act === 'ask') && rel === 'incoming') {
      // asking someone who already asked you is a yes
      await db.batch([
        db.prepare('UPDATE friends SET state = 1, at = ? WHERE user_id = ? AND friend_id = ?').bind(now, to, me),
        db.prepare('INSERT INTO friends (user_id, friend_id, state, at) VALUES (?, ?, 1, ?) ON CONFLICT (user_id, friend_id) DO UPDATE SET state = 1').bind(me, to, now),
      ]);
      rel = 'friends';
      await notify(env, to, { t: 'friends', why: 'accepted', name: user.name });
    } else if (b.act === 'decline' && rel === 'incoming') {
      await db.prepare('DELETE FROM friends WHERE user_id = ? AND friend_id = ? AND state = 0').bind(to, me).run();
      rel = 'none';
    } else if (b.act === 'remove' && rel !== 'none') {   // unfriend, or take back one's own request
      await db.prepare('DELETE FROM friends WHERE (user_id = ?1 AND friend_id = ?2) OR (user_id = ?2 AND friend_id = ?1)').bind(me, to).run();
      rel = 'none';
      await notify(env, to, { t: 'friends' });
    }
    return json({ relation: rel });
  }
  // players by the start of their name, to ask as friends
  if (p === '/api/users') {
    const user = await currentUser(req, env);
    if (!user) return fail(401, 'not signed in');
    const q = String(url.searchParams.get('q') || '').normalize('NFC').replace(/\s+/g, ' ').trim().slice(0, 20);
    if (q.length < 2) return json({ users: [] });
    const like = q.replace(/[\\%_]/g, c => '\\' + c) + '%';
    const { results } = await env.DB.prepare(`SELECT id, name, title, rating, sg_rating FROM users WHERE name LIKE ? ESCAPE '\\' AND id != ?
      ORDER BY games DESC, rating DESC LIMIT 10`).bind(like, user.id).all();
    return json({ users: results });
  }
  // achievements: the signed-in player's (with what the records now prove), and a game that earned some, replayed
  if (p === '/api/achievements') {
    const user = await currentUser(req, env);
    if (!user) return fail(401, 'not signed in');
    if (post) {
      const b = await body(req), g = b.game || {};
      if (!Array.isArray(g.moves) || g.moves.length > 600 || typeof g.fen0 !== 'string' || g.fen0.length > 100) return fail(400, 'bad game');
      const got = ACHIEVEMENTS.fromGame({ fen0: g.fen0, moves: g.moves, me: g.me });
      if (got.length) await env.DB.batch(got.map(id => env.DB.prepare('INSERT OR IGNORE INTO achievements (user_id, id, at) VALUES (?, ?, ?)').bind(user.id, id, Date.now())));
    }
    return json({ achievements: await achievementsOf(env, user) });
  }
  // the boards: this season's (ten ranked games in the season to be on it), or a past season's as it ended
  if (p === '/api/leaderboard') {
    const sg = url.searchParams.get('v') === 'sg', now = Date.now(), current = SEASONS.of(now);
    const asked = parseInt(url.searchParams.get('season'), 10), season = asked >= 1 && asked < current ? asked : current;
    const info = { n: season, name: SEASONS.name(season), current, end: SEASONS.end(season), past: season < current };
    if (season < current) {
      const { results } = await env.DB.prepare(`SELECT u.id, u.name, u.title, r.rank, r.rating, r.games FROM season_results r JOIN users u ON u.id = r.user_id
        WHERE r.season = ? AND r.v = ? ORDER BY r.rank LIMIT 100`).bind(season, sg ? 'sg' : 'xq').all();
      return json({ season: info, past: results, provisional: PROVISIONAL });
    }
    const q = sg
      ? `SELECT ${USER_COLS} FROM users WHERE sg_season_games >= 10 ORDER BY sg_rating DESC, sg_season_games DESC LIMIT 100`
      : `SELECT ${USER_COLS} FROM users WHERE season_games >= 10 ORDER BY rating DESC, season_games DESC LIMIT 100`;
    const { results } = await env.DB.prepare(q).all();
    return json({ season: info, top: results, provisional: PROVISIONAL });
  }
  const m = p.match(/^\/api\/user\/(\d{1,12})$/);
  if (m) {
    const id = +m[1], user = await env.DB.prepare(`SELECT ${USER_COLS} FROM users WHERE id = ?`).bind(id).first();
    if (!user) return fail(404, 'no such player');
    const { results } = await env.DB.prepare(`SELECT g.*, r.name AS red_name, b.name AS black_name FROM games g
      JOIN users r ON r.id = g.red JOIN users b ON b.id = g.black
      WHERE g.red = ?1 OR g.black = ?1 ORDER BY g.ended_at DESC LIMIT 20`).bind(id).all();
    const games = results.map(g => {
      const side = g.red === id ? 1 : -1, red = side > 0;
      return {
        id: g.id, replay: !!g.moves,
        side, opp: { id: red ? g.black : g.red, name: red ? g.black_name : g.red_name, rating: red ? g.black_rating : g.red_rating },
        result: g.winner === 0 ? 0 : g.winner === side ? 1 : -1, reason: g.reason, plies: g.plies,
        delta: red ? g.red_delta : g.black_delta, rating: (red ? g.red_rating + g.red_delta : g.black_rating + g.black_delta), at: g.ended_at,
      };
    });
    // Tam Quốc games: the player's kingdom, place and rating change, and the two others
    const sg = (await env.DB.prepare(`SELECT g.*, a.name AS n0, b.name AS n1, c.name AS n2 FROM sg_games g
      JOIN users a ON a.id = g.p0 JOIN users b ON b.id = g.p1 JOIN users c ON c.id = g.p2
      WHERE g.p0 = ?1 OR g.p1 = ?1 OR g.p2 = ?1 ORDER BY g.ended_at DESC LIMIT 20`).bind(id).all()).results.map(g => {
      const k = [g.p0, g.p1, g.p2].indexOf(id);
      return {
        k, place: g['place' + k], reason: g.reason, plies: g.plies, delta: g['delta' + k], rating: g['rating' + k] + g['delta' + k], at: g.ended_at,
        others: [0, 1, 2].filter(j => j !== k).map(j => ({ k: j, id: g['p' + j], name: g['n' + j], place: g['place' + j] })),
      };
    });
    // how the one looking stands with this player (signed in, someone else)
    const viewer = await currentUser(req, env);
    const friend = viewer && viewer.id !== id ? await relation(env, viewer.id, id) : null;
    // achievements (public), and the seasons they finished in the top hundred
    const ach = (await env.DB.prepare('SELECT id, at FROM achievements WHERE user_id = ? ORDER BY at').bind(id).all()).results;
    const seasons = (await env.DB.prepare('SELECT season, v, rank, rating FROM season_results WHERE user_id = ? ORDER BY season DESC, v LIMIT 40').bind(id).all()).results;
    return json({ user: await withRanks(env, user), games, sg, friend, achievements: ach, seasons });
  }
  return fail(404, 'not found');
}
