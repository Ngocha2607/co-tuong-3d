// tournament.test.mjs — `npm test`: tournaments between friends, the bracket (src/bracket.js) and the Worker's side
// (worker/tournament.js) on SQLite with every migration applied, its rooms and messages caught here.
// Needs node's built-in SQLite: node --experimental-sqlite --no-warnings test/tournament.test.mjs
import assert from 'assert';
import fs from 'fs';
import { createRequire } from 'module';
import { DatabaseSync } from 'node:sqlite';
import * as TOUR from '../worker/tournament.js';
const require = createRequire(import.meta.url);
const BRACKET = require('../src/bracket.js');

let failed = 0;
async function test(name, fn) {
  try { await fn(); console.log('ok   ', name); } catch (e) { failed++; console.log('FAIL ', name, '\n     ', e.stack); }
}
const seeded = n => () => { n = (n * 16807) % 2147483647; return n / 2147483647; };
const players = n => Array.from({ length: n }, (_, i) => ({ id: i + 1, name: 'P' + (i + 1) }));
// play every match ready, the first named (Red) winning unless told otherwise
const playAll = (d, pick = () => 1) => {
  for (let guard = 0; guard < 20 && d.state === 'playing'; guard++)
    d.rounds.forEach((round, r) => round.forEach((m, s) => { if (m.room && m.winner === null) BRACKET.report(d, r, s, pick(m, r, s), 'checkmate', 'ABCDEF'); }));
  return d;
};

await test('bracket: 3 to 8 players, 4 or 8 places, byes to the first drawn, everyone plays or has a bye', () => {
  for (let n = 3; n <= 8; n++) {
    const d = BRACKET.start({ ...BRACKET.fresh(players(1)[0]), players: players(n) }, 'ABCDEF', seeded(n));
    const size = n <= 4 ? 4 : 8, first = d.rounds[0];
    assert.strictEqual(first.length, size / 2, `n=${n}`);
    assert.strictEqual(d.rounds.length, size === 4 ? 2 : 3, `n=${n}: rounds drawn ahead`);
    const seen = first.flatMap(m => [m.a, m.b]).filter(x => x !== null).sort();
    assert.deepStrictEqual(seen, [...Array(n).keys()], `n=${n}: each player once`);
    assert.strictEqual(first.filter(m => m.reason === 'bye').length, size - n, `n=${n}: byes`);
    assert.ok(first.every(m => m.a !== null || m.b !== null), `n=${n}: no empty match`);
    for (const m of first) assert.strictEqual(!!m.room, m.reason !== 'bye', `n=${n}: a room for each real match`);
  }
});

await test('bracket: winners move on, a draw sends Black through, the final crowns a champion', () => {
  const d = BRACKET.start({ ...BRACKET.fresh(players(1)[0]), players: players(8) }, 'ABCDEF', seeded(3));
  const m = d.rounds[0][1];
  assert.ok(!BRACKET.report(d, 1, 0, 1, 'checkmate', 'ABCDEF'), 'a match without both players waits');
  assert.ok(BRACKET.report(d, 0, 1, 0, 'repetition', 'ABCDEF'));
  assert.strictEqual(m.winner, m.b); assert.strictEqual(m.reason, 'draw');
  assert.ok(!BRACKET.report(d, 0, 1, 1, 'checkmate', 'ABCDEF'), 'only once');
  assert.strictEqual(d.rounds[1][0].b, m.b, 'into the next round');
  assert.strictEqual(d.rounds[1][0].room, '', 'its room waits for the other semi-finalist');
  BRACKET.report(d, 0, 0, -1, 'time', 'ABCDEF');
  assert.strictEqual(d.rounds[1][0].room, 'ABCDEF10');
  playAll(d);
  assert.strictEqual(d.state, 'done');
  assert.strictEqual(d.champion, d.rounds[2][0].a);
  assert.strictEqual(BRACKET.roundName(d, 2), 'Chung kết'); assert.strictEqual(BRACKET.roundName(d, 0), 'Tứ kết');
  assert.strictEqual(BRACKET.current(d, d.champion), null);
});

await test('bracket: the match a player has to play now', () => {
  const d = BRACKET.start({ ...BRACKET.fresh(players(1)[0]), players: players(4) }, 'XYZ123', seeded(9));
  const m = d.rounds[0][0], c = BRACKET.current(d, m.a);
  assert.deepStrictEqual([c.r, c.s, c.m.room], [0, 0, 'XYZ12300']);
  BRACKET.report(d, 0, 0, 1, 'checkmate', 'XYZ123');
  assert.strictEqual(BRACKET.current(d, m.a), null, 'waits for the other semi-final');
  assert.strictEqual(BRACKET.current(d, m.b), null, 'out');
});

// D1 on node's SQLite (as in seasons.test.mjs), and the rooms and the Lobby as a list of what they were sent
function d1() {
  const db = new DatabaseSync(':memory:');
  for (const f of fs.readdirSync(new URL('../migrations/', import.meta.url)).sort()) db.exec(fs.readFileSync(new URL('../migrations/' + f, import.meta.url), 'utf8'));
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
  return { raw: db, prepare: sql => stmt(sql), batch: async list => { db.exec('BEGIN'); try { for (const s of list) s.exec(); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; } } };
}
function world(n) {
  const DB = d1(), rooms = [], said = [];
  for (let i = 1; i <= n; i++) DB.raw.prepare('INSERT INTO users (id, google_sub, name, created_at, seen_at) VALUES (?, ?, ?, 0, 0)').run(i, 'g' + i, 'P' + i);
  const taken = new Set();
  const ns = (log, ok) => ({ idFromName: x => x, get: name => ({ fetch: async (url, init) => { const b = JSON.parse(init.body); log.push({ name, ...b }); return { ok: ok(name, b) }; } }) });
  const env = { DB, ROOMS: ns(rooms, name => !taken.has(name) && taken.add(name)), LOBBY: ns(said, () => true) };
  return { env, rooms, said, user: i => ({ id: i, name: 'P' + i }) };
}

await test('worker: open, join, leave, the host draws; rooms set up with both players and the time, each once', async () => {
  const w = world(6), { env } = w;
  const t = (await TOUR.create(env, w.user(1), 'Giải Tết', '5+3')).t;
  assert.ok(TOUR.validId(t.id)); assert.strictEqual(t.tc, '5+3');
  for (const i of [2, 3, 4, 5]) assert.ok(!(await TOUR.act(env, w.user(i), t.id, 'join')).error);
  assert.ok((await TOUR.act(env, w.user(2), t.id, 'join')).t, 'joining twice changes nothing');
  assert.ok(!(await TOUR.act(env, w.user(5), t.id, 'leave')).error);
  assert.strictEqual((await TOUR.act(env, w.user(1), t.id, 'leave')).status, 403, 'the host stays');
  assert.strictEqual((await TOUR.act(env, w.user(2), t.id, 'start')).status, 403, 'only the host draws');
  const s = await TOUR.act(env, w.user(1), t.id, 'start');
  assert.strictEqual(s.t.data.state, 'playing');
  assert.strictEqual((await TOUR.act(env, w.user(6), t.id, 'join')).status, 409, 'too late to join');
  assert.strictEqual(w.rooms.length, 2, 'two semi-finals');
  for (const r of w.rooms) { assert.strictEqual(r.tc, '5+3'); assert.ok(r.info[1].id && r.info[-1].id); assert.strictEqual(r.tour.id, t.id); }
  assert.ok(w.said.some(x => x.to === 1 && x.msg.t === 'tour'));
  assert.deepStrictEqual((await TOUR.mine(env, w.user(3))).map(x => x.id), [t.id]);
  assert.deepStrictEqual(await TOUR.mine(env, w.user(5)), [], 'left before the draw');
});

await test('worker: results move the bracket on, the final room opens, the champion is told to all', async () => {
  const w = world(4), { env } = w;
  const t = (await TOUR.create(env, w.user(1), 'Giải nhỏ', '10+5')).t;
  for (const i of [2, 3, 4]) await TOUR.act(env, w.user(i), t.id, 'join');
  await TOUR.act(env, w.user(1), t.id, 'start');
  const [a, b] = w.rooms;
  // the two semi-finals end together: both results count
  await Promise.all([TOUR.report(env, a.tour, 1, 'checkmate'), TOUR.report(env, b.tour, -1, 'resign')]);
  const mid = (await TOUR.load(env.DB, t.id)).data;
  assert.ok(mid.rounds[0].every(m => m.winner !== null));
  // both may ask the final's room to set up: the second ask is refused by the room, harmlessly
  const rooms = [...new Map(w.rooms.map(r => [r.name, r])).values()];
  assert.strictEqual(rooms.length, 3, 'the final set up');
  const final = rooms[2];
  assert.deepStrictEqual([final.info[1].id, final.info[-1].id], [a.info[1].id, b.info[-1].id]);
  assert.ok(await TOUR.report(env, final.tour, 0, 'agreement'));
  const end = (await TOUR.load(env.DB, t.id)).data;
  assert.strictEqual(end.state, 'done'); assert.strictEqual(end.players[end.champion].id, b.info[-1].id, 'a drawn final: Black');
  assert.strictEqual(w.said.filter(x => /vô địch/.test(x.msg.text)).length, 4);
  assert.ok(await TOUR.report(env, final.tour, 1, 'checkmate'), 'a repeated report is harmless');
  assert.strictEqual((await TOUR.load(env.DB, t.id)).data.champion, end.champion);
});

console.log(failed ? `\n${failed} failed` : '\nall tests passed');
if (failed) process.exit(1);
