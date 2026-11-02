// achievements.js — thành tựu: feats of the board, each a seal to collect, some with a title to wear by one's name.
// Most are earned in a game (any game of cờ tướng: against the computer, the campaign, Chân Long Kỳ Trận, online) and all
// of those need a checkmate, so a list of moves proves them: the page checks each game it finishes, the Worker replays
// the moves before it saves one (worker/api.js). The last few the Worker sees for itself in its records.
// Shared by the page and the Worker.
'use strict';
const ACHIEVEMENTS = (() => {
  const X = typeof XQ !== 'undefined' ? XQ : require('./xiangqi.js');
  const { N, R, C, P } = X;
  const LIST = [
    { id: 'tieu-tot', han: '卒', name: 'Tiểu tốt đánh xe', desc: 'Dùng một con Tốt ăn Xe của đối phương' },
    { id: 'ma-dao', han: '馬', name: 'Mã đáo thành công', desc: 'Chiếu bí bằng một nước Mã', title: 'Mã đáo thành công' },
    { id: 'tot-sat', han: '兵', name: 'Tốt sát', desc: 'Chiếu bí bằng một nước Tốt' },
    { id: 'trung-phao', han: '炮', name: 'Trùng pháo', desc: 'Chiếu bí bằng Pháo, ngòi là cỗ Pháo thứ hai của mình' },
    { id: 'mat-tuong', han: '帥', name: 'Lộ mặt Tướng', desc: 'Chiếu bí mà Tướng địch không dám tránh sang vì sẽ đối mặt Tướng mình', title: 'Ngự giá thân chinh' },
    { id: 'than-toc', han: '速', name: 'Thần tốc', desc: 'Chiếu bí trong 15 nước, đánh từ thế khai cuộc', title: 'Thần tốc' },
    { id: 'toan-quan', han: '全', name: 'Toàn quân', desc: 'Chiếu bí từ thế khai cuộc mà không mất một quân nào', title: 'Bất bại tướng quân' },
    { id: 'don-ky', han: '騎', name: 'Đơn kỵ', desc: 'Chiếu bí khi quân tấn công duy nhất còn lại là một con Mã', title: 'Đơn kỵ cứu chúa' },
    { id: 'thi-xe', han: '車', name: 'Thí Xe', desc: 'Mất Xe rồi chiếu bí trong vòng 5 nước sau đó', title: 'Khí phách anh hùng' },
    { id: 'truong-ky', han: '久', name: 'Trường kỳ', desc: 'Chiếu bí sau một ván dài từ 100 nước trở lên' },
    // the Worker's own records say these
    { id: 'that-tinh', han: '陣', name: 'Thất tinh', desc: 'Phá Chân Long Kỳ Trận 7 ngày liên tiếp', title: 'Phá trận tiên sinh', server: true },
    { id: 'bach-chien', han: '戰', name: 'Thân kinh bách chiến', desc: 'Đánh 50 ván xếp hạng cờ tướng', server: true },
    { id: 'danh-chan', han: '名', name: 'Danh chấn thiên hạ', desc: 'Đạt 1600 điểm xếp hạng cờ tướng', title: 'Danh chấn thiên hạ', server: true },
    { id: 'tam-quoc', han: '統', name: 'Thống nhất Tam Quốc', desc: 'Một mình nhất thống thiên hạ trong một ván xếp hạng Tam Quốc', server: true },
  ];
  const byId = Object.fromEntries(LIST.map(a => [a.id, a]));
  const has = id => typeof id === 'string' && Object.prototype.hasOwnProperty.call(byId, id);
  // a title an achievement gives is worn as 'a:<id>'
  const title = id => (typeof id === 'string' && id.startsWith('a:') && has(id.slice(2)) && byId[id.slice(2)].title) || '';

  // the feats of one game, from the side `me` played: { fen0, moves, me }. Moves that are not legal end the replay
  // (nothing after them counts); the mates are checked on the board, not taken on trust.
  function fromGame(g) {
    const me = g && g.me, out = new Set();
    if ((me !== 1 && me !== -1) || !Array.isArray(g.moves)) return [];
    let pos;
    try { pos = X.Pos.fromFen(g.fen0); } catch (e) { return []; }
    const opening = g.fen0 === X.START;
    let mine = 0, lostAny = false, lostRookAt = -1, last = null;
    for (const m of g.moves.slice(0, 600)) {
      if (!Number.isInteger(m) || !pos.legal().includes(m)) break;
      const mover = pos.turn, pc = pos.b[X.from(m)], cap = pos.make(m);
      if (mover === me) {
        mine++;
        if (Math.abs(pc) === P && Math.abs(cap) === R) out.add('tieu-tot');
      } else if (cap) {
        lostAny = true;
        if (Math.abs(cap) === R) lostRookAt = mine;
      }
      last = { pc, m, mover };
    }
    const mated = last && last.mover === me && pos.turn === -me && pos.inCheck() && !pos.legal().length;
    if (!mated) return [...out];
    const t = Math.abs(last.pc);
    if (t === N) out.add('ma-dao');
    if (t === P) out.add('tot-sat');
    // the generals face each other: a square beside the mated general it may not step to, for it would stand on my
    // general's open file (the square it leaves counts as empty)
    const mk = pos.kings[me > 0 ? 0 : 1], ek = pos.kings[me > 0 ? 1 : 0];
    const facing = s => {
      if (X.col(s) !== X.col(mk)) return false;
      const step = 9 * Math.sign(mk - s);
      for (let q = s + step; q !== mk; q += step) if (pos.b[q] && q !== ek) return false;
      return true;
    };
    for (const d of [-1, 1, -9, 9]) {
      const s = ek + d, r = X.row(s), c = X.col(s);
      if (Math.abs(d) === 1 && X.row(ek) !== r) continue;           // no wrapping round the row's end
      if (s < 0 || s >= 90 || c < 3 || c > 5 || (me > 0 ? r > 2 : r < 7)) continue;
      if (Math.sign(pos.b[s]) !== -me && facing(s)) { out.add('mat-tuong'); break; }
    }
    if (t === C) {
      // the screen between the cannon that moved and the general it mates is the other cannon
      const a = X.to(last.m), k = pos.kings[me > 0 ? 1 : 0], between = [];
      if (X.row(a) === X.row(k) || X.col(a) === X.col(k)) {
        const step = X.row(a) === X.row(k) ? Math.sign(k - a) : 9 * Math.sign(k - a);
        for (let s = a + step; s !== k; s += step) if (pos.b[s]) between.push(pos.b[s]);
      }
      if (between.length === 1 && between[0] === me * C) out.add('trung-phao');
    }
    if (opening && mine <= 15) out.add('than-toc');
    if (opening && !lostAny) out.add('toan-quan');
    if (mine >= 100) out.add('truong-ky');
    if (lostRookAt >= 0 && mine - lostRookAt <= 5) out.add('thi-xe');
    const attackers = [...pos.b].filter(p => Math.sign(p) === me && [R, N, C, P].includes(Math.abs(p)));
    if (attackers.length === 1 && Math.abs(attackers[0]) === N) out.add('don-ky');
    return [...out];
  }
  // the ones the Worker's records prove: u a player row (users), streak the Chân Long Kỳ Trận days in a row
  function fromRecords(u, streak) {
    const out = [];
    if (streak >= 7) out.push('that-tinh');
    if ((u.games | 0) >= 50) out.push('bach-chien');
    if ((u.rating | 0) >= 1600) out.push('danh-chan');
    if ((u.sg_wins | 0) >= 1) out.push('tam-quoc');
    return out;
  }
  return { LIST, byId, has, title, fromGame, fromRecords };
})();
if (typeof module === 'object' && module.exports) module.exports = ACHIEVEMENTS;
