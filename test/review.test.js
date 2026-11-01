// review.test.js — `npm test`: the verdicts on moves after a game (src/review.js), from made-up searches and from the
// engine itself, the words they come with, and the games kept on this device.
'use strict';
const assert = require('assert');
const XQ = require('../src/xiangqi.js');
const R = require('../src/review.js');
let failed = 0;
function test(name, fn) {
  try { fn(); console.log('ok   ', name); } catch (e) { failed++; console.log('FAIL ', name, '\n     ', e.message); }
}
const find = (fen, text) => { const p = XQ.Pos.fromFen(fen); const m = p.legal().find(x => XQ.notation(p, x) === text); assert.ok(m, text); return m; };

test('chances of winning: even at 0, a chariot up near 87, a mate counted as more than any material', () => {
  assert.strictEqual(R.win(0), 50);
  assert.ok(R.win(600) > 85 && R.win(600) < 89, R.win(600));
  assert.ok(R.win(XQ.MATE - 3) > R.win(1999));
  assert.strictEqual(R.mateIn(XQ.MATE - 5), 3);
  assert.strictEqual(R.mateIn(-(XQ.MATE - 2)), -1);
  assert.strictEqual(R.mateIn(500), 0);
});

test('verdicts: the only good move gets a !, a lost side walking into mate is told so, the rest waits', () => {
  const a = find(XQ.START, 'Pháo 2 bình 5'), p = XQ.Pos.fromFen(XQ.START); p.make(a);
  const b = p.legal().find(m => XQ.notation(p, m) === 'Mã 8 tiến 7');
  // after a: Black to move, already a chariot down (made up); after b: Red mates in 3
  const evals = [{ s: 0, b: a, a: -300 }, { s: -600, b: 0 }, { s: XQ.MATE - 5, b: 0 }];
  const vs = R.verdicts(XQ.START, [a, b], evals);
  assert.strictEqual(vs[0].mark, 'good');
  assert.strictEqual(vs[0].side, 1);
  assert.strictEqual(vs[1].side, -1);
  assert.ok(vs[1].mark === 'inaccuracy', vs[1].mark);    // the game was lost already: the chance given away is small
  assert.match(R.comment(vs[1]), /để đối phương có đường chiếu bí trong 3 nước/);
  assert.strictEqual(R.verdicts(XQ.START, [a, b], [evals[0], evals[1]])[1], null, 'not analysed yet');
});

test('verdicts: giving away a horse for nothing is a blunder, less is a mistake or an inaccuracy, and what to play', () => {
  const a = find(XQ.START, 'Pháo 2 bình 5');
  const horse = R.verdicts(XQ.START, [a], [{ s: 0, b: find(XQ.START, 'Mã 2 tiến 3') }, { s: 270 }])[0];
  assert.strictEqual(horse.mark, 'blunder');
  assert.strictEqual(R.comment(horse), 'Nước hớ: mất lợi thế cỡ một quân Mã hay Pháo. Nên đi Mã 2 tiến 3.');
  const soft = R.verdicts(XQ.START, [a], [{ s: 0, b: find(XQ.START, 'Mã 2 tiến 3') }, { s: 180 }])[0];
  assert.strictEqual(soft.mark, 'mistake', 'an advisor and a soldier or so');
  const less = R.verdicts(XQ.START, [a], [{ s: 0, b: find(XQ.START, 'Mã 2 tiến 3') }, { s: 120 }])[0];
  assert.strictEqual(less.mark, 'inaccuracy', 'an advisor');
  const fine = R.verdicts(XQ.START, [a], [{ s: 10, b: find(XQ.START, 'Mã 2 tiến 3') }, { s: 25 }])[0];
  assert.strictEqual(fine.mark, '');
});

test('accuracy: perfect play is 100, a game of blunders far less, and only the side asked about counts', () => {
  const v = (side, drop) => ({ side, drop, mark: '' });
  assert.strictEqual(R.accuracy([v(1, 0), v(-1, 40), v(1, 0)], 1), 100);
  assert.ok(R.accuracy([v(-1, 40), v(-1, 30)], -1) < 30);
  assert.strictEqual(R.accuracy([v(1, 0)], -1), null);
  assert.deepStrictEqual(R.counts([{ side: 1, mark: 'blunder' }, { side: 1, mark: 'good' }, { side: -1, mark: 'blunder' }, null], 1), { blunder: 1, mistake: 0, inaccuracy: 0, good: 1 });
});

test('the engine itself: missing a mate in one is caught, and the mating move is named', () => {
  const fen = '4k4/4a4/R2a5/9/9/9/9/4K4/9/9 w', p = XQ.Pos.fromFen(fen);   // campaign 1-1: Xe 9 tiến 2 mates
  const slow = p.legal().find(m => XQ.notation(p, m) === 'Xe 9 tiến 1');
  const e0 = XQ.think(XQ.Pos.fromFen(fen), { time: 300, full: true });
  const q = XQ.Pos.fromFen(fen); q.make(slow);
  const e1 = XQ.think(q, { time: 300, full: true });
  const v = R.verdicts(fen, [slow], [{ s: e0.score, b: e0.move }, { s: e1.score, b: e1.move }])[0];
  assert.notStrictEqual(v.mark, 'best');
  assert.notStrictEqual(v.mark, '');
  assert.match(R.comment(v), /Nên đi Xe 9 tiến 2/);
  assert.ok(R.mateIn(e0.score) === 1, 'mate in one at the start');
});

test('think: full gives a real score with one move left; exclude finds the second best', () => {
  const p = XQ.Pos.fromFen(XQ.START), best = XQ.think(p, { time: 200 });
  const second = XQ.think(XQ.Pos.fromFen(XQ.START), { time: 200, exclude: [best.move] });
  assert.ok(second.move && second.move !== best.move);
});

test('the chart: a point per analysed position, dots for blunders, the cursor where the game is looked at', () => {
  const a = find(XQ.START, 'Pháo 2 bình 5');
  const evals = [{ s: 0, b: 1 }, { s: 300, b: 0 }], vs = R.verdicts(XQ.START, [a], evals);
  const svg = R.chart(XQ.START, [a], evals, vs, 1);
  assert.match(svg, /<path class="red"/);
  assert.match(svg, /<line class="dot blunder" x1="1000.0"/);
  assert.match(svg, /<line class="at" x1="1000.0"/);
  assert.doesNotMatch(R.chart(XQ.START, [a], [], [], 0), /<path/);
  assert.strictEqual(R.standText(250, 1), 'Đỏ hơn 2,5');
  assert.strictEqual(R.standText(250, -1), 'Đen hơn 2,5');
  assert.strictEqual(R.standText(-(XQ.MATE - 3), 1), 'Đen chiếu bí trong 2 nước');
});

test('games kept on this device: newest first, the same game once, at most 30, analysis kept with them', () => {
  const mem = {};
  global.localStorage = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); } };
  const g = n => ({ at: n, kind: 'ai', fen0: XQ.START, moves: [n, n + 1], me: 1, names: { 1: 'Bạn', '-1': 'Máy' }, winner: 1, reason: 'checkmate' });
  const first = R.add(g(1));
  assert.strictEqual(R.add(g(1)).id, first.id, 'seen again: not kept twice');
  for (let i = 2; i <= 40; i++) R.add(g(i));
  const list = R.list();
  assert.strictEqual(list.length, 30);
  assert.strictEqual(list[0].at, 40);
  assert.deepStrictEqual(R.unpack(list[0]).moves, [40, 41]);
  R.saveEvals(list[0].id, [{ s: 5, b: 7 }, null, { s: -3, b: 9, a: -80 }]);
  assert.deepStrictEqual(R.evalsOf(R.get(list[0].id)), [{ s: 5, b: 7, a: undefined }, null, { s: -3, b: 9, a: -80 }]);
  R.remove(list[0].id);
  assert.strictEqual(R.list().length, 29);
  delete global.localStorage;
});

console.log(failed ? `\n${failed} review test(s) FAILED` : '\nall review tests passed');
process.exitCode = failed ? 1 : 0;
