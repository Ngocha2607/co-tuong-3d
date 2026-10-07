// worker/api.js — HTTP side of accounts: Google sign-in, the signed-in player, nicknames, leaderboard, profiles.
// Accounts need three things configured (see README): the D1 database DB, GOOGLE_CLIENT_ID and the SESSION_SECRET
// secret. Without them the site still works, just without sign-in and ranked play.
import { verifyGoogle, makeSession, readSession, cookieOf, setCookie } from './auth.js';
import { PROVISIONAL } from './elo.js';

export const authReady = env => !!(env.DB && env.GOOGLE_CLIENT_ID && env.SESSION_SECRET);
const USER_COLS = 'id, name, rating, games, wins, draws, losses';

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
    const name = cleanName((await body(req)).name);
    if (!name) return fail(400, 'Tên dài 2–20 ký tự, chỉ gồm chữ, số, dấu cách và . _ -');
    await env.DB.prepare('UPDATE users SET name = ? WHERE id = ?').bind(name, user.id).run();
    return json({ user: { ...user, name, rank: await rankOf(env, user) } });
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
