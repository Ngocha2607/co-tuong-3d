// rules.test.js — `npm test`: move generator against published perft counts, plus a few rule and engine checks.
'use strict';
const assert = require('assert');
const XQ = require('../src/xiangqi.js');
const sq = (r, c) => r * 9 + c;
let failed = 0;
function test(name, fn) {
  try { fn(); console.log('ok   ', name); } catch (e) { failed++; console.log('FAIL ', name, '\n     ', e.message); }
}

const PERFT = [
  [XQ.START, [44, 1920, 79666]],
  ['r1ba1a3/4kn3/2n1b4/pNp1p1p1p/4c4/6P2/P1P2R2P/1CcC5/9/2BAKAB2 w', [38, 1128, 43929]],
  ['1cbak4/9/n2a5/2p1p3p/5cp2/2n2N3/6PCP/3AB4/2C6/3A1K1N1 w', [7, 281, 8620]],
  ['5a3/3k5/3aR4/9/5r3/5n3/9/3A1A3/5K3/2BC2B2 w', [25, 424, 9850]],
];
for (const [fen, want] of PERFT) test('perft ' + fen.slice(0, 24), () => {
  const p = XQ.Pos.fromFen(fen);
  assert.deepStrictEqual(want.map((_, i) => XQ.perft(p, i + 1)), want);
  assert.strictEqual(p.fen(), fen);
});

test('flying general: a general may not face the other one on an open file', () => {
  const p = XQ.Pos.fromFen('4k4/9/9/9/9/9/9/9/9/3K5 w');
  assert.ok(!p.legal().includes(XQ.mv(sq(9, 3), sq(9, 4))));
});
test('horse leg blocks the jump', () => {
  const p = XQ.Pos.fromFen('4k4/9/9/9/9/9/9/4P4/4N4/4K4 w');
  const to = p.legal().filter(m => XQ.from(m) === sq(8, 4)).map(XQ.to);
  assert.ok(!to.includes(sq(6, 3)) && !to.includes(sq(6, 5)));
  assert.ok(to.includes(sq(7, 2)) && to.includes(sq(7, 6)));
});
test('elephant may not cross the river', () => {
  const p = XQ.Pos.fromFen('4k4/9/9/9/9/2B6/9/9/9/4K4 w');
  assert.ok(p.legal().filter(m => XQ.from(m) === sq(5, 2)).every(m => XQ.row(XQ.to(m)) >= 5));
});
test('soldier moves sideways only after crossing the river', () => {
  const a = XQ.Pos.fromFen('4k4/9/9/9/9/9/4P4/9/9/3K5 w'), b = XQ.Pos.fromFen('4k4/9/9/9/4P4/9/9/9/9/3K5 w');
  assert.strictEqual(a.legal().filter(m => XQ.from(m) === sq(6, 4)).length, 1);
  assert.strictEqual(b.legal().filter(m => XQ.from(m) === sq(4, 4)).length, 3);
});
test('cannon captures only over exactly one screen', () => {
  const p = XQ.Pos.fromFen('4k4/9/4r4/9/4p4/9/9/4C4/9/3K5 w');
  const to = p.legal().filter(m => XQ.from(m) === sq(7, 4)).map(XQ.to);
  assert.ok(to.includes(sq(2, 4)) && !to.includes(sq(4, 4)));
});
test('no legal move loses, even without check (stalemate)', () => {
  const p = XQ.Pos.fromFen('3k5/4R4/9/9/9/9/9/9/9/5K3 b');
  const st = XQ.status(p, [], 0);
  assert.ok(st.over && st.winner === XQ.RED);
});
test('threefold repetition is a draw', () => {
  const p = XQ.Pos.fromFen(XQ.START), keys = [];
  const loop = [XQ.mv(sq(9, 1), sq(7, 2)), XQ.mv(sq(0, 1), sq(2, 2)), XQ.mv(sq(7, 2), sq(9, 1)), XQ.mv(sq(2, 2), sq(0, 1))];
  for (let i = 0; i < 8; i++) { keys.push(p.key()); p.make(loop[i % 4]); }
  assert.strictEqual(XQ.status(p, keys, 8).reason, 'repetition');
});
// play `loop` over and over from fen until its first position has come back twice → status with the full history
function repeat(fen, loop) {
  const p = XQ.Pos.fromFen(fen), keys = [], moves = [];
  for (let i = 0; i < loop.length * 2; i++) {
    const m = loop[i % loop.length];
    assert.ok(p.legal().includes(m), 'illegal test move ' + i);
    keys.push(p.key()); p.make(m); moves.push(m);
  }
  return XQ.status(p, keys, moves.length, moves);
}
test('perpetual check loses', () => {
  // the red chariot checks along two files, the black general steps across each time
  const st = repeat('4k4/9/9/9/9/3R5/9/9/9/5K3 w', [
    XQ.mv(sq(5, 3), sq(5, 4)), XQ.mv(sq(0, 4), sq(0, 3)), XQ.mv(sq(5, 4), sq(5, 3)), XQ.mv(sq(0, 3), sq(0, 4)),
  ]);
  assert.deepStrictEqual(st, { over: true, winner: XQ.BLACK, reason: 'perpetual-check' });
});
test('perpetual chase of an unprotected piece loses', () => {
  // the red chariot keeps attacking a lone black cannon that runs from one side of the board to the other
  const st = repeat('4k4/9/1c7/9/9/9/1R7/9/9/3K5 b', [
    XQ.mv(sq(2, 1), sq(2, 7)), XQ.mv(sq(6, 1), sq(6, 7)), XQ.mv(sq(2, 7), sq(2, 1)), XQ.mv(sq(6, 7), sq(6, 1)),
  ]);
  assert.deepStrictEqual(st, { over: true, winner: XQ.BLACK, reason: 'perpetual-chase' });
});
test('chasing a protected piece of lower value is allowed: repetition is a draw', () => {
  // same chase, but a black chariot guards each square the cannon runs to; when the cannon leaves, the chariots
  // face each other, which is an offered exchange and not a chase either
  const st = repeat('1r2k2r1/9/1c7/9/9/9/1R7/9/9/3K5 b', [
    XQ.mv(sq(2, 1), sq(2, 7)), XQ.mv(sq(6, 1), sq(6, 7)), XQ.mv(sq(2, 7), sq(2, 1)), XQ.mv(sq(6, 7), sq(6, 1)),
  ]);
  assert.strictEqual(st.reason, 'repetition');
});
test('both sides just shuffling: repetition is a draw', () => {
  const st = repeat('4k4/9/9/9/9/9/9/9/9/3K5 w', [
    XQ.mv(sq(9, 3), sq(8, 3)), XQ.mv(sq(0, 4), sq(1, 4)), XQ.mv(sq(8, 3), sq(9, 3)), XQ.mv(sq(1, 4), sq(0, 4)),
  ]);
  assert.deepStrictEqual(st, { over: true, winner: 0, reason: 'repetition' });
});
test('second time a position comes back is reported, so players can be warned', () => {
  const p = XQ.Pos.fromFen('4k4/9/9/9/9/9/9/9/9/3K5 w'), keys = [], moves = [];
  for (const m of [XQ.mv(sq(9, 3), sq(8, 3)), XQ.mv(sq(0, 4), sq(1, 4)), XQ.mv(sq(8, 3), sq(9, 3)), XQ.mv(sq(1, 4), sq(0, 4))]) { keys.push(p.key()); p.make(m); moves.push(m); }
  assert.strictEqual(XQ.status(p, keys, 4, moves).repeat, 1);
});
test('notation: Pháo 2 bình 5, Mã 2 tiến 3, Xe trước tiến 1', () => {
  const p = XQ.Pos.fromFen(XQ.START);
  assert.strictEqual(XQ.notation(p, XQ.mv(sq(7, 7), sq(7, 4))), 'Pháo 2 bình 5');
  assert.strictEqual(XQ.notation(p, XQ.mv(sq(9, 7), sq(7, 6))), 'Mã 2 tiến 3');
  const q = XQ.Pos.fromFen('4k4/9/9/9/9/9/R8/9/R8/4K4 w');
  assert.strictEqual(XQ.notation(q, XQ.mv(sq(6, 0), sq(5, 0))), 'Xe trước tiến 1');
});
test('engine finds a mate in one', () => {
  const p = XQ.Pos.fromFen('4k4/9/4P4/9/9/9/9/9/9/3K1R3 w');
  const r = XQ.think(p, { time: 1500 });
  assert.ok(r.score > XQ.MATE - 200, 'score ' + r.score);
});
test('incremental hash and score stay in sync with a fresh position', () => {
  const p = XQ.Pos.fromFen(XQ.START);
  for (let i = 0; i < 200; i++) {
    const ms = p.legal(); if (!ms.length) break;
    p.make(ms[(i * 7919) % ms.length]);
    const q = XQ.Pos.fromFen(p.fen());
    assert.ok(q.lo === p.lo && q.hi === p.hi && q.val === p.val, 'ply ' + i);
  }
});
console.log(failed ? `\n${failed} test(s) failed` : '\nall tests passed');
process.exit(failed ? 1 : 0);
