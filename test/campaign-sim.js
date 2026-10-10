// campaign-sim.js — `npm run verify:campaign`: plays the sieges, handicap games and duels engine against engine, to see that
// each can be won by good play and is still a real fight for weak play. Slow (a few minutes) and only indicative: the
// computer's thinking time is capped here, so its "hard" level plays weaker than in the game.
'use strict';
const XQ = require('../src/xiangqi.js');
const C = require('../src/campaign.js');
const CAP = +process.env.CAP || 350;                    // ms per computer move, at most
const players = {
  strong: { time: 250 },
  weak: { time: 60, depth: 2, noise: true },
};
function play(lv, who, seed) {
  const pos = XQ.Pos.fromFen(lv.fen), moves = [], keys = [];
  const ai = C.AI[lv.ai];
  for (let ply = 0; ply < 400; ply++) {
    const mine = pos.turn === lv.side, o = mine ? players[who] : ai;
    const r = XQ.think(pos, { time: Math.min(o.time || 1000, CAP), depth: o.depth, noise: o.noise ? (seed * 7919 + ply * 104729) | 1 : 0, history: keys.slice() });
    if (!r.move) break;
    keys.push(pos.key()); pos.make(r.move); moves.push(r.move);
    const res = C.judge(lv, moves);
    if (res.over) return res;
  }
  return C.judge(lv, moves);
}
for (const lv of C.LEVELS.filter(l => l.type !== 'mate')) {
  const out = [];
  for (const [who, seeds] of [['strong', [1]], ['weak', [1, 2]]]) {
    for (const s of seeds) {
      const r = play(lv, who, s);
      out.push(`${who}: ${r.win ? 'THẮNG' : 'thua'} (${r.reason}, ${r.mine} nước, còn ${r.pieces} quân, sao=${C.stars(lv, r, false)})`);
    }
  }
  console.log(`${lv.id} ${lv.type} "${lv.name}" [${lv.type === 'survive' ? 'n=' + lv.n + ' keep=' + lv.keep : 'par=' + lv.par}, máy ${lv.ai}]\n   ` + out.join('\n   '));
}
