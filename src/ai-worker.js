// ai-worker.js — runs the search off the main thread so the 3D view never stutters while the computer thinks.
// A job with `sg` is a three-kingdom position (sanguo.js), the others are ordinary games.
'use strict';
importScripts('xiangqi.js', 'sanguo.js');
onmessage = e => {
  const { id, fen, moves, time, depth, noise, sg } = e.data;
  if (sg) { postMessage({ id, ...SG.think(SG.unpack(sg), { time, depth, noise }) }); return; }
  const pos = XQ.Pos.fromFen(fen), history = [];
  for (const m of moves) { history.push(pos.key()); pos.make(m); }
  postMessage({ id, ...XQ.think(pos, { time, depth, history, noise }) });
};
