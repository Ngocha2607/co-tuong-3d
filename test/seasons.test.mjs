// seasons.test.mjs — `npm test`: ranked seasons (src/seasons.js) and closing one in D1 (worker/seasons.js, run here on
// SQLite with every migration applied), achievements (src/achievements.js) from real games, and the titles they give.
// Needs node's built-in SQLite: node --experimental-sqlite --no-warnings test/seasons.test.mjs
import assert from 'assert';
import fs from 'fs';
import { createRequire } from 'module';
import { DatabaseSync } from 'node:sqlite';
import { tick, titlesOf } from '../worker/seasons.js';
const require = createRequire(import.meta.url);
const XQ = require('../src/xiangqi.js');
const SEASONS = require('../src/seasons.js');
const A = require('../src/achievements.js');
const TITLES = require('../src/titles.js');

let failed = 0;
async function test(name, fn) {
  try { await fn(); console.log('ok   ', name); } catch (e) { failed++; console.log('FAIL ', name, '\n     ', e.message); }
}
const VN = (y, m, d) => Date.UTC(y, m - 1, d) - 7 * 3600e3;   // midnight in Vietnam

await test('seasons are the quarters of the year in Vietnam, the first the winter of 2026', () => {
  assert.strictEqual(SEASONS.of(VN(2026, 11, 1)), 1);
  assert.strictEqual(SEASONS.of(VN(2027, 1, 1) - 1), 1);
  assert.strictEqual(SEASONS.of(VN(2027, 1, 1)), 2);
  assert.strictEqual(SEASONS.of(VN(2027, 4, 1)), 3);
  assert.strictEqual(SEASONS.of(VN(2020, 1, 1)), 1, 'nothing before the first');
  assert.strictEqual(SEASONS.name(1), 'Mùa Đông 2026');
  assert.strictEqual(SEASONS.name(2), 'Mùa Xuân 2027');
  assert.strictEqual(SEASONS.name(5), 'Mùa Đông 2027');
  assert.strictEqual(SEASONS.end(1), VN(2027, 1, 1));
  assert.strictEqual(SEASONS.start(2), SEASONS.end(1));
});
await test('season titles: first, second or third, fourth to tenth, on either board', () => {
  assert.strictEqual(SEASONS.tierOf(1).tier, 1);
  assert.strictEqual(SEASONS.tierOf(3).tier, 2);
  assert.strictEqual(SEASONS.tierOf(10).tier, 3);
  assert.strictEqual(SEASONS.tierOf(11), null);
  assert.strictEqual(SEASONS.title('s:1:1:xq'), 'Kỳ vương Mùa Đông 2026');
  assert.strictEqual(SEASONS.title('s:2:3:sg'), 'Thập đại kiêu hùng Mùa Xuân 2027');
  for (const bad of ['s:1:4:xq', 's:1:1:zz', 's:x:1:xq', '', null, 'dao-vien']) assert.strictEqual(SEASONS.title(bad), '', String(bad));
  assert.strictEqual(SEASONS.soften(1500), 1350);
  assert.strictEqual(SEASONS.soften(1101), 1150);
  assert.strictEqual(SEASONS.soften(1200), 1200);
});

// D1 on node's SQLite: prepare / bind / first / all / run, and batch as one transaction
function d1() {
  const db = new DatabaseSync(':memory:');
  for (const f of fs.readdirSync(new URL('../migrations/', import.meta.url)).sort()) db.exec(fs.readFileSync(new URL('../migrations/' + f, import.meta.url), 'utf8'));
  // D1 binds ?1 ?2 … by position; node's SQLite does not, so each is spelled out as a plain ? with its value
  const plain = (sql, args) => {
    if (!/\?\d/.test(sql)) return [sql, args];
    const out = [];
    return [sql.replace(/\?(\d+)/g, (_, n) => { out.push(args[n - 1]); return '?'; }), out];
  };
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => db.prepare(plain(sql, args)[0]).get(...plain(sql, args)[1]) || null,
    all: async () => ({ results: db.prepare(plain(sql, args)[0]).all(...plain(sql, args)[1]) }),
    run: async () => db.prepare(plain(sql, args)[0]).run(...plain(sql, args)[1]),
    exec: () => db.prepare(plain(sql, args)[0]).run(...plain(sql, args)[1]),
  });
  return {
    raw: db,
    prepare: sql => stmt(sql),
    batch: async list => { db.exec('BEGIN'); try { for (const s of list) s.exec(); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; } },
  };
}
await test('closing a season: boards kept, top ten titled, ratings halfway back, counts afresh; only once', async () => {
  const DB = d1(), env = { DB };
  const add = (id, rating, sg, n, sn) => DB.raw.prepare(`INSERT INTO users (id, google_sub, name, rating, games, sg_rating, sg_games, season_games, sg_season_games, created_at, seen_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)`).run(id, 'g' + id, 'P' + id, rating, n, sg, sn, n, sn);
  for (let i = 1; i <= 14; i++) add(i, 1600 - i * 10, 1300 + i, 12, i <= 3 ? 10 : 0);   // 14 on the board, 3 on Tam Quốc's
  add(99, 1900, 1200, 5, 0);                                                           // too few games this season
  assert.deepStrictEqual(await tick(env, VN(2026, 12, 1)), { current: 1, closed: [] }, 'the first run marks the season');
  assert.deepStrictEqual(await tick(env, VN(2026, 12, 31)), { current: 1, closed: [] });
  assert.deepStrictEqual(await tick(env, VN(2027, 1, 1) + 300e3), { current: 2, closed: [1] });
  const xq = DB.raw.prepare("SELECT user_id, rank, rating FROM season_results WHERE season = 1 AND v = 'xq' ORDER BY rank").all();
  assert.strictEqual(xq.length, 14);
  assert.deepStrictEqual([xq[0].user_id, xq[0].rank, xq[0].rating], [1, 1, 1590], 'ratings kept as they ended');
  assert.ok(!xq.some(r => r.user_id === 99), 'five games are not enough');
  const sg = DB.raw.prepare("SELECT user_id, rank FROM season_results WHERE season = 1 AND v = 'sg' ORDER BY rank").all();
  assert.deepStrictEqual(sg.map(r => r.user_id), [3, 2, 1]);
  const u1 = DB.raw.prepare('SELECT rating, sg_rating, season_games, sg_season_games, games FROM users WHERE id = 1').get();
  assert.deepStrictEqual({ ...u1 }, { rating: SEASONS.soften(1590), sg_rating: SEASONS.soften(1301), season_games: 0, sg_season_games: 0, games: 12 });
  assert.strictEqual(DB.raw.prepare('SELECT rating FROM users WHERE id = 99').get().rating, SEASONS.soften(1900));
  assert.deepStrictEqual(await titlesOf(DB, 1), ['s:1:1:xq', 's:1:2:sg']);
  assert.deepStrictEqual(await titlesOf(DB, 10), ['s:1:3:xq']);
  assert.deepStrictEqual(await titlesOf(DB, 11), [], 'eleventh: on the board, no title');
  assert.deepStrictEqual(await tick(env, VN(2027, 1, 2)), { current: 2, closed: [] }, 'closed once');
  assert.strictEqual(DB.raw.prepare('SELECT rating FROM users WHERE id = 1').get().rating, SEASONS.soften(1590), 'not softened twice');
  // a long pause (no cron for months): each season missed is closed in turn
  assert.deepStrictEqual((await tick(env, VN(2027, 7, 15))).closed, [2, 3]);
});

// ---------- achievements ----------
const mv = (r1, c1, r2, c2) => XQ.mv(r1 * 9 + c1, r2 * 9 + c2);
const got = (fen0, moves, me = 1) => A.fromGame({ fen0, moves, me }).sort();
await test('achievements from single moves: a soldier takes a chariot; mates by horse, soldier, double cannon, and the generals face to face', () => {
  assert.deepStrictEqual(got('4k4/9/9/9/4r4/4P4/9/9/9/4K4 w', [mv(5, 4, 4, 4)]), ['tieu-tot']);
  // a smothered general, the horse alone left to attack
  assert.deepStrictEqual(got('3aka3/4a4/9/3N5/9/9/9/9/9/3K5 w', [mv(3, 3, 1, 2)]), ['don-ky', 'ma-dao']);
  assert.deepStrictEqual(got('3k5/8R/3P5/9/9/9/9/9/9/4K4 w', [mv(2, 3, 1, 3)]), ['mat-tuong', 'tot-sat'], 'the general holds the file beside');
  assert.deepStrictEqual(got('4k4/9/3R1R3/9/9/4C4/9/9/C8/3K5 w', [mv(8, 0, 8, 4)]), ['trung-phao']);
});
await test('achievements need the mate on the board: a check that is not mate, the other side, an illegal move', () => {
  assert.deepStrictEqual(got('3k5/8R/9/3P5/9/9/9/9/9/4K4 w', [mv(3, 3, 2, 3)]), [], 'no check at all');
  assert.deepStrictEqual(got('3k5/8R/3P5/9/9/9/9/9/9/4K4 w', [mv(2, 3, 1, 3)], -1), [], 'Black did not do it');
  assert.deepStrictEqual(got('3k5/8R/3P5/9/9/9/9/9/9/4K4 w', [mv(2, 3, 0, 3)]), [], 'a soldier cannot jump');
  assert.deepStrictEqual(got('bad fen', [1]), []);
  assert.deepStrictEqual(A.fromGame({ fen0: XQ.START, moves: 'x', me: 1 }), []);
});
await test('a chariot given up, then mate within five moves', () => {
  // the soldier steps aside, Black takes a chariot, the soldier mates
  assert.deepStrictEqual(got('3k5/8R/2P6/9/9/r7R/9/9/9/4K4 w', [mv(2, 2, 2, 3), mv(5, 0, 5, 8), mv(2, 3, 1, 3)]), ['mat-tuong', 'thi-xe', 'tot-sat']);
});
await test('a whole game from the opening: mate in 11 moves without losing a piece', () => {
  const game = [8402, 1152, 192, 1668, 385, 2818, 10577, 3334, 966, 2184, 3666, 2313, 3740, 1805, 1437, 1669, 1539, 2957, 2188, 654, 1041];
  assert.deepStrictEqual(got(XQ.START, game), ['than-toc', 'toan-quan', 'trung-phao']);
  assert.deepStrictEqual(got(XQ.START, game.slice(0, -1)), [], 'one move short of mate: nothing');
});
await test('achievements the records prove, and every achievement is well formed', () => {
  assert.deepStrictEqual(A.fromRecords({ games: 50, rating: 1600, sg_wins: 1 }, 7), ['that-tinh', 'bach-chien', 'danh-chan', 'tam-quoc']);
  assert.deepStrictEqual(A.fromRecords({ games: 49, rating: 1599, sg_wins: 0 }, 6), []);
  assert.strictEqual(new Set(A.LIST.map(a => a.id)).size, A.LIST.length);
  for (const a of A.LIST) assert.ok(a.name && a.desc && a.han, a.id);
});
await test('titles: campaign, achievement and season ids all have words; anything else has none', () => {
  assert.strictEqual(TITLES.text('dao-vien'), 'Huynh đệ kết nghĩa');
  assert.strictEqual(TITLES.text('a:than-toc'), 'Thần tốc');
  assert.strictEqual(TITLES.text('a:tieu-tot'), '', 'an achievement without a title');
  assert.strictEqual(TITLES.text('s:1:1:sg'), 'Bá chủ Tam Quốc Mùa Đông 2026');
  for (const bad of ['', null, 'toString', 'a:toString', 'a:', 's:1:1:']) assert.strictEqual(TITLES.text(bad), '', String(bad));
});

if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log('\nall season and achievement tests passed');
