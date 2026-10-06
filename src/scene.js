// scene.js — the 3D view: renderer, lanterns and table, orbit camera, tapping on points, highlights and the
// battle animations (a warrior rises from the piece, marches, strikes, the defeated piece flies to the tray).
// Holds no game rules: game.js tells it what to show.
'use strict';
const VIEW = (() => {
  THREE.ColorManagement.legacyMode = false;
  const { DISC_H } = MODELS;
  const { N, R, B } = XQ;
  let renderer, scene, camera, W = 1, H = 1, inset = 0;   // inset: px covered by the side panel on the right
  const units = new Map();                 // square -> unit { piece, root, disc, war, sq }
  const trays = { 1: [], '-1': [] };       // pieces captured by Red / by Black (meshes)
  let armyOn = false, viewer = 1, menu = false, busy = false;
  let clock = performance.now(), last = clock;
  const tweens = [], parts = [];
  const pos = (s) => new THREE.Vector3(XQ.col(s) - 4, 0, XQ.row(s) - 4.5);
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
    return Math.max(6.4 / v, (portrait() ? 5.5 : 6.0) / (v * a)) * 1.02;
  }
  const portrait = () => W / H < 0.8;
  // on a portrait phone the controls cover the bottom of the screen: look more from above and aim below the
  // board's centre (towards the viewer) so the board sits higher, clear of the panel
  function resetCamera() {
    cam.tTheta = viewer > 0 ? 0 : Math.PI; cam.tPhi = portrait() ? 1.2 : 0.98; cam.tDist = fitDist();
    HOME.set(0, -0.4, portrait() ? 1.5 * viewer : 0); if (cam.tZoom === 1) tFocus.copy(HOME);
  }
  function placeCamera() {
    const cp = Math.cos(cam.phi), d = cam.dist * cam.zoom;
    camera.position.set(focus.x + d * cp * Math.sin(cam.theta), focus.y + d * Math.sin(cam.phi), focus.z + d * cp * Math.cos(cam.theta));
    camera.lookAt(focus);
  }

  // ---------- setup ----------
  let keyLight, checkRing, checkLight, selRing, hintRings = [], dots = [], capRings = [], lastMarks = [], lanterns = [], motes;
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

    scene.add(new THREE.HemisphereLight('#ffe2c0', '#2a1408', 0.8));
    keyLight = new THREE.DirectionalLight('#ffe9cc', 1.9);
    keyLight.position.set(-6, 14, 7); keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    Object.assign(keyLight.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 40 });
    keyLight.shadow.bias = -0.0005; keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);
    const rim = new THREE.DirectionalLight('#7fa4ff', 0.45); rim.position.set(8, 6, -10); scene.add(rim);

    scene.add(MODELS.table());
    scene.add(MODELS.board());
    for (const [x, z, y] of [[-11.5, -7, 7.4], [11.5, -7, 6.8], [-11.5, 7, 7], [11.5, 7, 7.6]]) {
      const l = MODELS.lantern(); l.position.set(x, y, z); scene.add(l);
      const pl = new THREE.PointLight('#ff7a3a', 1.6, 30, 2); pl.position.set(x, y, z); scene.add(pl);
      lanterns.push({ l, pl, ph: Math.random() * 6 });
    }
    // dust in the lantern light
    const n = 160, g = new THREE.BufferGeometry(), arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = (Math.random() - 0.5) * 24; arr[i * 3 + 1] = Math.random() * 8; arr[i * 3 + 2] = (Math.random() - 0.5) * 24; }
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    motes = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.09, map: glowTex, color: '#ffb36a', transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    scene.add(motes);

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
        if (pinch0) cam.tDist = Math.max(7, Math.min(32, dist0 * pinch0 / d));
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
    el.addEventListener('wheel', e => { e.preventDefault(); cam.tDist = Math.max(7, Math.min(32, cam.tDist * (1 + Math.sign(e.deltaY) * 0.08))); dragged = true; }, { passive: false });
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
    const c = Math.round(hit.x + 4), r = Math.round(hit.z + 4.5);
    if (c < 0 || c > 8 || r < 0 || r > 9 || Math.hypot(hit.x + 4 - c, hit.z + 4.5 - r) > 0.5) return -1;
    return r * 9 + c;
  }
  let hoverFn = null;
  function hover(e) { if (hoverFn) renderer.domElement.style.cursor = hoverFn(pick(e.clientX, e.clientY)) ? 'pointer' : 'grab'; }

  // ---------- units ----------
  function makeUnit(piece, s) {
    const root = new THREE.Group(), disc = MODELS.disc(piece), war = MODELS.warrior(piece);
    root.add(disc); war.position.y = DISC_H; root.add(war);
    disc.rotation.y = viewer > 0 ? 0 : Math.PI;
    war.visible = armyOn; war.scale.setScalar(armyOn ? 1 : 0.001);
    root.position.copy(pos(s)); root.userData.sq = s;
    scene.add(root);
    return { piece, root, disc, war, sq: s };
  }
  function disposeUnit(u) { scene.remove(u.root); }
  function setBoard(b, captured) {
    for (const u of units.values()) disposeUnit(u); units.clear();
    for (let s = 0; s < 90; s++) if (b[s]) units.set(s, makeUnit(b[s], s));
    for (const side of [1, -1]) { for (const d of trays[side]) scene.remove(d); trays[side] = []; }
    if (captured) for (const pc of captured) addToTray(pc, false);
    clearMarks();
  }
  function trayPos(byside, i) {
    // pieces taken by Red line up on Red's right, pieces taken by Black on Black's right
    const col = i % 2, rowI = Math.floor(i / 2);
    const x = byside > 0 ? 5.7 + col * 0.62 : -5.7 - col * 0.62, z = byside > 0 ? 4 - rowI * 0.62 : -4 + rowI * 0.62;
    return new THREE.Vector3(x, -0.7, z);
  }
  function addToTray(piece, animFrom) {
    const by = piece > 0 ? -1 : 1, d = MODELS.disc(piece, true), list = trays[by];
    d.rotation.y = viewer > 0 ? 0 : Math.PI;
    const p = trayPos(by, list.length); list.push(d); scene.add(d);
    if (!animFrom) { d.position.copy(p); return Promise.resolve(); }
    const a = animFrom.clone();
    d.position.copy(a);
    return tween(650, k => { const e = out(k); d.position.set(lerp(a.x, p.x, e), lerp(a.y, p.y, e) + Math.sin(k * Math.PI) * 2.2, lerp(a.z, p.z, e)); d.rotation.x = k * Math.PI * 2; })
      .then(() => { d.rotation.x = 0; SFX.place(); });
  }

  function setViewer(side, instant) {
    viewer = side;
    for (const u of units.values()) u.disc.rotation.y = side > 0 ? 0 : Math.PI;
    for (const s of [1, -1]) for (const d of trays[s]) d.rotation.y = side > 0 ? 0 : Math.PI;
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
  function restFacing(u) { u.war.rotation.y = u.piece > 0 ? Math.PI : 0; }
  // a warrior grows out of its piece, larger than life so the fight reads from across the table
  const BIG = () => (armyOn ? 1.35 : 1.8), REST = () => (armyOn ? 1 : 0.001);
  async function summon(u) {
    u.war.visible = true;
    const a = u.war.scale.x, b = BIG();
    await tween(280, k => u.war.scale.setScalar(Math.max(0.001, a + (b - a) * backOut(k))));
  }
  async function dismiss(u) {
    const a = u.war.scale.x, b = REST(), y0 = u.war.rotation.y, y1 = u.piece > 0 ? Math.PI : 0;
    await tween(240, k => { u.war.scale.setScalar(Math.max(0.001, lerp(a, b, k))); u.war.rotation.y = lerp(y0, y1, k); });
    if (!armyOn) u.war.visible = false;
    restFacing(u);
  }
  // per-frame pose while marching
  function marchPose(u, k, dist) {
    const j = u.war.userData.j, type = Math.abs(u.piece), ph = k * dist * 9;
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
    if (j.armR) j.armR.rotation.x = Math.abs(u.piece) === XQ.A ? -0.6 : 0;   // the advisor holds his fan up
    u.war.position.y = DISC_H;
  }
  async function march(u, to, ms) {
    const a = u.root.position.clone(), d = a.distanceTo(to), type = Math.abs(u.piece);
    if (type === N) SFX.gallop(); else if (type === R) SFX.roll(); else SFX.step();
    await tween(ms, k => {
      const e = ease(k);
      u.root.position.set(lerp(a.x, to.x, e), Math.sin(k * Math.PI) * (type === N ? 0.25 : 0.06), lerp(a.z, to.z, e));
      marchPose(u, e, d);
    });
    u.root.position.y = 0; restPose(u);
  }
  async function strike(u) {
    const j = u.war.userData.j, type = Math.abs(u.piece);
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
  async function fall(u, from) {
    // knocked back, topples, bursts into pieces; the disc flies to the tray
    const p = u.root.position, away = new THREE.Vector3(p.x - from.x, 0, p.z - from.z).normalize();
    const pal = MODELS.PAL[u.piece > 0 ? 1 : -1];
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
    await addToTray(u.piece, u.root.position.clone().setY(0.1));
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
  async function play(m, opts = {}) {
    const f = XQ.from(m), t = XQ.to(m), u = units.get(f);
    if (!u) return;
    busy = true; clearMarks(); hint(-1, -1);
    const target = units.get(t), dest = pos(t), type = Math.abs(u.piece), fast = opts.fast;
    u.root.userData.sq = t;
    if (fast) {
      if (target) { disposeUnit(target); units.delete(t); addToTray(target.piece, false); }
      units.delete(f); units.set(t, u); u.sq = t; u.root.position.copy(dest); u.lift = 0;
      lastMove(f, t); busy = false; return;
    }
    const travelMs = d => Math.min(1200, 320 + d * 170);
    if (target && opts.closeUp !== false) {
      tFocus.copy(u.root.position).lerp(dest, 0.6).setY(0.2); cam.tZoom = 0.52;
    }
    await Promise.all([summon(u), target ? summon(target) : null]);
    face(u, dest); if (target) face(target, u.root.position);
    if (target && type === XQ.C) {
      await throwStone(u, target);
      units.delete(t);
      await fall(target, u.root.position);
      await march(u, dest, travelMs(u.root.position.distanceTo(dest)));
    } else if (target) {
      const a = u.root.position.clone(), dir = dest.clone().sub(a), d = dir.length(); dir.normalize();
      const stop = dest.clone().sub(dir.multiplyScalar(0.62));
      if (d > 0.7) await march(u, stop, travelMs(d - 0.62));
      await strike(u);
      const at = dest.clone().setY(0.55);
      SFX.clash(); sparks(at, '#fff0b0', 26); flash(at, '#ffd27a', 5); shake = 0.18;
      units.delete(t);
      await fall(target, u.root.position);
      restPose(u);
      await march(u, dest, 260);
    } else {
      await march(u, dest, travelMs(u.root.position.distanceTo(dest)));
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
    tween(900, k => { if (j.armR) j.armR.rotation.x = -2.6 * Math.sin(k * Math.PI); })
      .then(() => { if (!armyOn && !busy) return tween(220, k => u.war.scale.setScalar(Math.max(0.001, 1.8 * (1 - k)))).then(() => { if (!armyOn) u.war.visible = false; }); });
  }
  // the losing general falls
  function defeat(s) {
    const u = units.get(s); if (!u) return;
    u.war.visible = true; u.war.scale.setScalar(1.8);
    tween(900, k => { u.war.rotation.x = -1.5 * out(k); });
    smoke(u.root.position.clone().setY(0.3), 8, '#4a3a2a', 1);
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
    for (const L of lanterns) { L.l.rotation.z = Math.sin(t / 1300 + L.ph) * 0.06; L.pl.intensity = 1.55 + Math.sin(t / 170 + L.ph) * 0.08 + Math.sin(t / 53 + L.ph) * 0.05; }
    if (motes) { motes.rotation.y += dt * 0.01; motes.position.y = Math.sin(t / 4000) * 0.3; }
    if (checkRing.visible) { const k = 0.5 + 0.5 * Math.sin(t / 160); checkRing.material.opacity = 0.5 + 0.45 * k; checkLight.intensity = 1.5 + k * 1.5; } else checkLight.intensity = 0;
    if (selRing.visible) selRing.scale.setScalar(1 + Math.sin(t / 200) * 0.04);
    // banners turn towards the camera so the characters on them always read the right way round
    for (const u of units.values()) {
      const f = u.war.userData.flag; if (!f || !u.war.visible) continue;
      f.getWorldPosition(tmp);
      f.rotation.y = Math.atan2(camera.position.x - tmp.x, camera.position.z - tmp.z) - u.war.rotation.y;
    }
    // camera
    if (menu) cam.tTheta += dt * 0.08;
    const kk = Math.min(1, dt * 5);
    cam.theta += (cam.tTheta - cam.theta) * kk; cam.phi += (cam.tPhi - cam.phi) * kk; cam.dist += (cam.tDist - cam.dist) * kk;
    const kz = Math.min(1, dt * 3); cam.zoom += (cam.tZoom - cam.zoom) * kz; focus.lerp(tFocus, kz);
    placeCamera();
    // haze starts behind the board whatever the camera distance (portrait phones sit far back)
    scene.fog.near = cam.dist * cam.zoom + 6; scene.fog.far = scene.fog.near + 26;
    if (shake > 0) { camera.position.x += (Math.random() - 0.5) * shake; camera.position.y += (Math.random() - 0.5) * shake; shake = Math.max(0, shake - dt * 1.2); }
    renderer.render(scene, camera);
  }

  // getters via defineProperties: Object.assign would copy their value once
  Object.defineProperties(S, { busy: { get: () => busy }, army: { get: () => armyOn } });
  return Object.assign(S, {
    init, setBoard, setViewer, setArmy, select, lastMove, hint, check, play, alarm, defeat, resetCamera,
    setMenu(on) { menu = on; if (!on) { dragged = false; resetCamera(); } },
    setInset(px) { if (px === inset) return; inset = px; if (renderer) resize(); },
    onHover(fn) { hoverFn = fn; },
  });
})();
