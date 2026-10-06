// ai-worker.js — runs the search off the main thread so the 3D view never stutters while the computer thinks.
'use strict';
importScripts('xiangqi.js');
onmessage = e => {
  const { id, fen, moves, time, depth, noise } = e.data;
  const pos = XQ.Pos.fromFen(fen), history = [];
  for (const m of moves) { history.push(pos.key()); pos.make(m); }
  postMessage({ id, ...XQ.think(pos, { time, depth, history, noise }) });
};
