// worker/api.js — HTTP side of accounts: Google sign-in, the signed-in player (nickname, title, the hero and stage
// they picked), leaderboard, profiles, and campaign progress (each battle won is replayed here before it is saved).
// Accounts need three things configured (see README): the D1 database DB, GOOGLE_CLIENT_ID and the SESSION_SECRET
// secret. Without them the site still works, just without sign-in and ranked play.
import { verifyGoogle, makeSession, readSession, cookieOf, setCookie } from './auth.js';
import { PROVISIONAL } from './elo.js';
import CAMPAIGN from '../src/campaign.js';
import HEROES from '../src/heroes.js';
import STAGE_LIST from '../src/stage-list.js';

export const authReady = env => !!(env.DB && env.GOOGLE_CLIENT_ID && env.SESSION_SECRET);
const USER_COLS = 'id, name, rating, games, wins, draws, losses, title, hero, stage';

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
const rankOf = async (env, u) => u.games >= PROVISIONAL
  ? (await env.DB.prepare('SELECT COUNT(*) + 1 AS r FROM users WHERE games >= 10 AND rating > ?').bind(u.rating).first()).r
  : null;

// state-changing requests must come from our own page (the cookie is SameSite=Lax; this closes the rest)
const sameOrigin = (req, url) => req.headers.get('origin') === url.origin && (req.headers.get('content-type') || '').startsWith('application/json');
const body = async req => { try { return await req.json(); } catch (e) { return {}; } };

// campaign stars of a player: { [battle id]: stars }
async function progressOf(env, uid) {
  const { results } = await env.DB.prepare('SELECT level, stars FROM campaign WHERE user_id = ?').bind(uid).all();
  return Object.fromEntries(results.map(r => [r.level, r.stars]));
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
    return json({ user: { ...user, rank: await rankOf(env, user) } }, { headers: { 'set-cookie': setCookie(await makeSession(env.SESSION_SECRET, user.id), secure) } });
  }
  if (p === '/auth/logout' && post) return json({ ok: true }, { headers: { 'set-cookie': setCookie('', secure, 0) } });

  if (p === '/api/me') {
    const user = await currentUser(req, env);
    if (!post) return json({ user: user && { ...user, rank: await rankOf(env, user) } });
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
      if (next.title && !(await earned()).titles.includes(next.title)) return fail(403, 'Danh hiệu này chưa đạt được');
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
    await env.DB.prepare('UPDATE users SET name = ?, title = ?, hero = ?, stage = ? WHERE id = ?').bind(next.name, next.title, next.hero, next.stage, user.id).run();
    return json({ user: { ...next, rank: await rankOf(env, next) } });
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
  if (p === '/api/leaderboard') {
    const { results } = await env.DB.prepare(`SELECT ${USER_COLS} FROM users WHERE games >= 10 ORDER BY rating DESC, games DESC LIMIT 100`).all();
    return json({ top: results, provisional: PROVISIONAL });
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
        side, opp: { id: red ? g.black : g.red, name: red ? g.black_name : g.red_name, rating: red ? g.black_rating : g.red_rating },
        result: g.winner === 0 ? 0 : g.winner === side ? 1 : -1, reason: g.reason, plies: g.plies,
        delta: red ? g.red_delta : g.black_delta, rating: (red ? g.red_rating + g.red_delta : g.black_rating + g.black_delta), at: g.ended_at,
      };
    });
    return json({ user: { ...user, rank: await rankOf(env, user) }, games });
  }
  return fail(404, 'not found');
}
