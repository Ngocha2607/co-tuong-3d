// jieqi.test.js — cờ úp (src/jieqi.js): the deal, face-down pieces moving as their starting point's piece, turning up
'use strict';
const assert = require('assert');
const XQ = require('../src/xiangqi.js');
const JQ = require('../src/jieqi.js');

const ok = (name, fn) => { fn(); console.log('ok    ' + name); };
const sq = (r, c) => r * 9 + c, mv = (a, b) => XQ.mv(a, b);
const seeded = n => () => { n = (n * 16807) % 2147483647; return n / 2147483647; };

ok('a deal shuffles each side\'s fifteen pieces over its fifteen points, generals stay open', () => {
  const d = JQ.deal(seeded(7));
  assert.ok(JQ.validDeal(d));
  assert.strictEqual(JQ.HIDDEN.length, 30);
  assert.strictEqual(d[sq(9, 4)], 0); assert.strictEqual(d[sq(0, 4)], 0);
  assert.notDeepStrictEqual(d, JQ.deal(seeded(8)));
  const bad = d.slice(); bad[sq(9, 0)] = -XQ.R; assert.ok(!JQ.validDeal(bad));
  const swapped = d.slice(); swapped[sq(9, 0)] = XQ.K; assert.ok(!JQ.validDeal(swapped));
});

ok('face down, a piece moves as its starting point\'s piece: the same 44 opening moves', () => {
  assert.strictEqual(JQ.start().legal().length, 44);
});

ok('a move turns the piece up; it then moves as what it is', () => {
  const p = JQ.start(), d = new Array(90).fill(0);
  JQ.HIDDEN.forEach(s => { d[s] = XQ.Pos.fromFen(XQ.START).b[s]; });
  d[sq(9, 0)] = XQ.C; d[sq(7, 1)] = XQ.R;           // the chariot's point hides a cannon and the other way round
  const m = mv(sq(9, 0), sq(8, 0)), info = JQ.reveals(p, m, d);
  assert.deepStrictEqual(info, { r: XQ.C, c: 0 });
  assert.strictEqual(JQ.notation(p, m, info), 'Xe úp 9 tiến 1, lật Pháo');
  const r = JQ.apply(p, m, info);
  assert.strictEqual(r.turned, XQ.C); assert.strictEqual(p.b[sq(8, 0)], XQ.C); assert.strictEqual(p.dark[sq(9, 0)], 0);
  assert.strictEqual(p.dark[sq(8, 0)], 0);
});

ok('turned up, an advisor and an elephant go anywhere; face down they keep to their own', () => {
  const p = XQ.Pos.fromFen('3k5/9/9/9/9/2A1B4/9/9/9/4K4 w');
  JQ.withDark(p, []);
  const to = s => p.legal().filter(m => XQ.from(m) === s).map(XQ.to).sort((a, b) => a - b);
  assert.deepStrictEqual(to(sq(5, 2)), [sq(4, 1), sq(4, 3), sq(6, 1), sq(6, 3)]);               // out of the palace
  assert.deepStrictEqual(to(sq(5, 4)), [sq(3, 2), sq(3, 6), sq(7, 2), sq(7, 6)]);               // across the river
  JQ.withDark(p, [sq(5, 4)]);                         // face down, an elephant is still bound to its own side
  assert.deepStrictEqual(to(sq(5, 4)), [sq(7, 2), sq(7, 6)]);
  const q = XQ.Pos.fromFen('3k5/9/9/9/9/9/9/9/4A4/4K4 w');
  JQ.withDark(q, []);
  assert.deepStrictEqual(q.legal().filter(m => XQ.from(m) === sq(8, 4)).map(XQ.to).sort((a, b) => a - b), [sq(7, 3), sq(7, 5), sq(9, 3), sq(9, 5)]);
});

ok('taking a face-down piece turns it up', () => {
  const p = JQ.start(), d = JQ.deal(seeded(3));
  // the face-down piece on Red's cannon point (7,7) takes the one on Black's horse point (0,7), over (2,7)
  const m = mv(sq(7, 7), sq(0, 7)), info = JQ.reveals(p, m, d);
  assert.ok(p.legal().includes(m));
  const r = JQ.apply(p, m, info);
  assert.strictEqual(r.cap, d[sq(0, 7)]); assert.strictEqual(r.turned, d[sq(7, 7)]);
  assert.ok(JQ.notation(JQ.start(), m, info).includes('ăn'));
});

ok('the search plays on a position with face-down pieces', () => {
  const p = JQ.start(), r = XQ.think(p, { time: 300, depth: 3 });
  assert.ok(p.legal().includes(r.move));
  assert.ok(p.dark);
});
