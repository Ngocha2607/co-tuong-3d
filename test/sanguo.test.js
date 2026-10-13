// sanguo.test.js — `npm test`: the three-kingdom board's connections, the move rules, falls and the engine.
'use strict';
const assert = require('assert');
const SG = require('../src/sanguo.js');
const { sq, piece } = SG;
let failed = 0;
function test(name, fn) {
  try { fn(); console.log('ok   ', name); } catch (e) { failed++; console.log('FAIL ', name, '\n     ', e.message); }
}
// a position from a list of [kingdom, row, col, type, home?, owner?]
function setup(list, turn = 0) {
  const p = new SG.Pos();
  for (const [k, r, c, t, home = k, owner = home] of list) p.put(sq(k, r, c), piece(t, home, owner));
  p.setTurn(turn);
  return p;
}
// generals on column 3: each one's file leads to a neighbour's column 5, so none of them face each other
const kings = [[0, 0, 3, SG.K], [1, 0, 3, SG.K], [2, 0, 3, SG.K]];
const targets = (p, s) => p.legal().filter(m => SG.from(m) === s).map(SG.to).sort((a, b) => a - b);
const sorted = a => a.slice().sort((x, y) => x - y);

test('every step can be walked back', () => {
  for (let s = 0; s < SG.SQ; s++) for (let d = 0; d < 4; d++) for (const [t, d2] of SG.STEP[s * 4 + d]) {
    assert.ok(SG.STEP[t * 4 + ((d2 + 2) & 3)].some(([u, d3]) => u === s && d3 === ((d + 2) & 3)), `step ${s}/${d} -> ${t}`);
  }
});
test('points are laid out without overlap, at least a piece apart', () => {
  for (let a = 0; a < SG.SQ; a++) for (let b = a + 1; b < SG.SQ; b++) {
    const d = Math.hypot(SG.XZ[a * 2] - SG.XZ[b * 2], SG.XZ[a * 2 + 1] - SG.XZ[b * 2 + 1]);
    assert.ok(d > 0.86, `points ${a} and ${b} are ${d.toFixed(2)} apart`);
  }
});
test('neighbouring points across a river are one unit apart', () => {
  for (let s = 0; s < SG.SQ; s++) if (SG.rOf(s) === 4) for (const [t] of SG.STEP[s * 4]) {
    const d = Math.hypot(SG.XZ[s * 2] - SG.XZ[t * 2], SG.XZ[s * 2 + 1] - SG.XZ[t * 2 + 1]);
    assert.ok(Math.abs(d - 1) < 1e-4, `${s} -> ${t}: ${d}`);
  }
});
test('opening: the same 44 moves for each kingdom, nobody in check', () => {
  const p = SG.Pos.start();
  for (let k = 0; k < 3; k++) { p.setTurn(k); assert.strictEqual(p.legal().length, 44); assert.ok(!p.checked(k)); }
});
test('a chariot on the left file crosses into the left neighbour, column c meeting 8 - c', () => {
  const p = setup([...kings, [0, 4, 0, SG.R]]);
  const t = targets(p, sq(0, 4, 0));
  assert.ok(t.includes(sq(2, 4, 8)) && t.includes(sq(2, 0, 8)));
  assert.ok(!t.some(s => SG.kOf(s) === 1));
});
test('the centre file forks into both neighbours', () => {
  const p = setup([...kings, [0, 3, 4, SG.R]]);
  const t = targets(p, sq(0, 3, 4));
  for (const k of [1, 2]) for (let r = 0; r <= 4; r++) assert.ok(t.includes(sq(k, r, 4)), `kingdom ${k} row ${r}`);
});
test('a cannon can jump the centre screen into either branch', () => {
  const p = setup([...kings, [0, 2, 4, SG.C], [0, 4, 4, SG.P], [1, 2, 4, SG.N], [2, 1, 4, SG.N]]);
  const t = targets(p, sq(0, 2, 4));
  assert.ok(t.includes(sq(1, 2, 4)) && t.includes(sq(2, 1, 4)));
});
test('generals may not face each other across the board', () => {
  // Wei's column 5 runs across the river into Shu's column 3, where Shu's general stands (Shu is on Wei's right)
  const p = setup([[0, 0, 3, SG.K], [1, 0, 3, SG.K], [2, 0, 4, SG.K]], 2);
  const t = targets(p, sq(2, 0, 4));
  assert.ok(!t.includes(sq(2, 0, 5)));
  assert.ok(t.includes(sq(2, 1, 4)) && t.includes(sq(2, 0, 3)));
});
test('a soldier goes forward at home, on and sideways abroad', () => {
  const p = setup([...kings, [0, 4, 2, SG.P], [1, 2, 6, SG.P, 0]]);
  assert.deepStrictEqual(targets(p, sq(0, 4, 2)), [sq(2, 4, 6)]);
  assert.deepStrictEqual(targets(p, sq(1, 2, 6)), sorted([sq(1, 1, 6), sq(1, 2, 5), sq(1, 2, 7)]));
});
test('a soldier at the top of the centre file may go into either neighbour', () => {
  const p = setup([...kings, [0, 4, 4, SG.P]]);
  assert.deepStrictEqual(targets(p, sq(0, 4, 4)), sorted([sq(1, 4, 4), sq(2, 4, 4)]));
});
test('an elephant stays at home, a horse is stopped by its leg', () => {
  const p = setup([...kings, [0, 4, 2, SG.B], [0, 2, 2, SG.N], [0, 3, 2, SG.P]]);
  assert.ok(targets(p, sq(0, 4, 2)).every(s => SG.kOf(s) === 0));
  assert.ok(!targets(p, sq(0, 2, 2)).some(s => SG.rOf(s) === 4 && SG.kOf(s) === 0 && Math.abs(SG.cOf(s) - 2) === 1));
});
test('generals are never taken', () => {
  const p = setup([...kings, [0, 4, 7, SG.R]]);
  // Shu's chariot crosses into Wu's column 1 and runs down it; Wu's general on column 3 is not in its path, but
  // along Wu's back rank it would be: the chariot may go to Wu's back rank, never onto the general
  assert.ok(!p.legal().some(m => SG.to(m) === sq(1, 0, 3)));
});
test('attacked() agrees with the moves every rival could make', () => {
  let seed = 7;
  const rand = n => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  for (let game = 0; game < 30; game++) {
    let p = SG.Pos.start();
    for (let ply = 0; ply < 160 && p.living() > 1; ply++) {
      for (let k = 0; k < 3; k++) {
        if (!p.alive[k]) continue;
        const ks = p.kings[k];
        let hit = false;
        for (let o = 0; o < 3; o++) {
          if (o === k || !p.alive[o]) continue;
          const q = p.clone(); q.setTurn(o);
          if (q.gen([], false, true).some(m => SG.to(m) === ks)) hit = true;
        }
        assert.strictEqual(p.attacked(ks, k), hit, `game ${game} ply ${ply} kingdom ${k}`);
      }
      const moves = p.legal();
      if (!moves.length) break;
      p = SG.play(p, moves[rand(moves.length)]).pos;
    }
  }
});
// Shu (0) mates Wu (1): a chariot already holds Wu's second row, the other one comes down to its back rank
const mating = () => setup([...kings, [1, 3, 0, SG.P], [1, 1, 8, SG.R, 0, 0], [1, 3, 7, SG.R, 0, 0]], 0);
test('a cornered kingdom falls: its general leaves, its army goes to the one who cornered it', () => {
  const r = SG.play(mating(), SG.mv(sq(1, 3, 7), sq(1, 0, 7)));
  assert.deepStrictEqual(r.falls.map(f => [f.k, f.by, f.king, f.mate]), [[1, 0, sq(1, 0, 3), true]]);
  assert.ok(!r.pos.alive[1] && r.pos.kings[1] === -1 && !r.pos.b[sq(1, 0, 3)]);
  const soldier = r.pos.b[sq(1, 3, 0)];
  assert.strictEqual(SG.OWN(soldier), 0); assert.strictEqual(SG.HOME(soldier), 1);
  assert.strictEqual(r.pos.turn, 2);                       // Wu is skipped from now on
  assert.deepStrictEqual(SG.status(r.pos, [], 0).over, false);
});
test('a conquered soldier still moves by its home', () => {
  const r = SG.play(mating(), SG.mv(sq(1, 3, 7), sq(1, 0, 7)));
  const p = r.pos.clone(); p.setTurn(0);
  assert.deepStrictEqual(targets(p, sq(1, 3, 0)), [sq(1, 4, 0)]);
});
test('resigning takes the whole army off the board', () => {
  const p = SG.Pos.start(); p.fall(1, -1);
  assert.ok(!p.b.some(v => v && SG.OWN(v) === 1));
  assert.strictEqual(p.living(), 2);
});
test('the last general standing wins', () => {
  const p = setup([...kings, [1, 1, 8, SG.R, 0, 0], [1, 3, 7, SG.R, 0, 0]], 0);
  p.fall(2, 0);
  const r = SG.play(p, SG.mv(sq(1, 3, 7), sq(1, 0, 7)));
  assert.deepStrictEqual(SG.status(r.pos, [], 0), { over: true, winner: 0, reason: 'unite' });
});
test('the engine finds a legal move from the opening, in time', () => {
  const p = SG.Pos.start(), t0 = Date.now();
  const r = SG.think(p, { time: 600 });
  assert.ok(Date.now() - t0 < 1500, `took ${Date.now() - t0} ms`);
  assert.ok(p.legal().includes(r.move) && r.depth >= 2, `depth ${r.depth}`);
});
test('the engine takes a free chariot', () => {
  const p = setup([...kings, [0, 2, 0, SG.R], [2, 2, 8, SG.R]]);
  const r = SG.think(p, { time: 500 });
  assert.strictEqual(SG.to(r.move), sq(2, 2, 8));
});
test('the engine mates when it can', () => {
  const r = SG.think(mating(), { time: 800 });
  assert.strictEqual(r.move, SG.mv(sq(1, 3, 7), sq(1, 0, 7)));
});
test('a straight move goes along the lines: over the bend at the centre file, across the river', () => {
  assert.deepStrictEqual(SG.via(SG.mv(sq(0, 2, 1), sq(0, 2, 7))), [2, 3, 4, 5, 6].map(c => sq(0, 2, c)));
  assert.deepStrictEqual(SG.via(SG.mv(sq(0, 3, 0), sq(2, 2, 8))), [sq(0, 4, 0), sq(2, 4, 8), sq(2, 3, 8)]);
  assert.deepStrictEqual(SG.via(SG.mv(sq(0, 3, 4), sq(1, 3, 4))), [sq(0, 4, 4), sq(1, 4, 4)]);
  assert.deepStrictEqual(SG.via(SG.mv(sq(0, 0, 1), sq(0, 2, 2))), []);   // a horse jumps
});
test('pack and unpack keep the position', () => {
  let p = SG.Pos.start();
  for (const m of [p.legal()[3]]) p = SG.play(p, m).pos;
  const q = SG.unpack(JSON.parse(JSON.stringify(SG.pack(p))));
  assert.strictEqual(q.key(), p.key()); assert.deepStrictEqual(q.mat, p.mat); assert.strictEqual(q.turn, p.turn);
});

if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log('\nall three-kingdom tests passed');
