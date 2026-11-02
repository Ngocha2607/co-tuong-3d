// lessons.test.js — learning to play (src/lessons.js): every step is a sound position with Red to move, at least one
// legal move reaches its goal, and not every move does
'use strict';
const assert = require('assert');
const XQ = require('../src/xiangqi.js');
const LESSONS = require('../src/lessons.js');

let steps = 0;
for (const l of LESSONS.list) l.steps.forEach((st, i) => {
  const name = `${l.name} ${i + 1}`;
  const pos = XQ.Pos.fromFen(st.fen);
  assert.strictEqual(pos.turn, 1, `${name}: Red to move`);
  assert.ok(pos.b.includes(XQ.K) && pos.b.includes(-XQ.K), `${name}: both generals`);
  assert.ok(!pos.checked(-1), `${name}: Black is not in check with Red to move`);
  const legal = pos.legal(), good = [];
  for (const m of legal) {
    const p = XQ.Pos.fromFen(st.fen), keys = [p.key()];
    p.make(m);
    if (LESSONS.done(st, XQ.from(m), XQ.to(m), XQ.status(p, keys, 0, [m]))) good.push(m);
  }
  assert.ok(good.length > 0, `${name}: some move reaches the goal`);
  assert.ok(good.length < legal.length, `${name}: not every move does`);
  assert.ok(st.say, `${name}: says what to do`);
  steps++;
  console.log(`ok    ${name}: ${good.length} of ${legal.length} moves do it`);
});
assert.ok(steps >= 10);
console.log('\nall lesson tests passed');
