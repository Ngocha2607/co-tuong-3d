// campaign.test.js — `npm test`: every battle of the campaign is sound, and the rules that judge and reward them.
// The puzzles are proven exhaustively (test/mate.js): checkmate in exactly n moves against every defence, no win
// at all in fewer, and only one first move that works.
'use strict';
const assert = require('assert');
const XQ = require('../src/xiangqi.js');
const C = require('../src/campaign.js');
const HEROES = require('../src/heroes.js');
const STAGE_LIST = require('../src/stage-list.js');
const M = require('./mate.js');
let failed = 0;
function test(name, fn) {
  try { fn(); console.log('ok   ', name); } catch (e) { failed++; console.log('FAIL ', name, '\n     ', e.message); }
}

test('five chapters of three battles, ids unique, every field in place', () => {
  assert.strictEqual(C.CHAPTERS.length, 5);
  assert.strictEqual(new Set(C.LEVELS.map(l => l.id)).size, 15);
  assert.strictEqual(C.MAX_STARS, 45);
  for (const l of C.LEVELS) {
    assert.ok(l.name && l.story && C.AI[l.ai] && (l.side === 1 || l.side === -1), l.id);
    if (l.type === 'mate') assert.ok(l.n >= 1 && l.n <= 3, l.id);
    else if (l.type === 'survive') assert.ok(l.n > 0 && l.keep >= 0, l.id);
    else assert.ok(l.type === 'handicap' && l.par > 0, l.id);
  }
  for (const c of C.CHAPTERS) assert.ok(c.name && c.intro && c.year && c.stage, c.id);
});
test('every battle starts from a position a real game could reach', () => {
  for (const l of C.LEVELS) {
    const p = XQ.Pos.fromFen(l.fen);
    assert.ok(M.legalSetup(p), `${l.id} ${l.fen}`);
    assert.ok(p.legal().length > 0, `${l.id} has moves`);
    // puzzles and sieges begin with the player to move
    if (l.type !== 'handicap') assert.strictEqual(p.turn, l.side, `${l.id} player moves first`);
  }
});
test('the heroes and stages the campaign uses exist, and every locked one can be earned', () => {
  for (const c of C.CHAPTERS) assert.ok(!c.foe || HEROES.valid(c.foe), c.id + ' foe ' + c.foe);
  for (const r of C.REWARDS) if (r.hero) assert.ok(HEROES.valid(r.hero) && HEROES.byId[r.hero].campaign, 'reward hero ' + r.hero);
  for (const r of C.REWARDS) if (r.stage) assert.ok(STAGE_LIST.valid(r.stage) && STAGE_LIST.byId[r.stage].campaign, 'reward stage ' + r.stage);
  for (const c of C.CHAPTERS) assert.ok(STAGE_LIST.valid(c.stage), c.id + ' stage ' + c.stage);
  // every hero or stage marked as a campaign reward is given by some reward, so none stays locked for ever
  for (const h of HEROES.list.filter(h => h.campaign)) assert.ok(C.REWARDS.some(r => r.hero === h.id), 'no reward gives ' + h.id);
  for (const s of STAGE_LIST.list.filter(s => s.campaign)) assert.ok(C.REWARDS.some(r => r.stage === s.id), 'no reward gives ' + s.id);
});

for (const l of C.LEVELS.filter(l => l.type === 'mate')) {
  test(`puzzle ${l.id} "${l.name}": checkmate in exactly ${l.n}, one key move`, () => {
    const p = XQ.Pos.fromFen(l.fen);
    assert.ok(M.mateIn(p, l.n, true), 'a forced checkmate in ' + l.n);
    if (l.n > 1) assert.ok(!M.mateIn(p, l.n - 1), 'no win in fewer moves');
    const ks = M.keys(p, l.n);
    assert.strictEqual(ks.length, 1, 'key moves: ' + ks.map(m => XQ.notation(p, m)).join(', '));
  });
}

// plays a puzzle to the end: the player follows a winning line, the defence takes its first reply each time
function solve(l) {
  const p = XQ.Pos.fromFen(l.fen), moves = [];
  for (let left = l.n; ; left--) {
    const m = M.keys(p, left, true)[0];
    p.make(m); moves.push(m);
    const replies = p.legal();
    if (!replies.length) return moves;
    p.make(replies[0]); moves.push(replies[0]);
  }
}
test('judge: a puzzle solved in n moves wins three stars, two with help, none if it stops short', () => {
  for (const l of C.LEVELS.filter(l => l.type === 'mate')) {
    const moves = solve(l), r = C.judge(l, moves);
    assert.ok(r.over && r.win && r.mine <= l.n, `${l.id} ${JSON.stringify(r)}`);   // a weak defence can fall sooner
    assert.strictEqual(C.stars(l, r, false), 3);
    assert.strictEqual(C.stars(l, r, true), 2);
    const short = C.judge(l, moves.slice(0, -1));
    assert.ok(!short.over && C.stars(l, short, false) === 0, l.id + ' unfinished');
  }
});
test('judge: a puzzle not finished within n + 2 moves is lost', () => {
  const l = C.level('1-1'), p = XQ.Pos.fromFen(l.fen), moves = [];
  // the chariot steps back and forth without giving mate
  const key = M.keys(p, 1)[0];
  for (let i = 0; i < 3; i++) {
    const m = p.legal().find(x => x !== key && !M.forces(p, x, 1));
    p.make(m); moves.push(m);
    const r = p.legal()[0]; p.make(r); moves.push(r);
    if (i < 2) assert.ok(!C.judge(l, moves).over, 'still going after ' + (i + 1));
  }
  const r = C.judge(l, moves.slice(0, 5));
  assert.ok(r.over && !r.win && r.reason === 'limit', JSON.stringify(r));
});
test('judge: holding out ends the siege as soon as the enemy has made its n moves', () => {
  const l = C.level('2-2'), p = XQ.Pos.fromFen(l.fen), moves = [];
  let r;
  for (let i = 0; i < 40; i++) {
    const m = p.legal()[0]; p.make(m); moves.push(m);
    r = C.judge(l, moves);
    if (r.over) break;
  }
  assert.ok(r.over, 'ended');
  if (r.win) assert.ok(r.theirs === l.n && r.reason === 'held', JSON.stringify(r));
  else assert.ok(r.theirs <= l.n && r.reason !== 'held', JSON.stringify(r));
});
test('judge: illegal moves, and moves played after the end, are refused', () => {
  const l = C.level('1-1'), moves = solve(l);
  assert.strictEqual(C.judge(l, [123456]).reason, 'illegal');
  assert.strictEqual(C.judge(l, [...moves, moves[0]]).reason, 'illegal');
  assert.strictEqual(C.judge(l, ['x']).reason, 'illegal');
});
test('judge: a whole game with handicap counts the player\'s moves for the par star', () => {
  const l = C.level('1-3');
  assert.strictEqual(C.stars(l, { over: true, win: true, mine: 30 }, false), 3);
  assert.strictEqual(C.stars(l, { over: true, win: true, mine: 80 }, false), 2);
  assert.strictEqual(C.stars(l, { over: true, win: false, mine: 30 }, false), 0);
});

test('unlocking: battles open one after another, rewards come with chapters and stars', () => {
  let u = C.unlocked({});
  assert.deepStrictEqual([...u.levels], ['1-1']);
  assert.strictEqual(u.total, 0);
  u = C.unlocked({ '1-1': 1, '1-2': 3 });
  assert.deepStrictEqual([...u.levels], ['1-1', '1-2', '1-3']);
  assert.ok(!u.stages.has('dao-vien'));
  u = C.unlocked({ '1-1': 3, '1-2': 3, '1-3': 3 });
  assert.ok(u.chapters.has('c1') && u.stages.has('dao-vien') && u.titles.includes('dao-vien') && u.levels.has('2-1'));
  const all = Object.fromEntries(C.LEVELS.map(l => [l.id, 1]));
  u = C.unlocked(all);
  assert.strictEqual(u.total, 15);
  assert.ok(u.heroes.has('chu-du') && u.heroes.has('tu-ma-y') && u.heroes.has('hoang-trung') && !u.heroes.has('ma-sieu'));
  u = C.unlocked(Object.fromEntries(C.LEVELS.map(l => [l.id, 3])));
  assert.ok(u.heroes.has('ma-sieu') && u.titles.includes('vo-song') && u.titles.length === 6);
  assert.strictEqual(C.unlocked({ '1-1': 99 }).total, 3, 'stars are capped at three a battle');
});
test('locked heroes and stages say how to earn them', () => {
  assert.match(C.requirement('hero', 'chu-du'), /Xích Bích/);
  assert.match(C.requirement('hero', 'ma-sieu'), /30 sao/);
  assert.match(C.requirement('stage', 'dao-vien'), /Đào viên kết nghĩa/);
});

if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log('\nall campaign tests passed');
