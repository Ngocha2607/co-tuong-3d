// portraits.js — the heroes on the menu's dock: the heroes themselves (models.js), first posed and rendered once into
// still images with a renderer of their own that is let go straight after, then alive and at blows in a small
// picture of their own for as long as the dock shows them (show)
'use strict';
const PORTRAITS = (() => {
  // who stands where: x along the line, z towards the viewer, turn 0 faces the viewer (+ turns them to their left),
  // raise lifts the weapon arm (the hero preview's pose in scene.js); zoom closes in past the frame the figures fit
  // (long weapons widen it)
  const CAST = {
    xq: { zoom: 1.08, figs: [   // two players: Quan Vũ of Red against Lữ Bố of Black
      { piece: 1, hero: 'quan-vu', x: -0.34, z: 0, turn: 0.8, raise: -2.5 },
      { piece: -1, hero: 'lu-bo', x: 0.34, z: 0, turn: -0.8, raise: -1.7 },
    ] },
    sg: { zoom: 1, figs: [   // three kingdoms: Thục, Ngụy at the back, Ngô
      { piece: 21, hero: 'luu-bi', x: -0.62, z: 0.12, turn: 0.55, raise: -1.4 },
      { piece: 41, hero: 'tao-thao', x: 0, z: -0.3, turn: 0, raise: -2.5 },
      { piece: 31, hero: 'ton-quyen', x: 0.62, z: 0.12, turn: -0.55, raise: -1.4 },
    ] },
  };

  function shoot(renderer, { zoom, figs }, w, h) {
    const scene = new THREE.Scene(), group = new THREE.Group();
    scene.add(new THREE.HemisphereLight('#ffe2c0', '#2a1408', 0.9));
    const key = new THREE.DirectionalLight('#ffe9cc', 2.0); key.position.set(-3, 5, 6); scene.add(key);
    const rimL = new THREE.DirectionalLight('#ff7a4a', 1.2); rimL.position.set(-6, 3, -5); scene.add(rimL);
    const rimR = new THREE.DirectionalLight('#7fa4ff', 1.0); rimR.position.set(6, 3, -5); scene.add(rimR);
    for (const c of figs) {
      const war = MODELS.warrior(c.piece, c.hero), j = war.userData.j;
      war.rotation.y = c.turn; war.position.set(c.x, 0, c.z);
      if (j.armR) j.armR.rotation.x = c.raise;
      MODELS.settle(war);
      group.add(war);
    }
    scene.add(group); group.updateMatrixWorld(true);
    // frame the figures tight (their banners may run out at the top), seen a little from below; the dock stands them
    // on its edge, the picture's bottom
    const box = new THREE.Box3();
    for (const war of group.children) box.expandByObject(war.userData.fig);
    const c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
    const cam = new THREE.PerspectiveCamera(30, w / h, 0.05, 50), v = Math.tan((cam.fov * Math.PI) / 360);
    const dist = Math.max(size.y / (2 * v * 0.9), size.x / (2 * v * cam.aspect * 0.92)) / zoom + size.z / 2;
    const left = 0, up = size.y * 0.04;
    cam.position.set(c.x - left, c.y - size.y * 0.1 + up, c.z + dist); cam.lookAt(c.x - left, c.y + up, c.z);
    renderer.setSize(w, h, false); renderer.clear(); renderer.render(scene, cam);
    return renderer.domElement.toDataURL('image/png');
  }

  // the pictures by game, { xq, sg } as data URLs, w × h pixels each; null if WebGL is not there
  function render(w, h) {
    let renderer = null;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: document.createElement('canvas'), antialias: true, alpha: true, preserveDrawingBuffer: true });
      renderer.outputEncoding = THREE.sRGBEncoding;
      renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
      renderer.setClearColor('#000000', 0);
      const out = {};
      for (const k in CAST) out[k] = shoot(renderer, CAST[k], w, h);
      return out;
    } catch (e) { return null; }
    finally { if (renderer) { renderer.dispose(); renderer.forceContextLoss(); } }
  }

  // ---------- the dock's heroes at blows ----------
  // The same heroes, alive: they take turns to strike, each in their own way as on the board (scene.js), while the
  // one struck at parries and is driven back a step. One renderer for it, kept for as long as the page lives (a new
  // one each time would leave what it knows of the shared figures behind) and drawing only while the dock shows it;
  // its canvas goes into the picture of the game that is up (show). Those who want less motion keep the still.
  // figs as in CAST; turns: who strikes at whom and how; aim: how far they turn to each other for it
  const BOUTS = {
    xq: { aim: 0.3, figs: [{ piece: 1, hero: 'quan-vu', x: -0.36, z: 0, turn: 0.7 }, { piece: -1, hero: 'lu-bo', x: 0.36, z: 0, turn: -0.7 }], turns: [[0, 1, 'whirl'], [1, 0, 'leap']] },
    sg: { aim: 0.8, figs: [{ piece: 21, hero: 'luu-bi', x: -0.46, z: 0.1, turn: 0.6 }, { piece: 41, hero: 'tao-thao', x: 0, z: -0.26, turn: 0 }, { piece: 31, hero: 'ton-quyen', x: 0.46, z: 0.1, turn: -0.6 }], turns: [[0, 1, 'cut'], [1, 2, 'cut'], [2, 0, 'cut']] },
  };
  const clamp = k => Math.min(1, Math.max(0, k)), out = k => 1 - Math.pow(1 - clamp(k), 3), lerp = (a, b, k) => a + (b - a) * k;
  // a turn, in seconds: they square up, the striker's own lead into the blow (Guan Yu turns once round, the blade
  // level), the weapon drawn back, the blow, held, and back to rest. GAP: how near the striker comes for it.
  const LEN = 2.9, START = 0.5, LEAD = { cut: 0, whirl: 0.55, leap: 0 }, WIND = 0.3, BLOW = 0.14, HELD = 0.4, BACK = 0.45, GAP = { cut: 0.6, whirl: 0.7, leap: 0.58 };
  const hitAt = kind => START + LEAD[kind] + WIND + BLOW;
  const JOINTS = ['armL', 'armR', 'legL', 'legR', 'head', 'body'];
  const forth = (f, d) => { f.war.position.x += Math.sin(f.war.rotation.y) * d; f.war.position.z += Math.cos(f.war.rotation.y) * d; };
  function strike(f, kind, t, dist) {
    const j = f.j, lead = LEAD[kind];
    t -= START;
    if (t < 0) return;
    if (t < lead) {
      const k = t / lead;
      j.cutAs = 'sweep'; j.cutT = k < 0.2 ? k / 0.2 : k < 0.8 ? 1 : 2 + (k - 0.8) / 0.2; j.armR.rotation.x = -1.6 * Math.sin(k * Math.PI);
      f.war.rotation.y += out(k) * Math.PI * 2;
      return;
    }
    t -= lead;
    const up = out(t / WIND), down = clamp((t - WIND) / BLOW), back = out((t - WIND - BLOW - HELD) / BACK), leap = kind === 'leap';
    j.cutT = t < WIND ? up : t < WIND + BLOW ? 1 + down : 2 + back;
    j.armR.rotation.x = t < WIND ? -2.4 * up : lerp(lerp(-2.4, 0.9, down), 0, back);
    const step = (leap ? lerp(0.5 * up, 1, down) : down) * (1 - back);
    forth(f, Math.max(0.1, dist - GAP[kind]) * step);
    j.legL.rotation.x = -0.45 * step; j.legR.rotation.x = 0.3 * step;
    if (leap) { f.war.position.y = t < WIND ? 0.3 * Math.sin(up * Math.PI / 2) : 0.3 * (1 - down); j.legL.rotation.x = j.legR.rotation.x = -0.5 * Math.sin(clamp(t / (WIND + BLOW)) * Math.PI); }
  }
  // the one struck at: the weapon comes up before the blow lands, and it drives them back a step
  function parry(f, t, hit) {
    const j = f.j, guard = out((t - hit + 0.24) / 0.2) * (1 - out((t - hit - 0.45) / 0.5)), knock = t < hit ? 0 : out((t - hit) / 0.14) * (1 - out((t - hit - 0.3) / 0.6));
    j.armR.rotation.x = -1.25 * guard;
    j.body.rotation.x = -0.28 * knock; j.head.rotation.x = -0.2 * knock;
    j.legR.rotation.x = 0.4 * knock; j.legL.rotation.x = -0.2 * knock;
    forth(f, -0.13 * knock);
  }
  // a soft round spot, bright or dark, for the spark of the clash and the shadows at their feet
  function spot(inner, outer) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), fill = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    fill.addColorStop(0, inner); fill.addColorStop(1, outer); g.fillStyle = fill; g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }
  function stand(f) {                 // the figure, again once its file is in (the built one stands in till then)
    if (f.war) f.war.parent.remove(f.war);
    f.model = MODELS.figured(f.hero);
    f.war = MODELS.warrior(f.piece, f.hero); f.j = f.war.userData.j;
    f.war.userData.flag.visible = false;
    for (const n of JOINTS) if (!f.j[n]) f.j[n] = new THREE.Object3D();
  }
  function stage(key) {
    const { aim, figs, turns } = BOUTS[key], scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight('#ffe2c0', '#2a1408', 0.9));
    const sun = new THREE.DirectionalLight('#ffe9cc', 2.0); sun.position.set(-3, 5, 6); scene.add(sun);
    const rimL = new THREE.DirectionalLight('#ff7a4a', 1.2); rimL.position.set(-6, 3, -5); scene.add(rimL);
    const rimR = new THREE.DirectionalLight('#7fa4ff', 1.0); rimR.position.set(6, 3, -5); scene.add(rimR);
    const dark = spot('rgba(0,0,0,0.55)', 'rgba(0,0,0,0)');
    const cast = figs.map(c => {
      const f = { ...c, shade: new THREE.Mesh(new THREE.CircleGeometry(0.3, 20), new THREE.MeshBasicMaterial({ map: dark, transparent: true, depthWrite: false })) };
      f.shade.rotation.x = -Math.PI / 2; scene.add(f.shade);
      return f;
    });
    const spark = new THREE.Sprite(new THREE.SpriteMaterial({ map: spot('rgba(255,244,200,1)', 'rgba(255,170,60,0)'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
    spark.visible = false; scene.add(spark);
    return { aim, turns, cast, scene, spark, cam: new THREE.PerspectiveCamera(30, 1, 0.05, 50), mats: [], checked: -1, jolt: 0 };
  }
  // the heroes at t seconds: all at ease, but for the two whose turn it is
  function pose(st, t) {
    const n = Math.floor(t / LEN) % st.turns.length, at = t % LEN, [a, b, kind] = st.turns[n], hit = hitAt(kind);
    st.cast.forEach((f, i) => {
      const j = f.j, breath = Math.sin(t * 1.6 + i * 2) * 0.03;
      for (const k of JOINTS) j[k].rotation.set(0, 0, 0);
      j.kneel = 0; j.cutT = 0; j.cutAs = null;
      f.war.position.set(f.x, 0, f.z); f.war.rotation.y = f.turn;
      j.armR.rotation.z = breath; j.armL.rotation.z = -breath; j.head.rotation.y = Math.sin(t * 0.8 + i * 2.5) * 0.2;
    });
    const A = st.cast[a], B = st.cast[b], dx = B.x - A.x, dz = B.z - A.z, dist = Math.hypot(dx, dz);
    const square = st.aim * out(at / 0.4) * (1 - out((at - LEN + 0.5) / 0.5));
    for (const [f, to] of [[A, Math.atan2(dx, dz)], [B, Math.atan2(-dx, -dz)]]) f.war.rotation.y += Math.atan2(Math.sin(to - f.turn), Math.cos(to - f.turn)) * square;
    strike(A, kind, at, dist); parry(B, at, hit);
    const lit = clamp(1 - (at - hit) / 0.22);
    st.spark.visible = at >= hit && lit > 0;
    if (st.spark.visible) { st.spark.position.set(B.x - dx / dist * 0.24, 0.5, B.z - dz / dist * 0.24 + 0.2); st.spark.scale.setScalar(0.25 + 0.6 * (1 - lit)); st.spark.material.opacity = lit; }
    st.jolt = at >= hit ? clamp(1 - (at - hit) / 0.2) : 0;
    for (const f of st.cast) { MODELS.settle(f.war); f.shade.position.set(f.war.position.x, 0.003, f.war.position.z); f.shade.scale.setScalar(1 - 0.5 * f.war.position.y); }
  }

  let live = null, shownIn = null, shownKey = null, raf = 0, last = 0, clock = 0;
  function open() {
    const canvas = document.createElement('canvas');
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
    renderer.setClearColor('#000000', 0);
    // what the metal reflects here, as the board's renderer makes its own (scene.js makeEnvironment): the picture of
    // the room one renderer made is nothing to another
    const room = new THREE.Scene(), sky = new THREE.Color('#ffe2c0'), ground = new THREE.Color('#2a1408');
    const ball = new THREE.SphereGeometry(10, 24, 12), p = ball.attributes.position, col = [];
    for (let i = 0; i < p.count; i++) { const k = (p.getY(i) / 10 + 1) / 2, c = ground.clone().lerp(sky, k).multiplyScalar(0.2 + 0.6 * k); col.push(c.r, c.g, c.b); }
    ball.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    room.add(new THREE.Mesh(ball, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
    const win = new THREE.Mesh(new THREE.PlaneGeometry(7, 4), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffe9cc').multiplyScalar(4), side: THREE.DoubleSide }));
    win.position.set(-3, 5, 6).setLength(8); win.lookAt(0, 0, 0); room.add(win);
    const pmrem = new THREE.PMREMGenerator(renderer), env = pmrem.fromScene(room, 0.02).texture;
    pmrem.dispose(); ball.dispose(); win.geometry.dispose();
    canvas.addEventListener('webglcontextlost', () => { live = null; show(null); canvas.remove(); });      // the still is there again
    return { canvas, renderer, env, stages: {} };
  }
  function frame(now) {
    if (!live || !shownKey) { raf = 0; return; }
    raf = requestAnimationFrame(frame);
    if (now - last < 30) return;                      // thirty pictures a second are enough
    clock += Math.min(0.1, (now - last) / 1000); last = now;
    const { canvas, renderer, env } = live, st = live.stages[shownKey] || (live.stages[shownKey] = stage(shownKey));
    if (clock - st.checked > 0.7) {                    // the figures that have come as files since
      st.checked = clock;
      let fresh = false;
      for (const f of st.cast) if (!f.war || f.model !== MODELS.figured(f.hero)) { stand(f); st.scene.add(f.war); fresh = true; }
      if (fresh) { const all = new Set(); for (const f of st.cast) f.war.traverse(o => { if (o.isMesh && o.material.envMap) all.add(o.material); }); st.mats = [...all]; }
    }
    const w = canvas.clientWidth, h = canvas.clientHeight, pr = Math.min(2, devicePixelRatio || 1);
    if (!w || !h) return;
    if (canvas.width !== Math.round(w * pr) || canvas.height !== Math.round(h * pr)) renderer.setSize(Math.round(w * pr), Math.round(h * pr), false);
    pose(st, clock);
    // 1.55 wide, their feet near the picture's bottom edge
    const cam = st.cam, v = Math.tan((cam.fov * Math.PI) / 360), dist = 1.55 / (2 * v * (w / h)), tall = 2 * v * dist, shake = st.jolt * 0.012;
    cam.aspect = w / h; cam.updateProjectionMatrix();
    cam.position.set(Math.sin(clock * 90) * shake, tall * 0.42 + Math.cos(clock * 70) * shake, dist); cam.lookAt(0, tall * 0.44, 0);
    const theirs = st.mats.map(m => m.envMap);
    for (const m of st.mats) m.envMap = env;
    renderer.render(st.scene, cam);
    st.mats.forEach((m, i) => { m.envMap = theirs[i]; });
    if (!shownIn.classList.contains('live')) shownIn.classList.add('live');
  }
  // the heroes of a game ('xq', 'sg') come alive in its picture's box (the dock's .art); nothing for key: they stop
  function show(key, box) {
    cancelAnimationFrame(raf); raf = 0;
    if (shownIn && shownIn !== box) shownIn.classList.remove('live');
    shownIn = shownKey = null;
    if (!key || !box || !BOUTS[key] || (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
    try { if (!live) live = open(); } catch (e) { live = null; return; }
    shownIn = box; shownKey = key;
    if (live.canvas.parentNode !== box) box.appendChild(live.canvas);
    last = performance.now(); raf = requestAnimationFrame(frame);
  }
  return { render, show };
})();
