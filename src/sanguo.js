// sanguo.js — Cờ Tam Quốc: xiangqi for three players (Shu, Wu and Wei) on a hexagonal board made of three
// half-boards. Rules, the shape of the board, notation and a search for the computer players.
// A plain script like xiangqi.js: the page and the AI Web Worker load it, the tests require it.
//
// Board: three half-boards of 5 rows x 9 columns, square = kingdom * 45 + row * 9 + col. Each kingdom counts rows
// from its own back rank (0) to its river bank (4), and columns from its own left (0) to its right (8).
// Across the river a kingdom's left half (columns 0-3) faces the right half of the kingdom on its left, column c
// meeting column 8 - c, just like the two halves of an ordinary board. The centre files (column 4) of all three meet
// in the small triangle in the middle: a piece going up its centre file may carry on into either neighbour's.
// Kingdoms move in the order Shu, Wu, Wei (counter-clockwise round the board).
//
// Pieces: type | home << 3 | owner << 5. home is the kingdom it started with and decides where an elephant, an
// advisor or a soldier may go; owner is who commands it now (a conquered army changes hands, not its home).
// A kingdom with no legal move on its turn falls: its general leaves the board and the rest of its army goes to
// whoever moved last. The last general standing wins.
'use strict';
const SG = (() => {
  const K = 1, A = 2, B = 3, N = 4, R = 5, C = 6, P = 7;
  const SQ = 135, KINGDOMS = 3;
  const NAMES = ['Thục', 'Ngô', 'Ngụy'], SEAL = ['蜀', '吳', '魏'];
  const sq = (k, r, c) => k * 45 + r * 9 + c;
  const kOf = s => (s / 45) | 0, rOf = s => ((s % 45) / 9) | 0, cOf = s => s % 9;
  const rightOf = k => (k + 1) % 3, leftOf = k => (k + 2) % 3;
  const piece = (type, home, owner = home) => type | (home << 3) | (owner << 5);
  const T = p => p & 7, HOME = p => (p >> 3) & 3, OWN = p => p >> 5;
  const mv = (f, t) => f | (t << 8), from = m => m & 255, to = m => m >> 8;

  // ---------- the board's connections ----------
  // directions in a kingdom's own frame: 0 forward (towards the river), 1 right, 2 back, 3 left.
  // STEP[s * 4 + d]: the squares one step away as [square, direction in that square's frame]; crossing the river
  // turns forward into back, and the top of a centre file leads into both neighbours.
  const STEP = [];
  for (let s = 0; s < SQ; s++) for (let d = 0; d < 4; d++) {
    const k = kOf(s), r = rOf(s), c = cOf(s), out = [];
    if (d === 1) { if (c < 8) out.push([s + 1, 1]); }
    else if (d === 3) { if (c > 0) out.push([s - 1, 3]); }
    else if (d === 2) { if (r > 0) out.push([s - 9, 2]); }
    else if (r < 4) out.push([s + 9, 0]);
    else {
      if (c <= 4) out.push([sq(leftOf(k), 4, 8 - c), 2]);
      if (c >= 4) out.push([sq(rightOf(k), 4, 8 - c), 2]);
    }
    STEP.push(out);
  }
  // straight lines from each square, one array per way they can run (a line through the centre forks in two)
  const RAYS = [];
  for (let s = 0; s < SQ; s++) {
    const rays = [];
    const walk = (at, d, path) => {
      const next = STEP[at * 4 + d];
      if (!next.length) { if (path.length) rays.push(path); return; }
      for (const [n, nd] of next) walk(n, nd, path.concat(n));
    };
    for (let d = 0; d < 4; d++) walk(s, d, []);
    RAYS.push(rays);
  }
  // horse: one straight step (the leg, which must be empty), then one step sideways and one on
  const HORSE = [], HREV = Array.from({ length: SQ }, () => []);
  for (let s = 0; s < SQ; s++) {
    const list = [], seen = new Set();
    for (let d = 0; d < 4; d++) for (const [leg, d1] of STEP[s * 4 + d]) for (const q of [1, 3]) {
      for (const [m, d2] of STEP[leg * 4 + ((d1 + q) & 3)]) for (const [t] of STEP[m * 4 + ((d2 + 4 - q) & 3)]) {
        if (t === s || seen.has(t * 256 + leg)) continue;
        seen.add(t * 256 + leg); list.push([t, leg]); HREV[t].push([s, leg]);
      }
    }
    HORSE.push(list);
  }
  // pieces that stay at home: the general and advisors in the palace, elephants on their own side of the river
  const inPalace = (r, c) => r <= 2 && c >= 3 && c <= 5;
  const KING = [], ADV = [], ELE = [], SOLDIER_HOME = [], SOLDIER_AWAY = [];
  for (let s = 0; s < SQ; s++) {
    const k = kOf(s), r = rOf(s), c = cOf(s), at = (dr, dc) => sq(k, r + dr, c + dc);
    const ok = (dr, dc) => r + dr >= 0 && r + dr <= 4 && c + dc >= 0 && c + dc <= 8;
    KING.push([[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dr, dc]) => inPalace(r, c) && ok(dr, dc) && inPalace(r + dr, c + dc)).map(([dr, dc]) => at(dr, dc)));
    ADV.push([[1, 1], [1, -1], [-1, 1], [-1, -1]].filter(([dr, dc]) => inPalace(r, c) && ok(dr, dc) && inPalace(r + dr, c + dc)).map(([dr, dc]) => at(dr, dc)));
    ELE.push([[2, 2], [2, -2], [-2, 2], [-2, -2]].filter(([dr, dc]) => ok(dr, dc)).map(([dr, dc]) => [at(dr, dc), at(dr / 2, dc / 2)]));
    // a soldier at home only goes forward; across the river it goes on towards that kingdom's back rank, or sideways
    SOLDIER_HOME.push(STEP[s * 4].map(x => x[0]));
    SOLDIER_AWAY.push([2, 1, 3].flatMap(d => STEP[s * 4 + d].map(x => x[0])));
  }
  const soldierMoves = (s, p) => (kOf(s) === HOME(p) ? SOLDIER_HOME : SOLDIER_AWAY)[s];

  // ---------- where each point lies on the table ----------
  // The board is a regular hexagon; each kingdom's half is two quadrilaterals either side of its centre file, from its
  // back edge to its two rivers. A point is placed by bilinear interpolation inside its quadrilateral, the rivers being
  // kept one unit wide. Kingdom k sits at angle k * 120 degrees round the centre, Shu (0) towards +z.
  const H = 4 * Math.sqrt(3), HALF = 4, GAP = 0.5;               // apothem, half the back edge, half the river
  const S60 = Math.sin(Math.PI / 3), C60 = 0.5;
  const Q = {
    back: [0, H], corner: [HALF, H],
    riverEnd: [H * S60 - GAP * C60, H * C60 + GAP * S60],         // where a river bank meets the side edge
    centre: [0, GAP / S60],                                       // where it meets the centre file
  };
  const YAW = k => (k * 2 * Math.PI) / 3;
  // world x, z of fractional column c and row r of kingdom k (fractions are used to draw the board)
  function at(k, c, r) {
    const side = Math.sign(c - 4), a = Math.abs(c - 4) / 4, t = r / 4;
    const mix = i => (1 - a) * (1 - t) * Q.back[i] + a * (1 - t) * Q.corner[i] + a * t * Q.riverEnd[i] + (1 - a) * t * Q.centre[i];
    const X = side * mix(0), Y = mix(1), y = YAW(k), sn = Math.sin(y), cs = Math.cos(y);
    return [X * cs + Y * sn, -X * sn + Y * cs];
  }
  const XZ = new Float32Array(SQ * 2);
  for (let s = 0; s < SQ; s++) { const [x, z] = at(kOf(s), cOf(s), rOf(s)); XZ[s * 2] = x; XZ[s * 2 + 1] = z; }
  const BOARD_R = H + 0.75;                                       // apothem of the wooden board

  // ---------- values: material and a little for position, as seen by the piece's owner ----------
  const VALUE = [0, 0, 120, 120, 280, 600, 290, 30];
  function worth(p, s) {
    const t = T(p), r = rOf(s), c = cOf(s), away = kOf(s) !== HOME(p), mid = 4 - Math.abs(c - 4);
    let v = VALUE[t];
    if (t === P) v += away ? 45 + (4 - r) * 8 + mid * 3 : r >= 4 ? 10 : 0;
    else if (t === N) v += mid * 4 + (away ? 18 : r * 3);
    else if (t === R) v += (away ? 15 : 0) + mid;
    else if (t === C) v += c === 4 ? 12 : 0;
    return v;
  }
  const WORTH = new Int16Array(128 * SQ);
  for (let p = 1; p < 88; p++) if (T(p) && HOME(p) < 3 && OWN(p) < 3) for (let s = 0; s < SQ; s++) WORTH[p * SQ + s] = worth(p, s);

  // ---------- Zobrist keys ----------
  let seed = 0x5a17c3e1;
  const rnd = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return (t ^ (t >>> 14)) | 0; };
  const ZL = new Int32Array(128 * SQ), ZH = new Int32Array(128 * SQ);
  for (let i = 0; i < ZL.length; i++) { ZL[i] = rnd(); ZH[i] = rnd(); }
  const TURN_L = [rnd(), rnd(), rnd()], TURN_H = [rnd(), rnd(), rnd()];

  // ---------- position ----------
  let stamp = 0;
  const seen = new Int32Array(SQ);
  class Pos {
    constructor() {
      this.b = new Int8Array(SQ); this.turn = 0; this.alive = [true, true, true]; this.kings = [-1, -1, -1];
      this.mat = [0, 0, 0]; this.lo = TURN_L[0]; this.hi = TURN_H[0]; this.last = -1;   // last: who moved last
    }
    static start() {
      const p = new Pos(), back = [R, N, B, A, K, A, B, N, R];
      for (let k = 0; k < 3; k++) {
        back.forEach((t, c) => p.put(sq(k, 0, c), piece(t, k)));
        for (const c of [1, 7]) p.put(sq(k, 2, c), piece(C, k));
        for (const c of [0, 2, 4, 6, 8]) p.put(sq(k, 3, c), piece(P, k));
      }
      return p;
    }
    clone() {
      const p = new Pos(); p.b.set(this.b); p.turn = this.turn; p.alive = this.alive.slice(); p.kings = this.kings.slice();
      p.mat = this.mat.slice(); p.lo = this.lo; p.hi = this.hi; p.last = this.last; return p;
    }
    put(s, v) {
      const old = this.b[s];
      if (old) { this.lo ^= ZL[old * SQ + s]; this.hi ^= ZH[old * SQ + s]; this.mat[OWN(old)] -= WORTH[old * SQ + s]; if (T(old) === K && this.kings[HOME(old)] === s) this.kings[HOME(old)] = -1; }
      this.b[s] = v;
      if (v) { this.lo ^= ZL[v * SQ + s]; this.hi ^= ZH[v * SQ + s]; this.mat[OWN(v)] += WORTH[v * SQ + s]; if (T(v) === K) this.kings[HOME(v)] = s; }
    }
    key() { return (this.hi >>> 0).toString(36) + ':' + (this.lo >>> 0).toString(36); }
    living() { return this.alive.filter(Boolean).length; }
    nextAlive(k) { for (let i = 1; i <= 3; i++) { const n = (k + i) % 3; if (this.alive[n]) return n; } return k; }
    setTurn(k) { this.lo ^= TURN_L[this.turn] ^ TURN_L[k]; this.hi ^= TURN_H[this.turn] ^ TURN_H[k]; this.turn = k; }

    // the move played, the turn passed on; returns a new position
    after(m) {
      const p = this.clone(), f = from(m), t = to(m), pc = p.b[f];
      p.cap = p.b[t];
      p.put(t, 0); p.put(f, 0); p.put(t, pc);
      p.last = this.turn; p.setTurn(p.nextAlive(this.turn));
      return p;
    }
    // kingdom k falls: its general leaves the board, its army goes to `by` (or leaves too when by < 0, on resigning)
    fall(k, by) {
      for (let s = 0; s < SQ; s++) {
        const pc = this.b[s];
        if (!pc || OWN(pc) !== k) continue;
        this.put(s, 0);
        if (T(pc) !== K && by >= 0) this.put(s, (pc & 31) | (by << 5));
      }
      this.alive[k] = false; this.kings[k] = -1;
      if (this.turn === k) this.setTurn(this.nextAlive(k));
    }

    // is the point s, held by kingdom me, attacked by anyone else? (for a general: is it in check?)
    attacked(s, me) {
      const b = this.b;
      for (const ray of RAYS[s]) {
        let screen = false;
        for (let i = 0; i < ray.length; i++) {
          const t = ray[i], pc = b[t];
          if (!pc) continue;
          if (!screen) {
            if (OWN(pc) !== me) {
              const ty = T(pc);
              if (ty === R || ty === K) return true;                // chariot, or two generals facing each other
              if (ty === P && i === 0 && soldierMoves(t, pc).includes(s)) return true;
            }
            screen = true;
          } else { if (T(pc) === C && OWN(pc) !== me) return true; break; }
        }
      }
      for (const [h, leg] of HREV[s]) { const pc = b[h]; if (pc && T(pc) === N && OWN(pc) !== me && !b[leg]) return true; }
      return false;
    }
    checked(k) { return this.alive[k] && this.kings[k] >= 0 && this.attacked(this.kings[k], k); }
    inCheck() { return this.checked(this.turn); }

    // pseudo-legal moves of the side to move (captures only with caps); generals are never taken, only cornered.
    // withKings lets the tests see attacks on generals as moves.
    gen(out, caps, withKings) {
      const b = this.b, me = this.turn;
      let id = 0;
      const add = (f, t) => {
        const q = b[t];
        if (q) { if (OWN(q) === me || (T(q) === K && !withKings)) return; } else if (caps) return;
        if (seen[t] === id) return;
        seen[t] = id; out.push(f | (t << 8));
      };
      for (let s = 0; s < SQ; s++) {
        const pc = b[s];
        if (!pc || OWN(pc) !== me) continue;
        id = ++stamp;
        switch (T(pc)) {
          case K:
            for (const t of KING[s]) add(s, t);
            if (withKings) for (const ray of RAYS[s]) for (const t of ray) { if (b[t]) { if (T(b[t]) === K) add(s, t); break; } }
            break;
          case A: for (const t of ADV[s]) add(s, t); break;
          case B: for (const [t, eye] of ELE[s]) if (!b[eye]) add(s, t); break;
          case N: for (const [t, leg] of HORSE[s]) if (!b[leg]) add(s, t); break;
          case R: for (const ray of RAYS[s]) for (const t of ray) { add(s, t); if (b[t]) break; } break;
          case C: for (const ray of RAYS[s]) {
            let screen = false;
            for (const t of ray) {
              if (!screen) { if (b[t]) screen = true; else if (!caps) add(s, t); }
              else if (b[t]) { add(s, t); break; }
            }
          } break;
          case P: for (const t of soldierMoves(s, pc)) add(s, t); break;
        }
      }
      return out;
    }
    legal() {
      const me = this.turn, res = [];
      for (const m of this.gen([], false)) if (!this.after(m).checked(me)) res.push(m);
      return res;
    }
  }

  // ---------- a game: a move and what follows from it ----------
  // Plays m and passes the turn; every kingdom then left without a legal move on its turn falls to the player who
  // just moved. Returns the new position and the falls, [{ k, by, king }] (king: the square its general stood on).
  function play(pos, m) {
    const p = pos.after(m), falls = [];
    while (p.living() > 1 && !p.legal().length) {
      const k = p.turn, king = p.kings[k];
      falls.push({ k, by: p.last, king, mate: p.inCheck() });
      p.fall(k, p.last);
    }
    return { pos: p, falls };
  }
  // the game is over with one general left, or drawn: a position seen for the third time, or 50 rounds without a capture
  const QUIET = 150;
  function status(pos, keys, quiet) {
    if (pos.living() <= 1) return { over: true, winner: pos.alive.indexOf(true), reason: 'unite' };
    const k = pos.key(); let n = 0; for (const x of keys) if (x === k) n++;
    if (n >= 2) return { over: true, winner: -1, reason: 'repetition' };
    if (quiet >= QUIET) return { over: true, winner: -1, reason: 'quiet' };
    const checks = [0, 1, 2].filter(k => pos.checked(k));
    return { over: false, checks, repeat: n };
  }

  // ---------- notation: "Xe 9·1 → 9·4", a point in someone else's half named with that kingdom, "Mã 2·1 → Ngô 3·5" ----------
  const NAME = [null, 'Tướng', 'Sĩ', 'Tượng', 'Mã', 'Xe', 'Pháo', 'Tốt'];
  // files counted from each kingdom's right, 1-9, as in ordinary notation; rows from its back rank, 1-5
  const point = (s, own) => (kOf(s) === own ? '' : NAMES[kOf(s)] + ' ') + `${9 - cOf(s)}·${rOf(s) + 1}`;
  function notation(pos, m) {
    const f = from(m), t = to(m), pc = pos.b[f], cap = pos.b[t], own = HOME(pc);
    return `${NAME[T(pc)]} ${point(f, own)} → ${point(t, own)}${cap ? ' ăn ' + NAME[T(cap)] : ''}`;
  }

  // ---------- search: paranoid alpha-beta ----------
  // The player to move assumes the other two are allied against it: it maximises its material less the average of
  // theirs, they minimise that. A kingdom cornered inside the search falls and the search goes on without it.
  const MATE = 30000, INF = 32000;
  const ORDER = [0, 1000, 20, 20, 40, 90, 45, 10];
  function think(root, opts = {}) {
    const me = root.turn, time = opts.time || 1000, deadline = Date.now() + time, maxDepth = opts.depth || 24, noise = opts.noise || 0;
    let nodes = 0, stop = false;
    const hist = new Int32Array(SQ * SQ), killers = [];
    const rootMoves = root.legal();
    if (!rootMoves.length) return { move: 0, score: -MATE, depth: 0, nodes: 0 };
    if (rootMoves.length === 1) return { move: rootMoves[0], score: 0, depth: 0, nodes: 0 };

    function evaluate(p) {
      let opp = 0, n = 0;
      for (let k = 0; k < 3; k++) if (k !== me && p.alive[k]) { opp += p.mat[k]; n++; }
      let v = p.mat[me] - (n ? opp / n : 0);
      if (noise) v += ((p.lo ^ noise) & 63) - 32;
      return v;
    }
    function order(p, moves, first, ply) {
      const b = p.b, sc = moves.map(m => {
        if (m === first) return 1e9;
        const cap = b[to(m)];
        if (cap) return 1e6 + ORDER[T(cap)] * 100 - ORDER[T(b[from(m)])];
        const k = killers[ply];
        return k && (k[0] === m || k[1] === m) ? 9e5 : hist[from(m) * SQ + to(m)];
      });
      return moves.map((m, i) => [sc[i], m]).sort((x, y) => y[0] - x[0]).map(x => x[1]);
    }
    function quiesce(p, alpha, beta, qd) {
      if ((++nodes & 1023) === 0 && Date.now() > deadline) stop = true;
      if (stop) return 0;
      const stand = evaluate(p), maxing = p.turn === me;
      if (qd >= 4) return stand;
      if (maxing) { if (stand >= beta) return stand; if (stand > alpha) alpha = stand; }
      else { if (stand <= alpha) return stand; if (stand < beta) beta = stand; }
      let best = stand;
      for (const m of order(p, p.gen([], true), 0, 60)) {
        const c = p.after(m);
        if (c.checked(p.turn)) continue;
        const v = quiesce(c, alpha, beta, qd + 1);
        if (stop) return 0;
        if (maxing) { if (v > best) best = v; if (v > alpha) alpha = v; } else { if (v < best) best = v; if (v < beta) beta = v; }
        if (alpha >= beta) break;
      }
      return best;
    }
    let rootBest = 0;
    function search(p, depth, alpha, beta, ply) {
      if ((++nodes & 1023) === 0 && Date.now() > deadline) stop = true;
      if (stop) return 0;
      if (!p.alive[me]) return -MATE + ply;
      if (p.living() === 1) return MATE - ply;
      if (depth <= 0) return quiesce(p, alpha, beta, 0);
      const side = p.turn, maxing = side === me;
      const moves = ply === 0 ? rootMoves : p.gen([], false);
      let best = maxing ? -INF : INF, bestM = 0, legalN = 0;
      for (const m of order(p, moves, ply === 0 ? rootBest : 0, ply)) {
        const c = p.after(m);
        if (c.checked(side)) continue;
        legalN++;
        const v = search(c, depth - 1, alpha, beta, ply + 1);
        if (stop) return 0;
        if (maxing ? v > best : v < best) { best = v; bestM = m; }
        if (maxing) { if (v > alpha) alpha = v; } else if (v < beta) beta = v;
        if (alpha >= beta) {
          if (!p.b[to(m)]) { const k = killers[ply] || (killers[ply] = [0, 0]); if (k[0] !== m) { k[1] = k[0]; k[0] = m; } hist[from(m) * SQ + to(m)] += depth * depth; }
          break;
        }
      }
      if (!legalN) {                                        // cornered: this kingdom falls to whoever moved last
        if (maxing) return -MATE + ply;
        const q = p.clone(); q.fall(side, p.last);
        return search(q, depth, alpha, beta, ply + 1);
      }
      if (ply === 0) rootBest = bestM;
      return best;
    }

    let best = rootMoves[0], bestScore = 0, depthDone = 0;
    for (let d = 1; d <= maxDepth; d++) {
      const v = search(root, d, -INF, INF, 0);
      if (stop) break;
      best = rootBest; bestScore = v; depthDone = d;
      if (Math.abs(v) > MATE - 200) break;
      if (Date.now() > deadline - time * 0.5) break;      // the next depth would not finish
    }
    return { move: best, score: bestScore, depth: depthDone, nodes };
  }

  // a position for the worker and back
  const pack = p => ({ b: Array.from(p.b), turn: p.turn, alive: p.alive.slice(), last: p.last });
  function unpack(o) {
    const p = new Pos();
    o.b.forEach((v, s) => { if (v) p.put(s, v); });
    for (let k = 0; k < 3; k++) if (!o.alive[k]) p.alive[k] = false;
    p.setTurn(o.turn); p.last = o.last;
    return p;
  }

  return {
    K, A, B, N, R, C, P, SQ, KINGDOMS, NAMES, SEAL, NAME, MATE, QUIET,
    sq, kOf, rOf, cOf, rightOf, leftOf, piece, T, HOME, OWN, mv, from, to,
    Pos, play, status, notation, think, pack, unpack,
    at, XZ, H, BOARD_R, YAW, STEP, RAYS, HORSE,
  };
})();
if (typeof module === 'object' && module.exports) module.exports = SG;
