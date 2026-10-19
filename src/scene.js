// scene.js — the 3D view: renderer, the stage around the table (stages.js), orbit camera, tapping on points, highlights and the
// battle animations (a warrior rises from the piece, marches, strikes, the defeated piece flies to the tray).
// Holds no game rules: game.js tells it what to show. Two layouts: the ordinary board, and the hexagon of the
// three-kingdom game (sanguo.js). Before a room's game, the hall: the board is put away and the players' generals stand
// side by side on pedestals.
'use strict';
const VIEW = (() => {
  THREE.ColorManagement.legacyMode = false;
  const { DISC_H } = MODELS;
  const { N, R, B } = XQ;
  let renderer, scene, camera, W = 1, H = 1, inset = 0;   // inset: px covered by the side panel on the right
  const units = new Map();                 // square -> unit { piece, root, disc, war, sq }

  // ---------- layouts ----------
  // Where each point lies, how to read a move and a piece, and where each side sits: yaw is the direction of a side's
  // own edge seen from the centre (the camera looks from there for that player); its warriors face the other way.
  // taker(piece): the side that took a piece, when only the piece is known.
  const CLASSIC = {
    sides: [1, -1],
    pos: s => new THREE.Vector3(XQ.col(s) - 4, 0, XQ.row(s) - 4.5),
    from: XQ.from, to: XQ.to,
    sideOf: p => (p > 0 ? 1 : -1), typeOf: p => Math.abs(p), king: side => side * XQ.K,
    yaw: side => (side > 0 ? 0 : Math.PI),
    taker: p => (p > 0 ? -1 : 1),
    // pieces taken by Red line up on Red's right, pieces taken by Black on Black's right
    tray(by, i) {
      const col = i % 2, rowI = Math.floor(i / 2);
      return new THREE.Vector3(by > 0 ? 5.7 + col * 0.62 : -5.7 - col * 0.62, -0.7, by > 0 ? 4 - rowI * 0.62 : -4 + rowI * 0.62);
    },
    pick(x, z) {
      const c = Math.round(x + 4), r = Math.round(z + 4.5);
      return c < 0 || c > 8 || r < 0 || r > 9 || Math.hypot(x + 4 - c, z + 4.5 - r) > 0.5 ? -1 : r * 9 + c;
    },
    board: () => MODELS.board(),
    fit: [6.4, 5.5, 6.0], edge: 5.4, shadow: 9, far: 32,   // camera framing, the hero shadow's edge, light, zoom out
  };
  // the three kingdoms; pieces are drawn as 20 + 10 * kingdom + type (models.js)
  const local = (k, X, Y) => { const y = SG.YAW(k), sn = Math.sin(y), cs = Math.cos(y); return new THREE.Vector3(X * cs + Y * sn, 0, -X * sn + Y * cs); };
  const SANGUO = {
    sides: [0, 1, 2],
    pos: s => new THREE.Vector3(SG.XZ[s * 2], 0, SG.XZ[s * 2 + 1]),
    from: SG.from, to: SG.to,
    sideOf: p => ((p / 10) | 0) - 2, typeOf: p => p % 10, king: k => 20 + 10 * k + SG.K,
    yaw: SG.YAW,
    taker: p => ((p / 10) | 0) - 2,
    // behind each kingdom's own edge, to its right
    tray: (by, i) => local(by, 0.8 + (i % 6) * 0.62, SG.BOARD_R + 0.9 + Math.floor(i / 6) * 0.62).setY(-0.7),
    pick(x, z) {
      let best = -1, d = 0.5;
      for (let s = 0; s < SG.SQ; s++) { const e = Math.hypot(x - SG.XZ[s * 2], z - SG.XZ[s * 2 + 1]); if (e < d) { d = e; best = s; } }
      return best;
    },
    board: () => MODELS.sanguoBoard(),
    fit: [9.0, 9.4, 9.6], edge: SG.BOARD_R - 0.3, shadow: 11.5, far: 42,
  };
  let L = CLASSIC, layoutName = 'classic', boardMesh = null;
  let hall = null;                         // the hall, while it is shown: { group, figs } (see setHall)
  const HALL_SCALE = 3.2;                  // size of the generals on their pedestals
  // pedestals apart, and their size: closer and smaller on a portrait phone, so the camera can come nearer
  const hallGap = () => (portrait() ? 1.75 : 2.8), hallPed = () => (portrait() ? 0.68 : 1);
  let trays = { 1: [], '-1': [] };         // pieces captured by each side (meshes)
  let armyOn = false, viewer = 1, menu = false, busy = false;
  let heroes = { 1: '', '-1': '' };        // hero leading each side (heroes.js id, '' = the plain general)
  let clock = performance.now(), last = clock;
  const tweens = [], parts = [];
  const pos = s => L.pos(s);
  const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
  const rest = p => wrap(L.yaw(L.sideOf(p)) + Math.PI);       // the way a piece's warrior faces between moves
  const S = { onTap: null };

  // ---------- tweens ----------
  function tween(ms, fn) { return new Promise(res => tweens.push({ t0: clock, ms: Math.max(1, ms), fn, res })); }
  const wait = ms => tween(ms, () => { });
  const ease = k => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
  const out = k => 1 - Math.pow(1 - k, 3);
  const backOut = k => { const c = 1.7; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };
  const lerp = (a, b, k) => a + (b - a) * k;

  // ---------- camera ----------
  const cam = { theta: 0, phi: 0.98, dist: 16, tTheta: 0, tPhi: 0.98, tDist: 16, zoom: 1, tZoom: 1 };
  const HOME = new THREE.Vector3(0, -0.4, 0), focus = HOME.clone(), tFocus = HOME.clone();   // close-ups move the focus
  function fitDist() {
    const v = Math.tan((camera.fov * Math.PI) / 360), a = (W - inset) / H;
    // portrait screens fit the board's width only; the trays beside it may leave the frame
    return Math.max(L.fit[0] / v, (portrait() ? L.fit[1] : L.fit[2]) / (v * a)) * 1.02;
  }
  const portrait = () => W / H < 0.8;
  // on a portrait phone the controls cover the bottom of the screen: look more from above and aim below the
  // board's centre (towards the viewer) so the board sits higher, clear of the panel
  const LOW = 0.3;                         // the low angle that shows the stage's horizon (menu, showcase)
  function resetCamera() {
    if (hall) {
      // the hall: the generals seen from the front at eye level, all of them in frame; on a portrait phone they stand in
      // the upper half, above the controls
      const v = Math.tan((camera.fov * Math.PI) / 360), a = (W - inset) / H, n = Math.max(2, hall.figs.length), gap = hallGap();
      hall.figs.forEach((f, i) => { f.base.position.x = (i - (n - 1) / 2) * gap; f.ped.scale.set(hallPed(), 1, hallPed()); });
      // the page's dock covers the bottom of the screen: the camera stands back a little and looks low, so the
      // generals and their name cards stand clear above it
      cam.tTheta = 0; cam.tPhi = 0.12; cam.tDist = Math.max(2.6 / v, ((n * gap) / 2 + 0.5 * hallPed()) / (v * a)) * (portrait() ? 1.05 : 1.3);
      HOME.set(0, portrait() ? -1.4 : 0.3, 0); if (cam.tZoom === 1) tFocus.copy(HOME);
      return;
    }
    // the menu circles low to show off the stage; in play the camera looks down on the board
    const y = L.yaw(viewer), lean = portrait() ? 1.5 : 0;
    cam.tTheta = y; cam.tPhi = menu ? LOW : portrait() ? 1.2 : 0.98; cam.tDist = fitDist();
    HOME.set(lean * Math.sin(y), menu ? 1.6 : -0.4, lean * Math.cos(y)); if (cam.tZoom === 1) tFocus.copy(HOME);
  }
  function placeCamera() {
    const cp = Math.cos(cam.phi), d = cam.dist * cam.zoom;
    camera.position.set(focus.x + d * cp * Math.sin(cam.theta), focus.y + d * Math.sin(cam.phi), focus.z + d * cp * Math.cos(cam.theta));
    camera.lookAt(focus);
  }

  // ---------- setup ----------
  let keyLight, hemiLight, rimLight, checkRing, checkLight, selRing, hintRings = [], dots = [], capRings = [], lastMarks = [];
  let stage = null, stageId = '';          // what surrounds the table (stages.js)
  let occluders = [];                      // its scenery that may come between the camera and the board
  const glowTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
  })();
  function ringMesh(r0, r1, color, opacity) {
    const m = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2; m.renderOrder = 2; return m;
  }

  function init(canvas) {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    scene = new THREE.Scene();
    scene.background = new THREE.Color('#140d0a');
    scene.fog = new THREE.Fog('#140d0a', 22, 46);
    camera = new THREE.PerspectiveCamera(38, 1, 0.1, 120);

    hemiLight = new THREE.HemisphereLight('#ffe2c0', '#2a1408', 0.8); scene.add(hemiLight);
    keyLight = new THREE.DirectionalLight('#ffe9cc', 1.9);
    keyLight.position.set(-6, 14, 7); keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    Object.assign(keyLight.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 40 });
    keyLight.shadow.bias = -0.0005; keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);
    rimLight = new THREE.DirectionalLight('#7fa4ff', 0.45); rimLight.position.set(8, 6, -10); scene.add(rimLight);

    boardMesh = L.board(); scene.add(boardMesh);
    setStage(wantStage);

    // highlight meshes
    selRing = ringMesh(0.47, 0.56, '#ffd24a', 0.95); selRing.visible = false; scene.add(selRing);
    checkRing = ringMesh(0.46, 0.62, '#ff2a1a', 0.9); checkRing.visible = false; scene.add(checkRing);
    checkLight = new THREE.PointLight('#ff3a20', 0, 3, 2); scene.add(checkLight);
    for (let i = 0; i < 2; i++) { const m = ringMesh(0.36, 0.44, '#ffe08a', 0.45); m.visible = false; scene.add(m); lastMarks.push(m); }
    for (let i = 0; i < 2; i++) { const m = ringMesh(0.44, 0.54, '#5fd8ff', 0.9); m.visible = false; scene.add(m); hintRings.push(m); }

    resize();
    addEventListener('resize', resize);
    bindInput(canvas);
    resetCamera(); cam.theta = cam.tTheta; cam.dist = cam.tDist + 6; cam.phi = 0.7;
    requestAnimationFrame(loop);
  }
  function resize() {
    W = innerWidth; H = innerHeight;
    renderer.setSize(W, H, false); camera.aspect = W / H;
    // centre the board in the part of the screen the panel leaves free
    if (inset) camera.setViewOffset(W, H, inset / 2, 0, W, H); else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    cam.tDist = Math.max(cam.tDist, fitDist() * 0.6);
    if (!dragged) resetCamera();                         // re-frame on rotation (portrait <-> landscape)
  }

  // ---------- input: drag to orbit, pinch / wheel to zoom, tap to play ----------
  let dragged = false;
  function bindInput(el) {
    const ptrs = new Map(); let downAt = null, moved = false, pinch0 = 0, dist0 = 0;
    el.addEventListener('pointerdown', e => {
      el.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (ptrs.size === 1) { downAt = { x: e.clientX, y: e.clientY, t: performance.now() }; moved = false; }
      if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); dist0 = cam.tDist; moved = true; }
    });
    el.addEventListener('pointermove', e => {
      const p = ptrs.get(e.pointerId);
      if (!p) { hover(e); return; }
      const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
      if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch0) cam.tDist = Math.max(7, Math.min(L.far, dist0 * pinch0 / d));
        dragged = true; return;
      }
      if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 7) moved = true;
      if (moved) { cam.tTheta -= dx * 0.008; cam.tPhi = Math.max(0.32, Math.min(1.45, cam.tPhi + dy * 0.006)); dragged = true; }
    });
    const up = e => {
      ptrs.delete(e.pointerId);
      if (ptrs.size === 0 && downAt && !moved && performance.now() - downAt.t < 600) {
        const s = pick(e.clientX, e.clientY);
        if (s >= 0 && S.onTap) S.onTap(s);
      }
      if (ptrs.size === 0) downAt = null;
    };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', e => { e.preventDefault(); cam.tDist = Math.max(7, Math.min(L.far, cam.tDist * (1 + Math.sign(e.deltaY) * 0.08))); dragged = true; }, { passive: false });
    el.addEventListener('dblclick', () => { dragged = false; resetCamera(); });
  }
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -DISC_H / 2), hit = new THREE.Vector3();
  function pick(x, y) {
    ndc.set((x / W) * 2 - 1, -(y / H) * 2 + 1); ray.setFromCamera(ndc, camera);
    // a piece or a warrior under the pointer wins over the board point behind it
    const roots = [...units.values()].map(u => u.root);
    const hits = ray.intersectObjects(roots, true);
    for (const h of hits) { let o = h.object; while (o && !o.userData.sq && o.userData.sq !== 0) o = o.parent; if (o && o.visible !== false) return o.userData.sq; }
    if (!ray.ray.intersectPlane(plane, hit)) return -1;
    return L.pick(hit.x, hit.z);
  }
  let hoverFn = null;
  function hover(e) { if (hoverFn) renderer.domElement.style.cursor = hoverFn(pick(e.clientX, e.clientY)) ? 'pointer' : 'grab'; }

  // ---------- units ----------
  function makeUnit(piece, s) {
    const root = new THREE.Group(), disc = MODELS.disc(piece), war = MODELS.warrior(piece, heroes[L.sideOf(piece)]);
    root.add(disc); war.position.y = DISC_H; war.rotation.y = rest(piece); root.add(war);
    disc.rotation.y = L.yaw(viewer);
    war.visible = armyOn; war.scale.setScalar(armyOn ? 1 : 0.001);
    root.position.copy(pos(s)); root.userData.sq = s; root.visible = !hall;
    scene.add(root);
    return { piece, root, disc, war, sq: s };
  }
  function disposeUnit(u) { scene.remove(u.root); }
  // captured: the pieces already taken, each a piece or [piece, side that took it]
  function setBoard(b, captured) {
    for (const u of units.values()) disposeUnit(u); units.clear();
    for (let s = 0; s < b.length; s++) if (b[s]) units.set(s, makeUnit(b[s], s));
    for (const side of Object.keys(trays)) for (const d of trays[side]) scene.remove(d);
    trays = Object.fromEntries(L.sides.map(side => [side, []]));
    if (captured) for (const c of captured) Array.isArray(c) ? addToTray(c[0], false, c[1]) : addToTray(c, false);
    clearMarks();
  }
  function addToTray(piece, animFrom, by = L.taker(piece)) {
    const d = MODELS.disc(piece, true), list = trays[by];
    d.rotation.y = L.yaw(viewer);
    const p = L.tray(by, list.length); list.push(d); d.visible = !hall; scene.add(d);
    if (!animFrom) { d.position.copy(p); return Promise.resolve(); }
    const a = animFrom.clone();
    d.position.copy(a);
    return tween(650, k => { const e = out(k); d.position.set(lerp(a.x, p.x, e), lerp(a.y, p.y, e) + Math.sin(k * Math.PI) * 2.2, lerp(a.z, p.z, e)); d.rotation.x = k * Math.PI * 2; })
      .then(() => { d.rotation.x = 0; SFX.place(); });
  }

  function setViewer(side, instant) {
    viewer = side;
    showing++; homeTheta = null; cam.tZoom = 1;          // a game starts: a hero preview still running must not move the camera
    for (const u of units.values()) u.disc.rotation.y = L.yaw(side);
    for (const s of Object.keys(trays)) for (const d of trays[s]) d.rotation.y = L.yaw(side);
    dragged = false; resetCamera();
    if (instant) { cam.theta = cam.tTheta; cam.phi = cam.tPhi; cam.dist = cam.tDist; }
  }
  function setArmy(on) {
    armyOn = on;
    for (const u of units.values()) {
      if (on) { u.war.visible = true; tween(400, k => u.war.scale.setScalar(Math.max(0.001, backOut(k)))); }
      else tween(300, k => u.war.scale.setScalar(Math.max(0.001, 1 - k))).then(() => { if (!armyOn) u.war.visible = false; });
    }
  }

  // ---------- highlights ----------
  function dot(color, r) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(r, 24), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.renderOrder = 3; scene.add(m); return m;
  }
  function clearMarks() { for (const d of dots) scene.remove(d); dots = []; for (const r of capRings) scene.remove(r); capRings = []; selRing.visible = false; for (const u of units.values()) u.lift = 0; }
  function select(s, targets) {
    clearMarks();
    if (s < 0) return;
    const u = units.get(s); if (u) u.lift = 1;
    selRing.visible = true; selRing.position.copy(pos(s)).setY(0.012);
    for (const t of targets) {
      const p = pos(t);
      if (units.has(t)) { const r = ringMesh(0.45, 0.55, '#ff3a2a', 0.9); r.position.copy(p).setY(0.014); scene.add(r); capRings.push(r); }
      else { const d = dot('#46e0b0', 0.13); d.position.copy(p).setY(0.015); dots.push(d); }
    }
  }
  function lastMove(f, t) {
    lastMarks.forEach((m, i) => { const s = i ? t : f; m.visible = s >= 0; if (s >= 0) m.position.copy(pos(s)).setY(0.01); });
  }
  function hint(f, t) { hintRings.forEach((m, i) => { const s = i ? t : f; m.visible = s >= 0; if (s >= 0) m.position.copy(pos(s)).setY(0.016); }); }
  function check(s) { checkRing.visible = s >= 0; if (s >= 0) { checkRing.position.copy(pos(s)).setY(0.013); checkLight.position.copy(pos(s)).setY(0.6); } }

  // ---------- effects ----------
  const partGeo = new THREE.BoxGeometry(0.05, 0.05, 0.05);
  function debris(at, colors, n = 18, speed = 1) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(partGeo, new THREE.MeshStandardMaterial({ color: colors[i % colors.length], flatShading: true, transparent: true }));
      m.position.copy(at); m.castShadow = true; scene.add(m);
      const a = Math.random() * Math.PI * 2, v = (0.6 + Math.random() * 1.6) * speed;
      parts.push({ m, vx: Math.cos(a) * v, vy: 1.5 + Math.random() * 2.5 * speed, vz: Math.sin(a) * v, life: 1.2 + Math.random() * 0.4, max: 1.6, spin: (Math.random() - 0.5) * 12, solid: true });
    }
  }
  function sparks(at, color = '#ffd27a', n = 22, size = 0.22) {
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      s.position.copy(at); s.scale.setScalar(size * (0.5 + Math.random())); scene.add(s);
      const a = Math.random() * Math.PI * 2, e = Math.random() * 1.2;
      parts.push({ m: s, vx: Math.cos(a) * 3 * Math.cos(e), vy: Math.sin(e) * 3 + 0.5, vz: Math.sin(a) * 3 * Math.cos(e), life: 0.35 + Math.random() * 0.3, max: 0.65, glow: true });
    }
  }
  function smoke(at, n = 10, color = '#8a7a6a', size = 0.9) {
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, opacity: 0.5, depthWrite: false }));
      s.position.copy(at).add(new THREE.Vector3((Math.random() - 0.5) * 0.5, 0.1, (Math.random() - 0.5) * 0.5)); s.scale.setScalar(size * 0.4);
      scene.add(s);
      parts.push({ m: s, vx: (Math.random() - 0.5) * 0.6, vy: 0.4 + Math.random() * 0.6, vz: (Math.random() - 0.5) * 0.6, life: 1 + Math.random() * 0.6, max: 1.6, grow: size, fade: true });
    }
  }
  function dustRing(at) {
    const r = ringMesh(0.2, 0.32, '#e8d2a8', 0.6); r.position.copy(at).setY(0.02); scene.add(r);
    tween(420, k => { r.scale.setScalar(1 + k * 2.4); r.material.opacity = 0.6 * (1 - k); }).then(() => scene.remove(r));
  }
  let shake = 0;
  function flash(at, color, power = 4) {
    const l = new THREE.PointLight(color, power, 6, 2); l.position.copy(at).setY(0.8); scene.add(l);
    tween(380, k => { l.intensity = power * (1 - k); }).then(() => scene.remove(l));
  }

  // ---------- the battle animations ----------
  function face(u, target) {
    const p = u.root.position, yaw = Math.atan2(target.x - p.x, target.z - p.z);
    u.war.rotation.y = yaw;
  }
  function restFacing(u) { u.war.rotation.y = rest(u.piece); }
  // a warrior grows out of its piece, larger than life so the fight reads from across the table
  const BIG = () => (armyOn ? 1.35 : 1.8), REST = () => (armyOn ? 1 : 0.001);
  async function summon(u) {
    u.war.visible = true;
    const a = u.war.scale.x, b = BIG();
    await tween(280, k => u.war.scale.setScalar(Math.max(0.001, a + (b - a) * backOut(k))));
  }
  async function dismiss(u) {
    const a = u.war.scale.x, b = REST(), y0 = u.war.rotation.y, y1 = y0 + wrap(rest(u.piece) - y0);   // the short way round
    await tween(240, k => { u.war.scale.setScalar(Math.max(0.001, lerp(a, b, k))); u.war.rotation.y = lerp(y0, y1, k); });
    if (!armyOn) u.war.visible = false;
    restFacing(u);
  }
  // per-frame pose while marching
  function marchPose(u, k, dist) {
    const j = u.war.userData.j, type = L.typeOf(u.piece), ph = k * dist * 9;
    if (j.legL) { j.legL.rotation.x = Math.sin(ph) * 0.6; j.legR.rotation.x = -Math.sin(ph) * 0.6; }
    if (j.legs) j.legs.forEach((L, i) => { L.rotation.x = Math.sin(ph * (type === N ? 1.6 : 1) + (i % 2 ? Math.PI : 0) + (i > 1 ? 1 : 0)) * (type === N ? 0.8 : 0.35); });
    if (j.body && type === N) j.body.rotation.x = Math.sin(ph * 1.6) * 0.08;
    if (j.wheels) j.wheels.forEach(w => { w.rotation.x = k * dist * 6; });
    const bob = type === N ? Math.abs(Math.sin(ph * 0.8)) * 0.12 : type === R ? 0 : Math.abs(Math.sin(ph)) * 0.04;
    u.war.position.y = DISC_H + bob;
  }
  function restPose(u) {
    const j = u.war.userData.j;
    if (j.legL) { j.legL.rotation.x = 0; j.legR.rotation.x = 0; }
    if (j.legs) j.legs.forEach(L => { L.rotation.x = 0; });
    if (j.body) j.body.rotation.x = 0;
    if (j.armR) j.armR.rotation.x = j.restArm || 0;      // fan bearers keep the fan up
    u.war.position.y = DISC_H;
  }
  // the length of a route: from where the unit stands through the points given
  const routeLen = (u, pts) => pts.reduce((s, p, i) => s + p.distanceTo(i ? pts[i - 1] : u.root.position.clone().setY(0)), 0);
  // march to a point, or through a list of points (the lines of the three-kingdom board bend), turning at each bend
  async function march(u, to, ms) {
    const pts = [u.root.position.clone().setY(0), ...(Array.isArray(to) ? to : [to])], type = L.typeOf(u.piece);
    const lens = pts.slice(1).map((p, i) => p.distanceTo(pts[i])), d = lens.reduce((s, x) => s + x, 0);
    if (type === N) SFX.gallop(); else if (type === R) SFX.roll(); else SFX.step();
    let leg = -1;
    await tween(ms, k => {
      const e = ease(k);
      let x = e * d, i = 0;
      while (i < lens.length - 1 && x > lens[i]) x -= lens[i++];
      const a = pts[i], b = pts[i + 1], f = lens[i] ? Math.min(1, x / lens[i]) : 1;
      if (i !== leg && lens.length > 1) { leg = i; u.war.rotation.y = Math.atan2(b.x - a.x, b.z - a.z); }
      u.root.position.set(lerp(a.x, b.x, f), Math.sin(k * Math.PI) * (type === N ? 0.25 : 0.06), lerp(a.z, b.z, f));
      marchPose(u, e, d);
    });
    u.root.position.y = 0; restPose(u);
  }
  async function strike(u) {
    const j = u.war.userData.j, type = L.typeOf(u.piece);
    if (type === B) {           // the elephant rears and stamps
      await tween(260, k => { j.body.rotation.x = -0.45 * out(k); if (j.trunk) j.trunk.rotation.x = 0.5 - 1.4 * k; });
      await tween(140, k => { j.body.rotation.x = -0.45 * (1 - k) + 0.12 * k; });
      return;
    }
    if (type === N && j.body) await tween(200, k => { j.body.rotation.x = -0.35 * out(k); });
    if (j.armR) {
      await tween(240, k => { j.armR.rotation.x = -2.4 * out(k); });
      SFX.whoosh();
      await tween(120, k => { j.armR.rotation.x = lerp(-2.4, 0.9, k); });
    }
    if (type === N && j.body) j.body.rotation.x = 0;
  }
  async function fall(u, from, by) {
    // knocked back, topples, bursts into pieces; the disc flies to the tray of the side that took it
    const p = u.root.position, away = new THREE.Vector3(p.x - from.x, 0, p.z - from.z).normalize();
    const pal = MODELS.PAL[MODELS.palKey(u.piece)];
    const a = p.clone();
    await tween(300, k => {
      u.root.position.set(a.x + away.x * 0.3 * out(k), 0, a.z + away.z * 0.3 * out(k));
      u.war.rotation.x = -1.35 * out(k);
    });
    const at = u.root.position.clone().setY(0.4);
    debris(at, [pal.main, pal.trim, pal.dark, '#e5b88c'], 22);
    smoke(at, 6, '#6a5a4a', 0.8);
    SFX.thud();
    u.war.visible = false;
    disposeUnit(u);
    await addToTray(u.piece, u.root.position.clone().setY(0.1), by);
  }
  async function throwStone(u, target) {
    const j = u.war.userData.j, a = u.root.position.clone().setY(0.9), b = target.root.position.clone().setY(0.5);
    await tween(320, k => { j.arm.rotation.x = 0.55 + 0.5 * out(k); });          // wind back
    SFX.whoosh();
    await tween(140, k => { j.arm.rotation.x = lerp(1.05, -1.3, k); });
    j.stone.visible = false;
    const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.11), new THREE.MeshStandardMaterial({ color: '#7d756a', flatShading: true }));
    stone.castShadow = true; scene.add(stone);
    const fire = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#ff8a3a', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    fire.scale.setScalar(0.6); stone.add(fire);
    const d = a.distanceTo(b);
    await tween(380 + d * 60, k => {
      stone.position.set(lerp(a.x, b.x, k), lerp(a.y, b.y, k) + Math.sin(k * Math.PI) * (1.6 + d * 0.25), lerp(a.z, b.z, k));
      stone.rotation.x += 0.3; stone.rotation.z += 0.2;
    });
    scene.remove(stone);
    SFX.boom(); shake = 0.35;
    sparks(b, '#ffb04a', 30, 0.4); smoke(b, 14, '#5a4a3a', 1.4); flash(b, '#ff7a2a', 7);
    j.stone.visible = true;
    tween(400, k => { j.arm.rotation.x = lerp(-1.3, 0.55, k); });
  }

  // play one move; captured is the piece taken (0 for none). Resolves when the animation is over.
  // opts.via: the points the move passes over, when the lines it follows bend (the three-kingdom board)
  async function play(m, opts = {}) {
    const f = L.from(m), t = L.to(m), u = units.get(f);
    if (!u) return;
    busy = true; clearMarks(); hint(-1, -1);
    const target = units.get(t), dest = pos(t), type = L.typeOf(u.piece), fast = opts.fast, by = L.sideOf(u.piece);
    u.root.userData.sq = t;
    if (fast) {
      if (target) { disposeUnit(target); units.delete(t); addToTray(target.piece, false, by); }
      units.delete(f); units.set(t, u); u.sq = t; u.root.position.copy(dest); u.lift = 0;
      lastMove(f, t); busy = false; return;
    }
    const travelMs = d => Math.min(1200, 320 + d * 170);
    if (target && opts.closeUp !== false) {
      tFocus.copy(u.root.position).lerp(dest, 0.6).setY(0.2); cam.tZoom = 0.52;
    }
    // the route along the board's lines; the last point before the target is where the attack comes from
    const route = [...(opts.via || []).map(pos), dest], last = route.length > 1 ? route[route.length - 2] : u.root.position.clone().setY(0);
    await Promise.all([summon(u), target ? summon(target) : null]);
    face(u, route[0]); if (target) face(target, last);
    if (target && type === XQ.C) {
      face(u, dest);                                       // the stone flies straight over the screen
      await throwStone(u, target);
      units.delete(t);
      await fall(target, u.root.position, by);
      await march(u, route, travelMs(routeLen(u, route)));
    } else if (target) {
      // up to just short of the target, along the last stretch of the route
      const dir = dest.clone().sub(last), d = dir.length(); dir.normalize();
      const stop = route.slice(0, -1).concat(dest.clone().sub(dir.multiplyScalar(Math.min(0.62, d))));
      if (routeLen(u, stop) > 0.08) await march(u, stop, travelMs(routeLen(u, stop)));
      face(u, dest);
      await strike(u);
      const at = dest.clone().setY(0.55);
      SFX.clash(); sparks(at, '#fff0b0', 26); flash(at, '#ffd27a', 5); shake = 0.18;
      units.delete(t);
      await fall(target, u.root.position, by);
      restPose(u);
      await march(u, dest, 260);
    } else {
      await march(u, route, travelMs(routeLen(u, route)));
    }
    u.root.position.copy(dest);
    dustRing(dest); SFX.place();
    units.delete(f); units.set(t, u); u.sq = t; u.lift = 0;
    lastMove(f, t);
    tFocus.copy(HOME); cam.tZoom = 1;
    await dismiss(u);
    busy = false;
  }
  // a general raising the alarm when in check
  function alarm(s) {
    const u = units.get(s); if (!u) return;
    const j = u.war.userData.j;
    if (!armyOn) { u.war.visible = true; tween(260, k => u.war.scale.setScalar(Math.max(0.001, 1.8 * backOut(k)))); }
    tween(900, k => { if (j.armR) j.armR.rotation.x = (j.restArm || 0) - 2.6 * Math.sin(k * Math.PI); })
      .then(() => { if (!armyOn && !busy) return tween(220, k => u.war.scale.setScalar(Math.max(0.001, 1.8 * (1 - k)))).then(() => { if (!armyOn) u.war.visible = false; }); });
  }
  // the losing general falls
  function defeat(s) {
    const u = units.get(s); if (!u) return;
    u.war.visible = true; u.war.scale.setScalar(1.8);
    tween(900, k => { u.war.rotation.x = -1.5 * out(k); });
    smoke(u.root.position.clone().setY(0.3), 8, '#4a3a2a', 1);
  }

  // ---------- stage ----------
  // replace everything around the table, with its light, sky and haze; the board and pieces stay as they are
  let wantStage = 'room';
  function setStage(id) {
    wantStage = STAGES.valid(id) ? id : 'room';
    if (!scene || wantStage === stageId) return;          // before init() the wish is kept for it
    if (stage) scene.remove(stage.group);
    const low = Math.min(innerWidth, innerHeight) < 600 || (navigator.hardwareConcurrency || 8) <= 4;
    stage = STAGES.build(wantStage, { glowTex, low }); stageId = wantStage;
    if (stage.sky) stage.group.add(stage.sky);
    scene.add(stage.group);
    occluders = []; stage.group.traverse(o => { if (o.userData.clear) occluders.push(o); });
    stage.group.traverse(o => { if (o.isMesh && !o.material.transparent) o.receiveShadow = true; });
    const L = stage.light;
    hemiLight.color.set(L.hemi[0]); hemiLight.groundColor.set(L.hemi[1]); hemiLight.intensity = L.hemi[2];
    keyLight.color.set(L.key[0]); keyLight.intensity = L.key[1];
    rimLight.color.set(L.rim[0]); rimLight.intensity = L.rim[1];
    scene.background = new THREE.Color(stage.background || stage.fog);
    scene.fog.color.set(stage.fog);
    SFX.ambience(stage.ambience); SFX.music(stageId);
    if (!menu && !hall) showcase();
  }
  // a new stage during a game: the camera drops low and sweeps round for a look, then comes back to the board
  let showcaseRun = 0;
  function showcase() {
    const run = ++showcaseRun;
    cam.tPhi = LOW; cam.tTheta += 0.7; cam.tDist = fitDist() * 1.1; tFocus.set(0, 1.6, 0);
    wait(3200).then(() => { if (run === showcaseRun && !dragged && !menu) { cam.tZoom = 1; resetCamera(); } });
  }

  // ---------- heroes ----------
  // the generals of both sides as led by these heroes ({ 1: id, '-1': id }); a side left out keeps its hero
  function setHeroes(h) {
    for (const side of L.sides) {
      if (!(side in h) || heroes[side] === (h[side] || '')) continue;
      heroes[side] = h[side] || '';
      for (const u of units.values()) {
        if (u.piece !== L.king(side)) continue;
        const shown = u.war.visible, scale = u.war.scale.x;
        u.root.remove(u.war);
        u.war = MODELS.warrior(u.piece, heroes[side]);
        u.war.position.y = DISC_H; u.war.rotation.y = rest(u.piece); u.war.visible = shown; u.war.scale.setScalar(scale);
        u.root.add(u.war);
      }
    }
  }
  // the hero rises from the general's piece, raises their weapon and goes back (the menu's preview)
  let showing = 0, homeTheta = null;     // camera angle to return to after a preview (kept across quick re-picks)
  async function showHero(side) {
    const u = [...units.values()].find(x => x.piece === L.king(side));
    if (!u || busy) return;
    const id = ++showing, j = u.war.userData.j, a = u.war.scale.x;
    u.war.visible = true;
    // the camera comes round in front of them and moves in (they face the centre, away from their own edge)
    const front = L.yaw(side) + Math.PI, turn = ((front - cam.theta) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
    if (homeTheta === null) homeTheta = cam.tTheta;
    cam.tTheta = cam.theta + turn; cam.tPhi = 0.42;
    tFocus.copy(u.root.position).setY(0.7); cam.tZoom = 0.26;
    await tween(300, k => u.war.scale.setScalar(Math.max(0.001, lerp(a, 1.8, backOut(k)))));
    if (id !== showing) return;
    SFX.drum();
    await tween(900, k => { if (j.armR) j.armR.rotation.x = (j.restArm || 0) - 2.6 * Math.sin(k * Math.PI); });
    await wait(1100);
    if (id !== showing || busy) return;
    tFocus.copy(HOME); cam.tZoom = 1; cam.tPhi = portrait() ? 1.2 : 0.98;
    if (!menu && homeTheta !== null) cam.tTheta = homeTheta;   // in a game, back to the player's own view
    homeTheta = null;
    await tween(260, k => u.war.scale.setScalar(Math.max(0.001, lerp(1.8, REST(), k))));
    if (!armyOn) u.war.visible = false;
  }
  // a hero's silhouette, drawn once into a texture: white figure on black, weapon raised
  const shadowTex = new Map();
  function silhouette(id, side) {
    const key = id + side;
    if (shadowTex.has(key)) return shadowTex.get(key);
    const war = MODELS.warrior(L.king(side), id), j = war.userData.j;
    war.userData.flag.visible = false; war.rotation.y = 0.45;
    if (j.armR) j.armR.rotation.x = -2.5;
    const s = new THREE.Scene(); s.add(war);
    s.overrideMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false });
    war.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(war), c = b.getCenter(new THREE.Vector3()), size = b.getSize(new THREE.Vector3());
    const half = Math.max(size.y / 2, size.x) * 1.04;   // a 1:2 frame around the figure
    const cam = new THREE.OrthographicCamera(c.x - half / 2, c.x + half / 2, c.y + half, c.y - half, -10, 10);
    cam.position.set(0, 0, 5); cam.lookAt(0, 0, 0);
    const rt = new THREE.WebGLRenderTarget(256, 512);
    const clear = renderer.getClearColor(new THREE.Color()), alpha = renderer.getClearAlpha();
    renderer.setRenderTarget(rt); renderer.setClearColor('#000000', 1); renderer.clear(); renderer.render(s, cam);
    renderer.setRenderTarget(null); renderer.setClearColor(clear, alpha);
    shadowTex.set(key, rt.texture);
    return rt.texture;
  }
  // the hero's shadow falls across the board from their own edge: when they give check, and longer when they win
  const SHADOW_L = 9, SHADOW_W = 4.5;
  function heroShadow(side, win) {
    if (!renderer) return;
    const pivot = new THREE.Group(); pivot.rotation.y = L.yaw(side); scene.add(pivot);
    const m = new THREE.MeshBasicMaterial({ color: '#000000', alphaMap: silhouette(heroes[side], side), transparent: true, opacity: 0, depthWrite: false });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(SHADOW_W, SHADOW_L), m);
    plane.rotation.x = -Math.PI / 2; plane.renderOrder = 1; pivot.add(plane);
    const peak = win ? 0.62 : 0.48, ms = win ? 3200 : 1900;
    return tween(ms, k => {
      const grow = 0.82 + 0.22 * out(Math.min(1, k * 2));            // the shadow lengthens as the hero rises
      plane.scale.set(grow, grow, 1);
      plane.position.set(0, 0.006, L.edge - (SHADOW_L * grow) / 2); // feet at the hero's own edge of the board
      m.opacity = peak * Math.min(1, k * 4) * Math.min(1, (1 - k) * 3);
    }).then(() => { scene.remove(pivot); plane.geometry.dispose(); m.dispose(); });
  }

  // ---------- the hall ----------
  // list: one entry per seat, left to right: { piece (a general as models.js draws it), hero, ready } or { empty: true }.
  // null puts the hall away and brings the board back. A changed general swaps in with a puff of smoke.
  function showTable(on) {
    if (boardMesh) boardMesh.visible = on;
    for (const u of units.values()) u.root.visible = on;
    for (const side of Object.keys(trays)) for (const d of trays[side]) d.visible = on;
  }
  function hallSpot(i) {
    const base = new THREE.Group(), ped = new THREE.Group(); base.add(ped);
    const stone = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.15, 1.6, 28), new THREE.MeshStandardMaterial({ color: '#4a3a2e', roughness: 0.85 }));
    stone.position.y = -0.82; stone.castShadow = stone.receiveShadow = true; ped.add(stone);
    const trim = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.08, 28), new THREE.MeshStandardMaterial({ color: '#c9a23a', metalness: 0.6, roughness: 0.35 }));
    trim.position.y = -0.03; trim.receiveShadow = true; ped.add(trim);
    const ring = ringMesh(0.72, 0.94, '#e3b448', 0.55); ring.position.y = 0.012; ped.add(ring);
    const light = new THREE.PointLight('#ffdcae', 1.1, 7, 2); light.position.set(0, 3.2, 1.6); base.add(light);
    hall.group.add(base);
    return { i, base, ped, ring, war: null, key: null, ready: false, empty: true };
  }
  function setHall(list) {
    if (!scene) return;
    if (!list) {
      if (!hall) return;
      scene.remove(hall.group); hall = null;
      showTable(true); dragged = false; cam.tZoom = 1; resetCamera();
      return;
    }
    if (!hall) {
      hall = { group: new THREE.Group(), figs: [] }; scene.add(hall.group);
      showTable(false); clearMarks(); lastMove(-1, -1); hint(-1, -1); check(-1);
      showing++; homeTheta = null; dragged = false; cam.tZoom = 1;
    }
    const n = list.length;
    while (hall.figs.length > n) hall.group.remove(hall.figs.pop().base);
    list.forEach((p, i) => {
      const f = hall.figs[i] || (hall.figs[i] = hallSpot(i));
      const key = p.empty ? '' : `${p.piece}|${p.hero || ''}`;
      if (f.key !== key) {
        const had = f.key !== null;
        if (f.war) f.base.remove(f.war);
        f.war = null; f.key = key; f.empty = !!p.empty;
        if (!p.empty) {
          const w = MODELS.warrior(p.piece, p.hero || '');
          w.userData.flag.visible = false; w.rotation.y = 0; w.scale.setScalar(0.001);
          f.base.add(w); f.war = w;
          tween(380, k => w.scale.setScalar(Math.max(0.001, HALL_SCALE * backOut(k))));
        }
        if (had) { const at = f.base.position.clone().setY(1); smoke(at, 10, '#b8a890', 1.6); sparks(at, '#ffd27a', 18, 0.3); SFX.place(); }
      }
      f.ready = !!p.ready;
      f.ring.material.color.set(p.empty ? '#6a5a4a' : f.ready ? '#5fe0a0' : '#e3b448');
    });
    resetCamera();
  }
  // where each pedestal's front edge is on the screen, for the name cards (pixels from the top left)
  const spot = new THREE.Vector3();
  function hallSpots() {
    if (!hall) return [];
    return hall.figs.map(f => {
      spot.copy(f.base.position).add(new THREE.Vector3(0, -0.05, hallPed())).project(camera);
      return { x: ((spot.x + 1) / 2) * W, y: ((1 - spot.y) / 2) * H };
    });
  }

  // ---------- layout ----------
  // 'classic' or 'sanguo': swaps the board, empties it and its trays; setBoard and setHeroes follow
  function setLayout(name) {
    if (name === layoutName) return;
    layoutName = name; L = name === 'sanguo' ? SANGUO : CLASSIC;
    for (const u of units.values()) disposeUnit(u); units.clear();
    for (const side of Object.keys(trays)) for (const d of trays[side]) scene.remove(d);
    trays = Object.fromEntries(L.sides.map(side => [side, []]));
    heroes = Object.fromEntries(L.sides.map(side => [side, '']));
    if (!scene) return;                                  // before init(): the board is built from L then
    clearMarks(); lastMove(-1, -1); hint(-1, -1); check(-1);
    if (boardMesh) scene.remove(boardMesh);
    boardMesh = L.board(); boardMesh.visible = !hall; scene.add(boardMesh);
    Object.assign(keyLight.shadow.camera, { left: -L.shadow, right: L.shadow, top: L.shadow, bottom: -L.shadow });
    keyLight.shadow.camera.updateProjectionMatrix();
    cam.tZoom = 1; tFocus.copy(HOME); dragged = false; resetCamera();
  }

  // ---------- frame ----------
  const tmp = new THREE.Vector3();
  function loop(t) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (t - last) / 1000); last = t; clock = t;
    for (let i = tweens.length - 1; i >= 0; i--) {
      const w = tweens[i], k = Math.min(1, (clock - w.t0) / w.ms);
      try { w.fn(k); } catch (e) { console.error(e); }
      if (k >= 1) { tweens.splice(i, 1); w.res(); }
    }
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]; p.life -= dt;
      p.m.position.x += p.vx * dt; p.m.position.y += p.vy * dt; p.m.position.z += p.vz * dt;
      if (p.solid) { p.vy -= 9 * dt; if (p.m.position.y < 0.03) { p.m.position.y = 0.03; p.vy *= -0.3; p.vx *= 0.6; p.vz *= 0.6; } p.m.rotation.x += p.spin * dt; p.m.rotation.z += p.spin * dt; }
      if (p.glow) p.vy -= 4 * dt;
      if (p.grow) p.m.scale.setScalar(p.grow * (0.4 + (1 - p.life / p.max) * 0.9));
      const k = Math.max(0, p.life / p.max);
      if (p.m.material) p.m.material.opacity = p.fade ? 0.5 * k : p.solid ? Math.min(1, k * 3) : k;
      if (p.life <= 0) { scene.remove(p.m); if (p.m.material) p.m.material.dispose(); parts.splice(i, 1); }
    }
    // lifted selection, lantern sway, check pulse
    for (const u of units.values()) { const y = (u.lift || 0) * 0.22; if (!busy || u.lift) u.root.position.y += (y - u.root.position.y) * Math.min(1, dt * 12); }
    if (stage) stage.update(t, dt, camera);
    // scenery standing between the camera and the board steps aside (on the ground plane: distance to that line)
    for (const o of occluders) {
      const ax = camera.position.x, az = camera.position.z, bx = focus.x - ax, bz = focus.z - az, px = o.position.x - ax, pz = o.position.z - az;
      const k = Math.max(0, Math.min(1, (px * bx + pz * bz) / (bx * bx + bz * bz || 1)));
      o.visible = Math.hypot(px - bx * k, pz - bz * k) > o.userData.clear;
    }
    if (checkRing.visible) { const k = 0.5 + 0.5 * Math.sin(t / 160); checkRing.material.opacity = 0.5 + 0.45 * k; checkLight.intensity = 1.5 + k * 1.5; } else checkLight.intensity = 0;
    if (selRing.visible) selRing.scale.setScalar(1 + Math.sin(t / 200) * 0.04);
    // banners turn towards the camera so the characters on them always read the right way round
    for (const u of units.values()) {
      const f = u.war.userData.flag; if (!f || !u.war.visible) continue;
      f.getWorldPosition(tmp);
      f.rotation.y = Math.atan2(camera.position.x - tmp.x, camera.position.z - tmp.z) - u.war.rotation.y;
    }
    // camera
    if (menu && !hall) cam.tTheta += dt * 0.08;
    // the hall: the generals breathe; one who is ready raises their weapon
    if (hall) for (const f of hall.figs) {
      if (!f.war) { f.ring.material.opacity = 0.25 + 0.2 * Math.sin(t / 380); continue; }
      const j = f.war.userData.j;
      f.war.position.y = Math.sin(t / 650 + f.i * 1.7) * 0.025;
      if (j.armR) j.armR.rotation.x += ((j.restArm || 0) - (f.ready ? 2.4 : 0) - j.armR.rotation.x) * Math.min(1, dt * 5);
      f.ring.material.opacity = f.ready ? 0.6 + 0.3 * Math.sin(t / 260) : 0.55;
    }
    const kk = Math.min(1, dt * 5);
    cam.theta += (cam.tTheta - cam.theta) * kk; cam.phi += (cam.tPhi - cam.phi) * kk; cam.dist += (cam.tDist - cam.dist) * kk;
    const kz = Math.min(1, dt * 3); cam.zoom += (cam.tZoom - cam.zoom) * kz; focus.lerp(tFocus, kz);
    placeCamera();
    // haze starts behind the board whatever the camera distance (portrait phones sit far back)
    scene.fog.near = cam.dist * cam.zoom + 6; scene.fog.far = scene.fog.near + (stage ? stage.fogSpan : 26);
    if (shake > 0) { camera.position.x += (Math.random() - 0.5) * shake; camera.position.y += (Math.random() - 0.5) * shake; shake = Math.max(0, shake - dt * 1.2); }
    renderer.render(scene, camera);
  }

  // getters via defineProperties: Object.assign would copy their value once
  Object.defineProperties(S, { busy: { get: () => busy }, army: { get: () => armyOn } });
  return Object.assign(S, {
    init, setLayout, setHall, hallSpots, setBoard, setViewer, setArmy, select, lastMove, hint, check, play, alarm, defeat, resetCamera, setHeroes, showHero, heroShadow, setStage,
    setMenu(on) { menu = on; dragged = false; resetCamera(); },
    setInset(px) { if (px === inset) return; inset = px; if (renderer) resize(); },
    onHover(fn) { hoverFn = fn; },
  });
})();
