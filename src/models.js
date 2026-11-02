// models.js — everything on the table, built from code: the board texture, the round pieces with their
// brush-written characters, and a low-poly Three Kingdoms warrior for every piece type.
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
  };
  const pieceLook = id => PIECE_LOOK[id] || PIECE_LOOK.nga;
  const inkOf = (piece, look) => (look.ink && look.ink[palKey(piece)]) || PAL[palKey(piece)].ink;
  function faceTexture(piece, skin) {
    const key = piece + (PIECE_LOOK[skin] ? skin : 'nga');
    if (faceCache.has(key)) return faceCache.get(key);
    const look = pieceLook(skin), ink = inkOf(piece, look), ch = han(piece);
    const t = canvas(256, 256, (g, w) => {
      const gr = g.createRadialGradient(w / 2, w / 2, 20, w / 2, w / 2, w / 2);
      gr.addColorStop(0, look.face[0]); gr.addColorStop(1, look.face[1]);
      g.fillStyle = gr; g.fillRect(0, 0, w, w);
      g.strokeStyle = ink; g.lineWidth = 7; g.beginPath(); g.arc(w / 2, w / 2, w / 2 - 22, 0, Math.PI * 2); g.stroke();
      g.lineWidth = 2; g.beginPath(); g.arc(w / 2, w / 2, w / 2 - 34, 0, Math.PI * 2); g.stroke();
      g.fillStyle = ink; g.font = `bold 150px ${BRUSH}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(ch, w / 2, w / 2 + 8);
    });
    faceCache.set(key, t);
    return t;
  }
  // the same rings and character cut into the face, for its normal map
  const reliefCache = new Map();
  function faceRelief(piece) {
    if (reliefCache.has(piece)) return reliefCache.get(piece);
    const ch = han(piece);
    const t = reliefTexture(256, 256, (g, w) => {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, w);
      g.strokeStyle = '#555555'; g.lineWidth = 10; g.beginPath(); g.arc(w / 2, w / 2, w / 2 - 22, 0, Math.PI * 2); g.stroke();
      g.lineWidth = 4; g.beginPath(); g.arc(w / 2, w / 2, w / 2 - 34, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#606060'; g.font = `bold 150px ${BRUSH}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(ch, w / 2, w / 2 + 8);
    }, 2.5);
    reliefCache.set(piece, t);
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
  function disc(piece, small, skin) {
    const g = new THREE.Group(), look = pieceLook(skin);
    const body = mesh(discGeo(), discBody(PIECE_LOOK[skin] ? skin : 'nga'), g);
    // a thin coloured band around the side tells the sides apart from any angle
    mesh(geo('band', () => new THREE.CylinderGeometry(DISC_R + 0.008, DISC_R + 0.008, 0.05, 48, 1, true)), mat(inkOf(piece, look)), g, 0, DISC_H / 2, 0);
    // the face, with its rings and character cut into it
    const face = new THREE.Mesh(geo('face', () => new THREE.CircleGeometry(DISC_R - LIP, 48)),
      new THREE.MeshStandardMaterial({ map: faceTexture(piece, skin), normalMap: faceRelief(piece), roughness: Math.min(0.7, look.rough + 0.15), metalness: (look.metal || 0) * 0.6 }));
    face.rotation.x = -Math.PI / 2; face.position.y = DISC_H - SINK + 0.001; face.receiveShadow = true; g.add(face);
    g.userData = { body, face };
    if (small) g.scale.setScalar(0.62);
    return g;
  }

  // ---------- warriors ----------
  // humanoid with named joints: legs, armL, armR (pivot at the shoulder), head. Rounded and smooth: tapered legs in
  // boots, a chest that narrows to a belted waist, round shoulder plates, bracers, a face with brows and a nose
  function humanoid(pal, o = {}) {
    const g = group(), j = {};
    const armour = o.armour || pal.main, cloth = o.robe || armour, skin = o.skin || SKIN, hair = o.hair || '#1a1010';
    if (!o.noLegs) {
      j.legL = group(g, -0.05, 0.22, 0); j.legR = group(g, 0.05, 0.22, 0);
      for (const L of [j.legL, j.legR]) {
        part(geo('shin', () => new THREE.CylinderGeometry(0.036, 0.029, 0.18, 10)), pal.dark, L, 0, -0.09, 0);
        part(geo('boot', () => new THREE.SphereGeometry(0.04, 10, 8).scale(0.85, 0.7, 1.4)), '#2a1a10', L, 0, -0.19, 0.012);
      }
    }
    if (o.robe) {                                                        // a long robe flaring to a trimmed hem
      part(lathe('robe', [[0.17, 0.01], [0.15, 0.06], [0.125, 0.16], [0.1, 0.31]]), cloth, g, 0, 0, 0);
      part(geo('hem', () => new THREE.CylinderGeometry(0.172, 0.172, 0.02, 16, 1, true)), pal.trim, g, 0, 0.02, 0, TRIM);
    } else {                                                             // an armoured skirt
      part(lathe('skirt', [[0.135, -0.11], [0.112, -0.05], [0.098, 0]]), armour, g, 0, 0.27, 0);
      part(geo('skirtHem', () => new THREE.CylinderGeometry(0.137, 0.137, 0.015, 14, 1, true)), pal.trim, g, 0, 0.165, 0, TRIM);
    }
    part(lathe('chest', [[0, 0], [0.078, 0.005], [0.1, 0.09], [0.1, 0.13], [0.085, 0.165], [0.035, 0.185], [0, 0.185]], 0.62), cloth, g, 0, 0.24, 0);
    if (o.robe) part(geo('sash', () => new THREE.TorusGeometry(0.1, 0.012, 6, 18).rotateX(Math.PI / 2).scale(1, 1, 0.66)), pal.trim, g, 0, 0.3, 0, TRIM);
    else {
      part(geo('belt', () => new THREE.TorusGeometry(0.08, 0.012, 6, 18).rotateX(Math.PI / 2).scale(1, 1, 0.66)), pal.trim, g, 0, 0.255, 0, TRIM);
      part(geo('mirror', () => new THREE.CylinderGeometry(0.03, 0.03, 0.01, 16).rotateX(Math.PI / 2)), pal.trim, g, 0, 0.35, 0.062, TRIM);   // the breast mirror
      for (const sx of [-1, 1]) {
        const pad = part(geo('pauldron', () => new THREE.SphereGeometry(0.052, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.05, 0.75, 1)), pal.trim, g, sx * 0.118, 0.395, 0, TRIM);
        pad.rotation.z = -sx * 0.45;
      }
    }
    j.armL = group(g, -0.13, 0.4, 0); j.armR = group(g, 0.13, 0.4, 0);
    for (const A of [j.armL, j.armR]) {
      if (o.robe) part(geo('sleeve', () => new THREE.CylinderGeometry(0.032, 0.058, 0.16, 10)), cloth, A, 0, -0.085, 0);
      else {
        part(geo('upperArm', () => new THREE.CapsuleGeometry(0.026, 0.08, 4, 8)), cloth, A, 0, -0.055, 0);
        part(geo('bracer', () => new THREE.CylinderGeometry(0.029, 0.033, 0.065, 10)), pal.trim, A, 0, -0.13, 0, TRIM);
      }
      part(geo('hand', () => new THREE.SphereGeometry(0.028, 10, 8)), skin, A, 0, -0.18, 0.01);
    }
    part(geo('neck', () => new THREE.CylinderGeometry(0.026, 0.03, 0.05, 10)), skin, g, 0, 0.425, 0);
    j.head = group(g, 0, 0.43, 0);
    part(geo('head', () => new THREE.SphereGeometry(0.056, 16, 12).scale(0.94, 1.08, 1)), skin, j.head, 0, 0.065, 0);
    part(geo('hair', () => new THREE.SphereGeometry(0.06, 14, 10, Math.PI, Math.PI, 0, Math.PI * 0.62).scale(0.94, 1.08, 1)), hair, j.head, 0, 0.065, -0.004);
    for (const sx of [-1, 1]) {
      part(geo('eye', () => new THREE.SphereGeometry(0.0085, 6, 5)), '#141010', j.head, sx * 0.021, 0.07, 0.05);
      box(0.026, 0.007, 0.008, hair, j.head, sx * 0.022, 0.085, 0.05).rotation.z = sx * 0.25;   // brows, frowning
    }
    part(geo('nose', () => new THREE.ConeGeometry(0.011, 0.026, 6).rotateX(Math.PI / 2.4)), skin, j.head, 0, 0.058, 0.056);
    // beard: true = short; 'long' falls to the chest; 'bushy' covers the jaw
    if (o.beard) part(geo('stache', () => new THREE.CapsuleGeometry(0.007, 0.04, 3, 6).rotateZ(Math.PI / 2)), hair, j.head, 0, 0.044, 0.054);
    if (o.beard === 'long') part(geo('beardLong', () => new THREE.ConeGeometry(0.034, 0.2, 8).rotateX(Math.PI).scale(1, 1, 0.6)), hair, j.head, 0, -0.045, 0.062).rotation.x = -0.25;
    else if (o.beard === 'bushy') part(geo('beardBushy', () => new THREE.SphereGeometry(0.05, 10, 8).scale(1.15, 0.8, 0.7)), hair, j.head, 0, 0.022, 0.035);
    else if (o.beard) part(geo('beardShort', () => new THREE.ConeGeometry(0.022, 0.05, 8).rotateX(Math.PI).scale(1, 1, 0.7)), hair, j.head, 0, 0.012, 0.05);
    g.userData.j = j;
    return g;
  }
  // weapons are added to the right hand (armR), pointing up
  function spear(p, pal, len = 0.62) {
    const w = group(p, 0, -0.18, 0.03);
    cyl(0.009, 0.009, len, WOOD, w, 0, len * 0.35, 0, 5);
    cyl(0, 0.022, 0.09, IRON, w, 0, len * 0.35 + len / 2 + 0.04, 0, 5, { metal: 0.8, rough: 0.3 });
    cyl(0.03, 0.012, 0.04, '#c0201a', w, 0, len * 0.35 + len / 2 - 0.02, 0, 6);
    return w;
  }
  function sword(p, pal) {
    const w = group(p, 0, -0.18, 0.03);
    box(0.018, 0.34, 0.035, '#e8eef4', w, 0, 0.21, 0, { metal: 0.9, rough: 0.2 });
    box(0.09, 0.02, 0.04, pal.trim, w, 0, 0.035, 0, { metal: 0.7, rough: 0.3 });
    box(0.025, 0.07, 0.025, '#3a1a0a', w, 0, -0.01, 0);
    return w;
  }
  function halberd(p, pal) {
    const w = spear(p, pal, 0.7);
    box(0.09, 0.045, 0.012, IRON, w, 0.05, 0.6, 0, { metal: 0.8, rough: 0.3 });
    return w;
  }

  // a round helmet over the head, with a brim and a neck guard behind
  function helmet(head, color, o) {
    part(geo('helm', () => new THREE.SphereGeometry(0.066, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5).scale(0.96, 1, 1)), color, head, 0, 0.085, 0, o);
    part(geo('helmBrim', () => new THREE.TorusGeometry(0.064, 0.008, 6, 20).rotateX(Math.PI / 2)), color, head, 0, 0.088, 0, o);
    part(geo('neckGuard', () => new THREE.CylinderGeometry(0.068, 0.078, 0.05, 14, 1, true, Math.PI * 0.6, Math.PI * 0.8)), color, head, 0, 0.065, 0, o);
  }
  // two long pheasant feathers on a helmet, the mark of a famous general
  function plumes(head, color, len = 1) {
    for (const sx of [-1, 1]) {
      const f = group(head, sx * 0.03, 0.2, -0.01);
      f.rotation.z = -sx * 0.35; f.rotation.x = -0.35;
      box(0.014, 0.22 * len, 0.014, color, f, 0, 0.11 * len, 0);
      const tip = group(f, 0, 0.22 * len, 0); tip.rotation.x = -0.7; tip.rotation.z = -sx * 0.3;
      box(0.012, 0.16 * len, 0.012, color, tip, 0, 0.08 * len, 0);
    }
  }
  // generals wear a cape in their side's colour, which also tells the sides apart when a hero leads them
  function cape(h, side) {
    const c = group(h, 0, 0.42, -0.07); c.rotation.x = 0.18;
    box(0.24, 0.36, 0.02, CAPE[side], c, 0, -0.18, 0);
    h.userData.j.cape = c;
  }
  // a white feather fan held up in front (j.restArm keeps the arm raised between moves)
  function featherFan(h) {
    const j = h.userData.j, fan = group(j.armR, 0, -0.18, 0.04);
    cyl(0.008, 0.008, 0.1, WOOD, fan, 0, 0.04, 0, 4);
    const leaf = mesh(geo('fan', () => new THREE.CircleGeometry(0.09, 7, 0, Math.PI)), new THREE.MeshStandardMaterial({ color: '#f4f1e8', side: THREE.DoubleSide, flatShading: true, roughness: 0.9 }), fan, 0, 0.1, 0);
    leaf.rotation.z = -Math.PI / 2; leaf.rotation.y = Math.PI / 2;
    j.armR.rotation.x = j.restArm = -0.6;
  }

  function buildGeneral(pal, side) {
    const h = humanoid(pal, { armour: ARMOUR[side], beard: true }), j = h.userData.j;
    helmet(j.head, pal.trim, { metal: 0.7, rough: 0.3, smooth: true });
    cyl(0.018, 0.028, 0.05, pal.trim, j.head, 0, 0.17, 0, 10, { metal: 0.7, rough: 0.3, smooth: true });
    plumes(j.head, pal.plume);
    cape(h, side);
    sword(j.armR, pal);
    h.scale.setScalar(1.18);
    return h;
  }
  function buildAdvisor(pal, side) {
    const h = humanoid(pal, { robe: ROBE[side], noLegs: true, beard: true }), j = h.userData.j;
    // scholar's hat
    box(0.15, 0.025, 0.11, '#1a1010', j.head, 0, 0.125, 0);
    box(0.08, 0.06, 0.08, '#1a1010', j.head, 0, 0.16, 0);
    featherFan(h);
    return h;
  }
  function buildSoldier(pal) {
    const h = humanoid(pal), j = h.userData.j;
    helmet(j.head, pal.dark, { metal: 0.4, rough: 0.5, smooth: true });
    cyl(0.003, 0.012, 0.05, pal.trim, j.head, 0, 0.165, 0, 6, { metal: 0.6, rough: 0.35, smooth: true });   // the spike...
    cyl(0.018, 0.006, 0.04, pal.plume, j.head, 0, 0.2, 0, 8, SMOOTH);                                       // ...and its tassel
    spear(j.armR, pal);
    const shield = group(j.armL, -0.04, -0.12, 0.03);
    const s = cyl(0.1, 0.1, 0.025, pal.main, shield, 0, 0, 0, 18, SMOOTH); s.rotation.z = Math.PI / 2;
    part(geo('shieldRim', () => new THREE.TorusGeometry(0.1, 0.01, 6, 24).rotateY(Math.PI / 2)), pal.trim, shield, 0, 0, 0, TRIM);
    const boss = sball(0.032, pal.trim, shield, -0.015, 0, 0, TRIM); boss.scale.set(0.6, 1, 1);
    h.scale.setScalar(0.92);
    return h;
  }
  function buildHorse(pal, side) {
    const g = group(), j = {};
    const coat = pal.horse, dark = '#1a0f08';
    const body = group(g, 0, 0.32, 0); j.body = body;
    part(geo('horseBody', () => new THREE.CapsuleGeometry(0.078, 0.22, 6, 14).rotateX(Math.PI / 2).scale(0.95, 1, 1)), coat, body, 0, 0, 0);
    part(geo('saddleCloth', () => new THREE.CylinderGeometry(0.088, 0.088, 0.22, 14, 1, true, Math.PI * 0.4, Math.PI * 1.2).rotateX(Math.PI / 2)), pal.main, body, 0, 0.012, -0.01);
    part(geo('saddle', () => new THREE.SphereGeometry(0.06, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.5, 1.3)), '#3a2210', body, 0, 0.075, -0.01);
    const neck = group(body, 0, 0.05, 0.16); neck.rotation.x = j.neckRest = -0.6; j.neck = neck;
    part(geo('horseNeck', () => new THREE.CylinderGeometry(0.042, 0.062, 0.21, 12).scale(0.85, 1, 1)), coat, neck, 0, 0.09, 0);
    box(0.018, 0.2, 0.05, dark, neck, 0, 0.1, -0.045);                       // mane
    const head = group(neck, 0, 0.19, 0.02); head.rotation.x = 1.0;
    part(geo('horseHead', () => new THREE.CylinderGeometry(0.03, 0.045, 0.17, 12).rotateX(Math.PI / 2).scale(0.85, 1, 1)), coat, head, 0, 0, 0.06);
    part(geo('muzzle', () => new THREE.SphereGeometry(0.033, 10, 8).scale(0.85, 0.9, 1)), coat, head, 0, -0.004, 0.145);
    for (const sx of [-1, 1]) {
      part(geo('horseEar', () => new THREE.ConeGeometry(0.013, 0.05, 6)), coat, head, sx * 0.025, 0.045, 0.0).rotation.z = -sx * 0.25;
      part(geo('eye', () => new THREE.SphereGeometry(0.0085, 6, 5)), '#141010', head, sx * 0.035, 0.018, 0.05);
    }
    const tail = group(body, 0, 0.03, -0.19); tail.rotation.x = 0.5;
    part(geo('horseTail', () => new THREE.ConeGeometry(0.035, 0.2, 8).rotateX(Math.PI)), dark, tail, 0, -0.09, 0);
    j.legs = [];
    for (const [x, z] of [[-0.05, 0.13], [0.05, 0.13], [-0.05, -0.13], [0.05, -0.13]]) {
      const L = group(body, x, -0.07, z);
      part(geo('horseLeg', () => new THREE.CylinderGeometry(0.026, 0.017, 0.2, 8)), coat, L, 0, -0.1, 0);
      part(geo('hoof', () => new THREE.CylinderGeometry(0.02, 0.024, 0.035, 8)), dark, L, 0, -0.215, 0);
      j.legs.push(L);
    }
    // the rider sits on the saddle, lance in hand
    const rider = humanoid(pal, { noLegs: true });
    rider.position.set(0, 0.21, -0.01); rider.scale.setScalar(0.82); body.add(rider);
    const rj = rider.userData.j;
    helmet(rj.head, pal.trim, TRIM);
    cyl(0.016, 0.005, 0.07, pal.plume, rj.head, 0, 0.18, 0, 8, SMOOTH);
    halberd(rj.armR, pal);
    j.armR = rj.armR; j.armL = rj.armL; j.head = rj.head;
    g.userData.j = j;
    return g;
  }
  function buildChariot(pal, side) {
    const g = group(), j = {};
    box(0.32, 0.05, 0.28, WOOD, g, 0, 0.18, 0);
    for (const sx of [-1, 1]) box(0.02, 0.12, 0.28, pal.main, g, sx * 0.15, 0.26, 0);
    box(0.32, 0.12, 0.02, pal.main, g, 0, 0.26, 0.13);
    box(0.03, 0.03, 0.34, WOOD, g, 0, 0.16, 0.3);                           // draught pole
    j.wheels = [];
    for (const sx of [-1, 1]) {
      const w = group(g, sx * 0.19, 0.15, -0.02);
      const rim = cyl(0.15, 0.15, 0.03, '#4a2a14', w, 0, 0, 0, 20, SMOOTH); rim.rotation.z = Math.PI / 2;
      for (let k = 0; k < 4; k++) { const sp = box(0.012, 0.27, 0.02, '#2a160a', w, 0, 0, 0); sp.rotation.x = (k * Math.PI) / 4; }
      j.wheels.push(w);
    }
    // canopy
    cyl(0.008, 0.008, 0.55, WOOD, g, 0.09, 0.45, -0.08, 4);
    cyl(0.005, 0.2, 0.08, pal.main, g, 0.09, 0.73, -0.08, 8);
    const driver = humanoid(pal, { noLegs: true }); driver.position.set(-0.03, 0.12, 0); driver.scale.setScalar(0.85); g.add(driver);
    const dj = driver.userData.j;
    helmet(dj.head, pal.trim, TRIM);
    halberd(dj.armR, pal);
    j.armR = dj.armR; j.armL = dj.armL; j.head = dj.head;
    g.userData.j = j;
    return g;
  }
  function buildElephant(pal, side) {
    const g = group(), j = {}, grey = '#8d8f96';
    const body = group(g, 0, 0.34, 0); j.body = body;
    const b = sball(0.2, grey, body); b.scale.set(0.85, 0.8, 1.15);
    const head = group(body, 0, 0.06, 0.21);
    const hd = sball(0.12, grey, head); hd.scale.set(1, 1.05, 0.95);
    for (const sx of [-1, 1]) {
      const ear = part(geo('elephantEar', () => new THREE.SphereGeometry(0.09, 12, 8).scale(0.2, 1, 0.85)), '#7c7e86', head, sx * 0.12, 0.01, -0.03); ear.rotation.y = sx * 0.4;
      part(geo('eye', () => new THREE.SphereGeometry(0.0085, 6, 5)), '#141010', head, sx * 0.07, 0.04, 0.09);
    }
    // trunk in three segments, curling down
    let t = group(head, 0, -0.04, 0.1); t.rotation.x = 0.5; j.trunk = t;
    for (let k = 0; k < 3; k++) { cyl(0.04 - k * 0.008, 0.045 - k * 0.008, 0.11, grey, t, 0, -0.05, 0, 12, SMOOTH); const n = group(t, 0, -0.1, 0); n.rotation.x = 0.35; t = n; }
    for (const sx of [-1, 1]) { const tusk = cyl(0.004, 0.02, 0.14, '#f3ecd8', head, sx * 0.06, -0.07, 0.08, 8, SMOOTH); tusk.rotation.x = -1.1; }
    j.legs = [];
    for (const [x, z] of [[-0.09, 0.12], [0.09, 0.12], [-0.09, -0.12], [0.09, -0.12]]) {
      const L = group(body, x, -0.12, z); cyl(0.05, 0.055, 0.22, grey, L, 0, -0.1, 0, 12, SMOOTH); j.legs.push(L);
    }
    // howdah with the side's cloth and a little canopy
    box(0.26, 0.04, 0.3, pal.main, body, 0, 0.14, 0);
    box(0.18, 0.1, 0.18, WOOD, body, 0, 0.21, -0.02);
    for (const [x, z] of [[-0.08, 0.06], [0.08, 0.06], [-0.08, -0.1], [0.08, -0.1]]) cyl(0.006, 0.006, 0.14, WOOD, body, x, 0.33, z, 4);
    box(0.2, 0.03, 0.2, pal.trim, body, 0, 0.41, -0.02, { metal: 0.4, rough: 0.5 });
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
  const GOLD = { metal: 0.7, rough: 0.3 }, STEEL = { metal: 0.9, rough: 0.2 };
  // pole arms are held in the right hand like the spear; top(len) is the height of the pole's end
  function pole(p, len, color) { const w = group(p, 0, -0.18, 0.03); cyl(0.01, 0.01, len, color, w, 0, len * 0.35, 0, 5); return w; }
  const top = len => len * 0.35 + len / 2;
  const tassel = (w, y) => cyl(0.032, 0.012, 0.05, '#c0201a', w, 0, y, 0, 6);
  function glaive(p) {                      // Green Dragon Crescent Blade: a broad curved blade
    const len = 0.8, w = pole(p, len, '#24402a'), y = top(len);
    const b = box(0.06, 0.2, 0.012, '#e8eef4', w, 0.035, y + 0.06, 0, STEEL); b.rotation.z = -0.2;
    box(0.035, 0.03, 0.03, '#d4a017', w, 0, y - 0.05, 0, GOLD);
    tassel(w, y - 0.1);
  }
  function serpentSpear(p) {                // Zhang Fei's spear: a long wavy blade
    const len = 0.84, w = pole(p, len, '#1e1e22'), y = top(len);
    for (let i = 0; i < 4; i++) { const s = box(0.016, 0.05, 0.01, '#d8dee6', w, i % 2 ? 0.012 : -0.012, y + 0.025 + i * 0.04, 0, STEEL); s.rotation.z = i % 2 ? 0.45 : -0.45; }
    tassel(w, y - 0.02);
  }
  function skyPiercer(p) {                  // Lü Bu's halberd: a spear point with a crescent blade on each side
    const len = 0.84, w = pole(p, len, '#3a1a0a'), y = top(len);
    cyl(0, 0.02, 0.11, '#e8eef4', w, 0, y + 0.05, 0, 5, STEEL);
    for (const sx of [-1, 1]) {
      const c = mesh(geo('crescent', () => new THREE.TorusGeometry(0.055, 0.012, 4, 10, Math.PI)), mat('#e8eef4', STEEL), w, sx * 0.05, y - 0.03, 0);
      c.rotation.z = -sx * Math.PI / 2;
    }
    tassel(w, y - 0.1);
  }
  function sabre(p) {                       // a broad, slightly curved single-edged blade
    const w = group(p, 0, -0.18, 0.03);
    const b = box(0.032, 0.26, 0.01, '#e8eef4', w, 0.008, 0.17, 0, STEEL); b.rotation.z = -0.1;
    box(0.07, 0.016, 0.03, '#d4a017', w, 0, 0.035, 0, GOLD);
    box(0.022, 0.07, 0.022, '#3a1a0a', w, 0, -0.01, 0);
    return w;
  }
  const hero = (pal, o, scale = 1.18) => { const h = humanoid(pal, o); h.scale.setScalar(scale); return [h, h.userData.j]; };
  const HERO_BUILD = {
    'quan-vu'(pal, side) {
      const [h, j] = hero(pal, { armour: '#2f6b3a', skin: '#b4503a', beard: 'long' });
      box(0.11, 0.05, 0.11, '#24502c', j.head, 0, 0.12, 0); box(0.06, 0.05, 0.06, '#24502c', j.head, 0, 0.16, -0.01);   // green cloth cap
      cape(h, side); glaive(j.armR);
      return h;
    },
    'truong-phi'(pal, side) {
      const [h, j] = hero(pal, { armour: '#2b2b30', skin: '#c28860', beard: 'bushy' }, 1.26);
      cyl(0.064, 0.07, 0.07, '#3a3a40', j.head, 0, 0.12, 0, 8, { metal: 0.6, rough: 0.4 });
      cyl(0.004, 0.004, 0.08, '#c0201a', j.head, 0, 0.19, 0, 3);
      cape(h, side); serpentSpear(j.armR);
      return h;
    },
    'trieu-van'(pal, side) {
      const [h, j] = hero(pal, { armour: '#cfd5dc' });
      cyl(0.062, 0.068, 0.07, '#e6eaef', j.head, 0, 0.12, 0, 8, { metal: 0.8, rough: 0.25 });
      const tuft = group(j.head, 0, 0.17, -0.02); tuft.rotation.x = -0.5;
      box(0.03, 0.15, 0.03, '#ffffff', tuft, 0, 0.075, 0);
      cape(h, side); spear(j.armR, pal, 0.8);
      return h;
    },
    'gia-cat-luong'(pal, side) {
      const [h, j] = hero(pal, { robe: '#ece6d6', noLegs: true, beard: true });
      box(0.1, 0.12, 0.09, '#1a1418', j.head, 0, 0.15, -0.005);                 // tall silk cap with two ribbons
      for (const sx of [-1, 1]) { const r = box(0.012, 0.12, 0.004, '#1a1418', j.head, sx * 0.03, 0.08, -0.055); r.rotation.z = sx * 0.15; }
      featherFan(h);
      return h;
    },
    'luu-bi'(pal, side) {
      const [h, j] = hero(pal, { armour: '#c9a23a', beard: true });
      cyl(0.055, 0.06, 0.05, '#d9b65a', j.head, 0, 0.12, 0, 8, GOLD);            // crown: a flat board on a gold cap
      box(0.16, 0.012, 0.09, '#1a1010', j.head, 0, 0.16, 0);
      for (const x of [-0.06, -0.03, 0, 0.03, 0.06]) cyl(0.003, 0.003, 0.05, '#d9b65a', j.head, x, 0.13, 0.045, 3);
      cape(h, side); sword(j.armR, pal); sword(j.armL, pal);
      return h;
    },
    'tao-thao'(pal, side) {
      const [h, j] = hero(pal, { robe: '#3b2244', beard: true });
      box(0.1, 0.09, 0.1, '#141016', j.head, 0, 0.14, -0.005);                  // official's hat with two side wings
      for (const sx of [-1, 1]) box(0.09, 0.02, 0.01, '#141016', j.head, sx * 0.09, 0.15, -0.05);
      cape(h, side); sword(j.armR, pal);
      return h;
    },
    'ton-quyen'(pal, side) {
      const [h, j] = hero(pal, { armour: '#1f5f5a', beard: true, hair: '#6b2f7a' });
      cyl(0.06, 0.066, 0.06, '#d9b65a', j.head, 0, 0.12, 0, 8, GOLD);
      for (let i = 0; i < 3; i++) cyl(0, 0.014, 0.05, '#d9b65a', j.head, (i - 1) * 0.035, 0.17, 0.02, 4, GOLD);
      cape(h, side); sword(j.armR, pal);
      return h;
    },
    // ---- earned in the campaign ----
    'hoang-trung'(pal, side) {                 // the old general: white hair and beard, a broad sabre, a bow on his back
      const [h, j] = hero(pal, { armour: '#8a6a2a', skin: '#d9a87e', beard: 'long', hair: '#e8e4dc' });
      cyl(0.062, 0.068, 0.06, '#c9b27a', j.head, 0, 0.12, 0, 8, GOLD);
      box(0.1, 0.03, 0.08, '#e8e4dc', j.head, 0, 0.1, -0.03);                   // white hair under the helmet
      const bow = mesh(geo('bow', () => new THREE.TorusGeometry(0.17, 0.008, 4, 12, Math.PI)), mat('#4a2a12'), h, 0.04, 0.33, -0.08);
      bow.rotation.z = -1.2;
      cape(h, side);
      const len = 0.72, w = pole(j.armR, len, '#4a2a12'), y = top(len);
      const b = box(0.075, 0.22, 0.014, '#e8eef4', w, 0.045, y + 0.05, 0, STEEL); b.rotation.z = -0.12;
      tassel(w, y - 0.08);
      return h;
    },
    'ma-sieu'(pal, side) {                     // silver armour, a lion-head helmet with a golden mane, a long spear
      const [h, j] = hero(pal, { armour: '#d8dde4' });
      cyl(0.064, 0.07, 0.07, '#e6eaef', j.head, 0, 0.12, 0, 8, { metal: 0.8, rough: 0.25 });
      box(0.07, 0.04, 0.05, '#d4a017', j.head, 0, 0.15, 0.05, GOLD);           // the lion's face over the brow
      for (let i = 0; i < 5; i++) { const m = box(0.02, 0.08, 0.02, '#e3b448', j.head, (i - 2) * 0.025, 0.17, -0.04); m.rotation.x = -0.6; }
      cape(h, side);
      const sp = spear(j.armR, pal, 0.86);
      cyl(0, 0.026, 0.1, '#d4a017', sp, 0, 0.86 * 0.35 + 0.43 + 0.05, 0, 5, GOLD);
      return h;
    },
    'chu-du'(pal, side) {                      // the young admiral of Wu: dark red armour, a red plume, a sword
      const [h, j] = hero(pal, { armour: '#7a1f2a' });
      cyl(0.06, 0.066, 0.06, '#d9b65a', j.head, 0, 0.12, 0, 8, GOLD);
      const plume = group(j.head, 0, 0.16, -0.02); plume.rotation.x = -0.4;
      box(0.028, 0.16, 0.028, '#d8282a', plume, 0, 0.08, 0);
      cape(h, side); sword(j.armR, pal);
      return h;
    },
    'tu-ma-y'(pal, side) {                     // the strategist of Wei: a black robe, a tall official's hat, a grey beard
      const [h, j] = hero(pal, { robe: '#20222c', beard: 'long', hair: '#8e8e94' });
      box(0.1, 0.16, 0.1, '#0e0e12', j.head, 0, 0.17, -0.005);
      box(0.12, 0.02, 0.12, '#c9a23a', j.head, 0, 0.1, 0, GOLD);
      cape(h, side); sword(j.armR, pal);
      return h;
    },
    'ha-hau-uyen'(pal, side) {                 // Wei's swift general: steel-blue armour, a red crest along the helmet, two sabres
      const [h, j] = hero(pal, { armour: '#3c4c5e', beard: true });
      cyl(0.062, 0.068, 0.07, '#8c98a6', j.head, 0, 0.12, 0, 8, STEEL);
      box(0.018, 0.05, 0.12, '#c0201a', j.head, 0, 0.17, -0.005);              // the crest, front to back
      cape(h, side); sabre(j.armR); sabre(j.armL);
      return h;
    },
    'manh-hoach'(pal, side) {                  // the king of the Nanman: dark skin, a crown of feathers, a tiger skin, a great sabre
      const [h, j] = hero(pal, { armour: '#c8862a', skin: '#8a5634', beard: 'bushy' }, 1.3);
      for (const [x, y] of [[-0.06, 0.3], [0, 0.34], [0.06, 0.3], [-0.03, 0.22], [0.03, 0.22]]) box(0.03, 0.012, 0.013, '#2a1a10', h, x, y, 0.062);   // tiger stripes
      cyl(0.058, 0.062, 0.03, '#d4a017', j.head, 0, 0.115, 0, 8, GOLD);       // a gold band...
      ['#c0201a', '#2f7a3a', '#e3b448', '#2a5aa8', '#c0201a'].forEach((c, i) => {                                  // ...with feathers fanned out above it
        const f = group(j.head, (i - 2) * 0.025, 0.13, -0.01); f.rotation.z = (2 - i) * 0.3;
        box(0.016, 0.13, 0.008, c, f, 0, 0.065, 0);
      });
      for (const sx of [-1, 1]) ball(0.012, '#d4a017', j.head, sx * 0.053, 0.04, 0, GOLD);                      // gold earrings
      cape(h, side);
      const len = 0.76, w = pole(j.armR, len, '#3a1a0a'), y = top(len);
      const b = box(0.09, 0.24, 0.014, '#e8eef4', w, 0.05, y + 0.05, 0, STEEL); b.rotation.z = -0.18;
      tassel(w, y - 0.09);
      return h;
    },
    'khuong-duy'(pal, side) {                  // Zhuge Liang's heir: blue armour, a silver helmet with a red tassel, a long spear
      const [h, j] = hero(pal, { armour: '#2c4f86' });
      cyl(0.062, 0.068, 0.07, '#dfe4ea', j.head, 0, 0.12, 0, 8, STEEL);
      cyl(0.005, 0.005, 0.05, '#dfe4ea', j.head, 0, 0.18, 0, 4, STEEL);
      cyl(0.03, 0.006, 0.06, '#c0201a', j.head, 0, 0.21, 0, 6);
      cape(h, side);
      const sp = spear(j.armR, pal, 0.88);
      cyl(0.014, 0.014, 0.02, '#c0201a', sp, 0, 0.88 * 0.35 + 0.44 - 0.04, 0, 6);
      sword(j.armL, pal).rotation.x = 0.4;
      return h;
    },
    'chuc-dung'(pal, side) {                   // Lady Zhurong: hair in a high bun with feathers, flying knives in both hands
      const [h, j] = hero(pal, { armour: '#9a4a2a', skin: '#b67a52', hair: '#1a1010' }, 1.12);
      box(0.106, 0.04, 0.1, '#1a1010', j.head, 0, 0.12, -0.005);              // hair over the brow
      ball(0.04, '#1a1010', j.head, 0, 0.16, -0.03);                          // the bun
      for (const sx of [-1, 1]) {                                              // two long feathers from the bun
        const f = group(j.head, sx * 0.02, 0.18, -0.04); f.rotation.z = -sx * 0.5; f.rotation.x = -0.3;
        box(0.012, 0.2, 0.006, '#e3b448', f, 0, 0.1, 0);
      }
      cyl(0.14, 0.15, 0.06, '#2f7a3a', h, 0, 0.19, 0, 8);                     // a skirt of leaves over the armour
      for (const A of [j.armR, j.armL]) for (let i = -1; i <= 1; i++) {        // three throwing knives fanned in each hand
        const k = group(A, 0, -0.18, 0.03); k.rotation.z = i * 0.35;
        box(0.012, 0.09, 0.004, '#e8eef4', k, 0, 0.05, 0, STEEL);
      }
      return h;
    },
    'lu-bo'(pal, side) {
      const [h, j] = hero(pal, { armour: '#8e2219' }, 1.26);
      cyl(0.062, 0.068, 0.07, '#d9b65a', j.head, 0, 0.12, 0, 8, GOLD);
      cyl(0.02, 0.03, 0.05, '#d9b65a', j.head, 0, 0.18, 0, 6, GOLD);
      plumes(j.head, '#ffcf4a', 1.7);
      cape(h, side); skyPiercer(j.armR);
      return h;
    },
  };

  const BUILD = { 1: buildGeneral, 2: buildAdvisor, 3: buildElephant, 4: buildHorse, 5: buildChariot, 6: buildCatapult, 7: buildSoldier };

  // figures from model files (a glTF scene, loaded by whoever has one) in place of the built ones: by hero id, or by
  // piece type and palette ('7:1' a Red soldier, '7' a soldier of any side). Built facing +z, standing on y = 0,
  // about as tall as the built figure. Nodes named like the joints (legL, legR, armL, armR, head, body, trunk, arm,
  // stone, leg0..3, wheel0..1) move as the built ones do; a joint the model lacks is an empty group, so nothing breaks.
  const FIGURES = new Map();
  function setFigure(key, scene) { if (scene) FIGURES.set(String(key), scene); else FIGURES.delete(String(key)); }
  const JOINTS = ['legL', 'legR', 'armL', 'armR', 'head', 'body', 'trunk', 'arm', 'stone'];
  function fromModel(src) {
    const fig = src.clone(true), j = {};
    fig.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    for (const name of JOINTS) j[name] = fig.getObjectByName(name) || group(fig);
    const list = pre => [0, 1, 2, 3].map(i => fig.getObjectByName(pre + i)).filter(Boolean);
    if (list('leg').length) j.legs = list('leg');
    if (list('wheel').length) j.wheels = list('wheel');
    fig.userData.j = j;
    return fig;
  }

  // the warriors' looks besides the painted one (skins.js): the whole figure cast in one metal; the banner keeps the
  // side's colours, so the sides still tell apart
  const STATUE = { 'tuong-dong': ['#8a5a2c', { metal: 0.85, rough: 0.36, smooth: true }], 'tuong-vang': ['#d6a93c', { metal: 0.95, rough: 0.26, smooth: true }] };

  // a warrior for a piece, facing the enemy; with a banner pole for the army view.
  // hero: id from heroes.js for a general led by that hero (its banner then bears the hero's character); skin: the
  // warriors' look (skins.js), painted if unknown
  function warrior(piece, hero, skin) {
    const side = palKey(piece), type = typeOf(piece), pal = PAL[side];
    const led = type === XQ.K && HEROES.valid(hero) ? hero : '';
    const root = new THREE.Group();
    const model = (led && FIGURES.get(led)) || FIGURES.get(type + ':' + side) || FIGURES.get(String(type));
    const fig = model ? fromModel(model) : led ? HERO_BUILD[led](pal, side) : BUILD[type](pal, side);
    if (STATUE[skin]) { const m = mat(...STATUE[skin]); fig.traverse(o => { if (o.isMesh) o.material = m; }); }
    root.add(fig);
    root.rotation.y = side === 1 ? Math.PI : 0;              // Red sits at +z and faces -z
    // banner on a pole, shown in the army view so the character stays readable
    const flag = group(root, -0.16, 0, -0.12);
    const tall = type === 1 ? 1.25 : 1.0;
    cyl(0.01, 0.01, tall, '#2a160a', flag, 0, tall / 2, 0, 4);
    ball(0.025, pal.trim, flag, 0, tall + 0.01, 0, { metal: 0.6, rough: 0.3 });
    const cloth = new THREE.Mesh(geo('banner', () => { const p = new THREE.PlaneGeometry(0.3, 0.41); p.translate(0.15, 0, 0); return p; }),
      new THREE.MeshStandardMaterial({ map: bannerTexture(piece, led ? HEROES.byId[led].han : han(piece)), side: THREE.DoubleSide, roughness: 0.85 }));
    cloth.position.y = tall - 0.24; cloth.castShadow = true; flag.add(cloth);
    root.userData = { fig, j: fig.userData.j || {}, flag, cloth, type, side, hero: led };
    return root;
  }

  return { board, sanguoBoard, wet, riverDist, WATER_Y, REFLECT, table, lantern, disc, warrior, setFigure, setEnvMap, faceTexture, clearTextureCache, palKey, typeOf, han, DISC_H, DISC_R, PAL, BRUSH };
})();
