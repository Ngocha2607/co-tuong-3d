// sw.js — the installed app's service worker: the game's own files are kept, so the page opens without a network
// and plays the computer, the campaign, the daily puzzle and old games offline. worker/build.cjs writes the version
// and the list of files into the copy in dist/ on every build: a new version installs beside the old one and takes
// over when the page asks (its Cập nhật button), so the page and its scripts always come from the same version.
//   the page and its scripts, icons: from the version's cache
//   music: kept once played (it streams with Range requests, answered from the whole file once it is here)
//   fonts from Google: the copy here at once, a fresh one fetched for next time
//   everything else (the accounts API, rooms, /info, WebSockets): the network only
'use strict';
const VERSION = '__VERSION__';
const SHELL = __SHELL__;
const CODE = 'ct-code-' + VERSION, MUSIC = 'ct-music', FONTS = 'ct-fonts';

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CODE).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('ct-code-') && k !== CODE).map(k => caches.delete(k)))));
});
self.addEventListener('message', e => { if (e.data === 'skip') self.skipWaiting(); });

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;
  if (url.origin === location.origin) {
    if (req.mode === 'navigate') {
      // the game's page under any query (?room=, ?tq=, ?daily); the legal pages go to the network
      if (url.pathname === '/' || url.pathname === '/index.html') e.respondWith(fromCode('/', req));
      return;
    }
    if (url.pathname.startsWith('/music/')) { e.respondWith(music(req)); return; }
    if (SHELL.includes(url.pathname)) e.respondWith(fromCode(url.pathname, req));
    return;
  }
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') e.respondWith(fonts(req));
});

async function fromCode(path, req) {
  const hit = await caches.match(path, { cacheName: CODE });
  return hit || fetch(req);
}
async function fonts(req) {
  const cache = await caches.open(FONTS), hit = await cache.match(req);
  const fresh = fetch(req).then(r => { if (r.ok || r.type === 'opaque') cache.put(req, r.clone()); return r; }).catch(() => null);
  return hit || (await fresh) || Response.error();
}
// a track: from the whole file kept here (a Range asked for is cut from it), or from the network, the whole file
// then fetched once in the background for next time
async function music(req) {
  const cache = await caches.open(MUSIC), key = new URL(req.url).pathname, hit = await cache.match(key);
  if (hit) return ranged(hit, req.headers.get('range'));
  fetch(key).then(r => { if (r.ok && r.status === 200) cache.put(key, r); }).catch(() => { });
  return fetch(req);
}
async function ranged(res, range) {
  if (!range) return res;
  const m = /bytes=(\d*)-(\d*)/.exec(range), buf = await res.arrayBuffer(), size = buf.byteLength;
  if (!m) return new Response(buf, { headers: res.headers });
  let start = m[1] === '' ? size - +m[2] : +m[1], end = m[1] === '' || m[2] === '' ? size - 1 : Math.min(+m[2], size - 1);
  if (start < 0) start = 0;
  if (start >= size || start > end) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${size}` } });
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    headers: { 'content-type': res.headers.get('content-type') || 'audio/mpeg', 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': String(end - start + 1), 'accept-ranges': 'bytes' },
  });
}
