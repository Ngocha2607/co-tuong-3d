// quests.test.js — nhiệm vụ tuần (src/quests.js): the weeks, the three tasks of each, and games counting towards them
'use strict';
const assert = require('assert');
const Q = require('../src/quests.js');
const SKINS = require('../src/skins.js');

const ok = (name, fn) => { fn(); console.log('ok    ' + name); };
const VN = (y, m, d, h = 0) => Date.UTC(y, m - 1, d, h) - 7 * 3600e3;   // a time in Vietnam

ok('a week runs from Monday 0:00 to Sunday 24:00 in Vietnam', () => {
  const mon = VN(2026, 11, 2), w = Q.weekOf(mon);                      // 2 November 2026 is a Monday
  assert.strictEqual(Q.weekOf(mon - 1), w - 1);
  assert.strictEqual(Q.weekOf(VN(2026, 11, 8, 23)), w);
  assert.strictEqual(Q.weekOf(VN(2026, 11, 9)), w + 1);
  assert.strictEqual(Q.weekEnds(w), VN(2026, 11, 9));
});

ok('each week has three different tasks from the pool, the same for everyone, and they change', () => {
  const seen = new Set();
  for (let w = 2900; w < 2960; w++) {
    const ids = Q.of(w);
    assert.strictEqual(new Set(ids).size, 3);
    assert.ok(ids.every(id => Q.byId[id]));
    assert.deepStrictEqual(Q.of(w), ids);
    seen.add(ids.join());
  }
  assert.ok(seen.size > 40, 'weeks differ');
});

ok('games count: captures by kind, wins with conditions; a task done gives a star, once', () => {
  const t = VN(2026, 11, 4), week = Q.weekOf(t);
  // the week's tasks may be any of the pool: count every task by hand through count's own rules
  const log = [{ side: 1, pc: 4, cap: -7 }, { side: -1, pc: -5, cap: 6 }, { side: 1, pc: 4, cap: -5 }, { side: 1, pc: 6, cap: -4 }, { side: 1, pc: 4, cap: 0 }];
  const g = { mode: 'ai', level: 2, won: true, reason: 'checkmate', plies: 41, me: 1, log };
  assert.strictEqual(Q.byId.ma.add(g), 2);
  assert.strictEqual(Q.byId.phao.add(g), 1);
  assert.strictEqual(Q.byId['xe-dich'].add(g), 1);
  assert.strictEqual(Q.byId.kho.add(g), 1);
  assert.strictEqual(Q.byId['giu-phao'].add(g), 0, 'a cannon was lost');
  assert.strictEqual(Q.byId['giu-xe'].add(g), 1);
  assert.strictEqual(Q.byId['ma-bi'].add(g), 1, 'the last move, by a horse, mated');
  assert.strictEqual(Q.byId.nhanh.add(g), 1);
  assert.strictEqual(Q.byId['tam-quoc'].add(g), 0);
  assert.strictEqual(Q.byId['tam-quoc'].add({ mode: 'sanguo' }), 1);
  assert.strictEqual(Q.byId.thang.add({ ...g, won: false }), 0);
  // the week: play the same game until every task that can be done with it is
  let st = null, stars = 0;
  for (let i = 0; i < 5; i++) { const r = Q.count(st, g, t); st = r.st; stars += r.done.length; }
  assert.strictEqual(st.week, week);
  assert.strictEqual(st.stars, stars);
  for (const id of Q.of(week)) assert.ok((st.got[id] | 0) <= Q.byId[id].goal);
  // a new week starts afresh, the stars stay
  const next = Q.count(st, { mode: 'online', me: 1, log: [] }, t + 7 * 86400e3).st;
  assert.strictEqual(next.week, week + 1); assert.strictEqual(next.stars, st.stars);
  assert.ok(Object.values(next.got).every(n => n <= 1));
});

ok('six quest stars open the Sơn son pieces', () => {
  const rec = q => ({ stars: 0, ach: new Set(), season: false, quests: q });
  assert.ok(!SKINS.earned('pieces', 'son', rec(5)));
  assert.ok(SKINS.earned('pieces', 'son', rec(6)));
  assert.strictEqual(SKINS.requirement('pieces', 'son'), 'Hoàn thành 6 nhiệm vụ tuần');
});
