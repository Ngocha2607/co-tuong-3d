// gen-daily.js — content tool (never shipped): finds the battle formations of Chân Long Kỳ Trận, the daily puzzle
// (src/daily.js), hard enough that only a strong player breaks them.
//   node test/gen-daily.js [how many] [minutes at most] [seed] [keep file]  → prints the PUZZLES list of src/daily.js
// Each formation found is also added to the keep file (JSON lines) at once; a later run with the same file starts
// from what it holds, so a long search can be stopped and taken up again.
// Endgame-like positions are laid out at random on every core but two (Black's general well guarded, three or four
// Red attackers about it), and those that come close are polished by small changes, as puzzle composers do. The
// engine looks first, for a moment: only where it smells a mate in 4 to 6 does the exhaustive prover (test/mate.js)
// go to work. A position is kept when
//   - it is a checkmate in exactly 4, 5 or 6 moves against every defence, with no win at all in fewer,
//   - only one first move works,
//   - and that move is quiet or a sacrifice (the piece can be taken at once): never a plain check that tells you
//     where to look.
// Those a shallow search (4 plies) does not find come first in the list. Near copies are kept once.
'use strict';
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const os = require('os');

if (isMainThread) {
  const want = +process.argv[2] || 120, minutes = +process.argv[3] || 60, seed0 = +process.argv[4] || 20261101, keepFile = process.argv[5] || '';
  const fs = require('fs');
  const n = Math.max(1, os.cpus().length - 2), found = new Map(), t0 = Date.now();
  let tried = 0, smelt = 0, twins = 0, done = false; const why = {};
  const workers = [];
  // polishing makes families of near copies: one of each will do (half or more of the pieces where another has them)
  const XQ = require('../src/xiangqi.js'), boards = new Map();
  const board = fen => boards.get(fen) || (boards.set(fen, XQ.Pos.fromFen(fen).b), boards.get(fen));
  function twin(fen) {
    const a = board(fen);
    for (const f of found.keys()) {
      const b = board(f);
      let same = 0, all = 0;
      for (let s = 0; s < 90; s++) { if (a[s] || b[s]) all++; if (a[s] && a[s] === b[s]) same++; }
      if (same * 2 >= all) return true;
    }
    return false;
  }
  const finish = () => {
    if (done) return; done = true;
    for (const w of workers) w.terminate();
    const list = [...found.values()].sort((a, b) => a.seen - b.seen);
    // the lengths in turn, mate in 4, 5 and 6, as far as each lasts
    const by = [4, 5, 6].map(n => list.filter(x => x.n === n)), out = [];
    while (by.some(g => g.length)) for (const g of by) if (g.length) out.push(g.shift());
    for (const x of out) console.log(`    ['${x.fen}', ${x.n}, ${x.n >= 5 || !x.seen ? 2 : 1}],   // ${x.key}${x.cap ? ' (ăn quân)' : ''}${x.sac ? ' (thí quân)' : ''}${x.check ? ' (chiếu)' : ''}${x.seen ? '' : ' · máy tìm nông không thấy'}`);
    process.stderr.write(`\nwhy positions were let go: ${JSON.stringify(why)}`);
    process.stderr.write(`\n${list.length} found (mate in 4: ${list.filter(x => x.n === 4).length}, in 5: ${list.filter(x => x.n === 5).length}, in 6: ${list.filter(x => x.n === 6).length}; missed by a shallow search: ${list.filter(x => !x.seen).length}) from ${tried} positions, ${smelt} looked into, in ${((Date.now() - t0) / 60000).toFixed(1)} min\n`);
    process.exit(0);
  };
  if (keepFile && fs.existsSync(keepFile)) {
    for (const line of fs.readFileSync(keepFile, 'utf8').split('\n')) if (line.trim()) { const m = JSON.parse(line); found.set(m.fen, m); }
  }
  for (let i = 0; i < n; i++) {
    const w = new Worker(__filename, { workerData: { seed: seed0 + i * 7919 } });
    w.on('message', m => {
      if (m.tried) { tried += m.tried; smelt += m.smelt; for (const k in m.reasons) why[k] = (why[k] || 0) + m.reasons[k]; }
      if (m.fen && !found.has(m.fen)) {
        if (twin(m.fen)) twins++;
        else { found.set(m.fen, m); if (keepFile) fs.appendFileSync(keepFile, JSON.stringify(m) + '\n'); }
      }
      process.stderr.write(`\r${found.size}/${want} · ${tried} positions · ${smelt} looked into · ${twins} near copies · ${((Date.now() - t0) / 60000).toFixed(1)} min   `);
      if (found.size >= want) finish();
    });
    workers.push(w);
  }
  setTimeout(finish, minutes * 60000);
  process.on('SIGINT', finish);
  return;
}

// ---------- a worker ----------
const XQ = require('../src/xiangqi.js');
const M = require('./mate.js');
let seed = workerData.seed;
const rnd = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = a => a[(rnd() * a.length) | 0];
const { K, A, B, N, R, C, P } = XQ;
const B_ADV = [[0, 3], [0, 5], [1, 4], [2, 3], [2, 5]], B_ELE = [[0, 2], [0, 6], [2, 0], [2, 4], [2, 8], [4, 2], [4, 6]];
const R_ADV = [[9, 3], [9, 5], [8, 4], [7, 3], [7, 5]];

function layout() {
  const p = new XQ.Pos();
  const put = (r, c, pc) => { const s = r * 9 + c; if (p.b[s]) return false; p.put(s, pc); return true; };
  put(pick([0, 0, 1, 1, 2]), pick([3, 4, 5]), -K);
  put(pick([7, 8, 9, 9]), pick([3, 4, 5]), K);
  // a well guarded general: advisors and elephants most of the time, a piece or two of Black's own
  for (let i = 1 + ((rnd() * 2) | 0); i > 0; i--) put(...pick(B_ADV), -A);
  for (let i = (rnd() * 3) | 0; i > 0; i--) put(...pick(B_ELE), -B);
  for (let i = 1 + ((rnd() * 2) | 0); i > 0; i--) {
    const t = pick([R, N, C, C, P, P]);
    if (t === P) put(3 + ((rnd() * 7) | 0), (rnd() * 9) | 0, -P);
    else put((rnd() * 10) | 0, (rnd() * 9) | 0, -t);
  }
  // Red: three or four attackers, mostly across the river
  for (let i = 3 + ((rnd() * 2) | 0); i > 0; i--) {
    const t = pick([R, R, N, N, N, C, C, P]);
    put(t === P ? (rnd() * 5) | 0 : (rnd() * 8) | 0, (rnd() * 9) | 0, t);
  }
  if (rnd() < 0.45) put(...pick(R_ADV), A);
  p.turn = XQ.RED;
  return p;
}

// a small change to a position that came close, the way puzzle composers polish one: a piece moved elsewhere, a
// defender added (to shut a second solution out) or a piece taken away
function mutate(src) {
  const p = src.clone(), squares = [];
  for (let s = 0; s < 90; s++) if (p.b[s] && Math.abs(p.b[s]) !== K) squares.push(s);
  const empty = () => { for (;;) { const s = (rnd() * 90) | 0; if (!p.b[s]) return s; } };
  const op = rnd();
  if (op < 0.45 && squares.length) { const s = pick(squares), pc = p.b[s]; p.put(s, 0); p.put(empty(), pc); }
  else if (op < 0.75) p.put(empty(), -pick([A, B, N, C, R, P, P]));
  else if (op < 0.9 && squares.length > 4) p.put(pick(squares), 0);
  else p.put(empty(), pick([N, C, P, R]));
  if (rnd() < 0.3) {                                        // the generals step aside now and then
    const k = p.kings[rnd() < 0.5 ? 0 : 1], pc = p.b[k], c = 3 + ((rnd() * 3) | 0);
    const r = pc > 0 ? 7 + ((rnd() * 3) | 0) : (rnd() * 3) | 0;
    if (!p.b[r * 9 + c]) { p.put(k, 0); p.put(r * 9 + c, pc); }
  }
  p.turn = XQ.RED;
  return p;
}

let near = [];                                              // positions that came close, to polish
function look(p) {
  if (!M.legalSetup(p) || p.inCheck() || !p.legal().length) return null;
  // the engine's quick look: a mate it can see in 4 or 5 moves (the polishing keeps to those that come close)
  const e = XQ.think(p.clone(), { time: 50 });
  if (e.score < XQ.MATE - 200) return null;
  const quick = Math.ceil((XQ.MATE - e.score) / 2);
  if (quick >= 4 && quick <= 6) { near.push(p.clone()); if (near.length > 300) near = near.slice(-200); }
  if (quick < 4 || quick > 5) return 'smelt:quick' + (quick < 4 ? '<4' : '>5');
  // the cheap questions first. The engine's first move: quiet, or a sacrifice (the piece that moved can be taken at
  // once, check or not); a plain check gives the way in away
  const key = e.move, cap = p.make(key), check = p.inCheck(), sac = p.legal().some(r => XQ.to(r) === XQ.to(key));
  p.unmake(key, cap);
  if (check && !sac) return 'smelt:check';
  // a second way in, as far as the engine can tell
  const e2 = XQ.think(p.clone(), { time: 60, exclude: [key] });
  if (e2.score > XQ.MATE - 200 && Math.ceil((XQ.MATE - e2.score) / 2) <= quick) return 'smelt:second';
  // then the proof, on a budget: exactly n, that move, and no other
  const memo = Object.assign(new Map(), { nodes: 0, limit: 4e6 });
  let n = 0;
  try {
    if (M.mateIn(p, 3, false, memo)) return 'smelt:mate3';
    for (const k of [4, 5]) { if (M.mateIn(p, k, false, memo)) { n = k; break; } }
    if (!n || !M.mateIn(p, n, true, memo)) return 'smelt:unproven';      // a stalemate win is not the puzzle's finish
    if (!M.forces(p, key, n, false, memo)) return 'smelt:otherkey';
    for (const m of p.legal()) if (m !== key && M.forces(p, m, n, false, memo)) return 'smelt:keys2';
  } catch (x) { if (x === M.OVER) return 'smelt:budget'; throw x; }
  // whether a shallow search (4 plies) finds it: those it misses come first in the list
  const seen = XQ.think(p.clone(), { depth: 4, time: 5000 }).move === key;
  return { fen: p.fen(), n, key: XQ.notation(p, key), cap: !!cap, sac, check, seen };
}

let tried = 0, smelt = 0, reasons = {}, since = 0;
for (;;) {
  const r = look(near.length && rnd() < 0.6 ? mutate(pick(near)) : layout());
  tried++;
  if (r) { smelt++; const why = typeof r === 'string' ? r : 'keep'; reasons[why] = (reasons[why] || 0) + 1; }
  // a find, or a long while without one: polish something else
  if (r && typeof r !== 'string') { parentPort.postMessage(r); near = []; since = 0; }
  else if (++since > 500) { near = []; since = 0; }
  if (tried % 200 === 0) { parentPort.postMessage({ tried: 200, smelt, reasons }); smelt = 0; reasons = {}; }
}
