// quests.js — nhiệm vụ tuần: each week (Monday to Sunday, Vietnam time) three tasks drawn from POOL, the same for
// everyone, e.g. "Ăn 3 quân bằng Mã" or "Thắng một ván mà không mất Xe nào". Each finished game counts towards them
// (game.js tells it how the game went); each task done gives a quest star, and the stars open a look (skins.js,
// need.quests). Progress is kept on this device. The rules here are plain functions, shared with the tests.
'use strict';
const QUESTS = (() => {
  const N = 4, R = 5, C = 6, P = 7;
  const DAY = 86400000, VN = 7 * 3600000;
  // weeks since the first Monday after the epoch, in Vietnam
  const weekOf = (t = Date.now()) => Math.floor(((t + VN) / DAY + 3) / 7);
  const weekEnds = w => (w * 7 - 3 + 7) * DAY - VN;           // when that week is over (ms)

  // g: { mode ('ai', 'campaign', 'online', 'sanguo'), level (0–2 against the computer), won, reason, plies, jq (cờ úp),
  //   daily, me (1, -1), log: [{ side, pc (the piece that moved), cap (the piece taken) }] }
  const mine = g => (g.log || []).filter(x => x.side === g.me);
  const capsBy = (g, t) => mine(g).filter(x => x.cap && Math.abs(x.pc) === t).length;
  const took = (g, t) => mine(g).filter(x => Math.abs(x.cap) === t).length;
  const lost = (g, t) => (g.log || []).some(x => x.side === -g.me && Math.abs(x.cap) === t);
  const xq = g => g.mode !== 'sanguo';
  const POOL = [
    { id: 'ma', text: 'Ăn 3 quân bằng Mã', goal: 3, add: g => capsBy(g, N) },
    { id: 'phao', text: 'Ăn 4 quân bằng Pháo', goal: 4, add: g => capsBy(g, C) },
    { id: 'tot', text: 'Tốt ăn 2 quân', goal: 2, add: g => capsBy(g, P) },
    { id: 'xe-dich', text: 'Ăn 2 Xe của đối phương', goal: 2, add: g => took(g, R) },
    { id: 'thang', text: 'Thắng 3 ván cờ tướng', goal: 3, add: g => +(xq(g) && g.won) },
    { id: 'kho', text: 'Thắng máy ở mức Khó', goal: 1, add: g => +(g.mode === 'ai' && g.level === 2 && g.won) },
    { id: 'giu-phao', text: 'Thắng một ván mà không mất Pháo nào', goal: 1, add: g => +(xq(g) && g.won && !!g.log && !lost(g, C)) },
    { id: 'giu-xe', text: 'Thắng một ván mà không mất Xe nào', goal: 1, add: g => +(xq(g) && g.won && !!g.log && !lost(g, R)) },
    { id: 'ma-bi', text: 'Chiếu bí bằng Mã', goal: 1, add: g => { const m = mine(g); return +(g.won && g.reason === 'checkmate' && !!m.length && Math.abs(m[m.length - 1].pc) === N); } },
    { id: 'nhanh', text: 'Thắng trong vòng 30 nước', goal: 1, add: g => +(xq(g) && g.won && g.plies > 0 && g.plies <= 60) },
    { id: 'online', text: 'Đánh 2 ván online', goal: 2, add: g => +(g.mode === 'online') },
    { id: 'co-up', text: 'Chơi 2 ván cờ úp', goal: 2, add: g => +!!g.jq },
    { id: 'chien-dich', text: 'Thắng 2 trận Chiến dịch', goal: 2, add: g => +(g.mode === 'campaign' && !g.daily && g.won) },
    { id: 'tam-quoc', text: 'Chơi 1 ván Tam Quốc', goal: 1, add: g => +(g.mode === 'sanguo') },
  ];
  const byId = Object.fromEntries(POOL.map(q => [q.id, q]));
  // the week's three, drawn with the week as the seed
  function of(week) {
    let s = (week * 2654435761) >>> 0;
    const rnd = () => { s = (s + 0x6d2b79f5) >>> 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const ids = POOL.map(q => q.id);
    for (let i = ids.length - 1; i > 0; i--) { const k = Math.floor(rnd() * (i + 1)); [ids[i], ids[k]] = [ids[k], ids[i]]; }
    return ids.slice(0, 3);
  }
  // st: { week, got: { id: count }, stars } — a game counted: returns the new state and the tasks it finished
  function count(st, g, now = Date.now()) {
    const week = weekOf(now), s = st && st.week === week ? { ...st, got: { ...st.got } } : { week, got: {}, stars: (st && st.stars) | 0 };
    const done = [];
    for (const id of of(week)) {
      const q = byId[id], was = s.got[id] | 0;
      if (was >= q.goal) continue;
      const n = Math.min(q.goal, was + Math.max(0, q.add(g) | 0));
      s.got[id] = n;
      if (n >= q.goal) { done.push(q); s.stars = (s.stars | 0) + 1; }
    }
    return { st: s, done };
  }
  return { POOL, byId, weekOf, weekEnds, of, count };
})();
if (typeof module === 'object' && module.exports) module.exports = QUESTS;
