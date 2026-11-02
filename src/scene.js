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
  let renderer, scene, camera, W = 1, H = 1, inset = 0, lift = 0;   // inset: px covered by the side panel on the right (negative: a column on the left); lift: px covered at the bottom
  const units = new Map();                 // square -> unit { piece, root, disc, war, sq }
  let skins = { board: 'go', pieces: {}, army: {} };   // the looks (skins.js): the board's, and each side's pieces and warriors

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
    board: () => MODELS.board(skins.board), wet: MODELS.wet.classic, river: MODELS.riverDist.classic,
    inside: (x, z) => Math.abs(x) < 4.55 && Math.abs(z) < 5.05,          // within the frame
    fit: [6.4, 5.5, 6.0], edge: 5.1, shadow: 9, far: 32,   // camera framing, the hero shadow's edge (the frame's inner edge), light, zoom out
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
    board: () => MODELS.sanguoBoard(skins.board), wet: MODELS.wet.sanguo, river: MODELS.riverDist.sanguo,
    inside: (x, z) => [0, 1, 2, 3, 4, 5].every(i => x * Math.sin((i * Math.PI) / 3) + z * Math.cos((i * Math.PI) / 3) < SG.H + 0.45),
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
  let clock = performance.now(), last = clock, slowmo = 1;   // slowmo: the review's cinematic moments run slower
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
    const v = Math.tan((camera.fov * Math.PI) / 360), a = (W - Math.abs(inset)) / H, room = (H - lift) / H;
    // portrait screens fit the board's width only; the trays beside it may leave the frame
    return Math.max(L.fit[0] / (v * room), (portrait() ? L.fit[1] : L.fit[2]) / (v * a)) * 1.02;
  }
  const portrait = () => W / H < 0.8;
  // on a portrait phone the controls cover the bottom of the screen: look more from above and aim below the
  // board's centre (towards the viewer) so the board sits higher, clear of the panel
  const LOW = 0.3;                         // the low angle that shows the stage's horizon (menu, showcase)
  function resetCamera() {
    if (hall) {
      // the hall: the generals seen from the front at eye level, all of them in frame; on a portrait phone they stand in
      // the upper half, above the controls
      const v = Math.tan((camera.fov * Math.PI) / 360), a = (W - Math.abs(inset)) / H, n = Math.max(2, hall.figs.length), gap = hallGap();
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
  let keyLight, hemiLight, rimLight, checkRing, checkLight, selRing, hintRings = [], dots = [], lastMarks = [];
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
    for (const l of [hemiLight, keyLight, rimLight]) l.layers.enable(1);   // they light the pieces seen in the water too

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
    // centre the board in the part of the screen the panel (or the menu's dock) leaves free
    if (inset || lift) camera.setViewOffset(W, H, inset / 2, lift / 2, W, H); else camera.clearViewOffset();
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
  // a soft dark patch on the board under a warrior's feet, so from afar they stand on it rather than float over it
  const blobGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const blobMat = new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.42, depthWrite: false, map: (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
  })() });
  // dark: a face-down piece (cờ úp)
  function makeUnit(piece, s, dark) {
    const side = L.sideOf(piece), root = new THREE.Group(), disc = MODELS.disc(piece, false, skins.pieces[side], dark), war = MODELS.warrior(piece, heroes[side], skins.army[side], dark);
    root.add(disc); war.rotation.y = rest(piece); root.add(war);
    const blob = new THREE.Mesh(blobGeo, blobMat); blob.renderOrder = 1; blob.visible = false; root.add(blob);
    disc.rotation.y = L.yaw(viewer);
    war.visible = armyOn; war.scale.setScalar(REST());
    root.position.copy(pos(s)); root.userData.sq = s; root.visible = !hall;
    scene.add(root);
    return { piece, root, disc, war, blob, sq: s, phase: Math.random() * 100, dark: !!dark };
  }
  function disposeUnit(u) { scene.remove(u.root); }
  // captured: the pieces already taken, each a piece or [piece, side that took it]; dark: cờ úp's face-down points
  function setBoard(b, captured, dark) {
    for (const u of units.values()) disposeUnit(u); units.clear();
    for (let s = 0; s < b.length; s++) if (b[s]) units.set(s, makeUnit(b[s], s, !!(dark && dark[s])));
    for (const side of Object.keys(trays)) for (const d of trays[side]) scene.remove(d);
    trays = Object.fromEntries(L.sides.map(side => [side, []]));
    if (captured) for (const c of captured) Array.isArray(c) ? addToTray(c[0], false, c[1]) : addToTray(c, false);
    clearMarks();
  }
  function addToTray(piece, animFrom, by = L.taker(piece)) {
    const d = MODELS.disc(piece, true, skins.pieces[L.sideOf(piece)]), list = trays[by];
    d.userData.piece = piece;
    d.rotation.y = L.yaw(viewer);
    const p = L.tray(by, list.length); list.push(d); d.visible = !hall; scene.add(d);
    if (!animFrom) { d.position.copy(p); return Promise.resolve(); }
    const a = animFrom.clone();
    d.position.copy(a);
    return tween(650, k => { const e = out(k); d.position.set(lerp(a.x, p.x, e), lerp(a.y, p.y, e) + Math.sin(k * Math.PI) * 2.2, lerp(a.z, p.z, e)); d.rotation.x = k * Math.PI * 2; })
      .then(() => { d.rotation.x = 0; SFX.place(); });
  }

  // the looks (skins.js): { board, pieces: { [side]: id }, army: { [side]: id } }; what changed is built again
  function setSkins(s) {
    const was = skins;
    skins = { board: s.board || 'go', pieces: { ...s.pieces }, army: { ...s.army } };
    if (!scene) return;                                  // before init(): the board is built with them then
    if (skins.board !== was.board && boardMesh) { scene.remove(boardMesh); boardMesh = L.board(); boardMesh.visible = !hall; scene.add(boardMesh); }
    const same = k => (skins.pieces[k] || '') === (was.pieces[k] || '') && (skins.army[k] || '') === (was.army[k] || '');
    if (L.sides.every(same)) return;
    for (const [s, u] of units) { const fresh = makeUnit(u.piece, s, u.dark); disposeUnit(u); units.set(s, fresh); }
    for (const side of Object.keys(trays)) trays[side] = trays[side].map(d => {
      const p = d.userData.piece, n = MODELS.disc(p, true, skins.pieces[L.sideOf(p)]);
      n.userData.piece = p; n.position.copy(d.position); n.rotation.copy(d.rotation); n.visible = d.visible;
      scene.remove(d); scene.add(n); return n;
    });
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
      if (on) { u.war.visible = true; tween(400, k => u.war.scale.setScalar(Math.max(0.001, ARMY * backOut(k)))); }
      else tween(300, k => u.war.scale.setScalar(Math.max(0.001, ARMY * (1 - k)))).then(() => { if (!armyOn) u.war.visible = false; });
    }
  }

  // ---------- highlights ----------
  // where the selected piece can go: a mark cut into the wood that glows from inside, gold for an empty point and red,
  // notched like a target, round an enemy it can take. They light up nearest first and breathe while shown.
  function markTexture(rgb, take) {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), m = 64;
    const glow = g.createRadialGradient(m, m, 0, m, m, m);
    glow.addColorStop(0, `rgba(${rgb}, ${take ? 0.1 : 0.7})`); glow.addColorStop(take ? 0.78 : 0.5, `rgba(${rgb}, 0.3)`); glow.addColorStop(1, `rgba(${rgb}, 0)`);
    g.fillStyle = glow; g.fillRect(0, 0, 128, 128);
    g.strokeStyle = `rgba(${rgb}, 1)`; g.fillStyle = `rgba(${rgb}, 1)`; g.lineWidth = take ? 8 : 6;
    g.beginPath(); g.arc(m, m, take ? 48 : 30, 0, Math.PI * 2); g.stroke();
    if (take) for (let i = 0; i < 4; i++) { const a = Math.PI / 4 + (i * Math.PI) / 2, cs = Math.cos(a), sn = Math.sin(a); g.beginPath(); g.moveTo(m + cs * 48, m + sn * 48); g.lineTo(m + cs * 63, m + sn * 63); g.stroke(); }
    else { g.beginPath(); g.moveTo(m, m - 14); g.lineTo(m + 14, m); g.lineTo(m, m + 14); g.lineTo(m - 14, m); g.closePath(); g.fill(); }
    return new THREE.CanvasTexture(c);
  }
  let markGo = null, markTake = null;
  const markGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  function mark(take) {
    if (!markGo) { markGo = markTexture('255, 214, 120'); markTake = markTexture('255, 72, 48', true); }
    const m = new THREE.Mesh(markGeo, new THREE.MeshBasicMaterial({ map: take ? markTake : markGo, transparent: true, depthWrite: false,
      blending: take ? THREE.NormalBlending : THREE.AdditiveBlending }));   // red added onto the pale wood would wash out to white
    m.renderOrder = 3; m.userData.size = take ? 1.45 : 0.75; m.scale.setScalar(0.001); scene.add(m); return m;
  }
  function clearMarks() {
    for (const d of dots) { scene.remove(d); d.material.dispose(); } dots = [];
    selRing.visible = false; for (const u of units.values()) u.lift = 0;
  }
  function select(s, targets) {
    clearMarks();
    if (s < 0) return;
    const u = units.get(s); if (u) u.lift = 1;
    const from = pos(s);
    selRing.visible = true; selRing.position.copy(from).setY(0.012);
    targets.map(t => [t, pos(t)]).sort((a, b) => a[1].distanceTo(from) - b[1].distanceTo(from)).forEach(([t, p], i) => {
      const m = mark(units.has(t)); m.position.copy(p).setY(0.016); m.userData.ph = i * 0.7; dots.push(m);
      wait(i * 30).then(() => tween(220, k => { if (m.parent) m.scale.setScalar(m.userData.size * backOut(k)); }));
    });
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
  // water thrown up where a warrior wades, and a ring spreading on the surface
  const dropGeo = new THREE.SphereGeometry(0.032, 6, 4);
  function splash(at, n = 5, spray) {
    const y = MODELS.WATER_Y;
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(dropGeo, new THREE.MeshStandardMaterial({ color: '#effcfb', roughness: 0.1, transparent: true }));
      m.position.set(at.x, y + 0.02, at.z); scene.add(m);
      const a = Math.random() * Math.PI * 2, v = 0.4 + Math.random() * 0.9;
      parts.push({ m, vx: Math.cos(a) * v, vy: 1.2 + Math.random() * 1.6, vz: Math.sin(a) * v, life: 0.8, max: 0.8, drop: y });
    }
    if (spray) smoke(new THREE.Vector3(at.x, y, at.z), 5, '#e6f6f4', 0.55);   // a puff of spray where they hit the water
    const r = ringMesh(0.07, 0.11, '#e2f6f4', 0.75); r.position.set(at.x, y + 0.004, at.z); scene.add(r);
    tween(800, k => { r.scale.setScalar(1 + k * 4.5); r.material.opacity = 0.75 * (1 - k); })
      .then(() => { scene.remove(r); r.geometry.dispose(); r.material.dispose(); });
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
  // in the army view a warrior stands larger, on the board where its piece was
  const ARMY = 1.3, BIG = () => (armyOn ? 1.35 * ARMY : 1.8), REST = () => (armyOn ? ARMY : 0.001);
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
    u.war.position.y = bob;
  }
  function restPose(u) {
    const j = u.war.userData.j;
    if (j.legL) { j.legL.rotation.x = 0; j.legR.rotation.x = 0; }
    if (j.legs) j.legs.forEach(L => { L.rotation.x = 0; });
    if (j.body) j.body.rotation.x = 0;
    if (j.armR) j.armR.rotation.x = j.restArm || 0;      // fan bearers keep the fan up
    u.war.position.y = 0;
  }
  // standing at ease while no move is played: a look round now and then, arms easing with the breath, the banner
  // stirring, a horse tossing its head, an elephant swinging its trunk. Each unit keeps its own time (u.phase).
  function atEase(u, s) {
    const j = u.war.userData.j, p = s + u.phase, cloth = u.war.userData.cloth, breath = 0.05 + Math.sin(p * 1.6) * 0.03;
    if (j.head) j.head.rotation.y = Math.sin(p * 0.45) * 0.3 * Math.max(0, Math.sin(p * 0.17));
    if (j.armL) { j.armL.rotation.z = -breath; j.armR.rotation.z = breath; }
    if (j.neck) j.neck.rotation.x = j.neckRest + Math.sin(p * 1.3) * 0.08;
    if (j.trunk) j.trunk.rotation.x = 0.5 + Math.sin(p * 0.9) * 0.2;
    if (cloth) cloth.rotation.y = Math.sin(p * 2.1) * 0.22 + Math.sin(p * 3.7) * 0.07;
  }
  // how a warrior feels about where it stands (mood, set by the game after each move): 'afraid', a piece the enemy can
  // take next, leans back behind its shield with its head down and trembles (a piece on the board shivers);
  // 'alert', a general in check, holds the sword up and looks round. u.fear and u.alarm ease in and out.
  function setMood(m = {}) {
    const afraid = new Set(m.afraid || []);
    for (const [s, u] of units) u.mood = afraid.has(s) ? 'afraid' : s === m.alert ? 'alert' : '';
  }
  function calm(u) {
    const j = u.war.userData.j;
    u.mood = ''; u.fear = u.alarm = 0;
    u.war.rotation.x = 0; u.war.position.x = 0; u.disc.rotation.z = 0;
    if (j.head) j.head.rotation.x = 0;
    if (j.armL) j.armL.rotation.x = 0;
    if (j.armR) j.armR.rotation.x = j.restArm || 0;
  }
  function feel(u, s, dt) {
    const ease = Math.min(1, dt * 5);
    u.fear = (u.fear || 0) + ((u.mood === 'afraid' ? 1 : 0) - (u.fear || 0)) * ease;
    u.alarm = (u.alarm || 0) + ((u.mood === 'alert' ? 1 : 0) - (u.alarm || 0)) * ease;
    const f = u.fear, a = u.alarm, j = u.war.userData.j;
    if (f < 0.01 && a < 0.01) { if (u.felt) { u.felt = false; calm(u); } return; }
    u.felt = true;
    u.disc.rotation.z = Math.sin(s * 41 + u.phase) * 0.035 * f;
    if (!u.war.visible) return;
    u.war.rotation.x = -0.2 * f;
    u.war.position.x = Math.sin(s * 47 + u.phase) * 0.012 * f;
    if (j.head) { j.head.rotation.x = 0.3 * f; if (a > 0.01) j.head.rotation.y = Math.sin(s * 2.2 + u.phase) * 0.7 * a; }
    if (j.armL) j.armL.rotation.x = -1.1 * f;
    if (j.armR && a > 0.01) j.armR.rotation.x = (j.restArm || 0) - 2.2 * a;
  }
  // the length of a route: from where the unit stands through the points given
  const routeLen = (u, pts) => pts.reduce((s, p, i) => s + p.distanceTo(i ? pts[i - 1] : u.root.position.clone().setY(0)), 0);
  // march to a point, or through a list of points (the lines of the three-kingdom board bend), turning at each bend
  async function march(u, to, ms) {
    const pts = [u.root.position.clone().setY(0), ...(Array.isArray(to) ? to : [to])], type = L.typeOf(u.piece);
    const lens = pts.slice(1).map((p, i) => p.distanceTo(pts[i])), d = lens.reduce((s, x) => s + x, 0);
    if (type === N) SFX.gallop(); else if (type === R) SFX.roll(); else SFX.step();
    let leg = -1, wading = false, splashed = 0;
    await tween(ms, k => {
      const e = ease(k);
      let x = e * d, i = 0;
      while (i < lens.length - 1 && x > lens[i]) x -= lens[i++];
      const a = pts[i], b = pts[i + 1], f = lens[i] ? Math.min(1, x / lens[i]) : 1;
      if (i !== leg && lens.length > 1) { leg = i; u.war.rotation.y = Math.atan2(b.x - a.x, b.z - a.z); }
      // across a river a warrior wades in to the shins (a horse leaps it); the water splashes where they meet it
      const px = lerp(a.x, b.x, f), pz = lerp(a.z, b.z, f), w = L.wet(px, pz), hop = Math.sin(k * Math.PI) * (type === N ? 0.25 : 0.06);
      const y = type === N ? hop : hop * (1 - w) - w * 0.07;
      u.root.position.set(px, y, pz);
      if (w > 0.3 && y < 0.04) {
        if (!wading) { wading = true; splash(u.root.position, type === N ? 22 : 14, true); SFX.splash(); }
        else if (clock - splashed > 110) { splashed = clock; splash(u.root.position, 5); }
      } else if (w < 0.1) wading = false;
      marchPose(u, e, d);
    });
    u.root.position.y = 0; restPose(u);
  }
  // the blow, by kind of warrior: the elephant rears and stamps, the horse rears and tramples, the chariot backs up and
  // rams, the soldier lowers the spear and thrusts, the advisor sweeps a gust from the fan, the general cuts down.
  // A general led by a hero strikes in their own way (HERO_STRIKE).
  async function strike(u) {
    const j = u.war.userData.j, type = L.typeOf(u.piece), yaw = u.war.rotation.y, ahead = u.root.position.clone().add(new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)).multiplyScalar(0.6));
    const lunge = d => { u.war.position.x = Math.sin(yaw) * d; u.war.position.z = Math.cos(yaw) * d; };
    const arm = (a, b, ms) => tween(ms, k => { if (j.armR) j.armR.rotation.x = lerp(a, b, out(k)); });
    const cut = async () => { await arm(j.restArm || 0, -2.4, 240); SFX.whoosh(); await tween(120, k => { if (j.armR) j.armR.rotation.x = lerp(-2.4, 0.9, k); lunge(0.18 * k); }); };
    const thrust = async (ms = 110) => { await arm(j.armR ? j.armR.rotation.x : 0, -0.3, 160); SFX.whoosh(); await tween(ms, k => { if (j.armR) j.armR.rotation.x = lerp(-0.3, 1.0, k); lunge(0.22 * k); }); await tween(120, k => lunge(0.22 * (1 - k))); };
    const hero = HERO_STRIKE[u.war.userData.hero];
    if (hero) await hero(u, j, { cut, thrust, lunge, arm, ahead });
    else if (type === B) {
      await tween(260, k => { j.body.rotation.x = -0.45 * out(k); if (j.trunk) j.trunk.rotation.x = 0.5 - 1.4 * k; });
      await tween(140, k => { j.body.rotation.x = -0.45 * (1 - k) + 0.12 * k; });
      dustRing(ahead); shake = Math.max(shake, 0.12);
    } else if (type === N) {
      const front = (j.legs || []).slice(0, 2);
      await tween(260, k => { j.body.rotation.x = -0.6 * out(k); for (const l of front) l.rotation.x = -1.1 * Math.sin(k * Math.PI * 2); if (j.armR) j.armR.rotation.x = -2.2 * out(k); });
      SFX.whoosh();
      await tween(140, k => { j.body.rotation.x = lerp(-0.6, 0.08, k); lunge(0.25 * k); if (j.armR) j.armR.rotation.x = lerp(-2.2, 0.9, k); });
      SFX.gallop(); dustRing(ahead); shake = Math.max(shake, 0.1);
      j.body.rotation.x = 0; for (const l of front) l.rotation.x = 0;
    } else if (type === R) {
      SFX.roll();
      await tween(220, k => { lunge(-0.15 * out(k)); for (const w of j.wheels || []) w.rotation.x -= 0.15; });
      await tween(130, k => { lunge(lerp(-0.15, 0.4, k)); for (const w of j.wheels || []) w.rotation.x += 0.4; });
      SFX.thud(); dustRing(ahead); shake = Math.max(shake, 0.16);
    } else if (type === XQ.P) await thrust();
    else if (type === XQ.A) await gust(u, j, ahead);
    else await cut();
    const d0 = u.war.position.x * Math.sin(yaw) + u.war.position.z * Math.cos(yaw);   // back to where they stood
    await tween(120, k => lunge(d0 * (1 - k)));
    u.war.position.x = 0; u.war.position.z = 0; u.war.rotation.y = yaw;
  }
  // the fan swept forward, a gust of wind flying from it at the enemy
  async function gust(u, j, ahead) {
    await tween(220, k => { j.armR.rotation.x = lerp(j.restArm || 0, -1.9, out(k)); });
    SFX.whoosh();
    const from = u.root.position.clone().setY(0.5), dir = ahead.clone().setY(0.5).sub(from).normalize();
    for (let i = 0; i < 14; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#eef6ff', transparent: true, opacity: 0.6, depthWrite: false }));
      s.position.copy(from).add(new THREE.Vector3((Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.2)); s.scale.setScalar(0.25);
      scene.add(s);
      const v = 2.5 + Math.random() * 1.5;
      parts.push({ m: s, vx: dir.x * v, vy: (Math.random() - 0.3) * 0.4, vz: dir.z * v, life: 0.45, max: 0.45, grow: 0.5, fade: true });
    }
    await tween(160, k => { j.armR.rotation.x = lerp(-1.9, 0.6, k); });
  }
  // the heroes' own blows (heroes.js ids); the rest cut down like any general
  const HERO_STRIKE = {
    // Guan Yu sweeps the Green Dragon blade round in a full circle, then brings it down
    'quan-vu': async (u, j, s) => {
      SFX.whoosh(); const y = u.war.rotation.y;
      await tween(420, k => { u.war.rotation.y = y + out(k) * Math.PI * 2; j.armR.rotation.x = -1.6 * Math.sin(k * Math.PI); });
      u.war.rotation.y = y; await s.cut();
    },
    // Zhang Fei roars first, the ground shaking, then drives the serpent spear in
    'truong-phi': async (u, j, s) => {
      SFX.drum(); shake = Math.max(shake, 0.18);
      await tween(380, k => { j.head.rotation.x = -0.5 * Math.sin(k * Math.PI); u.war.scale.setScalar(BIG() * (1 + 0.12 * Math.sin(k * Math.PI))); });
      await s.thrust(90);
    },
    // Zhao Yun and Ma Chao: three thrusts, quick as lightning
    'trieu-van': async (u, j, s) => { for (let i = 0; i < 3; i++) await s.thrust(70); },
    'ma-sieu': async (u, j, s) => { for (let i = 0; i < 3; i++) await s.thrust(70); },
    // Lü Bu leaps high and brings the halberd down, the board shaking under him
    'lu-bo': async (u, j, s) => {
      await tween(300, k => { u.war.position.y = Math.sin(k * Math.PI * 0.5) * 0.45; j.armR.rotation.x = -2.6 * out(k); s.lunge(0.15 * k); });
      SFX.whoosh();
      await tween(140, k => { u.war.position.y = 0.45 * (1 - k); j.armR.rotation.x = lerp(-2.6, 1.0, k); s.lunge(lerp(0.15, 0.3, k)); });
      SFX.thud(); dustRing(s.ahead); smoke(s.ahead.clone().setY(0.1), 5, '#8a7a6a', 0.8); shake = Math.max(shake, 0.28);
    },
    // Zhuge Liang's feather fan raises a gale
    'gia-cat-luong': (u, j, s) => gust(u, j, s.ahead),
  };
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
  // cờ úp: a face-down piece is turned up, its hooded figure vanishing in a puff as the piece flips over to show what
  // it really is
  function wear(u, piece) {
    const side = L.sideOf(piece), disc = MODELS.disc(piece, false, skins.pieces[side]), war = MODELS.warrior(piece, heroes[side], skins.army[side]);
    disc.rotation.y = L.yaw(viewer); war.rotation.y = u.war.rotation.y; war.visible = u.war.visible; war.scale.copy(u.war.scale);
    u.root.remove(u.disc); u.root.remove(u.war); u.root.add(disc); u.root.add(war);
    u.mirrored = false; Object.assign(u, { piece, disc, war, dark: false });
  }
  async function turnUp(u, piece, fast) {
    if (!u || !u.dark || !piece) return;
    if (fast) { wear(u, piece); return; }
    const at = u.root.position.clone().setY(0.45), s0 = u.war.scale.x;
    SFX.whoosh(); smoke(at, 12, '#d9cfbf', 0.8); sparks(at, '#ffe6a8', 18, 0.18);
    await tween(170, k => { u.disc.rotation.x = k * Math.PI / 2; u.disc.position.y = k * 0.3; u.war.scale.setScalar(Math.max(0.001, s0 * (1 - k))); });
    wear(u, piece);
    u.disc.rotation.x = -Math.PI / 2; u.disc.position.y = 0.3;
    await tween(230, k => { const e = out(k); u.disc.rotation.x = -Math.PI / 2 * (1 - e); u.disc.position.y = 0.3 * (1 - e); u.war.scale.setScalar(Math.max(0.001, s0 * backOut(k))); });
    SFX.place();
  }
  // opts.reveal: the piece the move turns up (cờ úp); opts.taken: the face-down piece it takes, as it really is;
  // opts.cinema: a moment of the review ('good', 'blunder', 'mate'): the camera drops low beside the move and the
  // field slows down, then it all comes back
  async function play(m, opts = {}) {
    const f = L.from(m), t = L.to(m), u = units.get(f);
    if (!u) return;
    busy = true; clearMarks(); hint(-1, -1);
    for (const x of units.values()) if (x.felt || x.mood) calm(x);   // the move changes everything: moods are set again after it
    if (opts.cinema && !opts.fast) {
      dragged = false; showing++;
      tFocus.copy(pos(f)).lerp(pos(t), 0.6).setY(0.4); cam.tZoom = 0.4; cam.tPhi = 0.6; cam.tTheta = cam.theta + (Math.random() < 0.5 ? -0.5 : 0.5);
      await wait(350); slowmo = 0.6;
    }
    const target = units.get(t), fast = opts.fast;
    await Promise.all([target && opts.taken ? turnUp(target, opts.taken, fast) : null, opts.reveal ? turnUp(u, opts.reveal, fast) : null]);
    const dest = pos(t), type = L.typeOf(u.piece), by = L.sideOf(u.piece);
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
    if (opts.cinema) {                                     // the moment lands: gold for a fine move, ash for a blunder
      const at = dest.clone().setY(0.6);
      if (opts.cinema === 'blunder') smoke(at, 14, '#3a3030', 1.1); else { sparks(at, '#ffd27a', 36, 0.26); flash(at, '#ffcf6a', 5); }
      await wait(300); slowmo = 1;
      if (opts.cinema !== 'mate') await wait(450);
    }
    if (opts.cinema !== 'mate') { tFocus.copy(HOME); cam.tZoom = 1; if (opts.cinema) resetCamera(); }
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
  // the losing general falls. At the end of a game (final) the field stops for it: the camera drops low and circles
  // the beaten general as they sink to their knees, then turns to the winner, who leaps and raises their weapon in a
  // burst of gold; the beaten side's banners come down to half-mast and its warriors bow, the winners raise their arms.
  // Returns how long that takes (ms), for the end of game panel to wait.
  const FINALE = 3400;
  function defeat(s, final) {
    const u = units.get(s); if (!u) return 0;
    if (!final) {
      u.war.visible = true; u.war.scale.setScalar(1.8);
      tween(900, k => { u.war.rotation.x = -1.5 * out(k); });
      smoke(u.root.position.clone().setY(0.3), 8, '#4a3a2a', 1);
      return 0;
    }
    const side = L.sideOf(u.piece), w = [...units.values()].find(x => x.piece === L.king(-side));
    const run = ++showing;                                 // a hero preview still running gives way
    const grow = x => { x.war.visible = true; const a = x.war.scale.x; return tween(450, k => x.war.scale.setScalar(Math.max(0.001, lerp(a, 1.8, out(k))))); };
    // the camera: low, close on the beaten general, circling a little
    dragged = false; cam.tPhi = 0.5; cam.tZoom = 0.32; cam.tTheta = cam.theta + 0.5;
    tFocus.copy(u.root.position).setY(0.5);
    SFX.drum();
    // the beaten general kneels: legs folded back under them, the body bowed, the head down
    const j = u.war.userData.j, fig = u.war.userData.fig.scale.x;
    grow(u).then(() => tween(900, k => {
      const e = out(k);
      if (j.legL) { j.legL.rotation.x = j.legR.rotation.x = 1.45 * e; u.war.position.y = -0.2 * fig * 1.8 * e; }
      u.war.rotation.x = 0.35 * e; if (j.head) j.head.rotation.x = 0.55 * e; if (j.armR) j.armR.rotation.x = 0.5 * e;
    }));
    smoke(u.root.position.clone().setY(0.2), 6, '#4a3a2a', 0.9);
    // the beaten side's banners to half-mast, its warriors bowing; the winners raising their weapons
    for (const x of units.values()) {
      if (x === u || x === w) continue;
      const xj = x.war.userData.j, cloth = x.war.userData.cloth, mine = L.sideOf(x.piece) === side, d = Math.random() * 400;
      if (mine) { const y0 = cloth.position.y; wait(600 + d).then(() => tween(1200, k => { cloth.position.y = y0 - 0.32 * out(k); if (xj.head) xj.head.rotation.x = 0.4 * out(k); })); }
      else if (xj.armR) wait(1500 + d).then(() => tween(500, k => { xj.armR.rotation.x = (xj.restArm || 0) - 2.4 * out(k); }));
    }
    // then the winner
    if (w) wait(1500).then(() => {
      if (run !== showing) return;
      tFocus.copy(w.root.position).setY(0.7); cam.tTheta = cam.theta + 0.6; cam.tZoom = 0.36;
      const wj = w.war.userData.j;
      grow(w).then(() => {
        SFX.drum();
        const at = w.root.position.clone().setY(1.1);
        sparks(at, '#ffd27a', 40, 0.3); flash(at, '#ffcf6a', 6);
        tween(700, k => { w.war.position.y = Math.sin(k * Math.PI) * 0.35; if (wj.armR) wj.armR.rotation.x = (wj.restArm || 0) - 2.7 * out(Math.min(1, k * 2)); });
      });
    });
    // and back to the whole board once the panel is up
    wait(FINALE + 1200).then(() => { if (run === showing && !dragged) { tFocus.copy(HOME); cam.tZoom = 1; resetCamera(); } });
    return FINALE;
  }

  // ---------- stage ----------
  // replace everything around the table, with its light, sky and haze; the board and pieces stay as they are
  let wantStage = 'room';
  // where the board is and where its water, for the weather (asked of whichever board is out when it falls)
  const onBoard = { inside: (x, z) => L.inside(x, z), wet: (x, z) => L.wet(x, z) };
  function setStage(id) {
    wantStage = STAGES.valid(id) ? id : 'room';
    if (!scene || wantStage === stageId) return;          // before init() the wish is kept for it
    if (stage) scene.remove(stage.group);
    const low = Math.min(innerWidth, innerHeight) < 600 || (navigator.hardwareConcurrency || 8) <= 4;
    stage = STAGES.build(wantStage, { glowTex, low, ...onBoard }); stageId = wantStage;
    if (stage.sky) stage.group.add(stage.sky);
    scene.add(stage.group);
    occluders = []; stage.group.traverse(o => { if (o.userData.clear) occluders.push(o); });
    stage.group.traverse(o => { if (o.isMesh && !o.material.transparent) o.receiveShadow = true; });
    applyDaytime(true);                                  // its light, sky and haze, at this time of day
    SFX.music(stageId);
    if (!menu && !hall) showcase();
  }
  // what the metal, the water and the lacquer reflect (models.js): a dim sphere in the stage's sky and ground colours
  // with a bright window where the key light is, blurred into an environment map
  let pmrem = null, envTarget = null;
  function makeEnvironment(light) {
    if (!pmrem) pmrem = new THREE.PMREMGenerator(renderer);
    const room = new THREE.Scene(), sky = new THREE.Color(light.hemi[0]), ground = new THREE.Color(light.hemi[1]);
    const ball = new THREE.SphereGeometry(10, 24, 12), p = ball.attributes.position, col = [];
    for (let i = 0; i < p.count; i++) { const k = (p.getY(i) / 10 + 1) / 2, c = ground.clone().lerp(sky, k).multiplyScalar(0.2 + 0.6 * k); col.push(c.r, c.g, c.b); }
    ball.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    room.add(new THREE.Mesh(ball, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
    const win = new THREE.Mesh(new THREE.PlaneGeometry(7, 4), new THREE.MeshBasicMaterial({ color: new THREE.Color(light.key[0]).multiplyScalar(light.key[1] * 2), side: THREE.DoubleSide }));
    win.position.copy(keyLight.position).setLength(8); win.lookAt(0, 0, 0); room.add(win);
    const target = pmrem.fromScene(room, 0.02);
    MODELS.setEnvMap(target.texture);
    if (envTarget) envTarget.dispose();
    envTarget = target;
    ball.dispose(); win.geometry.dispose();
  }
  // ---------- day and night ----------
  // The stages set by day follow the clock (or the player's choice, setDaytime): at dusk and dawn the light turns gold,
  // at night the sky darkens to blue under stars and a moon, the light becomes moonlight and a lamp over the table
  // keeps the pieces readable. The stages already set at night (NIGHT) keep their own.
  const NIGHT = new Set(['room', 'xich-bich', 'ngu-truong']);
  let daytime = 'auto', nightSky = null, nightLamp = null, dayShown = '', dayF = 0;
  const smooth = (a, b, x) => Math.max(0, Math.min(1, (x - a) / (b - a)));
  // f: how far into the night (0 day, 1 night); w: the gold of dusk or dawn
  function nightOf(now = new Date()) {
    if (daytime === 'day') return { f: 0, w: 0 };
    if (daytime === 'night') return { f: 1, w: 0 };
    const h = now.getHours() + now.getMinutes() / 60;
    const f = h >= 12 ? smooth(17.6, 19.4, h) : 1 - smooth(4.8, 6.4, h);
    const w = h >= 12 ? Math.max(0, 1 - Math.abs(h - 18) / 1.6) : Math.max(0, 1 - Math.abs(h - 5.8) / 1.2);
    return { f, w: w * (1 - f) };
  }
  function makeNightSky() {
    const g = new THREE.Group(), n = 900, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {                        // over the upper part of a sphere inside the sky's dome
      const yaw = Math.random() * Math.PI * 2, up = Math.asin(0.06 + Math.random() * 0.94), r = 88;
      a[i * 3] = Math.cos(up) * Math.cos(yaw) * r; a[i * 3 + 1] = Math.sin(up) * r; a[i * 3 + 2] = Math.cos(up) * Math.sin(yaw) * r;
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(a, 3));
    const stars = new THREE.Points(geo, new THREE.PointsMaterial({ size: 1.9, map: glowTex, color: '#e4ecff', transparent: true, opacity: 0, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
    const moon = new THREE.Mesh(new THREE.CircleGeometry(2.6, 40), new THREE.MeshBasicMaterial({ color: '#f6f0da', transparent: true, opacity: 0, fog: false, depthWrite: false }));
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#9fb4ff', transparent: true, opacity: 0, fog: false, depthWrite: false, blending: THREE.AdditiveBlending }));
    moon.position.set(-34, 36, -62); moon.lookAt(0, 0, 0); halo.position.copy(moon.position); halo.scale.setScalar(22);
    // the night itself: a veil over the stage's sky (and behind its scenery), drawn before anything else see-through
    const veil = new THREE.Mesh(new THREE.SphereGeometry(92, 32, 16), new THREE.MeshBasicMaterial({ color: '#081129', side: THREE.BackSide, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    veil.renderOrder = -0.95; stars.renderOrder = halo.renderOrder = -0.9; moon.renderOrder = -0.85;
    g.add(veil, stars, halo, moon);
    g.userData = { stars, moon, halo, veil };
    return g;
  }
  function applyDaytime(force) {
    if (!scene || !stage) return;
    const { f, w } = NIGHT.has(stageId) ? { f: 0, w: 0 } : nightOf(), key = Math.round(f * 24) + ':' + Math.round(w * 24);
    if (!force && key === dayShown) return;
    dayShown = key; dayF = f;
    const L = stage.light, C = c => new THREE.Color(c), MOON = C('#7d8fc8'), GOLD = C('#ffb46a'), DARK = C('#070b18');
    hemiLight.color.copy(C(L.hemi[0]).lerp(GOLD, w * 0.35).lerp(MOON, f)); hemiLight.groundColor.copy(C(L.hemi[1]).multiplyScalar(1 - 0.6 * f));
    hemiLight.intensity = L.hemi[2] * (1 - 0.6 * f);
    keyLight.color.copy(C(L.key[0]).lerp(GOLD, w * 0.6).lerp(C('#aebcff'), f)); keyLight.intensity = L.key[1] * (1 - 0.6 * f);
    rimLight.color.copy(C(L.rim[0]).lerp(C('#6a84d8'), f)); rimLight.intensity = L.rim[1] * (1 + 0.4 * f);
    scene.background = C(stage.background || stage.fog).lerp(GOLD, w * 0.3).lerp(DARK, f * 0.9);
    scene.fog.color.copy(C(stage.fog).lerp(GOLD, w * 0.35).lerp(DARK, f * 0.85));
    if (stage.sky) stage.sky.material.color.copy(C('#ffffff').lerp(C('#ffb27a'), w * 0.7));
    if (!nightSky) {
      nightSky = makeNightSky(); scene.add(nightSky);
      nightLamp = new THREE.PointLight('#ffb064', 0, 26, 2); nightLamp.position.set(0, 7.5, 3); nightLamp.layers.enable(1); scene.add(nightLamp);
    }
    nightSky.visible = f > 0.01;
    const n = nightSky.userData;
    n.stars.material.opacity = f; n.moon.material.opacity = f; n.halo.material.opacity = 0.45 * f; n.veil.material.opacity = 0.9 * f;
    nightLamp.intensity = 1.2 * f;
    const hex = c => '#' + c.getHexString();
    makeEnvironment({ hemi: [hex(hemiLight.color), hex(hemiLight.groundColor), hemiLight.intensity], key: [hex(keyLight.color), keyLight.intensity] });
  }
  // 'auto' (the clock), 'day' or 'night'
  function setDaytime(mode) { daytime = ['day', 'night'].includes(mode) ? mode : 'auto'; applyDaytime(true); }
  setInterval(() => applyDaytime(false), 60000);

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
        u.war = MODELS.warrior(u.piece, heroes[side], skins.army[side]);
        u.war.rotation.y = rest(u.piece); u.war.visible = shown; u.war.scale.setScalar(scale);
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
  // a player's emote: their general rises from its piece and raises the weapon (left alone while a move is played),
  // or in the hall, the figure on their pedestal (seat: its place from the left) leaps and raises it
  function cheer(side, seat) {
    if (hall) { const f = hall.figs[seat]; if (f && f.war) f.cheer = clock + 1500; return; }
    if (busy) return;
    const u = [...units.values()].find(x => x.piece === L.king(side));
    if (!u || u.cheering) return;
    u.cheering = true;
    const j = u.war.userData.j, a = u.war.scale.x;
    u.war.visible = true;
    tween(260, k => u.war.scale.setScalar(Math.max(0.001, lerp(a, BIG(), backOut(k)))))
      .then(() => tween(900, k => { if (j.armR) j.armR.rotation.x = (j.restArm || 0) - 2.6 * Math.sin(k * Math.PI); }))
      .then(() => wait(400))
      .then(() => (busy ? null : tween(240, k => u.war.scale.setScalar(Math.max(0.001, lerp(BIG(), REST(), k))))))
      .then(() => { if (!armyOn && !busy) u.war.visible = false; u.cheering = false; });
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
  // stepping down when the frames come slowly: over each two seconds, if most frames took longer than 1/40 s, that is
  // a slow spell, and two in a row take the quality one step down (never back up by itself). Gaps of 0.75 s and more
  // don't count: a covered window gets a frame a second from the browser, whatever the drawing costs.
  const pace = { t0: 0, n: 0, slow: 0, spells: 0 };
  function watchPace(t, gap) {
    if (quality === 'low' || gap >= 0.75) return;
    if (!pace.t0) pace.t0 = t;
    pace.n++; if (gap > 1 / 40) pace.slow++;
    if (t - pace.t0 < 2000) return;
    pace.spells = pace.n >= 5 && pace.slow / pace.n > 0.6 ? pace.spells + 1 : 0;
    if (pace.spells >= 2) { pace.spells = 0; setQuality(quality === 'high' ? 'medium' : 'low'); }
    pace.t0 = t; pace.n = pace.slow = 0;
  }
  function loop(t) {
    requestAnimationFrame(loop);
    const gap = (t - last) / 1000, dt = Math.min(0.05, gap); clock += (t - last) * slowmo; last = t;
    watchPace(t, gap);
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
      if (p.drop !== undefined) { p.vy -= 9 * dt; if (p.vy < 0 && p.m.position.y < p.drop) p.life = 0; }   // a drop falls back into the water
      if (p.grow) p.m.scale.setScalar(p.grow * (0.4 + (1 - p.life / p.max) * 0.9));
      const k = Math.max(0, p.life / p.max);
      if (p.m.material) p.m.material.opacity = p.fade ? 0.5 * k : p.solid ? Math.min(1, k * 3) : k;
      if (p.life <= 0) { scene.remove(p.m); if (p.m.material) p.m.material.dispose(); parts.splice(i, 1); }
    }
    // lifted selection, lantern sway, check pulse
    for (const u of units.values()) { const y = (u.lift || 0) * 0.22; if (!busy || u.lift) u.root.position.y += (y - u.root.position.y) * Math.min(1, dt * 12); }
    // a warrior stands on the board itself: once it has grown out of its piece the piece is put away (still tappable)
    for (const u of units.values()) {
      u.disc.visible = !(u.war.visible && u.war.scale.x > 0.3);
      // the patch under the feet stays on the board, smaller and fainter as they leave it; none in a river
      const p = u.root.position, up = Math.max(0, p.y), show = !u.disc.visible && L.wet(p.x, p.z) < 0.2;
      u.blob.visible = show;
      if (show) { u.blob.position.y = 0.004 - p.y; u.blob.scale.setScalar(u.war.scale.x * 0.62 / (1 + up * 2)); }
    }
    if (!busy) for (const u of units.values()) { if (u.war.visible && !u.cheering) atEase(u, t / 1000); if (!u.cheering) feel(u, t / 1000, dt); }
    if (stage) stage.update(t, dt, camera);
    if (nightSky && nightSky.visible) nightSky.userData.stars.material.opacity = dayF * (0.82 + 0.18 * Math.sin(t / 900));   // the stars twinkle
    // scenery standing between the camera and the board steps aside (on the ground plane: distance to that line)
    for (const o of occluders) {
      const ax = camera.position.x, az = camera.position.z, bx = focus.x - ax, bz = focus.z - az, px = o.position.x - ax, pz = o.position.z - az;
      const k = Math.max(0, Math.min(1, (px * bx + pz * bz) / (bx * bx + bz * bz || 1)));
      o.visible = Math.hypot(px - bx * k, pz - bz * k) > o.userData.clear;
    }
    if (checkRing.visible) { const k = 0.5 + 0.5 * Math.sin(t / 160); checkRing.material.opacity = 0.5 + 0.45 * k; checkLight.intensity = 1.5 + k * 1.5; } else checkLight.intensity = 0;
    if (selRing.visible) selRing.scale.setScalar(1 + Math.sin(t / 200) * 0.04);
    for (const d of dots) d.material.opacity = 0.72 + 0.28 * Math.sin(t / 280 - d.userData.ph);
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
      const j = f.war.userData.j, c = f.cheer > t ? Math.sin((1 - (f.cheer - t) / 1500) * Math.PI) : 0;   // an emote
      f.war.position.y = Math.sin(t / 650 + f.i * 1.7) * 0.025 + 0.3 * c;
      if (j.armR) j.armR.rotation.x += ((j.restArm || 0) - Math.max(f.ready ? 2.4 : 0, 2.6 * c) - j.armR.rotation.x) * Math.min(1, dt * 5);
      f.ring.material.opacity = f.ready ? 0.6 + 0.3 * Math.sin(t / 260) : 0.55;
    }
    const kk = Math.min(1, dt * 5);
    cam.theta += (cam.tTheta - cam.theta) * kk; cam.phi += (cam.tPhi - cam.phi) * kk; cam.dist += (cam.tDist - cam.dist) * kk;
    const kz = Math.min(1, dt * 3); cam.zoom += (cam.tZoom - cam.zoom) * kz; focus.lerp(tFocus, kz);
    placeCamera();
    // haze starts behind the board whatever the camera distance (portrait phones sit far back)
    scene.fog.near = cam.dist * cam.zoom + 6; scene.fog.far = scene.fog.near + (stage ? stage.fogSpan : 26);
    if (shake > 0) { camera.position.x += (Math.random() - 0.5) * shake; camera.position.y += (Math.random() - 0.5) * shake; shake = Math.max(0, shake - dt * 1.2); }
    if (reflections) reflect();
    renderer.render(scene, camera);
  }
  // the pieces near a river, seen from under its surface: drawn on their own (layer 1, with the lights) into a picture
  // the water shows (models.js REFLECT). A camera mirrored in the water's plane, as three.js's Reflector does it.
  let reflections = true;
  // how much the device can take. 'high': everything. 'medium': no pieces in the rivers' water, a smaller shadow map,
  // at most 1.5 pixels to the screen's px. 'low': no cast shadows (the patches under warriors' feet stay), 1 pixel.
  let quality = 'high';
  function setQuality(q) {
    if (!renderer || !['high', 'medium', 'low'].includes(q) || q === quality) return;
    quality = q;
    reflections = q === 'high'; if (!reflections) MODELS.REFLECT.strength.value = 0;
    renderer.setPixelRatio(Math.min(q === 'high' ? 2 : q === 'medium' ? 1.5 : 1, window.devicePixelRatio || 1)); resize();
    const size = q === 'high' ? 2048 : 1024;
    if (keyLight.shadow.mapSize.x !== size) { keyLight.shadow.mapSize.set(size, size); if (keyLight.shadow.map) { keyLight.shadow.map.dispose(); keyLight.shadow.map = null; } }
    const shadows = q !== 'low';
    if (renderer.shadowMap.enabled !== shadows) {                // the shaders change with it
      renderer.shadowMap.enabled = shadows;
      scene.traverse(o => { if (o.material) for (const m of [].concat(o.material)) m.needsUpdate = true; });
    }
    if (S.onQuality) S.onQuality(q);
  }
  const reflRT = new THREE.WebGLRenderTarget(512, 512), reflCam = new THREE.PerspectiveCamera();
  reflCam.layers.set(1);
  const RN = new THREE.Vector3(0, 1, 0), rp = new THREE.Vector3(), rv = new THREE.Vector3(), rlook = new THREE.Vector3(), rrot = new THREE.Matrix4();
  const BIAS = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
  function reflect() {
    // which pieces are near enough a river to show in it: they join layer 1, the others leave it
    const far = L.river ? 1.6 : -1;                      // the rows either side of it, and the soldiers' behind them
    for (const u of units.values()) {
      const near = u.root.visible && L.river(u.root.position.x, u.root.position.z) < far;
      if (near !== !!u.mirrored) { u.mirrored = near; for (const o of [u.disc, u.war]) o.traverse(m => { if (m.isMesh) near ? m.layers.enable(1) : m.layers.disable(1); }); }
    }
    const R = MODELS.REFLECT, Y = MODELS.WATER_Y;
    rp.set(0, Y, 0);
    camera.updateMatrixWorld(); rrot.extractRotation(camera.matrixWorld);
    rv.copy(rp).sub(camera.position).reflect(RN).negate().add(rp);                       // the camera, mirrored
    rlook.set(0, 0, -1).applyMatrix4(rrot).add(camera.position);
    rlook.subVectors(rp, rlook).reflect(RN).negate().add(rp);                             // where it looks, mirrored
    reflCam.position.copy(rv); reflCam.up.set(0, 1, 0).applyMatrix4(rrot).reflect(RN); reflCam.lookAt(rlook);
    reflCam.projectionMatrix.copy(camera.projectionMatrix); reflCam.updateMatrixWorld();
    R.matrix.value.copy(BIAS).multiply(reflCam.projectionMatrix).multiply(reflCam.matrixWorldInverse);
    // drawn on a clear picture (no sky, no shadows worked out again)
    const bg = scene.background, auto = renderer.shadowMap.autoUpdate, clear = renderer.getClearColor(new THREE.Color()), alpha = renderer.getClearAlpha();
    scene.background = null; renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(reflRT); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(scene, reflCam);
    renderer.setRenderTarget(null); renderer.setClearColor(clear, alpha); scene.background = bg; renderer.shadowMap.autoUpdate = auto;
    R.map.value = reflRT.texture; R.strength.value = 0.55;
  }

  // getters via defineProperties: Object.assign would copy their value once
  Object.defineProperties(S, { busy: { get: () => busy }, army: { get: () => armyOn } });
  return Object.assign(S, {
    init, setLayout, setHall, hallSpots, setBoard, setViewer, setArmy, setSkins, setQuality, select, lastMove, hint, check, play, alarm, defeat, resetCamera, setHeroes, showHero, heroShadow, setStage, setDaytime, cheer, setMood,
    setMenu(on) { menu = on; dragged = false; resetCamera(); },
    setInset(px, up = 0) { if (px === inset && up === lift) return; inset = px; lift = up; if (renderer) resize(); },
    onHover(fn) { hoverFn = fn; },
  });
})();
