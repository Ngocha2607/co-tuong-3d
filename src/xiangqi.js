// xiangqi.js — Chinese chess: rules, Vietnamese move notation and a search engine for the computer player.
// A plain script: the page and the AI Web Worker load it with <script>/importScripts, the Cloudflare Worker
// imports it to check every online move.
//
// Board: 10 rows x 9 columns, square = row * 9 + col. Row 0 is Black's back rank (top of the screen for Red),
// row 9 is Red's back rank. Pieces are signed numbers: Red > 0, Black < 0.
'use strict';
const XQ = (() => {
  const K = 1, A = 2, B = 3, N = 4, R = 5, C = 6, P = 7;
  const RED = 1, BLACK = -1;
  const START = 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w';
  const row = s => (s / 9) | 0, col = s => s % 9;
  const inPalace = (r, c, side) => c >= 3 && c <= 5 && (side > 0 ? r >= 7 && r <= 9 : r >= 0 && r <= 2);
  const ownHalf = (r, side) => (side > 0 ? r >= 5 : r <= 4);

  // moves are numbers: from | to << 7
  const mv = (f, t) => f | (t << 7), from = m => m & 127, to = m => m >> 7;

  // ---------- Zobrist keys (two 32-bit halves) ----------
  let seed = 0x9e3779b9;
  const rnd = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return (t ^ (t >>> 14)) | 0; };
  const ZL = [], ZH = [];
  for (let p = 0; p < 15; p++) { ZL.push(new Int32Array(90)); ZH.push(new Int32Array(90)); for (let s = 0; s < 90; s++) { ZL[p][s] = rnd(); ZH[p][s] = rnd(); } }
  const SIDE_L = rnd(), SIDE_H = rnd();
  const zi = p => p + 7;                                 // piece -> table index

  // ---------- piece values and square tables (Red's view; Black mirrors the rows) ----------
  const VALUE = [0, 0, 120, 120, 270, 600, 285, 30];
  const PST = [null];
  for (let t = 1; t <= 7; t++) PST.push(new Int16Array(90));
  for (let s = 0; s < 90; s++) {
    const r = row(s), c = col(s), centre = 4 - Math.abs(c - 4);
    PST[K][s] = c === 4 ? 10 : 0;
    PST[A][s] = r === 8 && c === 4 ? 10 : 0;
    PST[B][s] = (r === 7 && c === 4) ? 10 : (r === 9 && (c === 2 || c === 6)) ? 4 : 0;
    PST[N][s] = centre * 4 + [-10, 10, 25, 25, 20, 15, 10, 0, -10, -20][r] - (c === 0 || c === 8 ? 10 : 0);
    PST[R][s] = (r >= 2 && r <= 4 ? 15 : 0) + (c === 4 ? 5 : 0) + (r === 9 && (c === 0 || c === 8) ? -10 : 0) + centre;
    PST[C][s] = (c === 4 ? 15 : 0) + (r <= 2 ? 10 : 0) + (r === 7 ? 5 : 0) + (r === 9 ? -5 : 0);
    PST[P][s] = r >= 5 ? (r <= 6 && c === 4 ? 5 : 0)
      : [20, 60, 60, 45, 30][r] + (c >= 3 && c <= 5 ? 15 : 0) - (c === 0 || c === 8 ? 10 : 0);
  }
  // score of piece p on square s, from Red's point of view
  const SCORE = new Int16Array(15 * 90);
  for (let p = -7; p <= 7; p++) for (let s = 0; s < 90; s++) {
    if (!p) continue;
    const t = Math.abs(p), ms = p > 0 ? s : (9 - row(s)) * 9 + col(s);
    SCORE[zi(p) * 90 + s] = (VALUE[t] + PST[t][ms]) * Math.sign(p);
  }

  // ---------- position ----------
  class Pos {
    constructor() { this.b = new Int8Array(90); this.turn = RED; this.kings = [0, 0]; this.lo = 0; this.hi = 0; this.val = 0; }
    static fromFen(fen) {
      const p = new Pos(), [rows, side] = String(fen || START).trim().split(/\s+/);
      const LET = { k: K, a: A, b: B, e: B, n: N, h: N, r: R, c: C, p: P };
      const lines = rows.split('/');
      if (lines.length !== 10) throw new Error('bad FEN');
      lines.forEach((line, r) => {
        let c = 0;
        for (const ch of line) {
          if (/\d/.test(ch)) { c += +ch; continue; }
          const t = LET[ch.toLowerCase()]; if (!t || c > 8) throw new Error('bad FEN');
          p.put(r * 9 + c, ch === ch.toUpperCase() ? t : -t); c++;
        }
        if (c !== 9) throw new Error('bad FEN');
      });
      p.turn = side === 'b' ? BLACK : RED;
      if (p.turn === BLACK) { p.lo ^= SIDE_L; p.hi ^= SIDE_H; }
      return p;
    }
    put(s, pc) {
      const old = this.b[s];
      if (old) { this.lo ^= ZL[zi(old)][s]; this.hi ^= ZH[zi(old)][s]; this.val -= SCORE[zi(old) * 90 + s]; }
      this.b[s] = pc;
      if (pc) { this.lo ^= ZL[zi(pc)][s]; this.hi ^= ZH[zi(pc)][s]; this.val += SCORE[zi(pc) * 90 + s]; if (pc === K) this.kings[0] = s; if (pc === -K) this.kings[1] = s; }
    }
    clone() { const p = new Pos(); p.b.set(this.b); p.turn = this.turn; p.kings = this.kings.slice(); p.lo = this.lo; p.hi = this.hi; p.val = this.val; return p; }
    fen() {
      const L = { 1: 'k', 2: 'a', 3: 'b', 4: 'n', 5: 'r', 6: 'c', 7: 'p' };
      let out = '';
      for (let r = 0; r < 10; r++) {
        let e = 0;
        for (let c = 0; c < 9; c++) {
          const pc = this.b[r * 9 + c];
          if (!pc) { e++; continue; }
          if (e) { out += e; e = 0; }
          out += pc > 0 ? L[pc].toUpperCase() : L[-pc];
        }
        if (e) out += e;
        if (r < 9) out += '/';
      }
      return out + (this.turn === RED ? ' w' : ' b');
    }
    key() { return (this.hi >>> 0).toString(36) + ':' + (this.lo >>> 0).toString(36); }

    // make / unmake; returns the captured piece
    make(m) {
      const f = from(m), t = to(m), pc = this.b[f], cap = this.b[t];
      if (cap) { this.lo ^= ZL[zi(cap)][t]; this.hi ^= ZH[zi(cap)][t]; this.val -= SCORE[zi(cap) * 90 + t]; }
      this.lo ^= ZL[zi(pc)][f] ^ ZL[zi(pc)][t]; this.hi ^= ZH[zi(pc)][f] ^ ZH[zi(pc)][t];
      this.val += SCORE[zi(pc) * 90 + t] - SCORE[zi(pc) * 90 + f];
      this.b[t] = pc; this.b[f] = 0;
      if (pc === K) this.kings[0] = t; else if (pc === -K) this.kings[1] = t;
      this.turn = -this.turn; this.lo ^= SIDE_L; this.hi ^= SIDE_H;
      return cap;
    }
    unmake(m, cap) {
      const f = from(m), t = to(m), pc = this.b[t];
      this.turn = -this.turn; this.lo ^= SIDE_L; this.hi ^= SIDE_H;
      this.b[f] = pc; this.b[t] = cap;
      if (pc === K) this.kings[0] = f; else if (pc === -K) this.kings[1] = f;
      this.lo ^= ZL[zi(pc)][f] ^ ZL[zi(pc)][t]; this.hi ^= ZH[zi(pc)][f] ^ ZH[zi(pc)][t];
      this.val -= SCORE[zi(pc) * 90 + t] - SCORE[zi(pc) * 90 + f];
      if (cap) { this.lo ^= ZL[zi(cap)][t]; this.hi ^= ZH[zi(cap)][t]; this.val += SCORE[zi(cap) * 90 + t]; }
    }
    // null move for the search
    pass() { this.turn = -this.turn; this.lo ^= SIDE_L; this.hi ^= SIDE_H; }

    // is `side`'s general attacked (including the two generals facing each other)?
    checked(side) {
      const b = this.b, k = this.kings[side > 0 ? 0 : 1], kr = row(k), kc = col(k), e = -side;
      // straight lines: chariots, cannons (one screen), the enemy general on the same file
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        let r = kr + dr, c = kc + dc, screens = 0;
        while (r >= 0 && r < 10 && c >= 0 && c < 9) {
          const pc = b[r * 9 + c];
          if (pc) {
            if (screens === 0) {
              if (pc === e * R) return true;
              if (pc === e * K && dc === 0) return true;      // flying general
              if (pc === e * P && Math.abs(r - kr) + Math.abs(c - kc) === 1) {
                // soldiers attack forward, and sideways once across the river
                if (dc === 0 ? r - kr === (e > 0 ? 1 : -1) : !ownHalf(r, e)) return true;
              }
              screens = 1;
            } else { if (pc === e * C) return true; break; }
          }
          r += dr; c += dc;
        }
      }
      // horses: the horse at (kr+dr, kc+dc) is blocked by the piece at its leg
      for (const [dr, dc] of [[-2, -1], [-2, 1], [2, -1], [2, 1], [-1, -2], [1, -2], [-1, 2], [1, 2]]) {
        const r = kr + dr, c = kc + dc;
        if (r < 0 || r > 9 || c < 0 || c > 8 || b[r * 9 + c] !== e * N) continue;
        // the leg is next to the horse, one step along its long side towards the general
        const legR = Math.abs(dr) === 2 ? r - dr / 2 : r, legC = Math.abs(dc) === 2 ? c - dc / 2 : c;
        if (!b[legR * 9 + legC]) return true;
      }
      return false;
    }

    // pseudo-legal moves for the side to move (captures only when caps is set), pushed into out
    gen(out, caps) {
      const b = this.b, side = this.turn;
      const add = (f, t) => { const q = b[t]; if (q * side > 0) return; if (caps && !q) return; out.push(f | (t << 7)); };
      for (let s = 0; s < 90; s++) {
        const pc = b[s] * side; if (pc <= 0) continue;
        const r = row(s), c = col(s);
        switch (pc) {
          case K: for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nr = r + dr, nc = c + dc; if (inPalace(nr, nc, side)) add(s, nr * 9 + nc); } break;
          case A: for (const [dr, dc] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { const nr = r + dr, nc = c + dc; if (inPalace(nr, nc, side)) add(s, nr * 9 + nc); } break;
          case B: for (const [dr, dc] of [[2, 2], [2, -2], [-2, 2], [-2, -2]]) {
            const nr = r + dr, nc = c + dc;
            if (nr < 0 || nr > 9 || nc < 0 || nc > 8 || !ownHalf(nr, side) || b[(r + dr / 2) * 9 + c + dc / 2]) continue;
            add(s, nr * 9 + nc);
          } break;
          case N: for (const [dr, dc] of [[-2, -1], [-2, 1], [2, -1], [2, 1], [-1, -2], [1, -2], [-1, 2], [1, 2]]) {
            const nr = r + dr, nc = c + dc;
            if (nr < 0 || nr > 9 || nc < 0 || nc > 8) continue;
            const legR = Math.abs(dr) === 2 ? r + dr / 2 : r, legC = Math.abs(dc) === 2 ? c + dc / 2 : c;
            if (!b[legR * 9 + legC]) add(s, nr * 9 + nc);
          } break;
          case R: for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            let nr = r + dr, nc = c + dc;
            while (nr >= 0 && nr < 10 && nc >= 0 && nc < 9) { const t = nr * 9 + nc; add(s, t); if (b[t]) break; nr += dr; nc += dc; }
          } break;
          case C: for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            let nr = r + dr, nc = c + dc, jumped = false;
            while (nr >= 0 && nr < 10 && nc >= 0 && nc < 9) {
              const t = nr * 9 + nc;
              if (!jumped) { if (b[t]) jumped = true; else if (!caps) out.push(s | (t << 7)); }
              else if (b[t]) { if (b[t] * side < 0) out.push(s | (t << 7)); break; }
              nr += dr; nc += dc;
            }
          } break;
          case P: {
            const fr = r - side;
            if (fr >= 0 && fr <= 9) add(s, fr * 9 + c);
            if (!ownHalf(r, side)) { if (c > 0) add(s, s - 1); if (c < 8) add(s, s + 1); }
          } break;
        }
      }
      return out;
    }
    legal() {
      const out = [], res = [], side = this.turn;
      this.gen(out, false);
      for (const m of out) { const cap = this.make(m); if (!this.checked(side)) res.push(m); this.unmake(m, cap); }
      return res;
    }
    inCheck() { return this.checked(this.turn); }
  }

  // ---------- a game: position + history, end detection ----------
  // Endings: no legal move loses (checkmate or stalemate); a position seen for the third time ends the game, judged by
  // judge() below; 120 plies (60 moves each) without a capture is a draw.
  // keys[i] is the position key before moves[i]; without moves a repetition is simply a draw.
  function status(pos, keys, quiet, moves) {
    const legal = pos.legal();
    if (!legal.length) return { over: true, winner: -pos.turn, reason: pos.inCheck() ? 'checkmate' : 'stalemate' };
    const k = pos.key(); let n = 0; for (const x of keys) if (x === k) n++;
    if (n >= 2) return moves ? judge(pos, keys, moves) : { over: true, winner: 0, reason: 'repetition' };   // seen twice before + now
    if (quiet >= 120) return { over: true, winner: 0, reason: 'quiet' };
    return { over: false, check: pos.inCheck(), repeat: n };
  }

  // ---------- perpetual check and perpetual chase (a simplified form of the Asian rules) ----------
  // Looking at every move since the repeated position first appeared: a side that gave check with each of its moves
  // loses; otherwise a side that chased one and the same piece with each of its moves loses; anything else is a draw.
  // A move chases a piece when it creates a legal threat to take it, and the piece is unprotected or worth more than
  // the attacker. Generals and soldiers may chase, soldiers still on their own side may be chased, and two pieces of
  // the same kind facing each other are an offered exchange, not a chase.
  const RANK = [0, 0, 1, 1, 2, 3, 2, 1];               // by type: chariot 3, horse and cannon 2, the rest 1
  // can the piece on f legally take the piece on t (whoever is to move)?
  function canTake(p, f, t) {
    const side = Math.sign(p.b[f]), flip = p.turn !== side, out = [];
    if (flip) p.pass();
    p.gen(out, true);
    let ok = false;
    for (const m of out) if (from(m) === f && to(m) === t) { const c = p.make(m); ok = !p.checked(side); p.unmake(m, c); break; }
    if (flip) p.pass();
    return ok;
  }
  // the captures `side` threatens in p that count as chasing
  function threats(p, side) {
    const flip = p.turn !== side, out = [], list = [];
    if (flip) p.pass();
    p.gen(out, true);
    for (const m of out) {
      const f = from(m), t = to(m), a = Math.abs(p.b[f]), v = Math.abs(p.b[t]);
      if (a === K || a === P || v === K) continue;
      if (v === P && ownHalf(row(t), -side)) continue;
      const cap = p.make(m);
      let real = !p.checked(side);
      if (real && RANK[a] >= RANK[v]) {                // not worth more than the attacker: a threat only if unprotected
        const back = []; p.gen(back, true);
        for (const r of back) if (to(r) === t) { const c = p.make(r); const ok = !p.checked(-side); p.unmake(r, c); if (ok) { real = false; break; } }
      }
      p.unmake(m, cap);
      if (real && a === v && canTake(p, t, f)) real = false;
      if (real) list.push(m);
    }
    if (flip) p.pass();
    return list;
  }
  function judge(pos, keys, moves) {
    const span = moves.slice(keys.indexOf(pos.key())), p = pos.clone();
    for (let i = span.length - 1; i >= 0; i--) p.unmake(span[i], 0);   // a repeated position means nothing was taken since
    const id = new Int16Array(90).fill(-1);                              // follow each piece as it moves
    for (let s = 0; s < 90; s++) if (p.b[s]) id[s] = s;
    const pairs = list => new Set(list.map(m => id[from(m)] * 128 + id[to(m)]));
    const checks = { 1: true, '-1': true }, chased = { 1: null, '-1': null };
    for (const m of span) {
      const side = p.turn, before = pairs(threats(p, side));
      p.make(m); id[to(m)] = id[from(m)]; id[from(m)] = -1;
      if (!p.checked(-side)) checks[side] = false;
      const now = new Set();
      for (const x of threats(p, side)) if (!before.has(id[from(x)] * 128 + id[to(x)])) now.add(id[to(x)]);
      chased[side] = chased[side] ? new Set([...chased[side]].filter(v => now.has(v))) : now;
    }
    const chases = s => chased[s].size > 0;
    let loser = 0, reason = 'repetition';
    if (checks[1] !== checks[-1]) { loser = checks[1] ? RED : BLACK; reason = 'perpetual-check'; }
    else if (!checks[1] && chases(1) !== chases(-1)) { loser = chases(1) ? RED : BLACK; reason = 'perpetual-chase'; }
    return { over: true, winner: loser ? -loser : 0, reason };
  }

  // ---------- Vietnamese notation, e.g. "Pháo 2 bình 5", "Mã 8 tiến 7", "Xe trước tiến 1" ----------
  const NAME = [null, 'Tướng', 'Sĩ', 'Tượng', 'Mã', 'Xe', 'Pháo', 'Tốt'];
  const HAN = { 1: '帥', 2: '仕', 3: '相', 4: '傌', 5: '俥', 6: '炮', 7: '兵', '-1': '將', '-2': '士', '-3': '象', '-4': '馬', '-5': '車', '-6': '砲', '-7': '卒' };
  function notation(pos, m) {
    const f = from(m), t = to(m), pc = pos.b[f], side = Math.sign(pc), type = Math.abs(pc);
    const file = c => (side > 0 ? 9 - c : c + 1);
    const fwd = (row(f) - row(t)) * side;                // > 0 moving towards the enemy
    let who = NAME[type] + ' ' + file(col(f));
    const same = [];
    for (let r = 0; r < 10; r++) if (pos.b[r * 9 + col(f)] === pc) same.push(r);
    if (same.length > 1 && type !== A && type !== B) {
      const order = side > 0 ? same : same.slice().reverse();          // front first
      const i = order.indexOf(row(f));
      who = NAME[type] + ' ' + (same.length === 2 ? (i === 0 ? 'trước' : 'sau') : ['trước', 'giữa', 'sau', 'tư', 'năm'][i]);
    }
    const act = fwd > 0 ? 'tiến' : fwd < 0 ? 'thoái' : 'bình';
    const diag = type === A || type === B || type === N;
    const num = act === 'bình' || diag ? file(col(t)) : Math.abs(row(t) - row(f));
    return `${who} ${act} ${num}`;
  }

  // ---------- search ----------
  const MATE = 30000, INF = 32000;
  const TT_BITS = 20, TT_SIZE = 1 << TT_BITS, TT_MASK = TT_SIZE - 1;
  let ttHi, ttLo, ttMove, ttScore, ttDepth, ttFlag;
  function ttInit() {
    if (ttHi) return;
    ttHi = new Int32Array(TT_SIZE); ttLo = new Int32Array(TT_SIZE); ttMove = new Int32Array(TT_SIZE);
    ttScore = new Int16Array(TT_SIZE); ttDepth = new Int8Array(TT_SIZE); ttFlag = new Int8Array(TT_SIZE);
  }
  const ORDER_VAL = [0, 1000, 20, 20, 40, 90, 45, 10];

  // Iterative deepening alpha-beta. opts: { time (ms), depth, history (position keys before this one), noise }
  function think(pos, opts = {}) {
    ttInit();
    const deadline = Date.now() + (opts.time || 1000), maxDepth = opts.depth || 32, noise = opts.noise || 0;
    const killers = []; const hist = new Int32Array(90 * 90);
    const path = (opts.history || []).slice();              // keys of earlier positions for repetition
    let nodes = 0, stop = false, best = 0, bestScore = 0, depthDone = 0;
    const rootMoves = pos.legal();
    if (!rootMoves.length) return { move: 0, score: -MATE, depth: 0, nodes: 0 };
    if (rootMoves.length === 1) return { move: rootMoves[0], score: 0, depth: 0, nodes: 0 };
    const evalSide = p => p.val * p.turn + (noise ? ((p.lo ^ noise) & 63) - 32 : 0);

    function order(moves, ttm, ply) {
      const b = pos.b, sc = new Int32Array(moves.length);
      for (let i = 0; i < moves.length; i++) {
        const m = moves[i], cap = b[to(m)];
        sc[i] = m === ttm ? 1e9 : cap ? 1e6 + ORDER_VAL[Math.abs(cap)] * 100 - ORDER_VAL[Math.abs(b[from(m)])]
          : (killers[ply] && (killers[ply][0] === m || killers[ply][1] === m)) ? 9e5 : hist[from(m) * 90 + to(m)];
      }
      const idx = moves.map((_, i) => i).sort((a, c) => sc[c] - sc[a]);
      return idx.map(i => moves[i]);
    }

    function quiesce(alpha, beta, ply) {
      if ((++nodes & 2047) === 0 && Date.now() > deadline) stop = true;
      if (stop) return 0;
      // checks answered by checks (evasions are searched in full) could go on for ever: stop on the evaluation
      if (ply >= 64) return evalSide(pos);
      const side = pos.turn, check = pos.checked(side);
      if (!check) {
        const stand = evalSide(pos);
        if (stand >= beta) return stand;
        if (stand > alpha) alpha = stand;
      }
      const moves = order(pos.gen([], !check), 0, 60);
      let any = false;
      for (const m of moves) {
        const cap = pos.make(m);
        if (pos.checked(side)) { pos.unmake(m, cap); continue; }
        any = true;
        const sc = -quiesce(-beta, -alpha, ply + 1);
        pos.unmake(m, cap);
        if (stop) return 0;
        if (sc >= beta) return sc;
        if (sc > alpha) alpha = sc;
      }
      if (check && !any) return -MATE + ply;
      return alpha;
    }

    function alphaBeta(depth, alpha, beta, ply, allowNull) {
      if ((++nodes & 2047) === 0 && Date.now() > deadline) stop = true;
      if (stop) return 0;
      const side = pos.turn, check = pos.checked(side);
      if (check) depth++;                                   // check extension
      if (depth <= 0) return quiesce(alpha, beta, ply);
      const key = pos.key();
      if (ply > 0 && path.includes(key)) return 0;          // repetition: treat as a draw
      // transposition table
      const ti = pos.lo & TT_MASK; let ttm = 0;
      if (ttHi[ti] === pos.hi && ttLo[ti] === pos.lo) {
        ttm = ttMove[ti];
        if (ply > 0 && ttDepth[ti] >= depth) {
          let s = ttScore[ti]; if (s > MATE - 200) s -= ply; else if (s < -MATE + 200) s += ply;
          if (ttFlag[ti] === 0 || (ttFlag[ti] === 1 && s >= beta) || (ttFlag[ti] === 2 && s <= alpha)) return s;
        }
      }
      // null move: give the opponent a free move; if we still beat beta, this line is good enough
      if (allowNull && !check && depth >= 3 && ply > 0 && Math.abs(beta) < MATE - 200) {
        pos.pass(); path.push(key);
        const s = -alphaBeta(depth - 3, -beta, -beta + 1, ply + 1, false);
        path.pop(); pos.pass();
        if (stop) return 0;
        if (s >= beta) return s;
      }
      const moves = order(ply === 0 ? rootMoves : pos.gen([], false), ply === 0 ? (best || ttm) : ttm, ply);
      let bestM = 0, bestS = -INF, legalN = 0; const a0 = alpha;
      path.push(key);
      for (const m of moves) {
        const cap = pos.make(m);
        if (pos.checked(side)) { pos.unmake(m, cap); continue; }
        legalN++;
        let s;
        if (legalN === 1) s = -alphaBeta(depth - 1, -beta, -alpha, ply + 1, true);
        else {
          // late quiet moves get a reduced search first
          const reduce = depth >= 3 && legalN > 4 && !cap && !check ? 1 : 0;
          s = -alphaBeta(depth - 1 - reduce, -alpha - 1, -alpha, ply + 1, true);
          if (s > alpha && !stop) s = -alphaBeta(depth - 1, -beta, -alpha, ply + 1, true);
        }
        pos.unmake(m, cap);
        if (stop) { path.pop(); return 0; }
        if (s > bestS) { bestS = s; bestM = m; }
        if (s > alpha) {
          alpha = s;
          if (s >= beta) {
            if (!cap) { const k = killers[ply] || (killers[ply] = [0, 0]); if (k[0] !== m) { k[1] = k[0]; k[0] = m; } hist[from(m) * 90 + to(m)] += depth * depth; }
            break;
          }
        }
      }
      path.pop();
      if (!legalN) return -MATE + ply;                      // no move: checkmate or stalemate, both lose
      let st = bestS; if (st > MATE - 200) st += ply; else if (st < -MATE + 200) st -= ply;
      ttHi[ti] = pos.hi; ttLo[ti] = pos.lo; ttMove[ti] = bestM; ttScore[ti] = st; ttDepth[ti] = depth;
      ttFlag[ti] = bestS >= beta ? 1 : bestS <= a0 ? 2 : 0;
      if (ply === 0) { best = bestM; bestScore = bestS; }
      return bestS;
    }

    for (let d = 1; d <= maxDepth; d++) {
      const prev = best, prevScore = bestScore;
      alphaBeta(d, -INF, INF, 0, false);
      if (stop) { best = prev || best; bestScore = prev ? prevScore : bestScore; break; }
      depthDone = d;
      if (Math.abs(bestScore) > MATE - 200) break;           // found a mate
      if (Date.now() > deadline - (opts.time || 1000) * 0.45) break;   // the next depth would not finish
    }
    return { move: best || rootMoves[0], score: bestScore, depth: depthDone, nodes };
  }

  // perft, for testing the move generator
  function perft(pos, d) {
    if (d === 0) return 1;
    let n = 0;
    for (const m of pos.legal()) { const cap = pos.make(m); n += d === 1 ? 1 : perft(pos, d - 1); pos.unmake(m, cap); }
    return n;
  }

  return { K, A, B, N, R, C, P, RED, BLACK, START, Pos, row, col, mv, from, to, status, notation, think, perft, NAME, HAN, MATE };
})();
if (typeof module === 'object' && module.exports) module.exports = XQ;
