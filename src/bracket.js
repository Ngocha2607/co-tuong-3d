// bracket.js — a tournament between friends (giải đấu): 3 to 8 players, drawn at random into a knock-out bracket of 4
// or 8 places; the places left empty are byes, given to the first drawn. Each match is one game (a room of its own,
// worker/tournament.js): the first named plays Red. A draw sends Black through, so every game has someone who goes on.
// The data, kept as JSON in D1 and drawn by the page:
//   { state: 'open' | 'playing' | 'done', players: [{ id, name }], rounds: [[match…]…], champion: index | null }
//   match: { a, b (indexes into players, null for a bye), room ('' until both are known), winner (index | null), reason }
// Shared by the page and the Worker.
'use strict';
const BRACKET = (() => {
  const MIN = 3, MAX = 8;
  const fresh = host => ({ state: 'open', players: [host], rounds: [], champion: null });
  // the places in a bracket of n, in the order seeds fill them: 1 meets n, 2 meets n-1… and the top two meet last
  const ORDER = { 4: [0, 3, 1, 2], 8: [0, 7, 3, 4, 1, 6, 2, 5] };
  const room = (id, r, s) => `${id}${r}${s}`.toUpperCase();

  // the draw: players shuffled into seeds, byes to the first seeds. Returns the data with its first round (byes
  // already decided) and the rounds after it filled as far as byes allow
  function start(data, id, rand = Math.random) {
    const n = data.players.length, size = n <= 4 ? 4 : 8;
    const seeds = data.players.map((_, i) => i);
    for (let i = n - 1; i > 0; i--) { const k = Math.floor(rand() * (i + 1)); [seeds[i], seeds[k]] = [seeds[k], seeds[i]]; }
    // seed s (0-based; past the players, a bye) meets the seed ORDER puts beside it: matches (ORDER[2k], ORDER[2k+1])
    const at = Array.from({ length: size }, (_, s) => (s < n ? seeds[s] : null));
    const first = [];
    for (let k = 0; k < size / 2; k++) {
      const x = at[ORDER[size][2 * k]], y = at[ORDER[size][2 * k + 1]];
      first.push({ a: x, b: y, room: '', winner: null, reason: '' });
    }
    const out = { ...data, state: 'playing', rounds: [first] };
    settle(out, id);
    return out;
  }
  // after any change: byes decided, rooms named for matches whose two players are known, the next round drawn from
  // the winners as they come, and the champion once the final is played
  function settle(d, id) {
    for (let r = 0; r < d.rounds.length; r++) {
      const round = d.rounds[r];
      for (let s = 0; s < round.length; s++) {
        const m = round[s];
        const ready = r === 0 || [0, 1].every(i => feeder(d, r, s, i).winner !== null);
        if (r === 0 && m.winner === null && (m.a === null || m.b === null)) { m.winner = m.a === null ? m.b : m.a; m.reason = 'bye'; }
        if (ready && m.a !== null && m.b !== null && !m.room && m.winner === null) m.room = room(id, r, s);
      }
      if (round.length > 1 && !d.rounds[r + 1]) d.rounds.push(Array.from({ length: round.length / 2 }, () => ({ a: null, b: null, room: '', winner: null, reason: '' })));
      if (d.rounds[r + 1]) d.rounds[r + 1].forEach((m, s) => {
        const x = feeder(d, r + 1, s, 0).winner, y = feeder(d, r + 1, s, 1).winner;
        if (m.a === null && x !== null) m.a = x;
        if (m.b === null && y !== null) m.b = y;
      });
    }
    const final = d.rounds[d.rounds.length - 1];
    if (final.length === 1 && final[0].winner !== null) { d.champion = final[0].winner; d.state = 'done'; }
    return d;
  }
  const feeder = (d, r, s, i) => d.rounds[r - 1][s * 2 + i];
  // a match's game is over: winner the side that won (1 Red = a, -1 Black = b, 0 a draw: Black goes through)
  function report(d, r, s, winner, reason, id) {
    const m = d.rounds[r] && d.rounds[r][s];
    if (!m || m.winner !== null || m.a === null || m.b === null) return false;
    m.winner = winner === 1 ? m.a : m.b; m.reason = winner === 0 ? 'draw' : reason || '';
    settle(d, id);
    return true;
  }
  // the match a player has to play now (both known, not played), or null
  function current(d, idx) {
    for (let r = 0; r < d.rounds.length; r++) for (let s = 0; s < d.rounds[r].length; s++) {
      const m = d.rounds[r][s];
      if (m.room && m.winner === null && (m.a === idx || m.b === idx)) return { r, s, m };
    }
    return null;
  }
  // rounds named from the end: Chung kết, Bán kết, Tứ kết
  const roundName = (d, r) => ['Chung kết', 'Bán kết', 'Tứ kết'][d.rounds.length - 1 - r] || `Vòng ${r + 1}`;

  return { MIN, MAX, fresh, start, settle, report, current, roundName, room };
})();
if (typeof module === 'object' && module.exports) module.exports = BRACKET;
