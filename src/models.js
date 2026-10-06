// models.js — everything on the table, built from code: the board texture, the round pieces with their
// brush-written characters, and a low-poly Three Kingdoms warrior for every piece type.
// Red is the army of Shu (crimson and gold), Black is the army of Wei (ink blue and silver).
// One board step is 1 world unit; figures are built facing +z and stand on y = 0.
'use strict';
const MODELS = (() => {
  const BRUSH = '"LXGW WenKai TC", "KaiTi", "STKaiti", "Noto Serif SC", serif';
  const PAL = {
    1: { main: '#a8231b', dark: '#5c1310', trim: '#e3b448', cloth: '#7a1712', plume: '#ffcf4a', ink: '#a3201a', banner: '#b3261e', horse: '#8a4a24', metal: '#d9b65a' },
    '-1': { main: '#26344d', dark: '#121a29', trim: '#c9d3de', cloth: '#18233a', plume: '#6fb1ff', ink: '#1b1b1b', banner: '#22324c', horse: '#2b2b33', metal: '#c3ccd6' },
  };
  const SKIN = '#e5b88c', WOOD = '#6b4423', IRON = '#9aa3ad';
  const DISC_R = 0.43, DISC_H = 0.2;

  // ---------- shared materials and geometries ----------
  const mats = new Map(), geos = new Map();
  function mat(color, o = {}) {
    const k = color + (o.metal || 0) + (o.rough || 0) + (o.emissive || '');
    if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color, roughness: o.rough || 0.72, metalness: o.metal || 0, flatShading: true, emissive: o.emissive || '#000000' }));
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

  // board: 9 x 10 points one unit apart, one unit of margin, 100 px per unit
  function boardTexture() {
    return canvas(1000, 1100, (g, w, h) => {
      woodGrain(g, w, h, '#d9b277', 220, 7);
      const vg = g.createRadialGradient(w / 2, h / 2, 200, w / 2, h / 2, 760);
      vg.addColorStop(0, 'rgba(255, 230, 180, 0.12)'); vg.addColorStop(1, 'rgba(70, 30, 5, 0.35)');
      g.fillStyle = vg; g.fillRect(0, 0, w, h);
      const X = c => 100 + c * 100, Y = r => 100 + r * 100;
      g.strokeStyle = '#3b1d0b'; g.lineCap = 'round';
      g.lineWidth = 7; g.strokeRect(X(0) - 22, Y(0) - 22, 844, 944);
      g.lineWidth = 3;
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
      // the river: 楚河 (Chu River) and 漢界 (Han Border)
      g.fillStyle = 'rgba(59, 29, 11, 0.82)'; g.font = `bold 82px ${BRUSH}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      const ry = (Y(4) + Y(5)) / 2;
      g.save(); g.translate(X(2), ry); g.fillText('楚  河', 0, 0); g.restore();
      g.save(); g.translate(X(6), ry); g.rotate(Math.PI); g.fillText('漢  界', 0, 0); g.restore();
    });
  }
  function tableTexture() {
    return canvas(512, 512, (g, w, h) => { woodGrain(g, w, h, '#3a1e10', 160, 3); });
  }

  // the top of a piece: the character inside a ring, in the side's ink
  const faceCache = new Map();
  function faceTexture(piece) {
    if (faceCache.has(piece)) return faceCache.get(piece);
    const side = piece > 0 ? 1 : -1, ink = PAL[side].ink, ch = XQ.HAN[piece];
    const t = canvas(256, 256, (g, w) => {
      const gr = g.createRadialGradient(w / 2, w / 2, 20, w / 2, w / 2, w / 2);
      gr.addColorStop(0, '#f6e6c4'); gr.addColorStop(1, '#e2c792');
      g.fillStyle = gr; g.fillRect(0, 0, w, w);
      g.strokeStyle = ink; g.lineWidth = 7; g.beginPath(); g.arc(w / 2, w / 2, w / 2 - 22, 0, Math.PI * 2); g.stroke();
      g.lineWidth = 2; g.beginPath(); g.arc(w / 2, w / 2, w / 2 - 34, 0, Math.PI * 2); g.stroke();
      g.fillStyle = ink; g.font = `bold 150px ${BRUSH}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(ch, w / 2, w / 2 + 8);
    });
    faceCache.set(piece, t);
    return t;
  }
  // banner cloth for army view: the character in gold on the side's colour
  const bannerCache = new Map();
  function bannerTexture(piece) {
    if (bannerCache.has(piece)) return bannerCache.get(piece);
    const pal = PAL[piece > 0 ? 1 : -1];
    const t = canvas(128, 176, (g, w, h) => {
      g.fillStyle = pal.banner; g.fillRect(0, 0, w, h);
      g.fillStyle = pal.trim; g.fillRect(0, 0, w, 10); g.fillRect(0, h - 22, w, 6);
      for (let x = 0; x < w; x += 16) { g.beginPath(); g.moveTo(x, h - 16); g.lineTo(x + 8, h); g.lineTo(x + 16, h - 16); g.fill(); }
      g.fillStyle = pal.trim; g.font = `bold 96px ${BRUSH}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(XQ.HAN[piece], w / 2, h / 2 - 4);
    });
    bannerCache.set(piece, t);
    return t;
  }
  function clearTextureCache() { for (const t of faceCache.values()) t.dispose(); faceCache.clear(); for (const t of bannerCache.values()) t.dispose(); bannerCache.clear(); }

  // ---------- board and table ----------
  function board() {
    const g = new THREE.Group();
    const top = new THREE.MeshStandardMaterial({ map: boardTexture(), roughness: 0.88 });
    const side = new THREE.MeshStandardMaterial({ map: tableTexture(), color: '#8a5a32', roughness: 0.6 });
    const slab = new THREE.Mesh(new THREE.BoxGeometry(10, 0.36, 11), [side, side, top, side, side, side]);
    slab.position.y = -0.18; slab.receiveShadow = true; slab.castShadow = true; g.add(slab);
    // a darker lacquered rim and four feet
    const rim = new THREE.Mesh(new THREE.BoxGeometry(10.5, 0.2, 11.5), new THREE.MeshStandardMaterial({ color: '#2a120a', roughness: 0.35, metalness: 0.1 }));
    rim.position.y = -0.42; rim.receiveShadow = true; g.add(rim);
    for (const [x, z] of [[-4.7, -5.2], [4.7, -5.2], [-4.7, 5.2], [4.7, 5.2]]) mesh(geo('foot', () => new THREE.CylinderGeometry(0.3, 0.38, 0.4, 10)), mat('#2a120a'), g, x, -0.7, z);
    return g;
  }
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
  const discGeo = () => geo('disc', () => {
    const pts = [[0, 0], [DISC_R - 0.03, 0], [DISC_R, 0.03], [DISC_R, DISC_H - 0.03], [DISC_R - 0.03, DISC_H], [0, DISC_H]].map(([x, y]) => new THREE.Vector2(x, y));
    return new THREE.LatheGeometry(pts, 40);
  });
  function disc(piece, small) {
    const g = new THREE.Group(), side = piece > 0 ? 1 : -1;
    const body = mesh(discGeo(), new THREE.MeshStandardMaterial({ color: '#e7cf9f', roughness: 0.62 }), g);
    // a thin coloured band around the rim tells the sides apart from any angle
    mesh(geo('band', () => new THREE.CylinderGeometry(DISC_R + 0.004, DISC_R + 0.004, 0.05, 40, 1, true)), mat(PAL[side].ink), g, 0, DISC_H / 2, 0);
    const face = new THREE.Mesh(geo('face', () => new THREE.CircleGeometry(DISC_R - 0.035, 40)), new THREE.MeshStandardMaterial({ map: faceTexture(piece), roughness: 0.75 }));
    face.rotation.x = -Math.PI / 2; face.position.y = DISC_H + 0.002; face.receiveShadow = true; g.add(face);
    g.userData = { body, face };
    if (small) g.scale.setScalar(0.62);
    return g;
  }

  // ---------- warriors ----------
  // humanoid with named joints: legs, armL, armR (pivot at the shoulder), head
  function humanoid(pal, o = {}) {
    const g = group(), j = {};
    const armour = o.armour || pal.main;
    if (!o.noLegs) {
      j.legL = group(g, -0.05, 0.22, 0); j.legR = group(g, 0.05, 0.22, 0);
      for (const L of [j.legL, j.legR]) { box(0.065, 0.2, 0.075, pal.dark, L, 0, -0.1, 0); box(0.075, 0.05, 0.1, '#2a1a10', L, 0, -0.2, 0.01); }
    }
    if (o.robe) cyl(0.1, 0.17, 0.3, o.robe, g, 0, 0.16, 0, 8);
    else cyl(0.1, 0.13, 0.1, armour, g, 0, 0.21, 0, 8);           // armoured skirt
    box(0.2, 0.17, 0.12, o.robe || armour, g, 0, 0.33, 0);
    box(0.14, 0.07, 0.012, pal.trim, g, 0, 0.35, 0.065, { metal: 0.6, rough: 0.35 });
    box(0.21, 0.03, 0.13, pal.trim, g, 0, 0.255, 0, { metal: 0.6, rough: 0.35 });
    if (!o.robe) for (const sx of [-1, 1]) box(0.08, 0.05, 0.13, pal.trim, g, sx * 0.135, 0.405, 0, { metal: 0.5, rough: 0.4 });
    j.armL = group(g, -0.13, 0.4, 0); j.armR = group(g, 0.13, 0.4, 0);
    for (const A of [j.armL, j.armR]) { box(0.055, 0.17, 0.065, o.robe || armour, A, 0, -0.085, 0); ball(0.032, SKIN, A, 0, -0.18, 0.01); }
    j.head = group(g, 0, 0.43, 0);
    box(0.1, 0.1, 0.1, SKIN, j.head, 0, 0.06, 0);
    for (const sx of [-1, 1]) box(0.018, 0.012, 0.005, '#1a1010', j.head, sx * 0.025, 0.07, 0.051);
    if (o.beard) box(0.06, 0.05, 0.02, '#1a1010', j.head, 0, 0.015, 0.055);
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

  function buildGeneral(pal, side) {
    const h = humanoid(pal, { armour: side > 0 ? '#c0392b' : '#2f4160', beard: true }), j = h.userData.j;
    // gold helmet with the two long pheasant feathers of a famous general
    cyl(0.062, 0.068, 0.07, pal.trim, j.head, 0, 0.12, 0, 8, { metal: 0.7, rough: 0.3 });
    cyl(0.02, 0.03, 0.05, pal.trim, j.head, 0, 0.18, 0, 6, { metal: 0.7, rough: 0.3 });
    for (const sx of [-1, 1]) {
      const f = group(j.head, sx * 0.03, 0.2, -0.01);
      f.rotation.z = -sx * 0.35; f.rotation.x = -0.35;
      box(0.014, 0.22, 0.014, pal.plume, f, 0, 0.11, 0);
      const tip = group(f, 0, 0.22, 0); tip.rotation.x = -0.7; tip.rotation.z = -sx * 0.3;
      box(0.012, 0.16, 0.012, pal.plume, tip, 0, 0.08, 0);
    }
    // cape
    const cape = group(h, 0, 0.42, -0.07); cape.rotation.x = 0.18;
    box(0.24, 0.36, 0.02, side > 0 ? '#7a0f0b' : '#101828', cape, 0, -0.18, 0);
    h.userData.j.cape = cape;
    sword(j.armR, pal);
    h.scale.setScalar(1.18);
    return h;
  }
  function buildAdvisor(pal, side) {
    const h = humanoid(pal, { robe: side > 0 ? '#8e1d16' : '#223150', noLegs: true, beard: true }), j = h.userData.j;
    // scholar's hat
    box(0.15, 0.025, 0.11, '#1a1010', j.head, 0, 0.125, 0);
    box(0.08, 0.06, 0.08, '#1a1010', j.head, 0, 0.16, 0);
    // feather fan
    const fan = group(j.armR, 0, -0.18, 0.04);
    cyl(0.008, 0.008, 0.1, WOOD, fan, 0, 0.04, 0, 4);
    const leaf = mesh(geo('fan', () => new THREE.CircleGeometry(0.09, 7, 0, Math.PI)), new THREE.MeshStandardMaterial({ color: '#f4f1e8', side: THREE.DoubleSide, flatShading: true, roughness: 0.9 }), fan, 0, 0.1, 0);
    leaf.rotation.z = -Math.PI / 2; leaf.rotation.y = Math.PI / 2;
    j.armR.rotation.x = -0.6;
    return h;
  }
  function buildSoldier(pal) {
    const h = humanoid(pal), j = h.userData.j;
    cyl(0.005, 0.075, 0.08, pal.dark, j.head, 0, 0.14, 0, 8);           // conical helmet
    cyl(0.004, 0.004, 0.06, pal.plume, j.head, 0, 0.2, 0, 3);
    spear(j.armR, pal);
    const shield = group(j.armL, -0.04, -0.12, 0.03);
    const s = cyl(0.1, 0.1, 0.025, pal.main, shield, 0, 0, 0, 10); s.rotation.z = Math.PI / 2;
    const boss = cyl(0.03, 0.03, 0.03, pal.trim, shield, -0.015, 0, 0, 8, { metal: 0.7, rough: 0.3 }); boss.rotation.z = Math.PI / 2;
    h.scale.setScalar(0.92);
    return h;
  }
  function buildHorse(pal, side) {
    const g = group(), j = {};
    const coat = pal.horse;
    const body = group(g, 0, 0.32, 0); j.body = body;
    box(0.15, 0.15, 0.36, coat, body, 0, 0, 0);
    box(0.17, 0.05, 0.22, pal.main, body, 0, 0.08, -0.01);                   // saddle cloth
    const neck = group(body, 0, 0.05, 0.16); neck.rotation.x = -0.6;
    box(0.09, 0.2, 0.1, coat, neck, 0, 0.09, 0);
    box(0.02, 0.18, 0.05, '#1a0f08', neck, 0, 0.1, -0.05);                  // mane
    const head = group(neck, 0, 0.19, 0.02); head.rotation.x = 1.0;
    box(0.08, 0.08, 0.17, coat, head, 0, 0, 0.06);
    for (const sx of [-1, 1]) box(0.02, 0.05, 0.02, coat, head, sx * 0.03, 0.06, 0);
    const tail = group(body, 0, 0.03, -0.18); tail.rotation.x = 0.5;
    box(0.03, 0.16, 0.03, '#1a0f08', tail, 0, -0.08, 0);
    j.legs = [];
    for (const [x, z] of [[-0.05, 0.13], [0.05, 0.13], [-0.05, -0.13], [0.05, -0.13]]) {
      const L = group(body, x, -0.07, z); box(0.04, 0.22, 0.045, coat, L, 0, -0.11, 0); box(0.045, 0.03, 0.05, '#1a0f08', L, 0, -0.22, 0);
      j.legs.push(L);
    }
    // the rider sits on the saddle, lance in hand
    const rider = humanoid(pal, { noLegs: true });
    rider.position.set(0, 0.21, -0.01); rider.scale.setScalar(0.82); body.add(rider);
    const rj = rider.userData.j;
    cyl(0.055, 0.065, 0.06, pal.trim, rj.head, 0, 0.12, 0, 8, { metal: 0.6, rough: 0.35 });
    cyl(0.004, 0.004, 0.08, pal.plume, rj.head, 0, 0.19, 0, 3);
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
      const rim = cyl(0.15, 0.15, 0.03, '#4a2a14', w, 0, 0, 0, 12); rim.rotation.z = Math.PI / 2;
      for (let k = 0; k < 4; k++) { const sp = box(0.012, 0.27, 0.02, '#2a160a', w, 0, 0, 0); sp.rotation.x = (k * Math.PI) / 4; }
      j.wheels.push(w);
    }
    // canopy
    cyl(0.008, 0.008, 0.55, WOOD, g, 0.09, 0.45, -0.08, 4);
    cyl(0.005, 0.2, 0.08, pal.main, g, 0.09, 0.73, -0.08, 8);
    const driver = humanoid(pal, { noLegs: true }); driver.position.set(-0.03, 0.12, 0); driver.scale.setScalar(0.85); g.add(driver);
    const dj = driver.userData.j;
    cyl(0.055, 0.065, 0.06, pal.trim, dj.head, 0, 0.12, 0, 8, { metal: 0.6, rough: 0.35 });
    halberd(dj.armR, pal);
    j.armR = dj.armR; j.armL = dj.armL; j.head = dj.head;
    g.userData.j = j;
    return g;
  }
  function buildElephant(pal, side) {
    const g = group(), j = {}, grey = '#8d8f96';
    const body = group(g, 0, 0.34, 0); j.body = body;
    const b = ball(0.2, grey, body); b.scale.set(0.85, 0.8, 1.15);
    const head = group(body, 0, 0.06, 0.21);
    const hd = ball(0.12, grey, head); hd.scale.set(1, 1.05, 0.95);
    for (const sx of [-1, 1]) { const ear = box(0.02, 0.15, 0.13, '#7c7e86', head, sx * 0.12, 0.01, -0.03); ear.rotation.y = sx * 0.4; }
    // trunk in three segments, curling down
    let t = group(head, 0, -0.04, 0.1); t.rotation.x = 0.5; j.trunk = t;
    for (let k = 0; k < 3; k++) { cyl(0.04 - k * 0.008, 0.045 - k * 0.008, 0.11, grey, t, 0, -0.05, 0, 6); const n = group(t, 0, -0.1, 0); n.rotation.x = 0.35; t = n; }
    for (const sx of [-1, 1]) { const tusk = cyl(0.004, 0.02, 0.14, '#f3ecd8', head, sx * 0.06, -0.07, 0.08, 5); tusk.rotation.x = -1.1; }
    j.legs = [];
    for (const [x, z] of [[-0.09, 0.12], [0.09, 0.12], [-0.09, -0.12], [0.09, -0.12]]) {
      const L = group(body, x, -0.12, z); cyl(0.05, 0.055, 0.22, grey, L, 0, -0.1, 0, 7); j.legs.push(L);
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

  const BUILD = { 1: buildGeneral, 2: buildAdvisor, 3: buildElephant, 4: buildHorse, 5: buildChariot, 6: buildCatapult, 7: buildSoldier };
  // a warrior for a piece, facing the enemy; with a banner pole for the army view
  function warrior(piece) {
    const side = piece > 0 ? 1 : -1, type = Math.abs(piece), pal = PAL[side];
    const root = new THREE.Group();
    const fig = BUILD[type](pal, side);
    root.add(fig);
    root.rotation.y = side > 0 ? Math.PI : 0;                // Red sits at +z and faces -z
    // banner on a pole, shown in the army view so the character stays readable
    const flag = group(root, -0.16, 0, -0.12);
    const tall = type === 1 ? 1.25 : 1.0;
    cyl(0.01, 0.01, tall, '#2a160a', flag, 0, tall / 2, 0, 4);
    ball(0.025, pal.trim, flag, 0, tall + 0.01, 0, { metal: 0.6, rough: 0.3 });
    const cloth = new THREE.Mesh(geo('banner', () => { const p = new THREE.PlaneGeometry(0.3, 0.41); p.translate(0.15, 0, 0); return p; }),
      new THREE.MeshStandardMaterial({ map: bannerTexture(piece), side: THREE.DoubleSide, roughness: 0.85 }));
    cloth.position.y = tall - 0.24; cloth.castShadow = true; flag.add(cloth);
    root.userData = { fig, j: fig.userData.j || {}, flag, cloth, type, side };
    return root;
  }

  return { board, table, lantern, disc, warrior, faceTexture, clearTextureCache, DISC_H, DISC_R, PAL, BRUSH };
})();
