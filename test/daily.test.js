// daily.test.js — the daily puzzle, Chân Long Kỳ Trận: every formation is sound (as the campaign's puzzles are) and hard,
// the days fall where they should in Vietnam's time, streaks count, and a solution is judged like a campaign battle.
// `npm test` proves the first three formations in full (a long mate takes seconds to prove) and checks the rest
// quickly; `npm run verify:daily` (node test/daily.test.js all) proves every one, which takes a while.
'use strict';
const assert = require('assert');
const XQ = require('../src/xiangqi.js');
const C = require('../src/campaign.js');
const D = require('../src/daily.js');
const M = require('./mate.js');
const ALL = process.argv[2] === 'all';
let failed = 0;
function test(name, fn) {
  try { fn(); console.log('ok   ', name); } catch (e) { failed++; console.log('FAIL ', name, '\n     ', e.message); }
}

test('two months of formations at least, none twice', () => {
  assert.ok(D.PUZZLES.length >= 60, `${D.PUZZLES.length} formations`);
  assert.strictEqual(new Set(D.PUZZLES.map(p => p[0])).size, D.PUZZLES.length);
});
test('every formation: Red to move in a position a game could reach, mate in 4 to 6, a tier', () => {
  D.PUZZLES.forEach(([fen, n, tier], i) => {
    const p = XQ.Pos.fromFen(fen), at = `Trận ${i + 1} ${fen}`;
    assert.ok(n >= 4 && n <= 6, `${at}: mate in ${n} is not for masters`);
    assert.ok(tier === 1 || tier === 2, `${at}: tier ${tier}`);
    if (n >= 5) assert.strictEqual(tier, 2, `${at}: a mate in ${n} is for masters`);
    assert.ok(M.legalSetup(p) && p.turn === XQ.RED && !p.inCheck() && p.legal().length, at);
  });
});
test(`${ALL ? 'every formation' : 'the first three formations'}: checkmate in exactly n, one key move, and that move quiet or a sacrifice`, () => {
  D.PUZZLES.slice(0, ALL ? D.PUZZLES.length : 3).forEach(([fen, n], i) => {
    const p = XQ.Pos.fromFen(fen), at = `Trận ${i + 1} ${fen}`, memo = new Map();
    assert.ok(M.mateIn(p, n, true, memo), `${at}: a forced checkmate in ${n}`);
    assert.ok(!M.mateIn(p, n - 1, false, memo), `${at}: no win in fewer moves`);
    const ks = M.keys(p, n, false, memo);
    assert.strictEqual(ks.length, 1, `${at}: key moves ${ks.map(m => XQ.notation(p, m)).join(', ')}`);
    // nothing gives the way in away: no plain check (a check that offers the piece is a sacrifice, and allowed)
    const key = ks[0], cap = p.make(key), check = p.inCheck(), sac = p.legal().some(r => XQ.to(r) === XQ.to(key));
    p.unmake(key, cap);
    assert.ok(!check || sac, `${at}: ${XQ.notation(p, key)} is a plain check`);
    if (ALL) console.log(`      trận ${i + 1}: chiếu bí ${n} nước, mở đầu ${XQ.notation(p, key)}${sac ? ' (thí quân)' : ''}`);
  });
});
test('the tiers have names: Cao thủ, and Đại sư above it', () => {
  assert.strictEqual(D.rank(1), 'Bậc Cao thủ');
  assert.strictEqual(D.rank(2), 'Bậc Đại sư');
  assert.strictEqual(D.level(D.EPOCH).tier, D.PUZZLES[0][2]);
});
test('the day turns at midnight in Vietnam (UTC+7), and the first puzzle is 1 November 2026', () => {
  const vnMidnight = Date.UTC(2026, 10, 1) - 7 * 3600000;
  assert.strictEqual(D.dayOf(vnMidnight), D.EPOCH);
  assert.strictEqual(D.dayOf(vnMidnight - 1), D.EPOCH - 1);
  assert.strictEqual(D.level(D.EPOCH).no, 1);
  assert.strictEqual(D.level(D.EPOCH).fen, D.PUZZLES[0][0]);
  assert.strictEqual(D.level(D.EPOCH + D.PUZZLES.length).fen, D.PUZZLES[0][0], 'the list starts again');
  assert.strictEqual(D.level(D.EPOCH - 1).fen, D.PUZZLES[D.PUZZLES.length - 1][0], 'and days before it wrap too');
  assert.strictEqual(D.dateText(D.EPOCH), 'Chủ nhật, 1/11/2026');
  assert.strictEqual(D.untilNext(vnMidnight), 86400000);
});
test('streak: days in a row up to today, or up to yesterday while today is still open', () => {
  assert.strictEqual(D.streak([10, 9, 8, 6], 10), 3);
  assert.strictEqual(D.streak([9, 8, 6], 10), 2);
  assert.strictEqual(D.streak([8, 7], 10), 0);
  assert.strictEqual(D.streak([], 10), 0);
});
test('a solution wins the day as a campaign battle would: in n moves, or late but within n + 2; not a draw', () => {
  const lv = D.level(D.EPOCH), p = XQ.Pos.fromFen(lv.fen), moves = [], memo = new Map();
  for (let left = lv.n; ; left--) {
    const m = M.keys(p, left, true, memo)[0];
    p.make(m); moves.push(m);
    const replies = p.legal();
    if (!replies.length) break;
    p.make(replies[0]); moves.push(replies[0]);
  }
  const r = C.judge(lv, moves);
  assert.ok(r.over && r.win, JSON.stringify(r));
  assert.ok(!C.judge(lv, moves.slice(0, -1)).over, 'stopping short is no solution');
});

console.log(failed ? `\n${failed} daily test(s) FAILED` : '\nall daily tests passed');
process.exitCode = failed ? 1 : 0;
