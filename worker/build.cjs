// worker/build.cjs — copies the public files (the pages, src/, icons/ and music/) into dist/ for Cloudflare assets
// Only changed files are written and stale ones removed, with a few retries: on Windows `wrangler dev`
// watches dist/ and a file it is reading cannot be replaced or deleted for a moment (EBUSY).
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..'), out = path.join(root, 'dist');

function retry(fn) {
  for (let i = 0; ; i++) {
    try { return fn(); } catch (e) {
      if (i >= 8 || !['EBUSY', 'EPERM', 'ENOTEMPTY'].includes(e.code)) throw e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 150);
    }
  }
}
const keep = new Set();
function copy(rel) {
  const src = path.join(root, rel), dst = path.join(out, rel), data = fs.readFileSync(src);
  keep.add(path.normalize(dst));
  if (fs.existsSync(dst) && fs.readFileSync(dst).equals(data)) return;
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  retry(() => fs.writeFileSync(dst, data));
}
function walk(rel) {
  for (const e of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
    const r = path.join(rel, e.name);
    if (e.isDirectory()) walk(r); else copy(r);
  }
}
walk('src');
if (fs.existsSync(path.join(root, 'music'))) walk('music');   // the battlefields' music tracks (optional)
walk('icons');                                                // home-screen icons (manifest, apple-touch-icon)
for (const page of ['index.html', 'privacy.html', 'terms.html', 'manifest.webmanifest']) copy(page);
(function prune(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) prune(p);
    else if (!keep.has(path.normalize(p))) retry(() => fs.rmSync(p, { force: true }));
  }
})(out);
