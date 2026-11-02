// classics.test.js — ván kinh điển (src/classics.js): every record plays out by the rules, and its heading matches it
'use strict';
const assert = require('assert');
const XQ = require('../src/xiangqi.js');
const CLASSICS = require('../src/classics.js');

const ok = (name, fn) => { fn(); console.log('ok    ' + name); };
ok('every move of every classic is legal, and the games end before a mate on the board or with one', () => {
  assert.ok(CLASSICS.LIST.length >= 6);
  for (const g of CLASSICS.LIST) {
    const pos = XQ.Pos.fromFen(XQ.START), moves = CLASSICS.movesOf(g);
    assert.strictEqual(moves.length, g.iccs.split(' ').length);
    for (const m of moves) { assert.ok(pos.legal().includes(m), `${g.id}: ${m}`); pos.make(m); }
    assert.ok([1, -1].includes(g.winner), `${g.id}: a decided game`);
    assert.ok(g.red && g.black && g.event && g.date && g.opening && /^[A-E]\d\d$/.test(g.ecco), `${g.id}: its heading`);
  }
});
ok('the first move of a record reads as it should: H2-E2 is Pháo 2 bình 5', () => {
  const pos = XQ.Pos.fromFen(XQ.START), m = CLASSICS.movesOf({ iccs: 'H2-E2' })[0];
  assert.strictEqual(XQ.notation(pos, m), 'Pháo 2 bình 5');
});
