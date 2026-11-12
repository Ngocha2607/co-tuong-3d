// models.js — everything on the table, built from code: the board texture, the round pieces with their
// brush-written characters, and a Three Kingdoms warrior for every piece type, built to a real body's proportions.
// Red is the army of Shu (crimson and gold), Black is the army of Wei (ink blue and silver); in the three-kingdom game
// (sanguo.js) Wu joins them in jade green.
// One board step is 1 world unit; figures are built facing +z and stand on y = 0.
'use strict';
const MODELS = (() => {
  const BRUSH = '"LXGW WenKai TC", "KaiTi", "STKaiti", "Noto Serif SC", serif';
  const PAL = {
    1: { main: '#a8231b', dark: '#5c1310', trim: '#e3b448', cloth: '#7a1712', plume: '#ffcf4a', ink: '#a3201a', banner: '#b3261e', horse: '#8a4a24', metal: '#d9b65a' },
    '-1': { main: '#26344d', dark: '#121a29', trim: '#c9d3de', cloth: '#18233a', plume: '#6fb1ff', ink: '#1b1b1b', banner: '#22324c', horse: '#2b2b33', metal: '#c3ccd6' },
    2: { main: '#2c7348', dark: '#143a24', trim: '#e3c86a', cloth: '#1d5233', plume: '#9be07a', ink: '#17663a', banner: '#215c39', horse: '#5a3a1e', metal: '#d9c27a' },
  };
  // by palette: a general's armour, an advisor's robe, a general's cape
  const ARMOUR = { 1: '#c0392b', '-1': '#2f4160', 2: '#2e7a4f' }, ROBE = { 1: '#8e1d16', '-1': '#223150', 2: '#1e5a3a' }, CAPE = { 1: '#7a0f0b', '-1': '#101828', 2: '#0f3d26' };
  // Pieces are signed numbers in the ordinary game (Red > 0); the three-kingdom game draws them as
  // 20 + 10 * kingdom + type (Shu 2x in red, Wu 3x in green, Wei 4x in ink blue), each with its kingdom on the general.
  const SG_PAL = [1, 2, -1];
  const SG_HAN = [
    [null, '蜀', '仕', '相', '傌', '俥', '炮', '兵'],
    [null, '吳', '士', '象', '馬', '車', '炮', '卒'],
    [null, '魏', '士', '象', '馬', '車', '砲', '卒'],
  ];
  const palKey = p => (p >= 20 ? SG_PAL[((p / 10) | 0) - 2] : p > 0 ? 1 : -1);
  const typeOf = p => (p >= 20 ? p % 10 : Math.abs(p));
  const han = p => (p >= 20 ? SG_HAN[((p / 10) | 0) - 2][p % 10] : XQ.HAN[p]);
  const SKIN = '#e5b88c', WOOD = '#6b4423', IRON = '#9aa3ad';
  const DISC_R = 0.43, DISC_H = 0.23;

  // ---------- shared materials and geometries ----------
  // what shiny things reflect: metal, the rivers' water, the lacquered frames. scene.js makes it from the stage's light
  // (setEnvMap); everything else is lit by the lights alone, so the stages keep their look.
  let ENV = null;
  const shiny = new Set();
  function shine(m, k = 1) { m.envMapIntensity = k; shiny.add(m); if (ENV) m.envMap = ENV; return m; }
  function setEnvMap(t) { ENV = t; for (const m of shiny) { m.envMap = t; m.needsUpdate = true; } }
  const mats = new Map(), geos = new Map();
  function mat(color, o = {}) {
    const k = color + (o.metal || 0) + (o.rough || 0) + (o.emissive || '') + (o.smooth ? 's' : '');
    if (!mats.has(k)) {
      const m = new THREE.MeshStandardMaterial({ color, roughness: o.rough || 0.72, metalness: o.metal || 0, flatShading: !o.smooth, emissive: o.emissive || '#000000' });
      mats.set(k, o.metal ? shine(m) : m);
    }
    return mats.get(k);
  }
  function geo(k, make) { if (!geos.has(k)) geos.set(k, make()); return geos.get(k); }
  function mesh(g, m, parent, x = 0, y = 0, z = 0) {
    const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true;
    if (parent) parent.add(o);
    return o;
  }
  const box = (w, h, d, c, p, x, y, z, o) => mesh(geo(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d)), mat(c, o), p, x, y, z);
  const cyl = (rt, rb, h, c, p, x, y, z, seg = 8, o) => mesh(geo(`c${rt},${rb},${h},${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg)), mat(c, o), p, x, y, z);
  const ball = (r, c, p, x, y, z, o) => mesh(geo(`s${r}`, () => new THREE.SphereGeometry(r, 8, 6)), mat(c, o), p, x, y, z);
  const group = (p, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); if (p) p.add(g); return g; };
  // a group that moves by itself: what hangs from it is kept apart from the rest of its figure (fuse)
  const joint = (p, x, y, z) => { const g = group(p, x, y, z); g.userData.joint = true; return g; };
  // smooth-shaded parts for the figures' bodies (wood and weapons stay faceted): a shared geometry by key, and a
  // lathe turned from [radius, height] points, flattened front to back by flat
  const SMOOTH = { smooth: true }, TRIM = { metal: 0.6, rough: 0.35, smooth: true };
  const part = (g, c, p, x, y, z, o = SMOOTH) => mesh(g, mat(c, o), p, x, y, z);
  const lathe = (k, pts, flat = 1, seg = 14) => geo(k, () => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg).scale(1, 1, flat));
  const sball = (r, c, p, x, y, z, o = SMOOTH) => part(geo('S' + r, () => new THREE.SphereGeometry(r, 16, 12)), c, p, x, y, z, o);

  // ---------- textures ----------
  function canvas(w, h, draw) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 8;
    return t;
  }
  function rng(seed) { return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function woodGrain(g, w, h, base, lines, seedN) {
    const r = rng(seedN);
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < lines; i++) {
      const y = r() * h, a = 0.04 + r() * 0.08;
      g.strokeStyle = `rgba(60, 30, 10, ${a})`; g.lineWidth = 1 + r() * 3;
      g.beginPath(); g.moveTo(0, y);
      for (let x = 0; x <= w; x += 40) g.lineTo(x, y + Math.sin(x * 0.01 + i) * 6 + (r() - 0.5) * 3);
      g.stroke();
    }
  }

  // a normal map from a height field drawn in grey (white the surface, darker deeper): softened a little, then
  // its slopes, steeper by depth. Not a colour, so it stays linear.
  function reliefTexture(w, h, draw, depth) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); draw(g, w, h);
    const img = g.getImageData(0, 0, w, h), d = img.data;
    const H = new Float32Array(w * h), T = new Float32Array(w * h), s = depth / 255;
    for (let i = 0; i < w * h; i++) H[i] = d[i * 4] * s;  // heights already scaled by depth
    // the neighbours of each pixel, clamped at the edges
    const L = x => (x > 0 ? -1 : 0), R = x => (x < w - 1 ? 1 : 0), U = y => (y > 0 ? -w : 0), D = y => (y < h - 1 ? w : 0);
    for (let pass = 0; pass < 2; pass++) {                 // a 3 x 3 box blur, twice: a groove's walls slope
      for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i++) T[i] = (H[i + L(x)] + H[i] + H[i + R(x)]) / 3;
      for (let y = 0, i = 0; y < h; y++) { const u = U(y), v = D(y); for (let x = 0; x < w; x++, i++) H[i] = (T[i + u] + T[i] + T[i + v]) / 3; }
    }
    for (let y = 0, i = 0; y < h; y++) {
      const u = U(y), v = D(y);
      for (let x = 0; x < w; x++, i++) {
        // canvas rows run down, the texture's v up
        const nx = H[i + L(x)] - H[i + R(x)], ny = H[i + v] - H[i + u], k = 127.5 / Math.sqrt(nx * nx + ny * ny + 1);
        d[i * 4] = 127.5 + nx * k; d[i * 4 + 1] = 127.5 + ny * k; d[i * 4 + 2] = 127.5 + k;
      }
    }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c); t.anisotropy = 8;
    return t;
  }

  // board: 9 x 10 points one unit apart, one unit of margin, 100 px per unit. Drawn twice: in colour, and as the
  // carving for its normal map, where the lines, the marks and the river's words are cut into the wood.
  const RIVER_Z = [0.36, 0.44];            // the river's bed reaches this far from the middle, its banks rise to here
  const RIVER_D = 0.09, WATER_Y = -0.02;   // the bed this deep, the water's surface a little below the banks' top
  // the boards' looks (skins.js): the top's colour, its lines and the rivers' words, how it takes the light, the frame.
  // The carving is the same on every one.
  const BOARD_LOOK = {
    go: { base: '#d9b277', edge: 'rgba(70, 30, 5, 0.35)', halo: 'rgba(70, 32, 8, 0.2)', ink: '#3b1d0b', words: 'rgba(40, 18, 6, 0.9)', rough: 0.88, frame: '#4a2010', frameRough: 0.5 },
    'son-mai': { base: '#1d110c', edge: 'rgba(0, 0, 0, 0.45)', halo: 'rgba(230, 190, 90, 0.14)', ink: '#d9b04c', words: 'rgba(225, 185, 85, 0.9)', rough: 0.32, shine: 0.7, frame: '#3a0d0a', frameRough: 0.32 },
    ngoc: { base: '#1b5440', veins: 'rgba(190, 235, 210, 0.08)', edge: 'rgba(3, 25, 15, 0.45)', halo: 'rgba(255, 255, 255, 0.12)', ink: '#e8f5ec', words: 'rgba(232, 246, 236, 0.9)', rough: 0.3, shine: 0.5, frame: '#0f2a1f', frameRough: 0.3 },
    // old bronze, a little green where it has weathered
    dong: { base: '#4a3219', veins: 'rgba(80, 140, 110, 0.12)', edge: 'rgba(20, 10, 0, 0.45)', halo: 'rgba(20, 10, 0, 0.3)', ink: '#1c0f05', words: 'rgba(24, 12, 4, 0.9)', rough: 0.42, metal: 0.8, shine: 1, frame: '#2c1c0e', frameRough: 0.42, frameMetal: 0.6 },
  };
  const boardLook = id => BOARD_LOOK[id] || BOARD_LOOK.go;
  // soft light veins through a stone
  function veins(g, w, h, color, seedN) {
    const r = rng(seedN);
    g.strokeStyle = color; g.lineCap = 'round';
    for (let i = 0; i < 26; i++) {
      g.lineWidth = 2 + r() * 10;
      g.beginPath(); g.moveTo(r() * w, r() * h);
      g.bezierCurveTo(r() * w, r() * h, r() * w, r() * h, r() * w, r() * h); g.stroke();
    }
  }
  // the top and its frame, in colour (look) or as the carving for the normal map (relief)
  function drawBoard(g, w, h, relief, look = BOARD_LOOK.go) {
    woodGrain(g, w, h, relief ? '#ffffff' : look.base, 220, 7);
    const X = c => 100 + c * 100, Y = r => 100 + r * 100, ry = (Y(4) + Y(5)) / 2;
    if (!relief) {
      if (look.veins) veins(g, w, h, look.veins, 7);
      const vg = g.createRadialGradient(w / 2, h / 2, 200, w / 2, h / 2, 760);
      vg.addColorStop(0, 'rgba(255, 230, 180, 0.12)'); vg.addColorStop(1, look.edge);
      g.fillStyle = vg; g.fillRect(0, 0, w, h);
      // the river's bed: wet, dark wood under the water, darker in the shade of its banks
      const b1 = RIVER_Z[1] * 100, rv = g.createLinearGradient(0, ry - b1, 0, ry + b1);
      for (const [at, a] of [[0, 0], [0.06, 0.5], [0.2, 0.32], [0.8, 0.32], [0.94, 0.5], [1, 0]]) rv.addColorStop(at, `rgba(40, 30, 14, ${a})`);
      g.fillStyle = rv; g.fillRect(0, ry - b1, w, 2 * b1);
    }
    const grid = lw => {
      g.lineCap = 'round';
      g.lineWidth = lw + 4; g.strokeRect(X(0) - 22, Y(0) - 22, 844, 944);
      g.lineWidth = lw;
      for (let r = 0; r < 10; r++) { g.beginPath(); g.moveTo(X(0), Y(r)); g.lineTo(X(8), Y(r)); g.stroke(); }
      for (let c = 0; c < 9; c++) {
        g.beginPath();
        if (c === 0 || c === 8) { g.moveTo(X(c), Y(0)); g.lineTo(X(c), Y(9)); }
        else { g.moveTo(X(c), Y(0)); g.lineTo(X(c), Y(4)); g.moveTo(X(c), Y(5)); g.lineTo(X(c), Y(9)); }
        g.stroke();
      }
      for (const [r0, r1] of [[0, 2], [7, 9]]) {
        g.beginPath(); g.moveTo(X(3), Y(r0)); g.lineTo(X(5), Y(r1)); g.moveTo(X(5), Y(r0)); g.lineTo(X(3), Y(r1)); g.stroke();
      }
      // position marks for the cannons and soldiers
      const mark = (r, c) => {
        for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
          if ((c === 0 && sx < 0) || (c === 8 && sx > 0)) continue;
          const x = X(c) + sx * 9, y = Y(r) + sy * 9;
          g.beginPath(); g.moveTo(x + sx * 18, y); g.lineTo(x, y); g.lineTo(x, y + sy * 18); g.stroke();
        }
      };
      for (const c of [1, 7]) { mark(2, c); mark(7, c); }
      for (const c of [0, 2, 4, 6, 8]) { mark(3, c); mark(6, c); }
    };
    // a groove: its shaded walls, then the ink at the bottom
    if (relief) { g.strokeStyle = '#5a5a5a'; grid(9); }
    else { g.strokeStyle = look.halo; grid(10); g.strokeStyle = look.ink; grid(3); }
    // the river: 楚河 (Chu River) and 漢界 (Han Border), on its bed
    g.fillStyle = relief ? '#8a8a8a' : look.words; g.font = `bold 70px ${BRUSH}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.save(); g.translate(X(2), ry); g.fillText('楚  河', 0, 0); g.restore();
    g.save(); g.translate(X(6), ry); g.rotate(Math.PI); g.fillText('漢  界', 0, 0); g.restore();
  }
  // the frame round the board, on the same 100 px per unit: dark wood with a line cut along it,
  // a knot at each corner, at the middle of the ends and at either end of the river
  function drawFrame(g, w, h, relief, look = BOARD_LOOK.go) {
    const FRAME = look.frame;
    woodGrain(g, w, h, relief ? '#ffffff' : FRAME, 200, 5);
    const cut = relief ? '#6a6a6a' : 'rgba(25, 8, 2, 0.8)', m = 20;
    g.strokeStyle = cut; g.lineWidth = relief ? 6 : 2.5; g.strokeRect(m, m, w - 2 * m, h - 2 * m);
    const diamond = (x, y, r) => { g.beginPath(); g.moveTo(x, y - r); g.lineTo(x + r, y); g.lineTo(x, y + r); g.lineTo(x - r, y); g.closePath(); };
    for (const [x, y] of [[m, m], [w - m, m], [m, h - m], [w - m, h - m], [w / 2, m], [w / 2, h - m], [m, h / 2], [w - m, h / 2]]) {
      g.fillStyle = relief ? '#ffffff' : FRAME; diamond(x, y, 16); g.fill();
      g.strokeStyle = cut; diamond(x, y, 14); g.stroke();
      g.fillStyle = cut; diamond(x, y, 6); g.fill();
    }
  }
  function tableTexture() {
    return canvas(512, 512, (g, w, h) => { woodGrain(g, w, h, '#3a1e10', 160, 3); });
  }

  // the top of a piece: the character inside a ring, in the side's ink
  const faceCache = new Map();
  // the pieces' looks (skins.js): the body, the face, and each side's ink where the side's own would not show
  const PIECE_LOOK = {
    nga: { body: '#e7cf9f', rough: 0.55, face: ['#f6e6c4', '#e2c792'] },
    ngoc: { body: '#5d9c7f', rough: 0.22, shine: 0.9, face: ['#d4ebdc', '#9fcbb3'] },
    dong: { body: '#9a6a35', rough: 0.36, metal: 0.8, shine: 1, face: ['#cf9f60', '#9a6a35'], ink: { 1: '#6e120c', '-1': '#1b1209' } },
    mun: { body: '#2a1912', rough: 0.35, shine: 0.6, face: ['#3a2418', '#22140d'], ink: { 1: '#ff6a4a', '-1': '#efe4cc', 2: '#7be0a0' } },
    son: { body: '#9a1d12', rough: 0.28, shine: 0.85, face: ['#c8402a', '#8c1a0f'], ink: { 1: '#f6d27a', '-1': '#160b06', 2: '#bff0c8' } },   // vermilion lacquer
  };
  const pieceLook = id => PIECE_LOOK[id] || PIECE_LOOK.nga;
  const inkOf = (piece, look) => (look.ink && look.ink[palKey(piece)]) || PAL[palKey(piece)].ink;
  // the back of a piece (cờ úp, face down): the rings round a knot of four loops, no character
  function knot(g, w) {
    const m = w / 2;
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; g.beginPath(); g.ellipse(m + Math.cos(a) * 26, m + Math.sin(a) * 26, 30, 13, a, 0, Math.PI * 2); g.stroke(); }
    g.beginPath(); g.arc(m, m, 9, 0, Math.PI * 2); g.fill();
  }
  function faceTexture(piece, skin, hidden) {
    const key = piece + (PIECE_LOOK[skin] ? skin : 'nga') + (hidden ? 'h' : '');
    if (faceCache.has(key)) return faceCache.get(key);
    const look = pieceLook(skin), ink = inkOf(piece, look), ch = han(piece);
    const t = canvas(256, 256, (g, w) => {
      const gr = g.createRadialGradient(w / 2, w / 2, 20, w / 2, w / 2, w / 2);
      gr.addColorStop(0, look.face[0]); gr.addColorStop(1, look.face[1]);
      g.fillStyle = gr; g.fillRect(0, 0, w, w);
      g.strokeStyle = ink; g.lineWidth = 7; g.beginPath(); g.arc(w / 2, w / 2, w / 2 - 22, 0, Math.PI * 2); g.stroke();
      g.lineWidth = 2; g.beginPath(); g.arc(w / 2, w / 2, w / 2 - 34, 0, Math.PI * 2); g.stroke();
      g.fillStyle = ink;
      if (hidden) { g.lineWidth = 6; knot(g, w); }
      else { g.font = `bold 150px ${BRUSH}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ch, w / 2, w / 2 + 8); }
    });
    faceCache.set(key, t);
    return t;
  }
  // the same rings and character cut into the face, for its normal map
  const reliefCache = new Map();
  function faceRelief(piece, hidden) {
    const key = hidden ? 'h' : piece;
    if (reliefCache.has(key)) return reliefCache.get(key);
    const ch = han(piece);
    const t = reliefTexture(256, 256, (g, w) => {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, w);
      g.strokeStyle = '#555555'; g.lineWidth = 10; g.beginPath(); g.arc(w / 2, w / 2, w / 2 - 22, 0, Math.PI * 2); g.stroke();
      g.lineWidth = 4; g.beginPath(); g.arc(w / 2, w / 2, w / 2 - 34, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#606060';
      if (hidden) { g.strokeStyle = '#606060'; g.lineWidth = 9; knot(g, w); }
      else { g.font = `bold 150px ${BRUSH}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ch, w / 2, w / 2 + 8); }
    }, 2.5);
    reliefCache.set(key, t);
    return t;
  }
  // banner cloth for army view: the character in gold on the side's colour
  const bannerCache = new Map();
  function bannerTexture(piece, ch = han(piece)) {
    const key = piece + ch;
    if (bannerCache.has(key)) return bannerCache.get(key);
    const pal = PAL[palKey(piece)];
    const t = canvas(128, 176, (g, w, h) => {
      g.fillStyle = pal.banner; g.fillRect(0, 0, w, h);
      g.fillStyle = pal.trim; g.fillRect(0, 0, w, 10); g.fillRect(0, h - 22, w, 6);
      for (let x = 0; x < w; x += 16) { g.beginPath(); g.moveTo(x, h - 16); g.lineTo(x + 8, h); g.lineTo(x + 16, h - 16); g.fill(); }
      g.fillStyle = pal.trim; g.font = `bold 96px ${BRUSH}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(ch, w / 2, h / 2 - 4);
    });
    bannerCache.set(key, t);
    return t;
  }
  function clearTextureCache() {
    for (const cache of [faceCache, reliefCache, bannerCache]) { for (const t of cache.values()) t.dispose(); cache.clear(); }
  }

  // the river's ripples, as a normal map: a few waves whose periods divide the tile, so it repeats without a seam
  function rippleTexture() {
    const W = 256, H = 64, c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'), img = g.createImageData(W, H), d = img.data;
    const waves = [[2, 1, 0, 1], [3, -1, 1.3, 0.7], [5, 1, 2.1, 0.4], [7, -2, 0.7, 0.25]];   // across, along, phase, height
    for (let y = 0, i = 0; y < H; y++) for (let x = 0; x < W; x++, i += 4) {
      let nx = 0, ny = 0;
      for (const [fx, fy, p, a] of waves) { const k = a * Math.cos((fx * x) / W * 2 * Math.PI + (fy * y) / H * 2 * Math.PI + p) * 0.25; nx -= k * fx; ny += k * fy * 4; }
      const s = 127.5 / Math.hypot(nx, ny, 1);
      d[i] = 127.5 + nx * s; d[i + 1] = 127.5 + ny * s; d[i + 2] = 127.5 + s; d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 1); t.anisotropy = 8;
    return t;
  }

  // ---------- board and table ----------
  // a look's top and frame, from the colour drawn for it and the carving every look shares
  function lookMaterials(look, top, frame, carvedTop, carvedFrame) {
    const t = new THREE.MeshStandardMaterial({ map: top, normalMap: carvedTop, roughness: look.rough, metalness: look.metal || 0 });
    const f = new THREE.MeshStandardMaterial({ map: frame, normalMap: carvedFrame, roughness: look.frameRough, metalness: look.frameMetal || 0 });
    return { top: look.shine ? shine(t, look.shine) : t, frame: shine(f, 0.6) };
  }
  // the board's top and frame by look: their textures take a moment to draw, so once each, for every board after
  const boardMats = {}, boardCarving = {};
  function boardMaterials(id) {
    if (boardMats[id]) return boardMats[id];
    // the frame's uvs are its own x and y, laid onto the board's 10 x 11 units; its textures at half the board's
    // 100 px per unit, the frame being a thin band
    const look = BOARD_LOOK[id], half = draw => (c, w, h) => { c.scale(0.5, 0.5); draw(c, w * 2, h * 2); };
    const onBoard = t => { t.repeat.set(1 / 10, 1 / 11); t.offset.set(0.5, 0.5); return t; };
    if (!boardCarving.top) {
      boardCarving.top = reliefTexture(1000, 1100, (c, w, h) => drawBoard(c, w, h, true), 3);
      boardCarving.frame = onBoard(reliefTexture(500, 550, half((c, w, h) => drawFrame(c, w, h, true)), 1.5));
      boardCarving.water = waterMaterial(rippleTexture());
    }
    const top = canvas(1000, 1100, (c, w, h) => drawBoard(c, w, h, false, look)), frame = onBoard(canvas(500, 550, half((c, w, h) => drawFrame(c, w, h, false, look))));
    return (boardMats[id] = { ...lookMaterials(look, top, frame, boardCarving.top, boardCarving.frame), water: boardCarving.water });
  }
  // clear green water: the bed and the river's words show through it, the lights glint on its ripples
  // The pieces near a river show in its water: scene.js renders them seen from under the surface into REFLECT.map,
  // REFLECT.matrix carrying a point of the world to where it lands on that picture; the ripples shake it a little.
  const REFLECT = { map: { value: null }, matrix: { value: new THREE.Matrix4() }, strength: { value: 0 } };
  function waterMaterial(ripples) {
    const m = new THREE.MeshStandardMaterial({
      color: '#1d5c68', transparent: true, opacity: 0.62, roughness: 0.1, normalMap: ripples, normalScale: new THREE.Vector2(0.45, 0.45), depthWrite: false,
    });
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, { reflMap: REFLECT.map, reflMatrix: REFLECT.matrix, reflStrength: REFLECT.strength });
      sh.vertexShader = 'uniform mat4 reflMatrix;\nvarying vec4 vRefl;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n  vRefl = reflMatrix * modelMatrix * vec4(transformed, 1.0);');
      sh.fragmentShader = 'uniform sampler2D reflMap;\nuniform float reflStrength;\nvarying vec4 vRefl;\n' + sh.fragmentShader.replace('#include <tonemapping_fragment>',
        '{ vec4 r = texture2D(reflMap, vRefl.xy / vRefl.w + normal.xy * 0.03); float k = r.a * reflStrength;\n' +
        '  gl_FragColor.rgb = mix(gl_FragColor.rgb, r.rgb * 0.8, k); gl_FragColor.a = mix(gl_FragColor.a, 1.0, k * 0.6); }\n#include <tonemapping_fragment>');
    };
    m.customProgramCacheKey = () => 'water-reflect';
    return shine(m);
  }
  // the water's surface, a little below the banks' top, meets them this far from the river's middle
  const WATER_W = RIVER_Z[1] - (RIVER_Z[1] - RIVER_Z[0]) * (-WATER_Y / RIVER_D);
  // a water surface: its ripples drift downstream
  function waterMesh(g, m) {
    const water = new THREE.Mesh(g, m), ripples = m.normalMap;
    water.position.y = WATER_Y; water.receiveShadow = true;
    water.onBeforeRender = () => { const s = performance.now() / 1000; ripples.offset.set(s * 0.05, s * 0.02); };
    return water;
  }
  // skin: the board's look (skins.js), the plain wood if unknown
  function board(skin) {
    const g = new THREE.Group(), M = boardMaterials(BOARD_LOOK[skin] ? skin : 'go');
    // the top: flat at y = 0 but for the river, a shallow channel running under the frame at both ends. Each face
    // keeps its own normal (no rounding across the banks); the carving is in the normal map.
    const xs = [-5, -4.7, -4.62, 4.62, 4.7, 5], zs = [-5.5, -RIVER_Z[1], -RIVER_Z[0], RIVER_Z[0], RIVER_Z[1], 5.5], low = [0, 0, 1, 1, 0, 0];
    const pos = [], uv = [];
    const vert = (i, j) => { pos.push(xs[i], -RIVER_D * low[i] * low[j], zs[j]); uv.push((xs[i] + 5) / 10, 1 - (zs[j] + 5.5) / 11); };
    for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) { vert(i, j); vert(i, j + 1); vert(i + 1, j); vert(i, j + 1); vert(i + 1, j + 1); vert(i + 1, j); }
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); tg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    tg.computeVertexNormals();
    const top = new THREE.Mesh(tg, M.top);
    top.receiveShadow = true; g.add(top);
    // the water, from frame to frame and from bank to bank
    g.add(waterMesh(new THREE.PlaneGeometry(9.3, 2 * WATER_W).rotateX(-Math.PI / 2), M.water));
    const side = new THREE.MeshStandardMaterial({ map: tableTexture(), color: '#8a5a32', roughness: 0.6 });
    // the slab under it all, its top below the river's bed
    const slab = new THREE.Mesh(new THREE.BoxGeometry(10, 0.26, 11), side);
    slab.position.y = -0.23; slab.receiveShadow = true; slab.castShadow = true; g.add(slab);
    // the raised frame, bevelled, from the slab's top to 0.07 above the board's; its inner edge 0.4 in from the slab's
    const B = 0.03, rect = (p, x, z) => { p.moveTo(-x, -z); p.lineTo(x, -z); p.lineTo(x, z); p.lineTo(-x, z); p.closePath(); return p; };
    const shape = rect(new THREE.Shape(), 5 - B, 5.5 - B); shape.holes.push(rect(new THREE.Path(), 4.6 + B, 5.1 + B));
    const fg = new THREE.ExtrudeGeometry(shape, { depth: 0.17 - 2 * B, bevelEnabled: true, bevelThickness: B, bevelSize: B, bevelSegments: 3 });
    fg.rotateX(-Math.PI / 2);
    const frame = new THREE.Mesh(fg, M.frame);
    frame.position.y = -0.1 + B; frame.castShadow = true; frame.receiveShadow = true; g.add(frame);
    // a darker lacquered rim and four feet
    const rim = new THREE.Mesh(new THREE.BoxGeometry(10.5, 0.2, 11.5), new THREE.MeshStandardMaterial({ color: '#2a120a', roughness: 0.35, metalness: 0.1 }));
    rim.position.y = -0.42; rim.receiveShadow = true; g.add(rim);
    for (const [x, z] of [[-4.7, -5.2], [4.7, -5.2], [-4.7, 5.2], [4.7, 5.2]]) mesh(geo('foot', () => new THREE.CylinderGeometry(0.3, 0.38, 0.4, 10)), mat('#2a120a'), g, x, -0.7, z);
    return g;
  }
  // the three-kingdom board (sanguo.js): a hexagon of three half-boards, a river between each two kingdoms running from
  // the centre to the middle of their shared edge. The textures cover the square around it, SPAN units from the centre
  // each way; world x, z map straight onto the canvas. The wood reaches SG_RO from the centre (to the middle of an
  // edge), a little wider than SG.BOARD_R so that the frame, from SG_RI, clears the pieces on the back rows.
  const SPAN = 9.2, SG_RO = SG.BOARD_R + 0.25, SG_RI = SG.H + 0.48, S60 = Math.sin(Math.PI / 3);
  const dirOf = a => [Math.sin(a), Math.cos(a)];
  const hexPts = R => Array.from({ length: 6 }, (_, i) => dirOf(Math.PI / 6 + (i * Math.PI) / 3).map(v => (v * R) / S60));   // corners, apothem R
  const RIVERS = [0, 1, 2].map(k => SG.YAW(k) + Math.PI / 3);      // the river between kingdom k and the next, outwards
  // the rivers' outline w from their middles: three arms from the centre out to out from it, joined round the centre
  function riverStar(w, out) {
    const pts = [];
    for (const a of RIVERS) {
      const [cx, cz] = dirOf(a - Math.PI / 3), [dx, dz] = dirOf(a), [lx, lz] = dirOf(a - Math.PI / 2), r = w / S60;
      pts.push([cx * r, cz * r], [dx * out + lx * w, dz * out + lz * w], [dx * out - lx * w, dz * out - lz * w]);
    }
    return pts;
  }
  // what is left of a convex polygon on the side of a line where x * n[0] + z * n[1] >= c
  function clip(poly, [nx, nz], c) {
    const out = [], f = ([x, z]) => x * nx + z * nz - c;
    poly.forEach((p, i) => {
      const q = poly[(i + 1) % poly.length], fp = f(p), fq = f(q);
      if (fp >= 0) out.push(p);
      if ((fp >= 0) !== (fq >= 0)) { const t = fp / (fp - fq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
    });
    return out;
  }
  // drawn twice like the ordinary board: in colour, and as the carving for its normal map
  function drawSanguo(g, PX, relief, look = BOARD_LOOK.go) {
    const sc = PX / (2 * SPAN), X = x => (x + SPAN) * sc, Z = z => (z + SPAN) * sc;
    const trace = pts => { pts.forEach(([x, z], i) => (i ? g.lineTo(X(x), Z(z)) : g.moveTo(X(x), Z(z)))); g.closePath(); };
    woodGrain(g, PX, PX, relief ? '#ffffff' : look.base, 380, 11);
    if (!relief) {
      if (look.veins) veins(g, PX, PX, look.veins, 11);
      const vg = g.createRadialGradient(PX / 2, PX / 2, 300, PX / 2, PX / 2, PX * 0.62);
      vg.addColorStop(0, 'rgba(255, 230, 180, 0.12)'); vg.addColorStop(1, look.edge);
      g.fillStyle = vg; g.fillRect(0, 0, PX, PX);
      // the rivers' beds: wet, dark wood under the water, darker on the banks
      g.fillStyle = 'rgba(40, 30, 14, 0.32)'; g.beginPath(); trace(riverStar(RIVER_Z[0], SG_RO)); g.fill();
      g.fillStyle = 'rgba(40, 30, 14, 0.45)'; g.beginPath(); trace(riverStar(RIVER_Z[1], SG_RO)); trace(riverStar(RIVER_Z[0], SG_RO)); g.fill('evenodd');
    }
    const line = pts => { g.beginPath(); pts.forEach(([x, z], i) => (i ? g.lineTo(X(x), Z(z)) : g.moveTo(X(x), Z(z)))); g.stroke(); };
    const grid = lw => {
      g.lineCap = 'round'; g.lineJoin = 'round';
      g.lineWidth = lw + 4.6; line(hexPts(SG.H + 0.22).concat([hexPts(SG.H + 0.22)[0]]));   // a hexagon a little outside the outer points
      g.lineWidth = lw;
      for (let k = 0; k < 3; k++) {
        for (let r = 0; r <= 4; r++) line([SG.at(k, 0, r), SG.at(k, 4, r), SG.at(k, 8, r)]);
        for (let c = 0; c <= 8; c++) line([SG.at(k, c, 0), SG.at(k, c, 4)]);
        line([SG.at(k, 3, 0), SG.at(k, 4, 1), SG.at(k, 5, 2)]); line([SG.at(k, 5, 0), SG.at(k, 4, 1), SG.at(k, 3, 2)]);
        // the outer files and the centre run on across the rivers
        line([SG.at(k, 8, 4), SG.at(SG.rightOf(k), 0, 4)]);
        line([SG.at(k, 4, 4), SG.at(SG.rightOf(k), 4, 4)]);
      }
    };
    // a groove: its shaded walls, then the ink at the bottom
    if (relief) { g.strokeStyle = '#5a5a5a'; grid(10); }
    else { g.strokeStyle = look.halo; grid(11); g.strokeStyle = look.ink; grid(3.4); }
    // the three rivers, each named for the water between those two kingdoms, on its bed
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const RIVER = ['長  江', '淮  水', '漢  水'];
    RIVERS.forEach((a, k) => {
      const [dx, dz] = dirOf(a), d = 4.1, turn = Math.atan2(dz, dx);
      g.save(); g.translate(X(dx * d), Z(dz * d)); g.rotate(Math.cos(turn) < 0 ? turn + Math.PI : turn);   // never upside down
      g.fillStyle = relief ? '#8a8a8a' : look.words; g.font = `bold 72px ${BRUSH}`; g.fillText(RIVER[k], 0, 0); g.restore();
    });
  }
  // the hexagonal frame, on the same canvas: a line cut along it, a knot at each corner and at each river's mouth, and
  // each kingdom's seal inlaid at the middle of its own edge
  function drawHexFrame(g, PX, relief, look = BOARD_LOOK.go) {
    const sc = PX / (2 * SPAN), X = x => (x + SPAN) * sc, Z = z => (z + SPAN) * sc, mid = (SG_RI + SG_RO) / 2, FRAME = look.frame;
    woodGrain(g, PX, PX, relief ? '#ffffff' : FRAME, 300, 5);
    const cut = relief ? '#6a6a6a' : 'rgba(25, 8, 2, 0.8)';
    g.strokeStyle = cut; g.lineWidth = relief ? 6 : 2.5; g.lineJoin = 'round';
    g.beginPath(); hexPts(mid).forEach(([x, z], i) => (i ? g.lineTo(X(x), Z(z)) : g.moveTo(X(x), Z(z)))); g.closePath(); g.stroke();
    const diamond = (x, y, r) => { g.beginPath(); g.moveTo(x, y - r); g.lineTo(x + r, y); g.lineTo(x, y + r); g.lineTo(x - r, y); g.closePath(); };
    for (const [x, z] of hexPts(mid).concat(RIVERS.map(a => dirOf(a).map(v => v * mid)))) {
      g.fillStyle = relief ? '#ffffff' : FRAME; diamond(X(x), Z(z), 18); g.fill();
      g.strokeStyle = cut; diamond(X(x), Z(z), 16); g.stroke();
      g.fillStyle = cut; diamond(X(x), Z(z), 7); g.fill();
    }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let k = 0; k < 3; k++) {
      const y = SG.YAW(k), [x, z] = dirOf(y).map(v => v * mid), r = 0.2 * sc;
      g.save(); g.translate(X(x), Z(z)); g.rotate(-y);
      g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2);
      if (relief) { g.strokeStyle = cut; g.lineWidth = 6; g.stroke(); }
      else { g.fillStyle = '#ead6a6'; g.fill(); g.strokeStyle = PAL[SG_PAL[k]].trim; g.lineWidth = 3; g.stroke(); g.fillStyle = PAL[SG_PAL[k]].ink; g.font = `bold ${Math.round(0.28 * sc)}px ${BRUSH}`; g.fillText(SG_HAN[k][1], 0, 2); }
      g.restore();
    }
  }
  const sanguoMats = {}, sanguoCarving = {};
  function sanguoMaterials(id) {
    if (sanguoMats[id]) return sanguoMats[id];
    // the carving and the frame at half the colour's resolution; drawn at full size into a canvas scaled down
    const look = BOARD_LOOK[id], half = draw => c => { c.scale(0.5, 0.5); draw(c, 2048); };
    const onBoard = t => { t.repeat.set(1 / (2 * SPAN), 1 / (2 * SPAN)); t.offset.set(0.5, 0.5); return t; };
    if (!sanguoCarving.top) {
      sanguoCarving.top = reliefTexture(1024, 1024, half((c, PX) => drawSanguo(c, PX, true)), 1.8);
      sanguoCarving.frame = onBoard(reliefTexture(1024, 1024, half((c, PX) => drawHexFrame(c, PX, true)), 1.5));
      const ripples = rippleTexture(); ripples.repeat.set(0.35, 1.4);    // its uvs are world units: tiles as on the other board
      sanguoCarving.water = waterMaterial(ripples);
    }
    const top = canvas(2048, 2048, (c, w) => drawSanguo(c, w, false, look)), frame = onBoard(canvas(1024, 1024, half((c, PX) => drawHexFrame(c, PX, false, look))));
    return (sanguoMats[id] = { ...lookMaterials(look, top, frame, sanguoCarving.top, sanguoCarving.frame), water: sanguoCarving.water });
  }
  function sanguoBoard(skin) {
    const g = new THREE.Group(), M = sanguoMaterials(BOARD_LOOK[skin] ? skin : 'go'), [W0, W1] = RIVER_Z, D = RIVER_D;
    // the top: three pieces of wood at y = 0 between the rivers, banks sloping down to the bed, and the bed itself, a
    // hexagon RIVER_D below. Every triangle is turned to face up and keeps its own normal; the carving is in the normal map.
    const pos = [], uv = [];
    const tri = (a, b, c) => {
      if ((b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]) < 0) [b, c] = [c, b];
      for (const [x, y, z] of [a, b, c]) { pos.push(x, y, z); uv.push((x + SPAN) / (2 * SPAN), 1 - (z + SPAN) / (2 * SPAN)); }
    };
    const at = ([x, z], y) => [x, y, z], add = ([x, z], [u, v], s) => [x + u * s, z + v * s];
    for (let k = 0; k < 3; k++) {                        // kingdom k's land: inside the hexagon, clear of both its rivers' banks
      const land = clip(clip(hexPts(SG_RO), dirOf(RIVERS[k] - Math.PI / 2), W1), dirOf(RIVERS[(k + 2) % 3] + Math.PI / 2), W1);
      for (let i = 1; i < land.length - 1; i++) tri(at(land[0], 0), at(land[i], 0), at(land[i + 1], 0));
    }
    for (const a of RIVERS) for (const s of [-1, 1]) {   // each river's two banks, from the centre out to the edge
      const lat = dirOf(a + (s * Math.PI) / 2), bis = dirOf(a + (s * Math.PI) / 3), mouth = dirOf(a).map(v => v * SG_RO);
      const c1 = at(bis.map(v => (v * W1) / S60), 0), c0 = at(bis.map(v => (v * W0) / S60), -D);
      const o1 = at(add(mouth, lat, W1), 0), o0 = at(add(mouth, lat, W0), -D);
      tri(c1, o1, o0); tri(c1, o0, c0);
    }
    const bed = hexPts(SG_RO);
    bed.forEach((p, i) => tri([0, -D, 0], at(p, -D), at(bed[(i + 1) % 6], -D)));
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); tg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    tg.computeVertexNormals();
    const top = new THREE.Mesh(tg, M.top);
    top.receiveShadow = true; g.add(top);
    // the water, a three-armed star from bank to bank, running under the frame at each river's mouth
    const star = new THREE.Shape(riverStar(WATER_W, SG_RO).map(([x, z]) => new THREE.Vector2(x, -z)));
    g.add(waterMesh(new THREE.ShapeGeometry(star).rotateX(-Math.PI / 2), M.water));
    const rc = SG_RO / S60, side = new THREE.MeshStandardMaterial({ map: tableTexture(), color: '#8a5a32', roughness: 0.6 });
    // the slab under it all, its top below the rivers' bed
    const slab = new THREE.Mesh(new THREE.CylinderGeometry(rc, rc, 0.26, 6), side);
    slab.rotation.y = Math.PI / 6; slab.position.y = -0.23; slab.receiveShadow = true; slab.castShadow = true; g.add(slab);
    // the raised frame, bevelled, from the slab's top to 0.07 above the board's
    const B = 0.03, hex = (p, R) => { hexPts(R).forEach(([x, z], i) => (i ? p.lineTo(x, -z) : p.moveTo(x, -z))); p.closePath(); return p; };
    const shape = hex(new THREE.Shape(), SG_RO - B); shape.holes.push(hex(new THREE.Path(), SG_RI + B));
    const fg = new THREE.ExtrudeGeometry(shape, { depth: 0.17 - 2 * B, bevelEnabled: true, bevelThickness: B, bevelSize: B, bevelSegments: 3 });
    fg.rotateX(-Math.PI / 2);
    const frame = new THREE.Mesh(fg, M.frame);
    frame.position.y = -0.1 + B; frame.castShadow = true; frame.receiveShadow = true; g.add(frame);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(rc + 0.3, rc + 0.3, 0.2, 6), new THREE.MeshStandardMaterial({ color: '#2a120a', roughness: 0.35, metalness: 0.1 }));
    rim.rotation.y = Math.PI / 6; rim.position.y = -0.42; rim.receiveShadow = true; g.add(rim);
    for (const [x, z] of hexPts(SG_RO)) mesh(geo('foot', () => new THREE.CylinderGeometry(0.3, 0.38, 0.4, 10)), mat('#2a120a'), g, x * 0.93, -0.7, z * 0.93);
    return g;
  }
  // how deep in a river a point of the table is: 1 over the bed, 0 on dry land, in between on a bank
  const ramp = d => Math.max(0, Math.min(1, (RIVER_Z[1] - d) / (RIVER_Z[1] - RIVER_Z[0])));
  const wet = {
    classic: (x, z) => (Math.abs(x) < 4.6 ? ramp(Math.abs(z)) : 0),
    sanguo: (x, z) => Math.max(...RIVERS.map(a => { const [dx, dz] = dirOf(a); return x * dx + z * dz > -0.3 ? ramp(Math.abs(x * dz - z * dx)) : 0; })),
  };
  // how far a point is from the middle of the nearest river
  const riverDist = {
    classic: (x, z) => Math.abs(z),
    sanguo: (x, z) => Math.min(...RIVERS.map(a => { const [dx, dz] = dirOf(a); return x * dx + z * dz > -0.3 ? Math.abs(x * dz - z * dx) : Infinity; })),
  };
  function table() {
    const t = tableTexture(); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 6);
    const m = new THREE.Mesh(new THREE.CircleGeometry(26, 64), new THREE.MeshStandardMaterial({ map: t, color: '#7a4a2a', roughness: 0.5 }));
    m.rotation.x = -Math.PI / 2; m.position.y = -0.9; m.receiveShadow = true;
    return m;
  }
  // a hanging paper lantern
  function lantern() {
    const g = new THREE.Group();
    const body = mesh(geo('lant', () => new THREE.SphereGeometry(0.6, 12, 8)), new THREE.MeshStandardMaterial({ color: '#ff5a2a', emissive: '#ff3a10', emissiveIntensity: 1.6, roughness: 0.9 }), g);
    body.scale.set(1, 1.25, 1); body.castShadow = false;
    for (const y of [0.72, -0.72]) cyl(0.3, 0.3, 0.12, '#2a120a', g, 0, y, 0, 12);
    cyl(0.015, 0.015, 8, '#1a0c06', g, 0, 4.8, 0, 4);
    for (let i = 0; i < 5; i++) cyl(0.012, 0.012, 0.5, '#ffcf4a', g, (i - 2) * 0.05, -1.05, 0, 3);
    return g;
  }

  // ---------- pieces ----------
  // a turned piece: rounded top and bottom edges, the side swelling a little, a raised lip round a sunken face
  const LIP = 0.07, SINK = 0.012;
  const discGeo = () => geo('disc', () => {
    const R = DISC_R, H = DISC_H;
    const pts = [[0, 0], [R - 0.05, 0], [R - 0.022, 0.006], [R - 0.006, 0.024], [R, 0.05], [R + 0.004, H / 2], [R, H - 0.05], [R - 0.006, H - 0.024],
      [R - 0.022, H - 0.006], [R - 0.05, H], [R - 0.062, H], [R - LIP, H - SINK], [0, H - SINK]];
    return new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), 48);
  });
  // skin: the pieces' look (skins.js), ivory if unknown
  const discBodies = {};                    // one material for the bodies of a look (shiny ones are kept by shine)
  function discBody(id) {
    if (!discBodies[id]) {
      const look = PIECE_LOOK[id], m = new THREE.MeshStandardMaterial({ color: look.body, roughness: look.rough, metalness: look.metal || 0 });
      discBodies[id] = look.shine ? shine(m, look.shine) : m;
    }
    return discBodies[id];
  }
  function disc(piece, small, skin, hidden) {
    const g = new THREE.Group(), look = pieceLook(skin);
    const body = mesh(discGeo(), discBody(PIECE_LOOK[skin] ? skin : 'nga'), g);
    // a thin coloured band around the side tells the sides apart from any angle
    mesh(geo('band', () => new THREE.CylinderGeometry(DISC_R + 0.008, DISC_R + 0.008, 0.05, 48, 1, true)), mat(inkOf(piece, look)), g, 0, DISC_H / 2, 0);
    // the face, with its rings and character cut into it
    const face = new THREE.Mesh(geo('face', () => new THREE.CircleGeometry(DISC_R - LIP, 48)),
      new THREE.MeshStandardMaterial({ map: faceTexture(piece, skin, hidden), normalMap: faceRelief(piece, hidden), roughness: Math.min(0.7, look.rough + 0.15), metalness: (look.metal || 0) * 0.6 }));
    face.rotation.x = -Math.PI / 2; face.position.y = DISC_H - SINK + 0.001; face.receiveShadow = true; g.add(face);
    g.userData = { body, face };
    if (small) g.scale.setScalar(0.62);
    return g;
  }

  // ---------- warriors ----------
  // People are built to a real body's measure: about six and a half heads tall, legs half the height, arms that hang
  // to mid thigh, each limb in two parts with a knee or an elbow between. One unit of height is about 2.8 m.
  const V2 = pts => pts.map(([r, y]) => new THREE.Vector2(r, y));
  // how often a part's texture repeats, written into its uvs (the texture itself repeats once)
  function tiled(g, ru, rv) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * ru, uv.getY(i) * rv); return g; }
  // cloth seen from both sides (capes, cloaks), by colour
  const cloths = new Map();
  function cloth2(color) {
    if (!cloths.has(color)) cloths.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.85, side: THREE.DoubleSide }));
    return cloths.get(color);
  }
  // lamellar armour: rows of small plates laced together, each row lying over the one below. A grey tile that the
  // armour's colour tints, and the same tile as relief
  let LAM = null;
  function lamellar() {
    if (LAM) return LAM;
    const draw = (g, w, h) => {
      g.fillStyle = '#2e2e2e'; g.fillRect(0, 0, w, h);
      const pw = w / 4, ph = h / 4;
      for (let r = 4; r >= 0; r--) for (let c = -1; c <= 4; c++) {
        const x = c * pw + (r % 2 ? pw / 2 : 0) + 1.5, y = r * ph - ph * 0.25, a = pw - 3, b = ph * 1.2, k = a * 0.3;
        const gr = g.createLinearGradient(0, y, 0, y + b); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.75, '#d2d2d2'); gr.addColorStop(1, '#8a8a8a');
        g.fillStyle = gr;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + a, y); g.lineTo(x + a, y + b - k); g.quadraticCurveTo(x + a, y + b, x + a - k, y + b);
        g.lineTo(x + k, y + b); g.quadraticCurveTo(x, y + b, x, y + b - k); g.closePath(); g.fill();
        g.fillStyle = '#4a4a4a'; g.fillRect(x + a * 0.5 - 4, y + ph * 0.36, 8, 2.5);   // the lacing
      }
    };
    const map = canvas(128, 128, draw), normal = reliefTexture(128, 128, draw, 2.2);
    map.encoding = THREE.LinearEncoding;                    // a tint over the material's colour, not a colour itself
    for (const t of [map, normal]) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return (LAM = { map, normal });
  }
  const lams = new Map();
  function lam(color) {
    if (!lams.has(color)) { const L = lamellar(); lams.set(color, shine(new THREE.MeshStandardMaterial({ color, map: L.map, normalMap: L.normal, roughness: 0.5, metalness: 0.3 }), 0.5)); }
    return lams.get(color);
  }

  // the head, in a frame of its own (the head joint): chin at y = 0, crown at 0.128, the face towards +z. Headgear is
  // made to this frame; the joint is then scaled down to a real head's share of the body.
  const HEAD_SCALE = [0.68, 0.73, 0.72];
  const HEAD_PTS = [[0, 0.004], [0.017, 0.006], [0.029, 0.015], [0.037, 0.03], [0.043, 0.048], [0.048, 0.068], [0.051, 0.088], [0.049, 0.104], [0.041, 0.117], [0.025, 0.125], [0, 0.128]];
  const HEAD_Y0 = 0.004, HEAD_H = 0.124;
  // a skull turned on the lathe, then shaped: deeper than wide, the chin forward, the nape tucked in. Its seam is at
  // the back; u runs round it (0.5 the middle of the face), v from the chin to the crown.
  const skullGeo = () => geo('skull', () => {
    const g = new THREE.LatheGeometry(V2(HEAD_PTS), 28).rotateY(Math.PI), p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), z = p.getZ(i) * 1.1;
      const y = p.getY(i), low = Math.max(0, 1 - y / 0.05), high = Math.max(0, Math.min(1, (y - 0.05) / 0.03));
      if (z > 0) { z += 0.006 * low * (1 - 0.5 * low); x *= 1 - 0.1 * low; }
      else z *= (1 - 0.4 * low) * (1 + 0.06 * high);
      p.setXYZ(i, x, y, z); uv.setY(i, (y - HEAD_Y0) / HEAD_H);
    }
    return g;
  });
  // the face and hair painted round the skull: skin shaded under the jaw and warm on the cheeks, eyes with their
  // whites, lids and brows, the nose's shadow, lips; hair over the crown, down the temples and behind the ears
  const headCache = new Map();
  function headMaterial(skin, hair, lady) {
    const key = skin + hair + (lady ? 'f' : '');
    if (headCache.has(key)) return headCache.get(key);
    const t = canvas(512, 256, (g, w, h) => {
      const PX = a => w / 2 + (a * w) / (2 * Math.PI), PY = y => (1 - (y - HEAD_Y0) / HEAD_H) * h;   // by angle from the front, by height
      g.fillStyle = skin; g.fillRect(0, 0, w, h);
      let gr = g.createLinearGradient(0, PY(0.045), 0, PY(0.004)); gr.addColorStop(0, 'rgba(90, 40, 20, 0)'); gr.addColorStop(1, 'rgba(90, 40, 20, 0.4)');
      g.fillStyle = gr; g.fillRect(0, PY(0.045), w, h);
      const soft = (x, y, r, c0, c1) => { const q = g.createRadialGradient(x, y, 0, x, y, r); q.addColorStop(0, c0); q.addColorStop(1, c1); g.fillStyle = q; g.fillRect(x - r, y - r, 2 * r, 2 * r); };
      for (const s of [-1, 1]) {
        soft(PX(s * 0.78), PY(0.046), 30, `rgba(205, 80, 60, ${lady ? 0.3 : 0.2})`, 'rgba(205, 80, 60, 0)');   // cheeks
        soft(PX(s * 0.46), PY(0.071), 22, 'rgba(70, 30, 15, 0.2)', 'rgba(70, 30, 15, 0)');                       // eye sockets
        soft(PX(s * 1.25), PY(0.05), 34, 'rgba(70, 30, 15, 0.22)', 'rgba(70, 30, 15, 0)');                      // the jaw's side
      }
      // hair
      g.fillStyle = hair; g.beginPath(); g.moveTo(0, 0); g.lineTo(w, 0); g.lineTo(w, PY(0.03));
      const line = [[2.1, 0.03], [1.8, 0.05], [1.62, 0.086], [1.36, 0.06], [1.16, 0.09], [0.75, 0.101], [0, 0.105]];
      for (const [a, y] of line) g.lineTo(PX(a), PY(y));
      for (const [a, y] of line.slice(0, -1).reverse()) g.lineTo(PX(-a), PY(y));
      g.lineTo(0, PY(0.03)); g.closePath(); g.fill();
      // the nose's sides and nostrils
      g.lineCap = 'round';
      for (const s of [-1, 1]) {
        g.strokeStyle = 'rgba(80, 35, 18, 0.28)'; g.lineWidth = 3;
        g.beginPath(); g.moveTo(PX(s * 0.15), PY(0.072)); g.quadraticCurveTo(PX(s * 0.12), PY(0.058), PX(s * 0.2), PY(0.047)); g.stroke();
        g.fillStyle = 'rgba(50, 18, 10, 0.6)'; g.beginPath(); g.ellipse(PX(s * 0.09), PY(0.0452), 3.4, 1.8, 0, 0, 7); g.fill();
      }
      // eyes
      for (const s of [-1, 1]) {
        const ex = PX(s * 0.43), ey = PY(0.068), rx = 15.5, ry = lady ? 7.5 : 6.5;
        g.save(); g.beginPath(); g.ellipse(ex, ey, rx, ry, -s * 0.08, 0, 7); g.clip();
        g.fillStyle = '#f1e8de'; g.fillRect(ex - 17, ey - 9, 34, 18);
        g.fillStyle = '#3a1f0e'; g.beginPath(); g.arc(ex, ey - 0.5, 6.4, 0, 7); g.fill();
        g.fillStyle = '#080404'; g.beginPath(); g.arc(ex, ey - 0.5, 3, 0, 7); g.fill();
        g.fillStyle = 'rgba(255, 255, 255, 0.9)'; g.beginPath(); g.arc(ex - 2.2, ey - 2.8, 1.5, 0, 7); g.fill();
        g.fillStyle = 'rgba(40, 15, 8, 0.35)'; g.fillRect(ex - 17, ey - 9, 34, 5);     // the lid's shadow
        g.restore();
        g.strokeStyle = '#1a0d08'; g.lineWidth = lady ? 3.2 : 2.6;                         // the upper lid
        g.beginPath(); g.moveTo(ex - s * 16.5, ey + 2); g.quadraticCurveTo(ex - s * 2, ey - ry - 4.5, ex + s * 18, ey - 0.5); g.stroke();
        g.strokeStyle = 'rgba(90, 40, 25, 0.55)'; g.lineWidth = 1.2;
        g.beginPath(); g.moveTo(ex - s * 15, ey + 2.5); g.quadraticCurveTo(ex, ey + ry + 2.5, ex + s * 15.5, ey + 1); g.stroke();
        g.strokeStyle = hair === '#e8e4dc' || hair === '#8e8e94' ? hair : '#1c100a'; g.lineWidth = lady ? 3 : 6;   // brows, drawn together
        g.beginPath(); g.moveTo(PX(s * 0.16), PY(0.0785)); g.quadraticCurveTo(PX(s * 0.45), PY(0.087), PX(s * 0.8), PY(0.082)); g.stroke();
      }
      // lips
      g.strokeStyle = lady ? '#8e1f22' : '#6e2a22'; g.lineWidth = lady ? 3 : 2.4;
      g.beginPath(); g.moveTo(PX(-0.27), PY(0.0348)); g.quadraticCurveTo(PX(0), PY(0.0322), PX(0.27), PY(0.0348)); g.stroke();
      g.fillStyle = lady ? 'rgba(190, 40, 45, 0.75)' : 'rgba(165, 70, 58, 0.4)';
      g.beginPath(); g.ellipse(PX(0), PY(0.0298), 15, lady ? 5 : 4, 0, 0, 7); g.fill();
      if (lady) { g.beginPath(); g.ellipse(PX(0), PY(0.0366), 14, 3.2, 0, 0, 7); g.fill(); }
    });
    t.encoding = THREE.LinearEncoding;          // read like the materials' own colours, so the face matches the neck and hands
    const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.62 });
    headCache.set(key, m);
    return m;
  }

  // the parts of a body, turned on the lathe from [radius, height] points: each below its joint, the joint at 0
  const BODY = {
    thigh: [[0, -0.155], [0.024, -0.15], [0.027, -0.12], [0.035, -0.06], [0.038, -0.01], [0.03, 0.014], [0, 0.018]],
    shin: [[0, -0.15], [0.018, -0.146], [0.019, -0.11], [0.027, -0.055], [0.026, -0.015], [0.023, 0.008], [0, 0.012]],
    upperArm: [[0, -0.118], [0.0185, -0.114], [0.02, -0.09], [0.0245, -0.05], [0.026, -0.015], [0.02, 0.012], [0, 0.016]],
    foreArm: [[0, -0.108], [0.013, -0.105], [0.0145, -0.085], [0.021, -0.035], [0.0195, -0.004], [0, 0.006]],
    sleeveUp: [[0, -0.118], [0.03, -0.114], [0.031, -0.06], [0.027, -0.01], [0, 0.004]],
    sleeveLow: [[0, -0.1], [0.046, -0.108], [0.048, -0.098], [0.032, -0.02], [0.026, 0.004], [0, 0.008]],
    torso: [[0, 0.32], [0.058, 0.322], [0.062, 0.33], [0.06, 0.36], [0.056, 0.39], [0.062, 0.43], [0.069, 0.465], [0.068, 0.49], [0.05, 0.508], [0.024, 0.52], [0, 0.522]],
    robe: [[0, 0], [0.118, 0.002], [0.12, 0.012], [0.106, 0.06], [0.082, 0.2], [0.066, 0.32], [0.058, 0.392]],
  };
  const HIP_Y = 0.325, KNEE = 0.147, SHOULDER = [0.073, 0.49], ELBOW_Y = 0.112, HAND_Y = 0.118, CHEST_Z = 0.047, FLAT = 0.66;
  const ELBOW = -0.25;                       // how far the elbow is bent when the arm hangs
  // The rest of a limb follows its hip or shoulder, which is what gets moved (scene.js, stages.js). A leg swung forward
  // lifts its knee; j.kneel (0..1) brings the figure down on one knee. An arm turned back from rest (below 0) is an
  // arm raised: it folds at the elbow and holds what is in its hand aloft, tipped a little back. Turned forward (above
  // 0) is the end of a stroke: the arm reaches out in front and the weapon comes down level, pointing ahead.
  function flex(j) {
    for (const s of ['L', 'R']) {
      const hip = j['leg' + s], knee = j['knee' + s], arm = j['arm' + s], sho = j['sho' + s], fore = j['fore' + s], hand = j['hand' + s];
      if (hip && knee) {
        const a = hip.rotation.x, bend = a < 0 ? -a * 0.9 : a * 0.35, k = s === 'R' ? j.kneel || 0 : 0;
        knee.rotation.x = bend + (1.6 - bend) * k;
      }
      if (arm && sho) {
        const a = arm.rotation.x, out = a > 0;
        const reach = out ? -0.75 * a : a, bend = ELBOW - (out ? 0.2 * a : -0.3 * a), tip = out ? 1.5 * a : 0.14 * a;   // the upper arm, the elbow, the weapon: from upright
        sho.rotation.x = reach - a; fore.rotation.x = bend; hand.rotation.x = tip - reach - bend;
      }
    }
  }
  // o: armour or robe (a colour; a robe reaches the ground and hides the legs), skin, hair, beard (true = short,
  // 'long' falls to the chest, 'bushy' covers the jaw), lady, seat (astride a horse: the legs set, not walking).
  // Over armour, each a colour: drape (cloth thrown over the left shoulder, the armour bare on the weapon's side),
  // sleeve (a wide sleeve on the left arm), skirt (cloth to the knee in place of the thigh guards)
  function humanoid(pal, o = {}) {
    const g = group(), j = {};
    const armour = o.armour || pal.main, robed = !!o.robe, cloth = o.robe || pal.cloth, skin = o.skin || SKIN, hair = o.hair || '#1a1010', BOOT = '#2a1a10';
    if (!robed) {
      for (const sx of [-1, 1]) {
        const hip = (o.seat ? group : joint)(g, sx * 0.04, HIP_Y, 0), knee = (o.seat ? group : joint)(hip, 0, -KNEE, 0);
        part(lathe('thigh', BODY.thigh), pal.dark, hip);
        // a guard of plates hangs round each thigh and swings with it
        if (o.skirt) mesh(geo('skirtLeg', () => new THREE.CylinderGeometry(0.044, 0.066, 0.175, 12, 1, true)), cloth2(o.skirt), hip, 0, -0.078, 0);
        else mesh(geo('tasset', () => tiled(new THREE.CylinderGeometry(0.043, 0.054, 0.13, 12, 1, true), 8, 4)), lam(armour), hip, 0, -0.055, 0);
        part(lathe('shin', BODY.shin), BOOT, knee);
        part(geo('bootFoot', () => new THREE.SphereGeometry(0.028, 10, 8).scale(0.8, 0.62, 1.6)), BOOT, knee, 0, -0.16, 0.02);
        if (o.seat) { hip.rotation.set(-1.25, 0, sx * 0.62); knee.rotation.x = 1.3; }
        else { j[sx < 0 ? 'legL' : 'legR'] = hip; j[sx < 0 ? 'kneeL' : 'kneeR'] = knee; }
      }
    }
    const torsoGeo = geo('torso', () => tiled(new THREE.LatheGeometry(V2(BODY.torso), 16).scale(1, 1, FLAT), 12, 9));
    let torso;
    if (robed) {                                                         // a long robe to a trimmed hem, a sash with its ends hanging, a crossed collar
      torso = part(torsoGeo, cloth, g);
      part(lathe('robe', BODY.robe, 0.8, 18), cloth, g);
      part(geo('hem', () => new THREE.CylinderGeometry(0.122, 0.122, 0.016, 18, 1, true).scale(1, 1, 0.8)), pal.trim, g, 0, 0.014, 0, TRIM);
      part(geo('sash', () => new THREE.TorusGeometry(0.059, 0.009, 6, 18).rotateX(Math.PI / 2).scale(1, 1, 0.7)), pal.trim, g, 0, 0.388, 0, TRIM);
      box(0.022, 0.13, 0.006, pal.trim, g, 0, 0.325, 0.05, TRIM).rotation.x = -0.07;
      for (const sx of [-1, 1]) box(0.008, 0.075, 0.005, '#efe6d2', g, sx * 0.015, 0.477, CHEST_Z - 0.0075).rotation.set(0.2, 0, sx * 0.4);
    } else {                                                             // a coat of plates, belted, with a breast mirror and shoulder guards
      torso = mesh(torsoGeo, lam(armour), g);
      part(geo('belt', () => new THREE.TorusGeometry(0.058, 0.008, 6, 18).rotateX(Math.PI / 2).scale(1, 1, 0.68)), pal.trim, g, 0, 0.388, 0, TRIM);
      part(geo('mirror', () => new THREE.CylinderGeometry(0.02, 0.02, 0.008, 16).rotateX(Math.PI / 2)), pal.trim, g, 0, 0.458, CHEST_Z, TRIM);
      part(geo('collar', () => new THREE.TorusGeometry(0.026, 0.009, 6, 14).rotateX(Math.PI / 2)), pal.cloth, g, 0, 0.513, 0);
      if (o.drape) mesh(geo('drape', () => new THREE.LatheGeometry(V2(BODY.torso.map(([r, y]) => [r && r * 1.07 + 0.003, y])), 16, Math.PI * 0.8, Math.PI * 1.32).scale(1, 1, FLAT)), cloth2(o.drape), g);
      for (const sx of o.drape ? [1] : [-1, 1]) {
        const pad = part(geo('pauldron', () => new THREE.SphereGeometry(0.034, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 1, 1.1)), pal.trim, g, sx * 0.077, 0.483, 0, TRIM);
        pad.rotation.z = -sx * 0.5;
      }
    }
    torso.userData.flex = () => flex(j); torso.onBeforeRender = torso.userData.flex;
    for (const sx of [-1, 1]) {
      const s = sx < 0 ? 'L' : 'R', pivot = joint(g, sx * SHOULDER[0], SHOULDER[1], 0), arm = joint(pivot), fore = joint(arm, 0, -ELBOW_Y, 0), hand = joint(fore, 0, -HAND_Y, 0.002);
      const wide = robed ? cloth : sx < 0 ? o.sleeve : null;
      part(geo('deltoid', () => new THREE.SphereGeometry(0.029, 10, 8)), wide || cloth, arm, 0, -0.002, 0);
      if (wide) {                                                        // a wide sleeve, the hand just out of it
        part(lathe('sleeveUp', BODY.sleeveUp), wide, arm);
        part(geo('sleeveLow', () => new THREE.LatheGeometry(V2(BODY.sleeveLow), 12).scale(0.8, 1, 1.25)), wide, fore, 0, 0, -0.006);
      } else {
        part(lathe('upperArm', BODY.upperArm), cloth, arm);
        part(lathe('foreArm', BODY.foreArm), pal.trim, fore, 0, 0, 0, TRIM);   // a vambrace
      }
      part(geo('fist', () => new THREE.SphereGeometry(0.0165, 10, 8).scale(0.8, 1.1, 1)), skin, hand);
      fore.rotation.x = ELBOW; hand.rotation.x = -ELBOW;                // what the hand holds stands upright while the arm hangs
      j['arm' + s] = pivot; j['sho' + s] = arm; j['fore' + s] = fore; j['hand' + s] = hand;   // arm is the one that gets moved
    }
    part(geo('neck', () => new THREE.CylinderGeometry(0.02, 0.024, 0.04, 10)), skin, g, 0, 0.515, 0);
    const head = j.head = joint(g, 0, 0.519, 0); head.scale.set(...HEAD_SCALE);
    const face = headMaterial(skin, hair, o.lady), bare = g => { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.5, 0.7); return g; };   // bare skin: the forehead
    mesh(skullGeo(), face, head);
    part(geo('hair', () => new THREE.SphereGeometry(0.056, 14, 10, Math.PI, Math.PI, 0, Math.PI * 0.62).scale(1, 1.08, 1.1)), hair, head, 0, 0.068, -0.002);
    mesh(geo('nose', () => bare(new THREE.SphereGeometry(0.008, 8, 6).scale(0.72, 1.5, 1).rotateX(-0.35))), face, head, 0, 0.058, 0.0505);
    for (const sx of [-1, 1]) mesh(geo('ear', () => bare(new THREE.SphereGeometry(0.011, 8, 6).scale(0.4, 1, 0.75))), face, head, sx * 0.05, 0.064, -0.002);
    if (o.beard) part(geo('stache', () => new THREE.TorusGeometry(0.016, 0.0038, 5, 10, Math.PI).scale(1, 0.55, 1)), hair, head, 0, 0.0335, 0.0495);
    if (o.beard === 'long') part(geo('beardLong', () => new THREE.ConeGeometry(0.03, 0.19, 8).rotateX(Math.PI).scale(1, 1, 0.55)), hair, head, 0, -0.055, 0.06).rotation.x = -0.28;
    else if (o.beard === 'bushy') part(geo('beardBushy', () => new THREE.SphereGeometry(0.046, 10, 8).scale(1.02, 0.78, 0.72)), hair, head, 0, 0.011, 0.022);
    else if (o.beard) part(geo('beardShort', () => new THREE.ConeGeometry(0.02, 0.05, 8).rotateX(Math.PI).scale(1, 1, 0.7)), hair, head, 0, -0.004, 0.037);
    g.userData.j = j;
    return g;
  }
  // Weapons are held in a hand (j.handR, j.handL) and stand up from it; a pole arm's butt reaches the ground GRIP
  // below the hand, top(len) is the height of its other end.
  const GRIP = 0.25, top = len => len - GRIP;
  function pole(p, len, color) { const w = group(p); cyl(0.0075, 0.0075, len, color, w, 0, len / 2 - GRIP, 0, 6); return w; }
  const tassel = (w, y) => cyl(0.026, 0.01, 0.045, '#c0201a', w, 0, y, 0, 6);
  // a leaf-shaped spear point
  const point = (w, y, o = { metal: 0.8, rough: 0.3, smooth: true }, c = IRON) => part(geo('spearPoint', () => new THREE.LatheGeometry(V2([[0, 0], [0.008, 0.004], [0.015, 0.03], [0.008, 0.075], [0, 0.11]]), 8).scale(1, 1, 0.35)), c, w, 0, y, 0, o);
  // a flat blade cut to an outline (draw traces it on a shape, the edge towards +x), ground thin at its edges
  function blade(key, draw, thick = 0.008) {
    return geo('blade:' + key + thick, () => {
      const sh = new THREE.Shape(); draw(sh);
      return new THREE.ExtrudeGeometry(sh, { depth: thick * 0.3, bevelEnabled: true, bevelThickness: thick * 0.35, bevelSize: thick * 0.5, bevelSegments: 1, curveSegments: 8 }).translate(0, 0, -thick * 0.15);
    });
  }
  const BLADES = {
    glaive: sh => { sh.moveTo(-0.01, 0); sh.lineTo(-0.012, 0.1); sh.lineTo(-0.032, 0.118); sh.lineTo(-0.012, 0.13); sh.quadraticCurveTo(-0.01, 0.2, 0.022, 0.25); sh.quadraticCurveTo(0.064, 0.15, 0.03, 0); },
    sabre: sh => { sh.moveTo(-0.008, 0); sh.lineTo(-0.008, 0.2); sh.quadraticCurveTo(-0.004, 0.26, 0.022, 0.29); sh.quadraticCurveTo(0.032, 0.2, 0.014, 0); },
    axe: sh => { sh.moveTo(0, 0.012); sh.lineTo(0.05, 0.042); sh.quadraticCurveTo(0.07, 0, 0.05, -0.042); sh.lineTo(0, -0.012); },
    serpent: sh => {                         // a blade that winds like a snake to its point
      const edge = (t, s) => [s * (0.013 * (1 - t) + 0.0015) + 0.009 * Math.sin(t * Math.PI * 3) * (1 - t * 0.6), t * 0.21];
      sh.moveTo(...edge(0, -1));
      for (let i = 1; i <= 16; i++) sh.lineTo(...edge(i / 16, -1));
      for (let i = 16; i >= 0; i--) sh.lineTo(...edge(i / 16, 1));
    },
  };
  const cut = (key, w, x, y, thick) => mesh(blade(key, BLADES[key], thick), mat('#e8eef4', { metal: 0.9, rough: 0.2 }), w, x, y, 0);
  function spear(p, pal, len = 0.82) {
    const w = pole(p, len, WOOD);
    point(w, top(len)); tassel(w, top(len) - 0.03);
    return w;
  }
  // a straight two-edged sword: the blade tapers to its point
  function sword(p, pal) {
    const w = group(p);
    part(geo('blade', () => new THREE.CylinderGeometry(0.002, 0.012, 0.3, 4).scale(1, 1, 0.28)), '#e8eef4', w, 0, 0.18, 0, { metal: 0.9, rough: 0.2 });
    box(0.07, 0.012, 0.022, pal.trim, w, 0, 0.026, 0, { metal: 0.7, rough: 0.3 });
    cyl(0.007, 0.007, 0.06, '#3a1a0a', w, 0, -0.008, 0, 6);
    ball(0.011, pal.trim, w, 0, -0.042, 0, { metal: 0.7, rough: 0.3 });
    return w;
  }
  function halberd(p, pal) {
    const len = 0.84, w = spear(p, pal, len);
    cut('axe', w, 0.006, top(len) - 0.07);
    return w;
  }

  // a round helmet over the head, with a brim and a neck guard behind
  function helmet(head, color, o) {
    part(geo('helm', () => new THREE.SphereGeometry(0.063, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5).scale(0.96, 1.08, 1.06)), color, head, 0, 0.085, 0, o);
    part(geo('helmBrim', () => new THREE.TorusGeometry(0.062, 0.007, 6, 20).rotateX(Math.PI / 2).scale(0.96, 1, 1.06)), color, head, 0, 0.087, 0, o);
    part(geo('neckGuard', () => new THREE.CylinderGeometry(0.064, 0.076, 0.06, 14, 1, true, Math.PI * 0.55, Math.PI * 0.9).scale(1, 1, 1.06)), color, head, 0, 0.058, 0, o);
  }
  // two long pheasant feathers on a helmet, the mark of a famous general
  function plumes(head, color, len = 1) {
    for (const sx of [-1, 1]) {
      const f = group(head, sx * 0.03, 0.2, -0.01);
      f.rotation.z = -sx * 0.35; f.rotation.x = -0.35;
      part(geo('quill' + len, () => new THREE.CylinderGeometry(0.0055, 0.007, 0.22 * len, 6)), color, f, 0, 0.11 * len, 0);
      const tip = group(f, 0, 0.22 * len, 0); tip.rotation.x = -0.7; tip.rotation.z = -sx * 0.3;
      part(geo('quillTip' + len, () => new THREE.CylinderGeometry(0.001, 0.0055, 0.16 * len, 6)), color, tip, 0, 0.08 * len, 0);
    }
  }
  // a cloak from the shoulders to the calves, widening as it falls
  function cloak(h, color) {
    const c = group(h, 0, 0.502, -0.028); c.rotation.x = 0.1;
    mesh(geo('cape', () => new THREE.CylinderGeometry(0.078, 0.128, 0.4, 14, 3, true, Math.PI * 0.5, Math.PI).translate(0, -0.2, 0).scale(1, 1, 0.55)), cloth2(color), c);
    return c;
  }
  // generals wear a cape in their side's colour, which also tells the sides apart when a hero leads them
  function cape(h, side) { h.userData.j.cape = cloak(h, CAPE[side]); }
  // a white feather fan held up in front (j.restArm keeps the arm raised between moves)
  function featherFan(h, size = 1) {
    const j = h.userData.j, fan = group(j.handR);
    cyl(0.005, 0.005, 0.07, WOOD, fan, 0, 0.02, 0, 5);
    for (let i = -3; i <= 3; i++) {
      const f = group(fan, 0, 0.045, 0); f.rotation.z = i * 0.27; f.scale.setScalar(size * (1 - Math.abs(i) * 0.04));
      part(geo('feather', () => new THREE.SphereGeometry(0.05, 8, 6).scale(0.27, 1, 0.06)), '#f4f1e8', f, 0, 0.05, 0);
    }
    j.armR.rotation.x = j.restArm = -0.6;
  }

  // a general stands over the ranks: taller than a soldier and a good deal broader (the same up and deep, so limbs
  // that swing forward keep their shape)
  const STOUT = 1.24, GRAND = 1.13;
  const grand = (h, k) => { h.scale.set(k * GRAND * STOUT, k * GRAND, k * GRAND); return h; };
  function buildGeneral(pal, side) {
    const h = humanoid(pal, { armour: ARMOUR[side], beard: true }), j = h.userData.j;
    helmet(j.head, pal.trim, { metal: 0.7, rough: 0.3, smooth: true });
    cyl(0.018, 0.028, 0.05, pal.trim, j.head, 0, 0.17, 0, 10, { metal: 0.7, rough: 0.3, smooth: true });
    plumes(j.head, pal.plume);
    cape(h, side);
    sword(j.handR, pal);
    grand(h, 1.18);
    return h;
  }
  function buildAdvisor(pal, side) {
    const h = humanoid(pal, { robe: ROBE[side], beard: true }), j = h.userData.j;
    // scholar's hat
    part(geo('hatBrim', () => new THREE.CylinderGeometry(0.066, 0.066, 0.016, 18).scale(1, 1, 0.9)), '#1a1010', j.head, 0, 0.122, -0.002);
    part(geo('hatCrown', () => new THREE.CylinderGeometry(0.036, 0.042, 0.06, 16)), '#1a1010', j.head, 0, 0.158, -0.004);
    featherFan(h);
    return h;
  }
  function buildSoldier(pal) {
    const h = humanoid(pal), j = h.userData.j;
    helmet(j.head, pal.dark, { metal: 0.4, rough: 0.5, smooth: true });
    cyl(0.003, 0.012, 0.05, pal.trim, j.head, 0, 0.175, 0, 6, { metal: 0.6, rough: 0.35, smooth: true });   // the spike...
    cyl(0.018, 0.006, 0.04, pal.plume, j.head, 0, 0.21, 0, 8, SMOOTH);                                      // ...and its tassel
    spear(j.handR, pal);
    // a round shield strapped to the other forearm
    const shield = group(j.foreL, -0.03, -0.06, 0.004);
    part(geo('shield', () => new THREE.SphereGeometry(0.094, 18, 10).scale(0.16, 1, 1)), pal.main, shield);
    part(geo('shieldRim', () => new THREE.TorusGeometry(0.096, 0.008, 6, 24).rotateY(Math.PI / 2)), pal.trim, shield, 0, 0, 0, TRIM);
    sball(0.026, pal.trim, shield, -0.018, 0, 0, TRIM).scale.set(0.6, 1, 1);
    h.scale.setScalar(0.92);
    return h;
  }
  // a horse's legs fold at the knee and hock as they swing
  function gait(legs, lower) {
    legs.forEach((L, i) => { const a = L.rotation.x; lower[i].rotation.x = i < 2 ? Math.max(0, -a) * 1.15 + Math.max(0, a) * 0.2 : Math.abs(a) * 0.5; });
  }
  function buildHorse(pal, side) {
    const g = group(), j = {};
    // Red rides the Red Hare: a coat the red of embers, a long black mane and tail, a gold plate down its face, a red
    // rope with tassels across its chest
    const hare = side === 1, coat = hare ? '#a8301a' : pal.horse, dark = '#1a0f08', gilt = { metal: 0.7, rough: 0.3, smooth: true };
    const body = group(g, 0, 0.336, 0); j.body = body;
    // the barrel, from the rump to the chest
    const barrel = part(geo('horseBarrel', () => new THREE.LatheGeometry(V2([[0, -0.21], [0.05, -0.205], [0.08, -0.16], [0.086, -0.09], [0.078, -0.01], [0.082, 0.07], [0.086, 0.13], [0.066, 0.185], [0, 0.2]]), 16).rotateX(Math.PI / 2).scale(0.8, 1, 1)), coat, body);
    part(geo('saddleCloth', () => new THREE.CylinderGeometry(0.09, 0.09, 0.2, 14, 1, true, Math.PI * 0.4, Math.PI * 1.2).rotateX(Math.PI / 2).scale(0.82, 1, 1)), hare ? pal.dark : pal.main, body, 0, 0, -0.02);
    part(geo('saddle', () => new THREE.SphereGeometry(0.06, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.95, 0.5, 1.4)), '#3a2210', body, 0, 0.068, -0.02);
    if (hare) {
      part(geo('breastRope', () => new THREE.TorusGeometry(0.076, 0.011, 6, 18).scale(0.82, 1, 1)), '#b3261e', body, 0, 0, 0.15);
      for (const x of [-0.04, 0, 0.04]) cyl(0.017, 0.004, 0.055, '#c0201a', body, x, -0.07 + Math.abs(x) * 0.5, 0.185 - Math.abs(x) * 0.6, 8, SMOOTH);
      sball(0.014, '#d4a017', body, 0, -0.04, 0.2, gilt);
    } else part(geo('breastStrap', () => new THREE.TorusGeometry(0.074, 0.006, 6, 18).scale(0.82, 1, 1)), pal.trim, body, 0, 0, 0.15, TRIM);
    const neck = group(body, 0, 0.04, 0.15); neck.rotation.x = j.neckRest = 0.6; j.neck = neck;
    part(geo('horseNeck', () => new THREE.LatheGeometry(V2([[0, -0.06], [0.076, -0.035], [0.062, 0.04], [0.045, 0.13], [0.035, 0.2], [0, 0.215]]), 12).scale(0.62, 1, 1)), coat, neck);
    part(geo('mane', () => new THREE.SphereGeometry(0.05, 8, 8).scale(0.16, 2.3, 0.55)), dark, neck, 0, 0.105, -0.036);
    if (hare) for (const sx of [-1, 1]) part(geo('maneFall', () => new THREE.SphereGeometry(0.05, 8, 8).scale(0.14, 2.1, 0.75)), dark, neck, sx * 0.014, 0.09, -0.04).rotation.z = sx * 0.16;
    const head = group(neck, 0, 0.2, 0.004); head.rotation.x = 0.35;
    part(geo('horseHead', () => new THREE.LatheGeometry(V2([[0, -0.036], [0.03, -0.03], [0.038, 0], [0.036, 0.04], [0.026, 0.09], [0.022, 0.13], [0.02, 0.15], [0, 0.162]]), 12).rotateX(Math.PI / 2).scale(0.72, 1, 1)), coat, head);
    part(geo('noseband', () => new THREE.TorusGeometry(0.0255, 0.003, 5, 14).scale(0.74, 1, 1)), pal.trim, head, 0, 0, 0.105, TRIM);
    part(geo('forelock', () => new THREE.SphereGeometry(0.016, 8, 6).scale(0.8, 0.7, 1.5)), dark, head, 0, 0.034, 0.012);
    if (hare) {
      part(geo('chamfron', () => new THREE.LatheGeometry(V2([[0.036, -0.012], [0.043, 0], [0.041, 0.04], [0.031, 0.09], [0.027, 0.13], [0.024, 0.152]]), 12, Math.PI * 0.68, Math.PI * 0.64).rotateX(Math.PI / 2).scale(0.72, 1, 1)), '#d4a017', head, 0, 0, 0, gilt);
      sball(0.009, '#c0201a', head, 0, 0.041, 0.03);
    }
    for (const sx of [-1, 1]) {
      part(geo('horseEar', () => new THREE.ConeGeometry(0.01, 0.045, 6)), coat, head, sx * 0.018, 0.04, -0.03).rotation.set(-0.95, 0, -sx * 0.2);
      part(geo('eye', () => new THREE.SphereGeometry(0.0075, 6, 5)), '#141010', head, sx * 0.0245, 0.012, 0.035);
    }
    const tail = group(body, 0, 0.045, -0.2); tail.rotation.x = 0.3; if (hare) tail.scale.set(1.3, 1.15, 1.3);
    part(lathe('horseTail', [[0, -0.25], [0.018, -0.23], [0.028, -0.12], [0.014, -0.02], [0, 0]]), dark, tail);
    j.legs = []; const lower = [];
    for (const [x, z] of [[-0.045, 0.13], [0.045, 0.13], [-0.045, -0.15], [0.045, -0.15]]) {
      const L = group(body, x, -0.02, z), K = joint(L, 0, -0.16, 0);
      L.scale.set(1.15, 0.86, 1.15);
      const up = part(lathe('horseLegUp', [[0, -0.165], [0.017, -0.16], [0.02, -0.1], [0.03, -0.03], [0.034, 0.02], [0, 0.05]]), coat, L);
      if (z < 0) up.scale.set(1.1, 1, 1.5);                                // the hindquarters
      part(lathe('horseLegLow', [[0, -0.16], [0.014, -0.155], [0.012, -0.1], [0.014, -0.03], [0.02, 0], [0, 0.012]]), coat, K);
      part(geo('hoof', () => new THREE.CylinderGeometry(0.017, 0.022, 0.035, 8)), dark, K, 0, -0.17, 0.003);
      j.legs.push(L); lower.push(K);
    }
    barrel.userData.flex = () => gait(j.legs, lower); barrel.onBeforeRender = barrel.userData.flex;
    // the rider sits astride the saddle, a halberd in hand
    const rider = humanoid(pal, { seat: true });
    rider.scale.setScalar(0.85); rider.position.set(0, 0.1 - HIP_Y * 0.85, -0.02); body.add(rider);
    const rj = rider.userData.j;
    helmet(rj.head, pal.trim, TRIM);
    cyl(0.016, 0.005, 0.07, pal.plume, rj.head, 0, 0.19, 0, 8, SMOOTH);
    halberd(rj.handR, pal);
    Object.assign(j, { armR: rj.armR, armL: rj.armL, handR: rj.handR, handL: rj.handL, head: rj.head });
    g.userData.j = j;
    return g;
  }
  function buildChariot(pal, side) {
    const g = group(), j = {};
    box(0.32, 0.04, 0.3, WOOD, g, 0, 0.19, 0);                              // the floor, its rails and front board
    for (const sx of [-1, 1]) { box(0.018, 0.11, 0.3, pal.main, g, sx * 0.151, 0.265, 0); box(0.024, 0.016, 0.31, pal.trim, g, sx * 0.151, 0.326, 0, { metal: 0.6, rough: 0.35 }); }
    box(0.32, 0.13, 0.018, pal.main, g, 0, 0.275, 0.141);
    box(0.33, 0.016, 0.024, pal.trim, g, 0, 0.346, 0.141, { metal: 0.6, rough: 0.35 });
    cyl(0.012, 0.012, 0.4, WOOD, g, 0, 0.165, 0.3, 6).rotation.x = Math.PI / 2;   // the draught pole and its yoke
    cyl(0.01, 0.01, 0.2, WOOD, g, 0, 0.175, 0.49, 6).rotation.z = Math.PI / 2;
    cyl(0.012, 0.012, 0.42, '#2a160a', g, 0, 0.165, -0.02, 6).rotation.z = Math.PI / 2;   // the axle
    j.wheels = [];
    for (const sx of [-1, 1]) {
      const w = group(g, sx * 0.195, 0.165, -0.02);
      part(geo('wheelRim', () => new THREE.TorusGeometry(0.152, 0.013, 6, 28).rotateY(Math.PI / 2)), '#4a2a14', w);
      for (let k = 0; k < 6; k++) cyl(0.006, 0.006, 0.3, '#2a160a', w, 0, 0, 0, 5).rotation.x = (k * Math.PI) / 6;
      cyl(0.022, 0.022, 0.04, pal.trim, w, 0, 0, 0, 10, TRIM).rotation.z = Math.PI / 2;
      j.wheels.push(w);
    }
    // a parasol over the driver
    cyl(0.007, 0.007, 0.66, WOOD, g, 0.1, 0.54, -0.09, 5);
    cyl(0.005, 0.2, 0.07, pal.main, g, 0.1, 0.89, -0.09, 10);
    part(geo('parasolRim', () => new THREE.TorusGeometry(0.2, 0.005, 5, 20).rotateX(Math.PI / 2)), pal.trim, g, 0.1, 0.856, -0.09, TRIM);
    const driver = humanoid(pal); driver.position.set(-0.03, 0.21, -0.01); driver.scale.setScalar(0.85); g.add(driver);
    const dj = driver.userData.j;
    helmet(dj.head, pal.trim, TRIM);
    halberd(dj.handR, pal);
    Object.assign(j, { armR: dj.armR, armL: dj.armL, handR: dj.handR, handL: dj.handL, head: dj.head });   // the driver stands: the legs are not the figure's
    g.userData.j = j;
    return g;
  }
  function buildElephant(pal, side) {
    const g = group(), j = {}, grey = '#84858c', shade = '#74757c', ivory = '#f3ecd8';
    const body = group(g, 0, 0.37, 0); j.body = body;
    part(geo('elephantBody', () => new THREE.LatheGeometry(V2([[0, -0.24], [0.09, -0.23], [0.16, -0.17], [0.178, -0.06], [0.172, 0.05], [0.16, 0.13], [0.11, 0.2], [0, 0.22]]), 18).rotateX(Math.PI / 2).scale(0.84, 1, 1)), grey, body);
    const head = group(body, 0, 0.075, 0.23);
    part(geo('elephantHead', () => new THREE.SphereGeometry(0.112, 16, 12).scale(0.95, 1.12, 0.95)), grey, head);
    for (const sx of [-1, 1]) {
      part(geo('elephantBrow', () => new THREE.SphereGeometry(0.05, 10, 8)), grey, head, sx * 0.04, 0.09, 0.01);     // the two domes of the forehead
      const ear = part(geo('elephantEar', () => new THREE.SphereGeometry(0.1, 12, 8).scale(0.1, 1.15, 0.9)), shade, head, sx * 0.118, 0.01, -0.05);
      ear.rotation.set(0, sx * 0.55, -sx * 0.12);
      part(geo('eye', () => new THREE.SphereGeometry(0.0075, 6, 5)), '#141010', head, sx * 0.075, 0.035, 0.078);
      const tusk = part(geo('tusk', () => new THREE.TorusGeometry(0.16, 0.012, 6, 10, 0.95).rotateY(-Math.PI / 2)), ivory, head, sx * 0.055, 0.085, 0.07);
      tusk.rotation.set(2.25, 0, 0); tusk.rotation.y = sx * 0.14;
    }
    // the trunk in five lengths: hanging, its tip curling forward. j.trunk swings the whole of it (0.5 at rest)
    const root = group(head, 0, -0.045, 0.09); root.rotation.x = 0.5; j.trunk = root;
    let t = group(root); t.rotation.x = -0.72;
    for (let k = 0; k < 5; k++) {
      const r = 0.044 - k * 0.0062;
      part(geo('trunk' + k, () => new THREE.CylinderGeometry(r, r - 0.006, 0.08, 12)), grey, t, 0, -0.036, 0);
      const n = group(t, 0, -0.072, 0); n.rotation.x = k < 2 ? 0.12 : -0.42; t = n;
    }
    j.legs = [];
    for (const [x, z] of [[-0.088, 0.13], [0.088, 0.13], [-0.088, -0.14], [0.088, -0.14]]) {
      const L = group(body, x, -0.1, z);
      part(lathe('elephantLeg', [[0, -0.27], [0.05, -0.268], [0.053, -0.25], [0.045, -0.2], [0.05, -0.06], [0.062, 0.03], [0, 0.07]]), grey, L);
      j.legs.push(L);
    }
    const tail = group(body, 0, 0.06, -0.225); tail.rotation.x = 0.25;
    cyl(0.008, 0.004, 0.16, shade, tail, 0, -0.08, 0, 6, SMOOTH);
    // a cloth in the side's colour over the back, and on it a howdah under a roof
    part(geo('elephantCloth', () => new THREE.CylinderGeometry(0.186, 0.186, 0.26, 18, 1, true, Math.PI * 0.45, Math.PI * 1.1).rotateX(Math.PI / 2).scale(0.84, 1, 1)), pal.main, body, 0, 0, -0.02);
    part(geo('elephantClothTrim', () => new THREE.CylinderGeometry(0.189, 0.189, 0.02, 18, 1, true, Math.PI * 0.45, Math.PI * 1.1).rotateX(Math.PI / 2).scale(0.84, 1, 1)), pal.trim, body, 0, 0, 0.11, TRIM);
    box(0.2, 0.1, 0.2, WOOD, body, 0, 0.225, -0.02);
    box(0.215, 0.014, 0.215, pal.trim, body, 0, 0.28, -0.02, { metal: 0.5, rough: 0.4 });
    for (const [x, z] of [[-0.09, 0.07], [0.09, 0.07], [-0.09, -0.11], [0.09, -0.11]]) cyl(0.006, 0.006, 0.15, WOOD, body, x, 0.36, z, 4);
    cyl(0.01, 0.175, 0.07, pal.main, body, 0, 0.465, -0.02, 4).rotation.y = Math.PI / 4;
    g.userData.j = j;
    g.scale.setScalar(1.05);
    return g;
  }
  function buildCatapult(pal, side) {
    const g = group(), j = {};
    for (const sx of [-1, 1]) box(0.03, 0.04, 0.42, WOOD, g, sx * 0.12, 0.05, 0);
    for (const z of [-0.17, 0.17]) box(0.27, 0.03, 0.03, WOOD, g, 0, 0.06, z);
    for (const sx of [-1, 1]) {
      for (const dz of [-0.07, 0.07]) { const u = box(0.025, 0.34, 0.025, WOOD, g, sx * 0.12, 0.22, dz * 0.7); u.rotation.x = -Math.sign(dz) * 0.25; }
      const w = cyl(0.06, 0.06, 0.025, '#3a2210', g, sx * 0.15, 0.06, sx > 0 ? 0.14 : -0.14, 8); w.rotation.z = Math.PI / 2;
    }
    box(0.27, 0.025, 0.025, pal.trim, g, 0, 0.38, 0, { metal: 0.5, rough: 0.4 });
    // the throwing arm: counterweight behind, stone cup in front
    const arm = group(g, 0, 0.38, 0); j.arm = arm; arm.rotation.x = 0.55;
    box(0.03, 0.03, 0.5, WOOD, arm, 0, 0, 0.08);
    box(0.12, 0.1, 0.1, pal.main, arm, 0, -0.06, -0.15);
    cyl(0.05, 0.03, 0.04, '#3a2210', arm, 0, 0.02, 0.32, 8);
    j.stone = ball(0.045, '#7d756a', arm, 0, 0.06, 0.32);
    box(0.05, 0.05, 0.05, pal.trim, g, 0, 0.05, 0.2);
    g.userData.j = j;
    return g;
  }

  // ---------- heroes (heroes.js): a player's general, known by face, headgear and weapon ----------
  const GOLD = { metal: 0.7, rough: 0.3 }, STEEL = { metal: 0.9, rough: 0.2 }, GOLDS = { ...GOLD, smooth: true }, STEELS = { ...STEEL, smooth: true };
  // a soft cap or a tall hat: round, a little deeper than wide
  const cap = (head, rt, rb, h, color, y, o = SMOOTH) => part(geo(`cap${rt},${rb},${h}`, () => new THREE.CylinderGeometry(rt, rb, h, 18).scale(1, 1, 1.08)), color, head, 0, y, -0.004, o);
  function glaive(p) {                      // Green Dragon Crescent Blade: a broad curved blade
    const len = 0.8, w = pole(p, len, '#24402a'), y = top(len);
    cut('glaive', w, 0, y - 0.03, 0.01);
    box(0.035, 0.03, 0.03, '#d4a017', w, 0, y - 0.05, 0, GOLD);
    tassel(w, y - 0.1);
  }
  function serpentSpear(p) {                // Zhang Fei's spear: a long wavy blade
    const len = 0.84, w = pole(p, len, '#1e1e22'), y = top(len);
    cut('serpent', w, 0, y - 0.005);
    tassel(w, y - 0.02);
  }
  function skyPiercer(p) {                  // Lü Bu's halberd: a spear point with a crescent blade on each side
    const len = 0.84, w = pole(p, len, '#3a1a0a'), y = top(len);
    point(w, y, STEELS, '#e8eef4');
    for (const sx of [-1, 1]) {
      const c = mesh(geo('crescent', () => new THREE.TorusGeometry(0.055, 0.012, 4, 10, Math.PI)), mat('#e8eef4', STEEL), w, sx * 0.05, y - 0.03, 0);
      c.rotation.z = -sx * Math.PI / 2;
    }
    tassel(w, y - 0.1);
  }
  function sabre(p) {                       // a broad, slightly curved single-edged blade
    const w = group(p);
    cut('sabre', w, 0, 0.04);
    box(0.07, 0.016, 0.03, '#d4a017', w, 0, 0.035, 0, GOLD);
    cyl(0.008, 0.008, 0.07, '#3a1a0a', w, 0, -0.005, 0, 6);
    return w;
  }
  // a beast's head in gold on a shoulder: brow, snout and two horns
  function beast(h, sx, color = '#d4a017') {
    const b = group(h, sx * 0.089, 0.494, 0); b.rotation.z = -sx * 0.45;
    sball(0.036, color, b, 0, 0, 0, GOLDS).scale.set(1.1, 0.85, 1.2);
    sball(0.02, color, b, sx * 0.014, -0.006, 0.036, GOLDS);
    for (const dz of [-1, 1]) cyl(0, 0.008, 0.034, color, b, sx * 0.004, 0.032, dz * 0.022, 6, GOLDS).rotation.x = dz * 0.5;
  }
  // a band round the brow with a jewel in front
  function browBand(head, color = '#d4a017', gem = '#c0201a', y = 0.098) {
    part(geo('browBand', () => new THREE.TorusGeometry(0.0515, 0.0055, 6, 20).rotateX(Math.PI / 2).scale(1, 1.3, 1.1)), color, head, 0, y, 0, GOLDS);
    sball(0.009, gem, head, 0, y + 0.003, 0.058);
  }
  // tails of cloth flying from the back of the head
  function tails(head, color, len = 0.17, y = 0.1) {
    for (const sx of [-1, 1]) {
      const t = mesh(geo('tails' + len, () => {
        const g = new THREE.PlaneGeometry(0.022, len, 1, 6).translate(0, -len / 2, 0), p = g.attributes.position;
        for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin((p.getY(i) / len) * 5) * 0.012);
        g.computeVertexNormals(); return g;
      }), cloth2(color), head, sx * 0.022, y, -0.058);
      t.rotation.set(0.8, 0, sx * 0.32);
    }
  }
  // hair worn long down the back
  const longHair = (head, color = '#1a1010') => part(geo('longHair', () => new THREE.SphereGeometry(0.045, 10, 8).scale(1, 2.1, 0.4)), color, head, 0, 0.02, -0.054);
  // hair tied in a knot on the crown, a small gold crown round it
  function topknot(head, hair = '#1a1010', y = 0.132) {
    sball(0.022, hair, head, 0, y, -0.012);
    part(geo('knotCrown', () => new THREE.CylinderGeometry(0.02, 0.016, 0.026, 12)), '#d4a017', head, 0, y + 0.012, -0.012, GOLDS);
  }
  // a collar of fur round the neck
  const fur = (h, color = '#3a2c28') => part(geo('furCollar', () => new THREE.TorusGeometry(0.04, 0.017, 6, 14).rotateX(Math.PI / 2).scale(1, 0.8, 0.9)), color, h, 0, 0.512, -0.004);
  // two long whiskers falling from the corners of the mouth
  function whiskers(head, color = '#1a1010') {
    for (const sx of [-1, 1]) part(geo('whisker', () => new THREE.ConeGeometry(0.007, 0.15, 6).rotateX(Math.PI)), color, head, sx * 0.024, -0.035, 0.058).rotation.set(-0.24, 0, sx * 0.1);
  }
  // a bow slung across the back
  const bow = h => { mesh(geo('bow', () => new THREE.TorusGeometry(0.17, 0.008, 4, 12, Math.PI)), mat('#4a2a12'), h, 0.03, 0.41, -0.062).rotation.z = -1.2; };
  const SILVER = '#dfe4ea';
  const hero = (pal, o, scale = 1.18) => { const h = grand(humanoid(pal, o), scale); return [h, h.userData.j]; };
  const HERO_BUILD = {
    'quan-vu'(pal, side) {
      // a green robe thrown over gold armour, the armour bare on the sword arm under a beast's head; a green cloth cap
      // with a gold band and flying tails; a face red as a date and a beard to the waist
      const GREEN = '#2f7a3c', [h, j] = hero(pal, { armour: '#b8922e', skin: '#b4503a', beard: 'long', drape: GREEN, sleeve: GREEN, skirt: GREEN }, 1.22);
      cap(j.head, 0.05, 0.057, 0.05, '#24602c', 0.118); sball(0.036, '#24602c', j.head, 0, 0.15, -0.014).scale.set(1, 0.8, 1.1);
      browBand(j.head); tails(j.head, GREEN, 0.2);
      part(geo('beardGrand', () => new THREE.ConeGeometry(0.036, 0.25, 8).rotateX(Math.PI).scale(1, 1, 0.5)), '#1a1010', j.head, 0, -0.085, 0.07).rotation.x = -0.24;
      whiskers(j.head);
      beast(h, 1); sball(0.015, '#d4a017', h, 0, 0.388, 0.044, GOLDS);
      cape(h, side); glaive(j.handR);
      return h;
    },
    'truong-phi'(pal, side) {
      // dark iron plates under a red cloth thrown over one shoulder, a blue sash, a beast's head on the spear arm; a red
      // head cloth knotted on top; a tiger's beard
      const RED = '#9c2a1c', [h, j] = hero(pal, { armour: '#3a3a42', skin: '#c28860', beard: 'bushy', drape: RED }, 1.26);
      cap(j.head, 0.052, 0.056, 0.036, RED, 0.108); sball(0.03, RED, j.head, 0, 0.142, -0.016).scale.set(1.1, 0.8, 1.1);
      tails(j.head, RED, 0.12, 0.13);
      for (const sx of [-1, 1]) part(geo('whiskerSide', () => new THREE.ConeGeometry(0.012, 0.06, 6)), '#1a1010', j.head, sx * 0.045, 0.022, 0.03).rotation.z = -sx * 1.9;
      part(geo('waistSash', () => new THREE.TorusGeometry(0.061, 0.013, 6, 18).rotateX(Math.PI / 2).scale(1, 1, 0.7)), '#2c4f86', h, 0, 0.374, 0);
      box(0.02, 0.08, 0.008, '#2c4f86', h, 0.012, 0.33, 0.05).rotation.z = 0.15;
      beast(h, 1);
      cape(h, side); serpentSpear(j.handR);
      return h;
    },
    'trieu-van'(pal, side) {
      const [h, j] = hero(pal, { armour: '#cfd5dc', skirt: '#eef1f4' });       // silver plates over white, a beast's head on each shoulder
      beast(h, 1, SILVER); beast(h, -1, SILVER); longHair(j.head);
      helmet(j.head, '#e6eaef', { metal: 0.8, rough: 0.25, smooth: true });
      const tuft = group(j.head, 0, 0.16, -0.02); tuft.rotation.x = -0.5;
      cyl(0.004, 0.02, 0.16, '#ffffff', tuft, 0, 0.08, 0, 8, SMOOTH);
      cape(h, side); spear(j.handR, pal, 0.8);
      return h;
    },
    'gia-cat-luong'(pal, side) {
      // a white robe over blue, a dark sash; the ridged silk cap with a gold band; hair down his back; a great fan of
      // white feathers
      const TEAL = '#2f8f8a', [h, j] = hero(pal, { robe: '#ece6d6', beard: true });
      box(0.036, 0.43, 0.005, '#2a4a8a', h, 0, 0.245, 0.0735).rotation.x = -0.1;
      part(geo('wideSash', () => new THREE.TorusGeometry(0.06, 0.015, 6, 18).rotateX(Math.PI / 2).scale(1, 1.3, 0.7)), '#3b2a52', h, 0, 0.385, 0);
      part(geo('lunjin', () => new THREE.SphereGeometry(0.056, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.95, 1.5, 1.15)), TEAL, j.head, 0, 0.098, -0.008);
      for (let i = -2; i <= 2; i++) {                                   // its ridges, from the brow over the top to the back
        const k = Math.sqrt(1 - (i * 0.33) ** 2);
        part(geo('lunjinRidge', () => new THREE.TorusGeometry(0.057, 0.004, 5, 14, Math.PI).rotateY(Math.PI / 2).scale(1, 1.5, 1.15)), '#8fd0c8', j.head, i * 0.0165, 0.098, -0.008).scale.set(1, k, k);
      }
      browBand(j.head, '#d4a017', '#2a5aa8', 0.1);
      longHair(j.head);
      featherFan(h, 1.3);
      return h;
    },
    'luu-bi'(pal, side) {
      const YELLOW = '#d2a83a', [h, j] = hero(pal, { armour: '#7a2418', beard: true, drape: YELLOW, sleeve: YELLOW, skirt: YELLOW });   // a yellow robe over dark red plates
      beast(h, 1); longHair(j.head);
      cap(j.head, 0.05, 0.056, 0.05, '#d9b65a', 0.12, GOLDS);            // crown: a flat board on a gold cap
      box(0.16, 0.012, 0.09, '#1a1010', j.head, 0, 0.16, 0);
      for (const x of [-0.06, -0.03, 0, 0.03, 0.06]) cyl(0.003, 0.003, 0.05, '#d9b65a', j.head, x, 0.13, 0.045, 3);
      cape(h, side); sword(j.handR, pal); sword(j.handL, pal);
      return h;
    },
    'tao-thao'(pal, side) {
      // a purple robe under gold: a beast's head on each shoulder, a plate on the breast; hair in a knot under a small
      // gold crown; the great sword Yitian
      const [h, j] = hero(pal, { robe: '#4a2a66', beard: true }, 1.2);
      beast(h, 1); beast(h, -1);
      sball(0.03, '#d4a017', h, 0, 0.452, CHEST_Z - 0.004, GOLDS).scale.set(1.5, 1.2, 0.35);
      topknot(j.head); cyl(0, 0.008, 0.04, '#d4a017', j.head, 0, 0.175, -0.012, 6, GOLDS);
      longHair(j.head);
      cape(h, side); sword(j.handR, { trim: '#d4a017' }).scale.setScalar(1.45);
      return h;
    },
    'ton-quyen'(pal, side) {
      const [h, j] = hero(pal, { armour: '#1f5f5a', beard: true, hair: '#6b2f7a', skirt: '#8a1f1a' });   // jade plates over a red skirt
      beast(h, 1); beast(h, -1); longHair(j.head, '#6b2f7a');
      cap(j.head, 0.052, 0.057, 0.06, '#d9b65a', 0.122, GOLDS);
      for (let i = 0; i < 3; i++) cyl(0, 0.014, 0.05, '#d9b65a', j.head, (i - 1) * 0.035, 0.17, 0.02, 4, GOLD);
      cape(h, side); sword(j.handR, pal);
      return h;
    },
    // ---- earned in the campaign ----
    'hoang-trung'(pal, side) {                 // the old general: white hair and beard, a broad sabre, a bow on his back
      const [h, j] = hero(pal, { armour: '#8a6a2a', skin: '#d9a87e', beard: 'long', hair: '#e8e4dc' });
      beast(h, 1); whiskers(j.head, '#e8e4dc');
      helmet(j.head, '#c9b27a', GOLDS);
      bow(h);
      cape(h, side);
      const len = 0.72, w = pole(j.handR, len, '#4a2a12'), y = top(len);
      cut('glaive', w, 0, y - 0.04, 0.011).scale.set(1.15, 1, 1);
      tassel(w, y - 0.08);
      return h;
    },
    'ma-sieu'(pal, side) {                     // silver armour, a lion-head helmet with a golden mane, a long spear
      const [h, j] = hero(pal, { armour: '#d8dde4', skirt: '#f0f2f5' });
      beast(h, 1, SILVER); beast(h, -1, SILVER); fur(h, '#e8e4dc');
      helmet(j.head, '#e6eaef', { metal: 0.8, rough: 0.25, smooth: true });
      box(0.07, 0.04, 0.05, '#d4a017', j.head, 0, 0.15, 0.05, GOLD);           // the lion's face over the brow
      for (let i = 0; i < 5; i++) { const m = box(0.02, 0.08, 0.02, '#e3b448', j.head, (i - 2) * 0.025, 0.17, -0.04); m.rotation.x = -0.6; }
      cape(h, side);
      const sp = spear(j.handR, pal, 0.86);
      point(sp, top(0.86) + 0.004, GOLDS, '#d4a017').scale.setScalar(1.12);
      return h;
    },
    'chu-du'(pal, side) {                      // the young admiral of Wu: dark red armour, a red plume, a sword
      const [h, j] = hero(pal, { armour: '#7a1f2a', skirt: '#efe6d2' });        // dark red plates over a pale skirt, hair down his back
      beast(h, 1); longHair(j.head);
      helmet(j.head, '#d9b65a', GOLDS);
      const plume = group(j.head, 0, 0.16, -0.02); plume.rotation.x = -0.4;
      cyl(0.004, 0.018, 0.16, '#d8282a', plume, 0, 0.08, 0, 8, SMOOTH);
      cape(h, side); sword(j.handR, pal);
      return h;
    },
    'tu-ma-y'(pal, side) {                     // the strategist of Wei: a black robe, a tall official's hat, a grey beard
      const [h, j] = hero(pal, { robe: '#20222c', beard: 'long', hair: '#8e8e94' });
      box(0.036, 0.43, 0.005, '#4a2a66', h, 0, 0.245, 0.0735).rotation.x = -0.1;   // purple down the front of the black robe
      longHair(j.head, '#8e8e94'); whiskers(j.head, '#8e8e94');
      cap(j.head, 0.045, 0.053, 0.15, '#0e0e12', 0.172);
      cap(j.head, 0.056, 0.056, 0.018, '#c9a23a', 0.104, GOLDS);
      cape(h, side); sword(j.handR, pal);
      return h;
    },
    'ha-hau-uyen'(pal, side) {                 // Wei's swift general: steel-blue armour, a red crest along the helmet, two sabres
      const [h, j] = hero(pal, { armour: '#3c4c5e', beard: true });
      beast(h, 1, '#8c98a6'); beast(h, -1, '#8c98a6'); bow(h);
      helmet(j.head, '#8c98a6', STEELS);
      box(0.018, 0.05, 0.12, '#c0201a', j.head, 0, 0.17, -0.005);              // the crest, front to back
      cape(h, side); sabre(j.handR); sabre(j.handL);
      return h;
    },
    'manh-hoach'(pal, side) {                  // the king of the Nanman: dark skin, a crown of feathers, a tiger skin, a great sabre
      const [h, j] = hero(pal, { armour: '#c8862a', skin: '#8a5634', beard: 'bushy', skirt: '#6a4a2a' }, 1.3);
      fur(h, '#5a3a22');
      for (const [x, y] of [[-0.036, 0.47], [0, 0.485], [0.036, 0.47], [-0.02, 0.425], [0.02, 0.425]]) box(0.024, 0.009, 0.01, '#2a1a10', h, x, y, CHEST_Z - 0.003);   // tiger stripes
      cap(j.head, 0.054, 0.056, 0.03, '#d4a017', 0.112, GOLDS);       // a gold band...
      ['#c0201a', '#2f7a3a', '#e3b448', '#2a5aa8', '#c0201a'].forEach((c, i) => {                                  // ...with feathers fanned out above it
        const f = group(j.head, (i - 2) * 0.025, 0.13, -0.01); f.rotation.z = (2 - i) * 0.3;
        box(0.016, 0.13, 0.008, c, f, 0, 0.065, 0);
      });
      for (const sx of [-1, 1]) ball(0.012, '#d4a017', j.head, sx * 0.053, 0.04, 0, GOLD);                      // gold earrings
      cape(h, side);
      const len = 0.76, w = pole(j.handR, len, '#3a1a0a'), y = top(len);
      cut('glaive', w, 0, y - 0.04, 0.012).scale.set(1.4, 1.05, 1);
      tassel(w, y - 0.09);
      return h;
    },
    'khuong-duy'(pal, side) {                  // Zhuge Liang's heir: blue armour, a silver helmet with a red tassel, a long spear
      const [h, j] = hero(pal, { armour: '#2c4f86', skirt: '#dfe6ee' });
      beast(h, 1, SILVER); longHair(j.head);
      helmet(j.head, '#dfe4ea', STEELS);
      cyl(0.005, 0.005, 0.05, '#dfe4ea', j.head, 0, 0.18, 0, 4, STEEL);
      cyl(0.03, 0.006, 0.06, '#c0201a', j.head, 0, 0.21, 0, 6);
      cape(h, side);
      const sp = spear(j.handR, pal, 0.88);
      cyl(0.014, 0.014, 0.02, '#c0201a', sp, 0, top(0.88) - 0.06, 0, 6);
      sword(j.handL, pal).rotation.x = 0.4;
      return h;
    },
    'chuc-dung'(pal, side) {                   // Lady Zhurong: hair in a high bun with feathers, flying knives in both hands
      const [h, j] = hero(pal, { armour: '#9a4a2a', skin: '#b67a52', hair: '#1a1010', lady: true }, 1.08);
      browBand(j.head, '#d4a017', '#2f7a3a', 0.1); longHair(j.head); tails(j.head, '#c0201a', 0.12, 0.13);
      sball(0.036, '#1a1010', j.head, 0, 0.14, -0.022);                       // hair in a high bun
      for (const sx of [-1, 1]) {                                              // two long feathers from the bun
        const f = group(j.head, sx * 0.02, 0.18, -0.04); f.rotation.z = -sx * 0.5; f.rotation.x = -0.3;
        box(0.012, 0.2, 0.006, '#e3b448', f, 0, 0.1, 0);
      }
      cyl(0.066, 0.1, 0.075, '#2f7a3a', h, 0, 0.345, 0, 10);                     // a skirt of leaves over the armour
      for (const A of [j.handR, j.handL]) for (let i = -1; i <= 1; i++) {        // three throwing knives fanned in each hand
        const k = group(A); k.rotation.z = i * 0.35;
        cut('sabre', k, 0, 0.012, 0.004).scale.setScalar(0.38);
      }
      return h;
    },
    'lu-bo'(pal, side) {
      // dark red plates, a beast's head on each shoulder, a collar of fur; a gold crown on the topknot with a crest of
      // red feathers and the two long pheasant plumes; hair down his back
      const [h, j] = hero(pal, { armour: '#6e1c18' }, 1.28);
      beast(h, 1); beast(h, -1);
      fur(h);
      browBand(j.head); topknot(j.head, '#1a1010', 0.134);
      const crest = group(j.head, 0, 0.15, -0.016); crest.rotation.x = -0.75;
      cyl(0.004, 0.026, 0.2, '#d8282a', crest, 0, 0.1, 0, 8, SMOOTH).scale.set(1, 1, 0.5);
      const pl = group(j.head, 0, -0.045, 0); plumes(pl, '#e8c56a', 1.9);
      longHair(j.head);
      cape(h, side); skyPiercer(j.handR);
      return h;
    },
  };

  // a face-down piece (cờ úp): a figure in a dark hooded cloak, nothing in its hands, its side shown by the trim
  const HOOD = '#1d1815';
  function buildHooded(pal) {
    const h = humanoid(pal, { robe: HOOD }), j = h.userData.j;
    // the hood, open over the face
    mesh(geo('hood', () => new THREE.LatheGeometry(V2([[0.07, -0.03], [0.078, 0.06], [0.066, 0.13], [0.03, 0.19], [0.002, 0.215]]), 16, 0.62, Math.PI * 2 - 1.24)), cloth2(HOOD), j.head, 0, 0.02, -0.008);
    part(geo('hoodRim', () => new THREE.TorusGeometry(0.052, 0.006, 6, 18).scale(1, 1.25, 1)), pal.trim, j.head, 0, 0.078, 0.05, TRIM);
    cloak(h, HOOD);
    return h;
  }

  const BUILD = { 1: buildGeneral, 2: buildAdvisor, 3: buildElephant, 4: buildHorse, 5: buildChariot, 6: buildCatapult, 7: buildSoldier };

  // figures from model files (a glTF scene, loaded by whoever has one) in place of the built ones: by hero id, or by
  // piece type and palette ('7:1' a Red soldier, '7' a soldier of any side). Built facing +z, standing on y = 0,
  // about as tall as the built figure. Nodes named like the joints (legL, legR, armL, armR, head, body, trunk, arm,
  // stone, leg0..3, wheel0..1) move as the built ones do; a joint the model lacks is an empty group, so nothing breaks.
  const FIGURES = new Map();
  function setFigure(key, scene) { if (scene) FIGURES.set(String(key), scene); else FIGURES.delete(String(key)); }
  const JOINTS = ['legL', 'legR', 'armL', 'armR', 'head', 'body', 'trunk', 'arm', 'stone'];
  // a copy of a model; a skinned mesh of the copy is bound to the copy's own bones
  function copyModel(src) {
    const fig = src.clone(true), a = [], b = [];
    src.traverse(o => a.push(o)); fig.traverse(o => b.push(o));
    a.forEach((o, i) => {
      if (!o.isSkinnedMesh) return;
      b[i].bind(new THREE.Skeleton(o.skeleton.bones.map(x => b[a.indexOf(x)]), o.skeleton.boneInverses), o.bindMatrix);
      b[i].frustumCulled = false;                       // its bounds are those of the pose it was made in
    });
    return fig;
  }
  // The rest of a model's limb follows what gets moved, as flex does for the built figures: bones named shoL/R,
  // foreL/R and handL/R under armL/R, shinL/R under legL/R. With shins it kneels as they do (j.kneel, 0..1): down on
  // the right knee, and a little lower than the built ones go, its legs being longer.
  const KNEEL_DROP = 0.05;
  function flexModel(fig, j) {
    const get = n => fig.getObjectByName(n), limbs = ['L', 'R'].map(s => ['arm', 'sho', 'fore', 'hand', 'leg', 'shin'].map(n => get(n + s)));
    let skin = null; fig.traverse(o => { if (o.isSkinnedMesh) skin = skin || o; });
    if (!skin) return;
    const body = fig.children[0], y0 = body.position.y;
    if (limbs[0][5] && limbs[1][5]) j.kneeL = limbs[0][5];             // it has knees: scene.js brings it down on one
    skin.userData.flex = skin.onBeforeRender = () => {
      const k = j.kneel || 0;
      body.position.y = y0 - KNEEL_DROP * k;
      limbs.forEach(([arm, sho, fore, hand, leg, shin], right) => {
        if (leg && shin) { const a = leg.rotation.x, bend = a < 0 ? -a * 0.9 : a * 0.35; shin.rotation.x = right ? bend + (1.6 - bend) * k : bend + 0.25 * k; }
        if (arm && sho && fore && hand) {
          const a = arm.rotation.x, out = a > 0, reach = out ? -0.75 * a : a, bend = out ? -0.2 * a : 0.3 * a, tip = out ? 1.5 * a : 0.14 * a;
          sho.rotation.x = reach - a; fore.rotation.x = bend; hand.rotation.x = tip - reach - bend;
        }
      });
    };
  }
  function fromModel(src) {
    const fig = copyModel(src), j = {};
    fig.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    for (const name of JOINTS) j[name] = fig.getObjectByName(name) || group(fig);
    for (const s of ['L', 'R']) j['hand' + s] = fig.getObjectByName('hand' + s) || group(j['arm' + s], 0, -0.18, 0.03);   // what a hand holds
    const list = pre => [0, 1, 2, 3].map(i => fig.getObjectByName(pre + i)).filter(Boolean);
    if (list('leg').length) j.legs = list('leg');
    if (list('wheel').length) j.wheels = list('wheel');
    flexModel(fig, j);
    fig.userData.j = j;
    return fig;
  }

  // The figures that come as files: key (as for setFigure) -> [file, height on the board, what to add]. They are
  // fetched once the game is up (loadFigures), and stood on y = 0 at that height, centred; done(key) is told as each
  // arrives, since the figures built before then are the built ones.
  const FILES = {
    // the file has no blade: ours stands in his right hand, its butt on the ground (k: the model's scale)
    'quan-vu': ['src/figures/quan-vu.glb', 0.93, (f, k) => { const w = group(f.getObjectByName('handR'), 0.012, -0.115 / k, -0.02); w.scale.setScalar(1.15 / k); w.rotation.y = 0.5; glaive(w); }],
  };
  function loadFigures(done) {
    if (!THREE.GLTFLoader) return;
    const loader = new THREE.GLTFLoader(), box = new THREE.Box3();
    for (const [key, [url, tall, more]] of Object.entries(FILES)) loader.load(url, g => {
      const fig = new THREE.Group(), body = g.scene;
      box.setFromObject(body);
      const k = tall / (box.max.y - box.min.y);
      body.scale.multiplyScalar(k); body.position.set(-k * (box.min.x + box.max.x) / 2, -k * box.min.y, -k * (box.min.z + box.max.z) / 2);
      body.traverse(o => { if (o.isMesh) shine(o.material, 0.6); });
      fig.add(body);
      if (more) more(fig, k);
      setFigure(key, fig);
      if (done) done(key);
    }, undefined, () => {});
  }

  // the warriors' looks besides the painted one (skins.js): the whole figure cast in one metal; the banner keeps the
  // side's colours, so the sides still tell apart
  const STATUE = { 'tuong-dong': ['#8a5a2c', { metal: 0.85, rough: 0.36, smooth: true }], 'tuong-vang': ['#d6a93c', { metal: 0.95, rough: 0.26, smooth: true }] };

  // Fewer things to draw: the meshes of a figure that move as one (all that hangs from the same joint) and share a
  // material become one mesh. The joints are the groups a figure names (userData.j) and those made by joint();
  // figures of a kind share what is merged.
  const fused = new Map();
  function fuseGeo(parts) {
    const pos = [], nor = [], uv = [], v = new THREE.Vector3(), nm = new THREE.Matrix3();
    for (const { o, m } of parts) {
      const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry, P = g.attributes.position, Q = g.attributes.normal, U = g.attributes.uv;
      nm.getNormalMatrix(m);
      for (let i = 0; i < P.count; i++) {
        v.fromBufferAttribute(P, i).applyMatrix4(m); pos.push(v.x, v.y, v.z);
        v.fromBufferAttribute(Q, i).applyMatrix3(nm).normalize(); nor.push(v.x, v.y, v.z);
        uv.push(U ? U.getX(i) : 0, U ? U.getY(i) : 0);
      }
      if (g !== o.geometry) g.dispose();
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    return out;
  }
  function fuse(fig) {
    fig.updateMatrixWorld(true);
    const keep = new Set(), lots = new Map(), inv = new THREE.Matrix4();
    for (const v of Object.values(fig.userData.j || {})) for (const o of Array.isArray(v) ? v : [v]) if (o && o.isObject3D) keep.add(o);
    fig.traverse(o => {
      if (!o.isMesh || keep.has(o) || o.userData.flex) return;          // a mesh that is itself moved, or moves others, stays as it is
      let owner = o.parent;
      while (owner !== fig && !owner.userData.joint && !keep.has(owner)) owner = owner.parent;
      const key = owner.uuid + o.material.uuid;
      if (!lots.has(key)) lots.set(key, { owner, material: o.material, parts: [] });
      lots.get(key).parts.push({ o, m: new THREE.Matrix4().copy(inv.copy(owner.matrixWorld).invert()).multiply(o.matrixWorld) });
    });
    for (const { owner, material, parts } of lots.values()) {
      if (parts.length < 2) continue;
      const key = parts.map(({ o, m }) => o.geometry.uuid + m.elements.map(v => v.toFixed(4)).join()).join('|');
      if (!fused.has(key)) fused.set(key, fuseGeo(parts));
      for (const { o } of parts) o.parent.remove(o);
      mesh(fused.get(key), material, owner);
    }
  }

  // The knees, elbows and hocks follow the joints that get moved as a figure is drawn, a frame behind; a figure posed
  // for a single picture (portraits.js) is settled by hand.
  function settle(w) { w.traverse(o => { if (o.userData.flex) o.userData.flex(); }); }

  // a warrior for a piece, facing the enemy; with a banner pole for the army view.
  // hero: id from heroes.js for a general led by that hero (its banner then bears the hero's character); skin: the
  // warriors' look (skins.js), painted if unknown
  // hidden: a face-down piece of cờ úp, whose banner shows only a question
  function warrior(piece, hero, skin, hidden) {
    const side = palKey(piece), type = typeOf(piece), pal = PAL[side];
    const led = type === XQ.K && HEROES.valid(hero) ? hero : '';
    const root = new THREE.Group();
    const model = (led && FIGURES.get(led)) || FIGURES.get(type + ':' + side) || FIGURES.get(String(type));
    const fig = hidden ? buildHooded(pal) : model ? fromModel(model) : led ? HERO_BUILD[led](pal, side) : BUILD[type](pal, side);
    if (STATUE[skin]) { const m = mat(...STATUE[skin]); fig.traverse(o => { if (o.isMesh) o.material = m; }); }
    if (hidden || !model) fuse(fig);
    root.add(fig);
    root.rotation.y = side === 1 ? Math.PI : 0;              // Red sits at +z and faces -z
    // banner on a pole, shown in the army view so the character stays readable
    const flag = group(root, -0.16, 0, -0.12);
    const tall = type === 1 ? 1.25 : 1.0;
    cyl(0.01, 0.01, tall, '#2a160a', flag, 0, tall / 2, 0, 4);
    ball(0.025, pal.trim, flag, 0, tall + 0.01, 0, { metal: 0.6, rough: 0.3 });
    const cloth = new THREE.Mesh(geo('banner', () => { const p = new THREE.PlaneGeometry(0.3, 0.41); p.translate(0.15, 0, 0); return p; }),
      new THREE.MeshStandardMaterial({ map: bannerTexture(piece, hidden ? '?' : led ? HEROES.byId[led].han : han(piece)), side: THREE.DoubleSide, roughness: 0.85 }));
    cloth.position.y = tall - 0.24; cloth.castShadow = true; flag.add(cloth);
    root.userData = { fig, j: fig.userData.j || {}, flag, cloth, type, side, hero: led };
    return root;
  }

  return { board, sanguoBoard, wet, riverDist, WATER_Y, REFLECT, table, lantern, disc, warrior, settle, setFigure, loadFigures, setEnvMap, faceTexture, clearTextureCache, palKey, typeOf, han, DISC_H, DISC_R, PAL, BRUSH };
})();
