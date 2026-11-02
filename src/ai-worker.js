// ai-worker.js — runs the search off the main thread so the 3D view never stutters while the computer thinks.
// A job with `sg` is a three-kingdom position (sanguo.js), the others are ordinary games; one with `dark` is a game of
// cờ úp (jieqi.js) given as it stands now: the points still face down, and the keys of the positions before it.
'use strict';
importScripts('xiangqi.js', 'jieqi.js', 'sanguo.js');
onmessage = e => {
  const { id, fen, moves, time, depth, noise, sg, exclude, full, dark, keys } = e.data;
  if (sg) { postMessage({ id, ...SG.think(SG.unpack(sg), { time, depth, noise }) }); return; }
  const pos = XQ.Pos.fromFen(fen), history = (keys || []).slice();
  if (dark) JQ.withDark(pos, dark);
  for (const m of moves) { history.push(pos.key()); pos.make(m); }
  postMessage({ id, ...XQ.think(pos, { time, depth, history, noise, exclude, full }) });
};
