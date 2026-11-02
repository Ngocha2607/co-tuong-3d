// skins.test.js — the looks (src/skins.js): packing them into one string, and what opens each one
'use strict';
const assert = require('assert');
const SKINS = require('../src/skins.js');

const ok = (name, fn) => { fn(); console.log('ok    ' + name); };
const rec = (o = {}) => ({ stars: 0, ach: new Set(), season: false, ...o });

ok('packing: three looks in one string, and back; anything unknown is the first of its kind', () => {
  assert.strictEqual(SKINS.pack(SKINS.DEFAULT), 'go/nga/mau');
  assert.strictEqual(SKINS.pack({ board: 'ngoc', pieces: 'mun', army: 'tuong-vang' }), 'ngoc/mun/tuong-vang');
  assert.deepStrictEqual(SKINS.unpack('dong/ngoc/tuong-dong'), { board: 'dong', pieces: 'ngoc', army: 'tuong-dong' });
  assert.deepStrictEqual(SKINS.unpack(''), SKINS.DEFAULT);
  assert.deepStrictEqual(SKINS.unpack('vang/<b>/__proto__'), SKINS.DEFAULT);
  assert.deepStrictEqual(SKINS.unpack(undefined), SKINS.DEFAULT);
  assert.strictEqual(SKINS.pack(SKINS.unpack('son-mai/x')), 'son-mai/nga/mau');
});

ok('the first look of each kind is open to everyone', () => {
  for (const k of SKINS.NAMES) assert.ok(SKINS.earned(k, SKINS.DEFAULT[k], rec()), k);
});

ok('the others open with stars, achievements, one achievement, or a top ten season', () => {
  assert.ok(!SKINS.earned('board', 'son-mai', rec({ stars: 23 })));
  assert.ok(SKINS.earned('board', 'son-mai', rec({ stars: 24 })));
  assert.ok(!SKINS.earned('board', 'ngoc', rec({ ach: new Set(['bach-chien']) })));
  assert.ok(SKINS.earned('board', 'ngoc', rec({ ach: new Set(['that-tinh']) })));
  assert.ok(!SKINS.earned('pieces', 'ngoc', rec({ ach: new Set(['a', 'b']) })));
  assert.ok(SKINS.earned('pieces', 'ngoc', rec({ ach: new Set(['a', 'b', 'c']) })));
  assert.ok(SKINS.earned('pieces', 'dong', rec({ ach: new Set(['bach-chien']) })));
  assert.ok(!SKINS.earned('army', 'tuong-vang', rec({ stars: 72, ach: new Set('abcdefghijklmn'.split('')) })));
  assert.ok(SKINS.earned('army', 'tuong-vang', rec({ season: true })));
  // every look that is not free says how it is earned
  for (const k of SKINS.NAMES) for (const s of SKINS.KINDS[k].slice(1)) assert.ok(SKINS.requirement(k, s.id), `${k}/${s.id}`);
});

console.log('\nall skin tests passed');
