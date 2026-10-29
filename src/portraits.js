// portraits.js — the heroes on the menu's dock: the heroes themselves (models.js), posed and rendered once into
// still images with a renderer of their own that is let go straight after, so it holds no WebGL context afterwards
'use strict';
const PORTRAITS = (() => {
  // who stands where: x along the line, z towards the viewer, turn 0 faces the viewer (+ turns them to their left),
  // raise lifts the weapon arm (the hero preview's pose in scene.js); zoom closes in past the frame the figures fit
  // (long weapons widen it)
  const CAST = {
    xq: { zoom: 1.35, figs: [   // two players: Quan Vũ of Red against Lữ Bố of Black
      { piece: 1, hero: 'quan-vu', x: -0.3, z: 0, turn: 0.8, raise: -2.5 },
      { piece: -1, hero: 'lu-bo', x: 0.3, z: 0, turn: -0.8, raise: -2.3 },
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
  return { render };
})();
