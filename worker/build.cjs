// worker/build.cjs — copies the public files (the pages, src/, icons/ and music/) into dist/ for Cloudflare assets,
// and writes the service worker (sw.js) with this build's version and the files the installed app keeps.
// Only changed files are written and stale ones removed, with a few retries: on Windows `wrangler dev`
// watches dist/ and a file it is reading cannot be replaced or deleted for a moment (EBUSY).
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const root = path.join(__dirname, '..'), out = path.join(root, 'dist');

function retry(fn) {
  for (let i = 0; ; i++) {
    try { return fn(); } catch (e) {
      if (i >= 8 || !['EBUSY', 'EPERM', 'ENOTEMPTY'].includes(e.code)) throw e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 150);
    }
  }
}
const keep = new Set(), shell = [], hash = crypto.createHash('sha256');
function write(rel, data) {
  const dst = path.join(out, rel);
  keep.add(path.normalize(dst));
  if (fs.existsSync(dst) && fs.readFileSync(dst).equals(data)) return;
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  retry(() => fs.writeFileSync(dst, data));
}
function copy(rel) {
  const data = fs.readFileSync(path.join(root, rel));
  write(rel, data);
  // the app's own files (not the music, nor the legal pages) are what the service worker keeps
  const url = '/' + rel.split(path.sep).join('/');
  if (!url.startsWith('/music/') && !/^\/(privacy|terms)\.html$/.test(url)) { shell.push(url === '/index.html' ? '/' : url); hash.update(url).update(data); }
}
function walk(rel) {
  for (const e of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
    const r = path.join(rel, e.name);
    if (e.isDirectory()) walk(r); else copy(r);
  }
}
walk('src');
if (fs.existsSync(path.join(root, 'music'))) walk('music');   // the battlefields' music tracks
walk('icons');                                                // home-screen icons (manifest, apple-touch-icon)
for (const page of ['index.html', 'privacy.html', 'terms.html', 'manifest.webmanifest']) copy(page);
const template = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const sw = template
  .replace("'__VERSION__'", JSON.stringify(hash.update(template).digest('hex').slice(0, 12)))
  .replace('__SHELL__', JSON.stringify(shell.sort()));
write('sw.js', Buffer.from(sw));
(function prune(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) prune(p);
    else if (!keep.has(path.normalize(p))) retry(() => fs.rmSync(p, { force: true }));
  }
})(out);
