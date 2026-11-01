// worker/seasons.js — closing ranked seasons (src/seasons.js), run by the cron trigger (worker/index.js, scheduled)
// a few minutes after midnight in Vietnam every day; it only acts on the first run after a season has ended.
// A season closes in one D1 batch (all or nothing): its two boards, the first hundred of each, go into
// season_results (their top ten wear a title for it from then on), every rating moves halfway back to 1200, and the
// season game counts start again. meta 'season' remembers the season being played, so a second run does nothing.
import SEASONS from '../src/seasons.js';

export const KEEP = 100;
const BOARDS = [['xq', 'rating', 'season_games'], ['sg', 'sg_rating', 'sg_season_games']];

// → { current, closed: [season numbers closed now] }
export async function tick(env, now = Date.now()) {
  const db = env.DB;
  if (!db) return { current: 0, closed: [] };
  const current = SEASONS.of(now);
  const row = await db.prepare("SELECT v FROM meta WHERE k = 'season'").first();
  if (!row) {                                                // the first run ever: the season under way is the one
    await db.prepare("INSERT OR IGNORE INTO meta (k, v) VALUES ('season', ?)").bind(current).run();
    return { current, closed: [] };
  }
  const closed = [];
  for (let n = row.v; n < current; n++) { await close(db, n); closed.push(n); }
  return { current, closed };
}

export async function close(db, n) {
  const stmts = BOARDS.map(([v, rating, games]) => db.prepare(`INSERT OR IGNORE INTO season_results (season, v, user_id, rank, rating, games)
    SELECT ?1, ?2, id, ROW_NUMBER() OVER (ORDER BY ${rating} DESC, ${games} DESC, id), ${rating}, ${games}
    FROM users WHERE ${games} >= ?3 ORDER BY ${rating} DESC, ${games} DESC, id LIMIT ${KEEP}`).bind(n, v, SEASONS.MIN_GAMES));
  stmts.push(db.prepare(`UPDATE users SET
    rating = 1200 + CAST(ROUND((rating - 1200) / 2.0) AS INTEGER), sg_rating = 1200 + CAST(ROUND((sg_rating - 1200) / 2.0) AS INTEGER),
    season_games = 0, sg_season_games = 0`));
  stmts.push(db.prepare("UPDATE meta SET v = ?1 + 1 WHERE k = 'season' AND v = ?1").bind(n));
  await db.batch(stmts);
}

// the season titles a player has: 's:<season>:<tier>:<board>' for each top-ten finish
export async function titlesOf(db, uid) {
  const { results } = await db.prepare('SELECT season, v, rank FROM season_results WHERE user_id = ? AND rank <= 10 ORDER BY season DESC, v DESC').bind(uid).all();
  return results.map(r => SEASONS.titleId(r.season, SEASONS.tierOf(r.rank).tier, r.v));
}
