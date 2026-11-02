// jieqi.js — cờ úp: the fifteen pieces of each side besides the general are shuffled and stand face down on the usual
// starting points. A face-down piece moves as the piece that starts on its point would; the move turns it up, and from
// then on it is what it really is. An advisor or elephant once turned up may go anywhere on the board (xiangqi.js,
// Pos.dark). A face-down piece taken is turned up for both players to see.
// The deal (which piece really stands where) is known to whoever deals: this page against the computer, the room
// (worker/room.js) online, which tells each move's turned-up pieces as it relays it. The computer never looks at it.
// Shared by the page, the AI worker and the Cloudflare Worker.
'use strict';
const JQ = (() => {
  const X = typeof XQ !== 'undefined' ? XQ : require('./xiangqi.js');
  const OPEN = X.Pos.fromFen(X.START).b;
  // the starting points that hold a face-down piece: all but the generals'
  const HIDDEN = [];
  for (let s = 0; s < 90; s++) if (OPEN[s] && Math.abs(OPEN[s]) !== X.K) HIDDEN.push(s);

  // a deal: for each point, the piece that really stands there face down (0 elsewhere)
  function deal(rand = Math.random) {
    const d = new Array(90).fill(0);
    for (const side of [1, -1]) {
      const sq = HIDDEN.filter(s => OPEN[s] * side > 0), pcs = sq.map(s => OPEN[s]);
      for (let i = pcs.length - 1; i > 0; i--) { const k = Math.floor(rand() * (i + 1)); [pcs[i], pcs[k]] = [pcs[k], pcs[i]]; }
      sq.forEach((s, i) => { d[s] = pcs[i]; });
    }
    return d;
  }
  const validDeal = d => Array.isArray(d) && d.length === 90 && [1, -1].every(side => {
    const want = HIDDEN.filter(s => OPEN[s] * side > 0).map(s => OPEN[s]).sort().join();
    return HIDDEN.filter(s => OPEN[s] * side > 0).map(s => d[s]).sort().join() === want;
  }) && d.every((p, s) => (HIDDEN.includes(s) ? !!p : p === 0));

  // the starting position, every piece but the generals face down
  function start() {
    const p = X.Pos.fromFen(X.START);
    p.dark = new Uint8Array(90);
    for (const s of HIDDEN) p.dark[s] = 1;
    return p;
  }
  // what move m turns up: r the piece that moves, if it was face down; c the piece it takes, if that was
  const reveals = (pos, m, d) => ({ r: pos.dark[X.from(m)] ? d[X.from(m)] : 0, c: pos.dark[X.to(m)] ? d[X.to(m)] : 0 });
  // play m, turning up what it turns up (info from reveals, or as the room told it); returns the piece taken as it
  // really is, and the piece turned up (0 if none)
  function apply(pos, m, info) {
    const f = X.from(m), t = X.to(m), hid = pos.dark[f], took = pos.dark[t];
    const cap = pos.make(m);
    pos.dark[f] = 0; pos.dark[t] = 0;
    if (hid && info.r) pos.put(t, info.r);
    return { cap: cap && took && info.c ? info.c : cap, turned: hid ? info.r || 0 : 0 };
  }
  // notation: "Xe úp 9 tiến 1, lật Pháo"
  function notation(pos, m, info) {
    const f = X.from(m), t = X.to(m);
    let s = X.notation(pos, m);
    if (pos.dark[f]) s = s.replace(/^(\S+)/, '$1 úp') + (info.r ? `, lật ${X.NAME[Math.abs(info.r)]}` : '');
    if (pos.dark[t] && info.c) s += `, ăn ${X.NAME[Math.abs(info.c)]} úp`;
    return s;
  }
  // the face-down points as a list, for the AI worker
  const darkList = pos => { const l = []; for (let s = 0; s < 90; s++) if (pos.dark[s]) l.push(s); return l; };
  const withDark = (pos, list) => { pos.dark = new Uint8Array(90); for (const s of list || []) if (s >= 0 && s < 90) pos.dark[s] = 1; return pos; };

  return { HIDDEN, deal, validDeal, start, reveals, apply, notation, darkList, withDark };
})();
if (typeof module === 'object' && module.exports) module.exports = JQ;
