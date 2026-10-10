// stages.js — where the game is played: the board always sits on its table in the middle, the stage is everything
// around it (sky, ground, distant scenery, its own light and fog, moving details). Built from code like the rest.
// Each stage: build(ctx) -> { group, sky, fog, fogSpan, light, ambience, update(t, dt, camera) }; scene.js adds the
// group and applies the light. ctx: { glowTex, low } (low = fewer particles on small or weak devices).
// Scenery the camera may pass through (trees, tents) carries userData.clear, a radius: scene.js hides it while it
// stands between the camera and the board.
'use strict';
const STAGES = (() => {
  const { list, byId } = STAGE_LIST;                // which stages there are: stage-list.js

  // ---------- helpers ----------
  const flat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.9, metalness: o.metal || 0, flatShading: true, emissive: o.emissive || '#000000', emissiveIntensity: o.glow || 1 });
  function add(parent, geo, mat, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; }
  const rnd = (a, b) => a + Math.random() * (b - a);
  // a dome coloured from the zenith down to the horizon and below it
  function skyDome(top, horizon, below) {
    const r = 95, g = new THREE.SphereGeometry(r, 32, 16), p = g.attributes.position, col = [], c = new THREE.Color();
    const T = new THREE.Color(top), H = new THREE.Color(horizon), B = new THREE.Color(below);
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) / r;
      if (y >= 0) c.copy(H).lerp(T, Math.pow(y, 0.55)); else c.copy(H).lerp(B, Math.min(1, -y * 5));
      col.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    m.renderOrder = -1;
    return m;
  }
  function glow(ctx, color, size, opacity = 1) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: ctx.glowTex, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
    s.scale.setScalar(size);
    return s;
  }
  // floating specks (dust, embers, fireflies): box of size w x h x w around a centre, drifting by vel(i, t)
  function specks(ctx, n, color, size, box, opacity = 0.8) {
    const g = new THREE.BufferGeometry(), a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = rnd(-box[0], box[0]); a[i * 3 + 1] = rnd(box[1], box[2]); a[i * 3 + 2] = rnd(-box[0], box[0]); }
    g.setAttribute('position', new THREE.BufferAttribute(a, 3));
    return new THREE.Points(g, new THREE.PointsMaterial({ size, map: ctx.glowTex, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }));
  }
  function woodTexture(base, planks) {
    const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d');
    g.fillStyle = base; g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < planks; i++) {
      const y = (i * 512) / planks;
      g.fillStyle = `rgba(0, 0, 0, ${0.12 + Math.random() * 0.12})`; g.fillRect(0, y, 512, 3);
      for (let k = 0; k < 14; k++) { g.strokeStyle = `rgba(40, 20, 8, ${0.06 + Math.random() * 0.08})`; g.beginPath(); const yy = y + rnd(4, 512 / planks - 2); g.moveTo(0, yy); g.lineTo(512, yy + rnd(-3, 3)); g.stroke(); }
    }
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }

  // ---------- the lantern-lit room (the original setting) ----------
  function room(ctx) {
    const group = new THREE.Group();
    group.add(MODELS.table());
    const lanterns = [];
    for (const [x, z, y] of [[-11.5, -7, 7.4], [11.5, -7, 6.8], [-11.5, 7, 7], [11.5, 7, 7.6]]) {
      const l = MODELS.lantern(); l.position.set(x, y, z); group.add(l);
      const pl = new THREE.PointLight('#ff7a3a', 1.6, 30, 2); pl.position.set(x, y, z); group.add(pl);
      lanterns.push({ l, pl, ph: Math.random() * 6 });
    }
    const motes = specks(ctx, ctx.low ? 80 : 160, '#ffb36a', 0.09, [12, 0, 8], 0.55);   // dust in the lantern light
    group.add(motes);
    return {
      group, sky: null, background: '#140d0a', fog: '#140d0a', fogSpan: 26, ambience: '',
      light: { hemi: ['#ffe2c0', '#2a1408', 0.8], key: ['#ffe9cc', 1.9], rim: ['#7fa4ff', 0.45] },
      update(t, dt) {
        for (const L of lanterns) { L.l.rotation.z = Math.sin(t / 1300 + L.ph) * 0.06; L.pl.intensity = 1.55 + Math.sin(t / 170 + L.ph) * 0.08 + Math.sin(t / 53 + L.ph) * 0.05; }
        motes.rotation.y += dt * 0.01; motes.position.y = Math.sin(t / 4000) * 0.3;
      },
    };
  }

  // ---------- Red Cliffs: on a deck on the river, the enemy fleet burning ----------
  function cliffTexture() {
    const c = document.createElement('canvas'); c.width = 256; c.height = 512; const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 512); gr.addColorStop(0, '#3a1810'); gr.addColorStop(1, '#1e0c08');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 512);
    for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(0, 0, 0, ${rnd(0.08, 0.25)})`; g.fillRect(rnd(0, 256), rnd(0, 512), rnd(10, 60), rnd(2, 6)); }
    g.fillStyle = '#b3261e'; g.font = `bold 120px ${MODELS.BRUSH}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('赤', 128, 170); g.fillText('壁', 128, 310);
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding;
    return t;
  }
  function ship(ctx, burning) {
    const s = new THREE.Group(), wood = flat('#24140c'), dark = flat('#160c08');
    add(s, new THREE.BoxGeometry(2.2, 1.1, 8), wood, 0, 0.2, 0);
    const bow = add(s, new THREE.BoxGeometry(1.6, 1.0, 2.2), wood, 0, 0.35, 4.6); bow.rotation.x = -0.35;
    add(s, new THREE.BoxGeometry(2.0, 1.2, 2.4), dark, 0, 1.2, -2.4);              // stern castle
    const flames = [], smoke = [];
    for (const [z, h] of [[1.2, 6], [-0.8, 5]]) {
      add(s, new THREE.CylinderGeometry(0.08, 0.1, h, 5), dark, 0, 0.8 + h / 2, z);
      const sail = add(s, new THREE.PlaneGeometry(2.6, h * 0.55), new THREE.MeshStandardMaterial({ color: burning ? '#3a1408' : '#3a2a20', side: THREE.DoubleSide, roughness: 1, flatShading: true }), 0, 1.3 + h * 0.45, z + 0.05);
      sail.rotation.y = Math.PI / 2 + rnd(-0.2, 0.2);
    }
    let pool = null;
    if (burning) {
      for (let i = 0; i < 9; i++) {
        const f = glow(ctx, i % 3 ? '#ff5a14' : '#ffb050', rnd(3, 5.5), 0.7);
        f.position.set(rnd(-1, 1), rnd(1.5, 6.5), rnd(-3.5, 3.5)); s.add(f);
        flames.push({ f, base: f.scale.x, y: f.position.y, ph: Math.random() * 10 });
      }
      pool = add(s, new THREE.CircleGeometry(8, 24), new THREE.MeshBasicMaterial({ map: ctx.glowTex, color: '#ff5a1a', transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false }), 0, -0.05, 0);
      pool.rotation.x = -Math.PI / 2;
      for (let i = 0; i < (ctx.low ? 2 : 4); i++) {
        const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: ctx.glowTex, color: '#2a1a14', transparent: true, opacity: 0.5, depthWrite: false }));
        s.add(m); smoke.push({ m, k: i / 4 });
      }
    }
    return { s, flames, smoke, pool };
  }
  function xichBich(ctx) {
    const group = new THREE.Group();
    // the deck the board stands on, with a railing
    const deckTex = woodTexture('#2e1c10', 8); deckTex.repeat.set(3, 4);
    const deck = add(group, new THREE.BoxGeometry(17, 0.4, 22), new THREE.MeshStandardMaterial({ map: deckTex, roughness: 0.85 }), 0, -1.1, 0);
    deck.receiveShadow = true;
    const rail = flat('#2a160c');
    for (const sx of [-1, 1]) { add(group, new THREE.BoxGeometry(0.25, 0.9, 22), rail, sx * 8.4, -0.5, 0); add(group, new THREE.BoxGeometry(17, 0.9, 0.25), rail, 0, -0.5, sx * 10.9); }
    for (let z = -10; z <= 10; z += 2.5) for (const sx of [-1, 1]) add(group, new THREE.BoxGeometry(0.3, 1.2, 0.3), rail, sx * 8.4, -0.4, z);
    // the river: dark and glossy, so the fires shine on it
    const water = add(group, new THREE.CircleGeometry(95, 48), new THREE.MeshStandardMaterial({ color: '#2a1210', roughness: 0.35, metalness: 0.25 }), 0, -1.8, 0);
    water.rotation.x = -Math.PI / 2;
    // the cliffs with the carved characters, and a far shore
    const rock = flat('#2a120c');
    const cliff = new THREE.Group(); cliff.position.set(-18, -1.8, -50); cliff.rotation.y = 0.35; group.add(cliff);
    add(cliff, new THREE.BoxGeometry(26, 24, 6), rock, 0, 12, -3);
    add(cliff, new THREE.PlaneGeometry(9, 18), new THREE.MeshBasicMaterial({ map: cliffTexture(), color: '#c8c8c8' }), 2, 9, 0.02);
    for (let i = 0; i < 9; i++) { const r = add(cliff, new THREE.DodecahedronGeometry(rnd(3, 6), 0), rock, rnd(-16, 18), rnd(2, 20), rnd(-6, 1)); r.rotation.set(rnd(0, 3), rnd(0, 3), 0); }
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 + 0.3, r = add(group, new THREE.ConeGeometry(rnd(6, 11), rnd(5, 12), 5), rock, Math.cos(a) * 78, 1, Math.sin(a) * 78); r.rotation.y = rnd(0, 3); }
    // the burning fleet, all around
    const fleet = [];
    const spots = [[-0.6, 28], [0.15, 34], [0.7, 26], [1.7, 30], [2.6, 27], [3.3, 36], [4.1, 29], [5.0, 33], [5.7, 25]];
    for (const [a, r] of ctx.low ? spots.filter((_, i) => i % 2 === 0) : spots) {
      const sh = ship(ctx, true); sh.s.position.set(Math.cos(a) * r, -1.7, Math.sin(a) * r); sh.s.rotation.y = rnd(0, Math.PI * 2);
      group.add(sh.s); fleet.push(sh);
    }
    // the fires light the scene from far off, so the deck around the board stays dim
    const fires = [new THREE.PointLight('#ff6a2a', 2.4, 95, 1.6), new THREE.PointLight('#ff8a3a', 2, 95, 1.6)];
    fires[0].position.set(-26, 5, -30); fires[1].position.set(28, 5, 22); fires.forEach(l => group.add(l));
    const embers = specks(ctx, ctx.low ? 90 : 220, '#ff9a4a', 0.18, [40, -1, 14], 0.9);
    group.add(embers);
    const ep = embers.geometry.attributes.position;
    return {
      group, sky: skyDome('#12060a', '#8a2a12', '#1a0808'), fog: '#2a0e0a', fogSpan: 60, ambience: 'river-fire',
      light: { hemi: ['#ff9a6a', '#1a0606', 0.55], key: ['#ffc9a0', 1.35], rim: ['#ff6a3a', 0.6] },
      update(t, dt) {
        fires[0].intensity = 2.4 + Math.sin(t / 90) * 0.35 + Math.sin(t / 37) * 0.25;
        fires[1].intensity = 2 + Math.sin(t / 110 + 2) * 0.35 + Math.sin(t / 41) * 0.2;
        for (const sh of fleet) {
          for (const F of sh.flames) { const k = 0.75 + 0.25 * Math.sin(t / 80 + F.ph) + 0.15 * Math.sin(t / 23 + F.ph * 3); F.f.scale.setScalar(F.base * k); F.f.position.y = F.y + Math.sin(t / 200 + F.ph) * 0.2; }
          if (sh.pool) sh.pool.material.opacity = 0.24 + 0.06 * Math.sin(t / 70 + sh.s.id);
          for (const S of sh.smoke) {
            S.k = (S.k + dt * 0.06) % 1;
            S.m.position.set(Math.sin(S.k * 4) * 1.5 + S.k * 6, 4 + S.k * 22, 0); S.m.scale.setScalar(4 + S.k * 14); S.m.material.opacity = 0.55 * Math.min(1, S.k * 5) * (1 - S.k);
          }
        }
        for (let i = 0; i < ep.count; i++) {
          let y = ep.getY(i) + dt * (1.2 + (i % 5) * 0.4);
          if (y > 14) y = -1;
          ep.setY(i, y); ep.setX(i, ep.getX(i) + Math.sin(t / 900 + i) * dt * 0.6);
        }
        ep.needsUpdate = true;
      },
    };
  }

  // ---------- Wuzhang Plains: an autumn night in the Shu camp, a great star falls ----------
  function tent(color) {
    const g = new THREE.Group(), cloth = flat(color);
    const body = add(g, new THREE.ConeGeometry(2.6, 3.2, 4), cloth, 0, 1.6, 0); body.rotation.y = Math.PI / 4;
    add(g, new THREE.BoxGeometry(0.9, 1.3, 0.1), new THREE.MeshStandardMaterial({ color: '#2a1408', emissive: '#ff8a3a', emissiveIntensity: Math.random() < 0.6 ? 0.9 : 0 }), 0, 0.65, 1.3);
    add(g, new THREE.CylinderGeometry(0.04, 0.04, 2, 4), flat('#2a160a'), 0, 4, 0);
    const flag = add(g, new THREE.PlaneGeometry(0.9, 0.6), new THREE.MeshStandardMaterial({ color: '#a8231b', side: THREE.DoubleSide, roughness: 1 }), 0.45, 4.6, 0);
    return { g, flag };
  }
  function brazier(ctx, group, x, z) {
    const b = new THREE.Group(); b.position.set(x, -1.4, z); group.add(b);
    add(b, new THREE.CylinderGeometry(0.06, 0.08, 1.6, 5), flat('#1a1210'), 0, 0.8, 0);
    add(b, new THREE.CylinderGeometry(0.45, 0.25, 0.4, 8), flat('#3a2a20', { metal: 0.4, rough: 0.6 }), 0, 1.7, 0);
    const f = glow(ctx, '#ffa04a', 1.8); f.position.y = 2.2; b.add(f);
    return f;
  }
  function nguTruong(ctx) {
    const group = new THREE.Group();
    // a wooden dais in the open, on the dark plain
    const plankTex = woodTexture('#3a2414', 6); plankTex.repeat.set(2, 2);
    const dais = add(group, new THREE.CylinderGeometry(9, 9.4, 0.5, 8), new THREE.MeshStandardMaterial({ map: plankTex, roughness: 0.85 }), 0, -1.15, 0);
    dais.receiveShadow = true; dais.rotation.y = Math.PI / 8;
    const ground = add(group, new THREE.CircleGeometry(95, 48), flat('#141c18'), 0, -1.4, 0); ground.rotation.x = -Math.PI / 2;
    // camp: rings of tents with Shu banners, some lit from inside
    const flags = [];
    const tents = ctx.low ? 9 : 16;
    for (let i = 0; i < tents; i++) {
      const a = (i / tents) * Math.PI * 2 + rnd(-0.1, 0.1), r = i % 2 ? rnd(30, 36) : rnd(20, 25);
      const T = tent(i % 3 ? '#6e6452' : '#5c5444'); T.g.position.set(Math.cos(a) * r, -1.4, Math.sin(a) * r); T.g.lookAt(0, -1.4, 0);
      T.g.userData.clear = 3.2; group.add(T.g); flags.push({ f: T.flag, ph: Math.random() * 6 });
    }
    // mountains far away, blue in the haze
    for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2, m = add(group, new THREE.ConeGeometry(rnd(10, 18), rnd(10, 22), 5), flat('#1a2236'), Math.cos(a) * rnd(70, 82), 2, Math.sin(a) * rnd(70, 82)); m.rotation.y = rnd(0, 3); }
    // braziers on the ground around the dais, outside the frame of play
    const fires = [];
    for (const [x, z] of [[-10.5, -10.5], [10.5, -10.5], [-10.5, 10.5], [10.5, 10.5]]) fires.push(brazier(ctx, group, x, z));
    const torch = [new THREE.PointLight('#ff9a4a', 1.8, 30, 2), new THREE.PointLight('#ff9a4a', 1.6, 30, 2)];
    torch[0].position.set(-10.5, 1.2, -10.5); torch[1].position.set(10.5, 1.2, 10.5); torch.forEach(l => group.add(l));
    // stars on the upper sky, and fireflies over the grass
    const sg = new THREE.BufferGeometry(), n = ctx.low ? 300 : 700, sa = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const az = Math.random() * Math.PI * 2, el = Math.asin(rnd(0.02, 1)), r = 88;
      sa[i * 3] = Math.cos(az) * Math.cos(el) * r; sa[i * 3 + 1] = Math.sin(el) * r; sa[i * 3 + 2] = Math.sin(az) * Math.cos(el) * r;
    }
    sg.setAttribute('position', new THREE.BufferAttribute(sa, 3));
    const stars = new THREE.Points(sg, new THREE.PointsMaterial({ size: 0.95, map: ctx.glowTex, color: '#dfe8ff', transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
    group.add(stars);
    const flies = specks(ctx, ctx.low ? 30 : 70, '#d8ff8a', 0.22, [26, -1, 3], 0.9); group.add(flies);
    const fp = flies.geometry.attributes.position, home = Float32Array.from(fp.array);
    // the falling star: a bright head with a fading tail of sprites
    const fall = new THREE.Group(); group.add(fall); fall.visible = false;
    const trail = [];
    for (let i = 0; i < 14; i++) { const s = glow(ctx, i ? '#ffd2b0' : '#ffffff', (i ? 1.6 : 2.6) * (1 - i / 16)); s.material.fog = false; fall.add(s); trail.push(s); }
    let next = 4000, start = 0, from = new THREE.Vector3(), dir = new THREE.Vector3();
    const look = new THREE.Vector3();
    return {
      group, sky: skyDome('#03050c', '#1f2c4c', '#070a10'), fog: '#0c1426', fogSpan: 58, ambience: 'night-wind',
      light: { hemi: ['#5a6c9a', '#0a0c10', 0.75], key: ['#b8c8ff', 1.25], rim: ['#ff9a5a', 0.35] },
      update(t, dt, camera) {
        for (const f of fires) f.scale.setScalar(1.6 + Math.sin(t / 70 + f.id) * 0.25 + Math.sin(t / 29) * 0.12);
        torch[0].intensity = 1.5 + Math.sin(t / 90) * 0.2; torch[1].intensity = 1.35 + Math.sin(t / 77 + 1) * 0.2;
        for (const F of flags) F.f.rotation.y = Math.sin(t / 600 + F.ph) * 0.4;
        for (let i = 0; i < fp.count; i++) {
          fp.setX(i, home[i * 3] + Math.sin(t / 1700 + i) * 1.5); fp.setY(i, home[i * 3 + 1] + Math.sin(t / 900 + i * 2) * 0.6); fp.setZ(i, home[i * 3 + 2] + Math.cos(t / 1500 + i) * 1.5);
        }
        fp.needsUpdate = true;
        flies.material.opacity = 0.55 + 0.35 * Math.sin(t / 400);
        // a star falls every so often, in the part of the sky the camera faces
        if (!start && t > next) {
          start = t;
          camera.getWorldDirection(look); look.y = 0; look.normalize();
          const side = new THREE.Vector3(-look.z, 0, look.x).multiplyScalar(rnd(-1, 1) > 0 ? 1 : -1);
          from.copy(look).multiplyScalar(70).addScaledVector(side, rnd(10, 30)).setY(rnd(16, 24));
          dir.copy(side).multiplyScalar(-1).addScaledVector(look, rnd(-0.2, 0.2)).setY(-0.35).normalize().multiplyScalar(34);
          fall.visible = true;
        }
        if (start) {
          const k = (t - start) / 1400;
          if (k >= 1) { start = 0; fall.visible = false; next = t + rnd(9000, 16000); }
          else trail.forEach((s, i) => {
            const kk = Math.max(0, k - i * 0.012);
            s.position.copy(from).addScaledVector(dir, kk * 1.4);
            s.material.opacity = Math.sin(Math.min(1, k * 1.2) * Math.PI) * (1 - i / 14);
          });
        }
      },
    };
  }

  // ---------- shared by the two battles below ----------
  function stoneTexture(base) {
    const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
    g.fillStyle = base; g.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 32) for (let x = (y / 32) % 2 ? -32 : 0; x < 256; x += 64) {
      g.fillStyle = `rgba(0, 0, 0, ${rnd(0.02, 0.12)})`; g.fillRect(x + 2, y + 2, 60, 28);
      g.strokeStyle = 'rgba(0, 0, 0, 0.35)'; g.lineWidth = 2; g.strokeRect(x + 1, y + 1, 62, 30);
    }
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }
  function flagTexture(ch, cloth, ink) {
    const c = document.createElement('canvas'); c.width = 128; c.height = 160; const g = c.getContext('2d');
    g.fillStyle = cloth; g.fillRect(0, 0, 128, 160);
    g.fillStyle = ink; g.fillRect(0, 0, 128, 10); g.fillRect(0, 150, 128, 10);
    g.font = `bold 92px ${MODELS.BRUSH}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ch, 64, 82);
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding;
    return t;
  }
  // a flag on a pole; waves with update(t)
  function flagPole(parent, tex, x, y, z, h = 4) {
    const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g);
    add(g, new THREE.CylinderGeometry(0.06, 0.06, h, 4), flat('#2a1a10'), 0, h / 2, 0);
    const geo = new THREE.PlaneGeometry(1.4, 1.75); geo.translate(0.7, 0, 0);
    const f = add(g, geo, new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 1 }), 0, h - 0.95, 0);
    return { f, ph: Math.random() * 6 };
  }
  // one of the heroes (heroes.js), larger than life, as part of the scenery
  function figure(id, side, scale, x, y, z) {
    const w = MODELS.warrior(side * XQ.K, id); w.scale.setScalar(scale); w.position.set(x, y, z);
    return w;
  }
  // their banners turn to the camera, so the characters on them never read mirrored (as scene.js does for pieces)
  const at = new THREE.Vector3();
  function faceBanners(figs, camera) {
    for (const w of figs) {
      const f = w.userData.flag; f.getWorldPosition(at);
      f.rotation.y = Math.atan2(camera.position.x - at.x, camera.position.z - at.z) - w.rotation.y;
    }
  }
  function tree(parent, x, z, s) {
    const g = new THREE.Group(); g.position.set(x, -1.4, z); g.scale.setScalar(s); g.userData.clear = 1.6 * s; parent.add(g);
    add(g, new THREE.CylinderGeometry(0.18, 0.25, 1.6, 5), flat('#2a1c10'), 0, 0.8, 0);
    add(g, new THREE.ConeGeometry(1.4, 2.4, 6), flat('#3a4424'), 0, 2.3, 0);
    add(g, new THREE.ConeGeometry(1.0, 1.9, 6), flat('#44502a'), 0, 3.4, 0);
    return g;
  }

  // ---------- Hulao Pass: the three brothers fight Lü Bu before the gate ----------
  function hoLao(ctx) {
    const group = new THREE.Group();
    const stone = stoneTexture('#6a6258'); stone.repeat.set(3, 3);
    add(group, new THREE.BoxGeometry(15, 0.5, 17), new THREE.MeshStandardMaterial({ map: stone, roughness: 0.95 }), 0, -1.15, 0);
    const ground = add(group, new THREE.CircleGeometry(95, 48), flat('#3e3a32'), 0, -1.4, 0); ground.rotation.x = -Math.PI / 2;
    // the pass: steep rock on both sides, a wall with a gate tower between them
    const rock = flat('#45434a'), wallTex = stoneTexture('#5e5850'); wallTex.repeat.set(8, 2);
    for (const sx of [-1, 1]) for (let i = 0; i < 7; i++) {
      const r = add(group, new THREE.DodecahedronGeometry(rnd(7, 13), 0), rock, sx * rnd(36, 54), rnd(2, 16), rnd(-70, -24));
      r.rotation.set(rnd(0, 3), rnd(0, 3), 0); r.scale.y = rnd(1.2, 1.8);
    }
    const gate = new THREE.Group(); gate.position.set(0, -1.4, -58); gate.scale.setScalar(0.55); group.add(gate);   // scaled to fit the low view
    add(gate, new THREE.BoxGeometry(64, 11, 5), new THREE.MeshStandardMaterial({ map: wallTex, roughness: 1 }), 0, 5.5, 0);
    for (let x = -31; x <= 31; x += 2.6) add(gate, new THREE.BoxGeometry(1.4, 1.2, 5.2), flat('#575148'), x, 11.6, 0);   // battlements
    add(gate, new THREE.BoxGeometry(6, 7, 5.4), flat('#120e0c'), 0, 3.5, 0.1);                                          // the gateway
    add(gate, new THREE.BoxGeometry(5.2, 6.4, 0.3), flat('#3a2414'), 0, 3.2, 2.75);                                      // its doors
    // the gate tower: two storeys with dark tiled roofs
    const red = flat('#7a2418'), roof = flat('#24201e');
    add(gate, new THREE.BoxGeometry(14, 4, 6), red, 0, 13, 0);
    const r1 = add(gate, new THREE.ConeGeometry(11.5, 3, 4), roof, 0, 16.4, 0); r1.rotation.y = Math.PI / 4; r1.scale.set(1.25, 1, 0.6);
    add(gate, new THREE.BoxGeometry(9, 3, 4.4), red, 0, 18.6, 0);
    const r2 = add(gate, new THREE.ConeGeometry(8.5, 3.4, 4), roof, 0, 21.6, 0); r2.rotation.y = Math.PI / 4; r2.scale.set(1.25, 1, 0.6);
    add(gate, new THREE.PlaneGeometry(4, 1.6), new THREE.MeshBasicMaterial({ map: (() => { const c = document.createElement('canvas'); c.width = 256; c.height = 100; const g = c.getContext('2d'); g.fillStyle = '#1a1210'; g.fillRect(0, 0, 256, 100); g.strokeStyle = '#c9a23a'; g.lineWidth = 6; g.strokeRect(4, 4, 248, 92); g.fillStyle = '#e3b448'; g.font = `bold 66px ${MODELS.BRUSH}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('虎牢關', 128, 54); const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t; })() }), 0, 13.4, 3.05);
    // Lü Bu's banners along the wall, braziers between them
    const flags = [], lu = flagTexture('呂', '#1c2436', '#c9d3de'), dong = flagTexture('董', '#5c1310', '#e3b448');
    for (let i = 0; i < (ctx.low ? 8 : 14); i++) {
      const x = -29 + (i * 58) / ((ctx.low ? 8 : 14) - 1);
      if (Math.abs(x) < 8) continue;
      flags.push(flagPole(gate, i % 3 ? lu : dong, x, 12.2, 0.8, 4.2));
    }
    // the duel: Lü Bu before the gate, the three brothers facing him
    const lv = figure('lu-bo', -1, 4.2, 0, -1.4, -38); group.add(lv);
    const brothers = [figure('luu-bi', 1, 3.6, -5, -1.4, -26), figure('quan-vu', 1, 3.6, 0, -1.4, -27.5), figure('truong-phi', 1, 3.6, 5, -1.4, -26)];
    brothers.forEach(b => group.add(b));
    const fighters = [lv, ...brothers].map((w, i) => ({ j: w.userData.j, ph: i * 1.7 }));
    // drifting morning mist
    const mist = [];
    for (let i = 0; i < (ctx.low ? 8 : 16); i++) {
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: ctx.glowTex, color: '#d8d4cc', transparent: true, opacity: 0.22, depthWrite: false }));
      m.scale.set(rnd(18, 30), rnd(5, 8), 1); m.position.set(rnd(-50, 50), rnd(0, 4), rnd(-40, 40)); group.add(m);
      mist.push({ m, v: rnd(0.6, 1.4) });
    }
    return {
      group, sky: skyDome('#4e5664', '#c4b49c', '#3a3630'), fog: '#77706a', fogSpan: 55, ambience: 'pass-war',
      light: { hemi: ['#b8c0cc', '#3a3428', 0.9], key: ['#fff0dc', 1.45], rim: ['#9ab0ff', 0.3] },
      update(t, dt, camera) {
        faceBanners([lv, ...brothers], camera);
        for (const F of flags) F.f.rotation.y = Math.sin(t / 500 + F.ph) * 0.35;
        for (const F of fighters) if (F.j.armR) F.j.armR.rotation.x = (F.j.restArm || 0) - 1.3 - 1.2 * Math.sin(t / 420 + F.ph);
        for (const M of mist) { M.m.position.x += M.v * dt; if (M.m.position.x > 60) M.m.position.x = -60; }
      },
    };
  }

  // ---------- Changban: Zhang Fei alone on the bridge, Cao Cao's cavalry raising dust beyond the river ----------
  function truongBan(ctx) {
    const group = new THREE.Group();
    const planks = woodTexture('#5a3e24', 7); planks.repeat.set(3, 3);
    add(group, new THREE.BoxGeometry(14, 0.5, 16), new THREE.MeshStandardMaterial({ map: planks, roughness: 0.9 }), 0, -1.15, 0);
    const ground = add(group, new THREE.CircleGeometry(95, 48), flat('#4a3c26'), 0, -1.4, 0); ground.rotation.x = -Math.PI / 2;
    // the river across the field, and the bridge over it
    const river = add(group, new THREE.PlaneGeometry(190, 9), new THREE.MeshStandardMaterial({ color: '#3a5050', roughness: 0.3, metalness: 0.2 }), 0, -1.37, -22);
    river.rotation.x = -Math.PI / 2;
    const wood = flat('#3a2614'), bridge = new THREE.Group(); bridge.position.set(7, -1.4, -22); group.add(bridge);
    add(bridge, new THREE.BoxGeometry(3.4, 0.3, 15), wood, 0, 1.1, 0);
    for (const sx of [-1, 1]) {
      add(bridge, new THREE.BoxGeometry(0.15, 0.15, 15), wood, sx * 1.6, 2.1, 0);
      for (let z = -7; z <= 7; z += 2.3) { add(bridge, new THREE.BoxGeometry(0.2, 1.1, 0.2), wood, sx * 1.6, 1.7, z); add(bridge, new THREE.BoxGeometry(0.3, 1.2, 0.3), wood, sx * 1.5, 0.5, z); }
    }
    // Zhang Fei on the bridge, facing the enemy across the river
    const zf = figure('truong-phi', 1, 4, 7, -0.15, -22); group.add(zf);
    // woods on both banks (Zhang Fei's riders dragged branches through them to raise dust)
    for (let i = 0; i < (ctx.low ? 18 : 34); i++) {
      const a = rnd(0, Math.PI * 2), r = rnd(20, 55), x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (Math.abs(z + 22) < 7 || (Math.abs(x - 7) < 5 && z < -10)) continue;
      tree(group, x, z, rnd(1.4, 2.6));
    }
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2, m = add(group, new THREE.ConeGeometry(rnd(12, 20), rnd(8, 16), 5), flat('#5a4c3a'), Math.cos(a) * 80, 1, Math.sin(a) * 80); m.rotation.y = rnd(0, 3); }
    // Cao Cao's cavalry riding along the far bank, trailing dust
    const riders = [], dust = [];
    const n = ctx.low ? 4 : 7;
    for (let i = 0; i < n; i++) {
      const w = MODELS.warrior(-4); w.scale.setScalar(3.2); w.rotation.y = Math.PI / 2;
      w.position.set(-60 + i * 7, -1.4, -36 - (i % 2) * 3); group.add(w);
      riders.push({ w, j: w.userData.j, ph: i * 0.9 });
    }
    for (let i = 0; i < (ctx.low ? 10 : 22); i++) {
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: ctx.glowTex, color: '#b89a6a', transparent: true, opacity: 0.4, depthWrite: false }));
      group.add(m); dust.push({ m, k: Math.random(), r: i % n });
    }
    const flies = specks(ctx, ctx.low ? 50 : 120, '#ffd890', 0.12, [30, -1, 6], 0.5); group.add(flies);   // dust motes in the low sun
    return {
      group, sky: skyDome('#5a6a86', '#e2b070', '#4a3c26'), fog: '#9a7c58', fogSpan: 62, ambience: 'dust-wind',
      light: { hemi: ['#d8c098', '#3a2a18', 0.85], key: ['#ffd49a', 1.6], rim: ['#ffb070', 0.45] },
      update(t, dt, camera) {
        for (const R of riders) {
          R.w.position.x += dt * 5.5; if (R.w.position.x > 62) R.w.position.x -= 124;
          const ph = t / 110 + R.ph;
          R.j.legs.forEach((L, i) => { L.rotation.x = Math.sin(ph + (i % 2 ? Math.PI : 0) + (i > 1 ? 1 : 0)) * 0.8; });
          if (R.j.body) R.j.body.rotation.x = Math.sin(ph) * 0.08;
          R.w.position.y = -1.4 + Math.abs(Math.sin(ph)) * 0.35;
        }
        for (const D of dust) {
          D.k = (D.k + dt * 0.35) % 1;
          const w = riders[D.r].w;
          D.m.position.set(w.position.x - 3 - D.k * 10, -0.5 + D.k * 4, w.position.z + Math.sin(D.k * 9 + D.r) * 1.5);
          D.m.scale.setScalar(3 + D.k * 9); D.m.material.opacity = 0.42 * Math.min(1, D.k * 6) * (1 - D.k);
        }
        flies.rotation.y += dt * 0.02;
        faceBanners([zf, ...riders.map(R => R.w)], camera);
        if (zf.userData.j.armR) zf.userData.j.armR.rotation.x = -0.5 - 0.5 * Math.sin(t / 900);
      },
    };
  }

  // ---------- the Peach Garden: spring, blossoms falling, the altar of the oath ----------
  function peachTree(parent, x, z, s) {
    const g = new THREE.Group(); g.position.set(x, -1.4, z); g.scale.setScalar(s); g.rotation.y = rnd(0, 6); g.userData.clear = 1.9 * s; parent.add(g);
    const bark = flat('#3a2418');
    const trunk = add(g, new THREE.CylinderGeometry(0.14, 0.22, 1.8, 5), bark, 0, 0.9, 0); trunk.rotation.z = rnd(-0.15, 0.15);
    for (let i = 0; i < 3; i++) { const b = add(g, new THREE.CylinderGeometry(0.05, 0.09, 1.1, 4), bark, rnd(-0.4, 0.4), 1.9, rnd(-0.4, 0.4)); b.rotation.set(rnd(-0.7, 0.7), 0, rnd(-0.7, 0.7)); }
    const pinks = ['#f4b6c6', '#eea0b6', '#f8cad6', '#e88aa6'];
    for (let i = 0; i < 6; i++) {
      const c = add(g, new THREE.IcosahedronGeometry(rnd(0.55, 0.9), 0), flat(pinks[i % 4], { emissive: '#3a1820', glow: 0.25 }), rnd(-0.9, 0.9), rnd(2.1, 3.1), rnd(-0.9, 0.9));
      c.rotation.set(rnd(0, 3), rnd(0, 3), 0);
    }
  }
  function daoVien(ctx) {
    const group = new THREE.Group();
    const stone = stoneTexture('#8a8478'); stone.repeat.set(3, 3);
    const dais = add(group, new THREE.CylinderGeometry(9, 9.3, 0.5, 8), new THREE.MeshStandardMaterial({ map: stone, roughness: 0.95 }), 0, -1.15, 0);
    dais.rotation.y = Math.PI / 8;
    const ground = add(group, new THREE.CircleGeometry(95, 48), flat('#5a7a3a'), 0, -1.4, 0); ground.rotation.x = -Math.PI / 2;
    for (let i = 0; i < (ctx.low ? 14 : 26); i++) {
      const a = rnd(0, Math.PI * 2), r = rnd(13, 42);
      peachTree(group, Math.cos(a) * r, Math.sin(a) * r, rnd(1.6, 2.6));
    }
    // the altar of the oath, with incense smoke, and Zhang Fei's thatched house beyond the trees
    const altar = new THREE.Group(); altar.position.set(0, -1.4, -15); group.add(altar);
    add(altar, new THREE.BoxGeometry(3.4, 1.1, 1.5), flat('#5a2a14'), 0, 0.55, 0);
    add(altar, new THREE.BoxGeometry(3.6, 0.12, 1.7), flat('#7a3a1c'), 0, 1.15, 0);
    add(altar, new THREE.CylinderGeometry(0.28, 0.22, 0.35, 8), flat('#8a6a3a', { metal: 0.5, rough: 0.5 }), 0, 1.38, 0);
    for (let i = -1; i <= 1; i++) add(altar, new THREE.CylinderGeometry(0.015, 0.015, 0.5, 3), flat('#c0302a'), i * 0.08, 1.75, 0);
    const smoke = [];
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: ctx.glowTex, color: '#e8e4e0', transparent: true, opacity: 0.3, depthWrite: false }));
      altar.add(m); smoke.push({ m, k: i / 6 });
    }
    const house = new THREE.Group(); house.position.set(16, -1.4, -36); house.rotation.y = -0.5; group.add(house);
    add(house, new THREE.BoxGeometry(8, 3.2, 5), flat('#c8b48a'), 0, 1.6, 0);
    const thatch = add(house, new THREE.ConeGeometry(6.6, 3, 4), flat('#8a7040'), 0, 4.6, 0); thatch.rotation.y = Math.PI / 4; thatch.scale.set(1.3, 1, 0.85);
    add(house, new THREE.BoxGeometry(1.4, 2.2, 0.1), flat('#3a2414'), 0, 1.1, 2.52);
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2, m = add(group, new THREE.ConeGeometry(rnd(14, 22), rnd(6, 12), 6), flat('#6a8a6a'), Math.cos(a) * 82, 0, Math.sin(a) * 82); m.rotation.y = rnd(0, 3); }
    // petals drifting down on the breeze
    const n = ctx.low ? 120 : 280, pg = new THREE.BufferGeometry(), pa = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pa[i * 3] = rnd(-30, 30); pa[i * 3 + 1] = rnd(-1, 9); pa[i * 3 + 2] = rnd(-30, 30); }
    pg.setAttribute('position', new THREE.BufferAttribute(pa, 3));
    const petals = new THREE.Points(pg, new THREE.PointsMaterial({ size: 0.16, color: '#f6b8c8', transparent: true, opacity: 0.95, depthWrite: false }));
    group.add(petals);
    const pp = pg.attributes.position;
    return {
      group, sky: skyDome('#7aa4d6', '#f2e4d6', '#5a7a3a'), fog: '#d6d8d4', fogSpan: 70, ambience: 'spring',
      light: { hemi: ['#fff4e8', '#4a5a30', 1.0], key: ['#fff2dc', 1.7], rim: ['#ffd6e0', 0.4] },
      update(t, dt) {
        for (let i = 0; i < n; i++) {
          let y = pp.getY(i) - dt * (0.5 + (i % 4) * 0.15);
          let x = pp.getX(i) + dt * (0.6 + Math.sin(t / 1300 + i) * 0.5);
          if (y < -1.3) { y = 9; x = rnd(-34, 26); pp.setZ(i, rnd(-30, 30)); }
          if (x > 32) x = -32;
          pp.setX(i, x); pp.setY(i, y);
        }
        pp.needsUpdate = true;
        for (const S of smoke) {
          S.k = (S.k + dt * 0.12) % 1;
          S.m.position.set(Math.sin(S.k * 5) * 0.3, 1.9 + S.k * 4, 0); S.m.scale.setScalar(0.5 + S.k * 2.2); S.m.material.opacity = 0.32 * Math.min(1, S.k * 5) * (1 - S.k);
        }
      },
    };
  }

  // ---------- shared by the side stories below ----------
  // a distant army in ranks, as three instanced meshes (bodies, helmets, spears): cheap enough for hundreds.
  // Ranks run along x around (x0, z0) and go back towards -z.
  function army(parent, n, cols, x0, y0, z0, gap, cloth) {
    const parts = [
      [new THREE.BoxGeometry(0.75, 1.5, 0.5), flat(cloth), 0, 0.75, 0],
      [new THREE.BoxGeometry(0.42, 0.42, 0.42), flat('#2a2c32', { metal: 0.4, rough: 0.5 }), 0, 1.72, 0],
      [new THREE.CylinderGeometry(0.04, 0.04, 3.4, 4), flat('#3a2a1a'), 0.48, 1.7, 0],
    ].map(([g, m, dx, dy, dz]) => ({ im: new THREE.InstancedMesh(g, m, n), dx, dy, dz }));
    const m = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      const x = x0 + ((i % cols) - (cols - 1) / 2) * gap + rnd(-0.25, 0.25), z = z0 - Math.floor(i / cols) * gap * 1.3 + rnd(-0.25, 0.25);
      for (const P of parts) { m.makeTranslation(x + P.dx, y0 + P.dy, z + P.dz); P.im.setMatrixAt(i, m); }
    }
    for (const P of parts) parent.add(P.im);
  }
  // clouds or mist: big soft sprites that drift along x and wrap round at ±x
  function drifts(ctx, group, n, color, opacity, w, h, x, y, z) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: ctx.glowTex, color, transparent: true, opacity, depthWrite: false }));
      m.scale.set(rnd(w[0], w[1]), rnd(h[0], h[1]), 1); m.position.set(rnd(-x, x), rnd(y[0], y[1]), rnd(z[0], z[1])); group.add(m);
      out.push({ m, v: rnd(0.5, 1.3), ph: Math.random() * 6, o: opacity });
    }
    return out;
  }
  function drift(list, dt, x) { for (const D of list) { D.m.position.x += D.v * dt; if (D.m.position.x > x) D.m.position.x = -x; } }

  // ---------- Mount Dingjun: on the facing peak at dawn, the red flag that sends Huang Zhong down ----------
  function bird(group) {
    const b = new THREE.Group(), c = flat('#2a2420');
    add(b, new THREE.BoxGeometry(0.25, 0.18, 0.9), c);
    const wings = [-1, 1].map(sx => { const w = new THREE.Group(); w.position.x = sx * 0.12; b.add(w); add(w, new THREE.BoxGeometry(1.6, 0.05, 0.5), c, sx * 0.8, 0, 0); return w; });
    group.add(b);
    return { b, wings };
  }
  function dinhQuan(ctx) {
    const group = new THREE.Group();
    const stone = stoneTexture('#7a7468'); stone.repeat.set(3, 3);
    const top = add(group, new THREE.CylinderGeometry(9, 9.4, 0.5, 9), new THREE.MeshStandardMaterial({ map: stone, roughness: 0.95 }), 0, -1.15, 0);
    top.rotation.y = 0.2;
    // the summit falls away under the platform, down to a sea of cloud
    const rock = flat('#5c5a50'), moss = flat('#4e6a3a');
    add(group, new THREE.CylinderGeometry(9.6, 21, 17, 9), rock, 0, -9.9, 0);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2, r = add(group, new THREE.DodecahedronGeometry(rnd(1.5, 2.6), 0), i % 3 ? rock : moss, Math.cos(a) * rnd(10.5, 12.5), rnd(-6, -4.5), Math.sin(a) * rnd(10.5, 12.5));
      r.rotation.set(rnd(0, 3), rnd(0, 3), 0);
    }
    for (let i = 0; i < (ctx.low ? 6 : 12); i++) {                          // pines clinging to the slopes
      const a = rnd(0, Math.PI * 2), r = rnd(13, 18), g = tree(group, Math.cos(a) * r, Math.sin(a) * r, rnd(1, 1.5));
      g.position.y = -1.4 - (r - 9.6) * 1.55;
    }
    // peaks all around, rising out of the cloud, bluer with distance; the near ring leaves the view to Dingjun open
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2 + rnd(-0.1, 0.1), far = i % 2, r = far ? rnd(72, 86) : rnd(46, 58);
      if (!far && Math.abs(Math.atan2(Math.sin(a + Math.PI / 2), Math.cos(a + Math.PI / 2))) < 0.5) continue;
      const m = add(group, new THREE.ConeGeometry(rnd(9, 16), rnd(24, 40), 6), flat(far ? '#5e6e86' : '#46603e'), Math.cos(a) * r, -17, Math.sin(a) * r);
      m.rotation.y = rnd(0, 3);
    }
    // Mount Dingjun across the gorge, with Xiahou Yuan's camp on its flat top
    const dj = new THREE.Group(); dj.position.set(0, -3, -55); group.add(dj);
    add(dj, new THREE.CylinderGeometry(6, 20, 26, 8), flat('#506646'), 0, -8, 0);
    const wei = flagTexture('夏', '#1c2a44', '#c9d3de'), weiFlags = [];
    for (let i = 0; i < (ctx.low ? 3 : 5); i++) {
      const a = (i / 5) * Math.PI * 2 + 0.4, T = tent('#2e3c56'); T.g.scale.setScalar(0.7); T.g.position.set(Math.cos(a) * 4, 5, Math.sin(a) * 4 - 1); dj.add(T.g);
    }
    for (const x of [-4.5, 4.5]) weiFlags.push(flagPole(dj, wei, x, 5, 2.5, 4));
    const hhu = figure('ha-hau-uyen', -1, 3.4, 0, 5, 3); dj.add(hhu);
    // Huang Zhong on a spur of rock below, ready to charge; Fa Zheng's red flag on the summit behind the board
    add(group, new THREE.DodecahedronGeometry(4.2, 0), rock, 11, -9, -20);
    const ht = figure('hoang-trung', 1, 3.6, 11, -5.2, -20); group.add(ht);
    const sig = flagPole(group, flagTexture('法', '#b3261e', '#e3b448'), -6.2, -0.9, -6.2, 6.5);
    sig.f.parent.scale.setScalar(1.3);
    // clouds below and around, a low sun, and two eagles circling
    const clouds = drifts(ctx, group, ctx.low ? 14 : 28, '#f4f2ee', 0.55, [24, 40], [6, 10], 90, [-14, -8], [-90, 90]);
    const high = drifts(ctx, group, ctx.low ? 4 : 8, '#fff4e4', 0.3, [30, 50], [4, 7], 90, [22, 30], [-80, -20]);
    const sun = glow(ctx, '#ffd9a0', 30, 0.8); sun.material.fog = false; sun.position.set(60, 16, -55); group.add(sun);
    const birds = [bird(group), bird(group)];
    return {
      group, sky: skyDome('#5d86c0', '#f3d9a8', '#8a9aa6'), fog: '#c4ccd2', fogSpan: 80, ambience: 'mountain',
      light: { hemi: ['#e8f0ff', '#3a4a2a', 0.95], key: ['#fff0d8', 1.6], rim: ['#ffc890', 0.45] },
      update(t, dt, camera) {
        drift(clouds, dt, 90); drift(high, dt * 0.5, 90);
        sig.f.rotation.y = Math.sin(t / 380) * 0.5;
        for (const F of weiFlags) F.f.rotation.y = Math.sin(t / 520 + F.ph) * 0.35;
        birds.forEach((B, i) => {
          const a = t / (9000 + i * 2500) + i * 3, r = 28 + i * 7;
          B.b.position.set(Math.cos(a) * r, 11 + i * 3 + Math.sin(t / 2000 + i) * 1.5, Math.sin(a) * r - 10);
          B.b.rotation.y = -a; B.b.rotation.z = 0.3;
          const flap = Math.max(0, Math.sin(t / 160 + i)) * 0.5;
          B.wings[0].rotation.z = -flap; B.wings[1].rotation.z = flap;
        });
        faceBanners([ht, hhu], camera);
        if (ht.userData.j.armR) ht.userData.j.armR.rotation.x = -0.9 - 0.6 * Math.sin(t / 700);
      },
    };
  }

  // ---------- the Nanman jungle: a bamboo deck by the Lu river, poison mist on the water, war elephants ----------
  function palm(parent, x, z, s) {
    const g = new THREE.Group(); g.position.set(x, -1.6, z); g.scale.setScalar(s); g.rotation.y = rnd(0, 6); g.userData.clear = 2.6 * s; parent.add(g);
    const bark = flat('#5a4a32'), lean = rnd(0.05, 0.25);
    let y = 0, dx = 0;
    for (let i = 0; i < 4; i++) { const seg = add(g, new THREE.CylinderGeometry(0.12, 0.15, 0.9, 5), bark, dx, y + 0.45, 0); seg.rotation.z = -lean; y += 0.88; dx += Math.sin(lean) * 0.9; }
    const crown = new THREE.Group(); crown.position.set(dx, y, 0); g.add(crown);
    for (let i = 0; i < 7; i++) {
      const f = new THREE.Group(); f.rotation.y = (i / 7) * Math.PI * 2; crown.add(f);
      const leaf = add(f, new THREE.BoxGeometry(0.5, 0.04, 2), flat(i % 2 ? '#3e7a32' : '#4e8a3a'), 0, 0, 1); leaf.rotation.x = 0.45;
    }
  }
  function bamboo(parent, x, z) {
    const g = new THREE.Group(); g.position.set(x, -1.6, z); g.userData.clear = 1.4; parent.add(g);
    for (let i = 0; i < 6; i++) {
      const h = rnd(4, 8), c = add(g, new THREE.CylinderGeometry(0.07, 0.08, h, 5), flat(i % 2 ? '#7a9a3a' : '#6a8a32'), rnd(-0.8, 0.8), h / 2, rnd(-0.8, 0.8));
      c.rotation.set(rnd(-0.08, 0.08), 0, rnd(-0.08, 0.08));
    }
  }
  function totem(parent, x, z) {
    const g = new THREE.Group(); g.position.set(x, -1.6, z); g.userData.clear = 1.2; parent.add(g);
    ['#8a3a1a', '#2a5a6a', '#c8862a', '#6a2a1a'].forEach((c, i) => {
      add(g, new THREE.BoxGeometry(1, 1.1, 1), flat(c), 0, 0.55 + i * 1.1, 0);
      for (const sx of [-1, 1]) add(g, new THREE.BoxGeometry(0.2, 0.14, 0.05), flat('#f0e6d0'), sx * 0.22, 0.7 + i * 1.1, 0.52);
      add(g, new THREE.BoxGeometry(0.5, 0.1, 0.05), flat('#1a1010'), 0, 0.36 + i * 1.1, 0.52);
    });
    for (const sx of [-1, 1]) { const w = add(g, new THREE.BoxGeometry(1.4, 0.5, 0.15), flat('#c8862a'), sx * 1.1, 4.3, 0); w.rotation.z = sx * 0.3; }
    g.lookAt(0, -1.6, 0);
  }
  function namMan(ctx) {
    const group = new THREE.Group();
    const deckTex = woodTexture('#8a7a42', 12); deckTex.repeat.set(3, 3);
    add(group, new THREE.BoxGeometry(15, 0.5, 17), new THREE.MeshStandardMaterial({ map: deckTex, roughness: 0.9 }), 0, -1.15, 0);
    for (const [x, z] of [[-7, -8], [7, -8], [-7, 8], [7, 8]]) add(group, new THREE.CylinderGeometry(0.25, 0.25, 1.4, 6), flat('#6a5a2a'), x, -1.9, z);
    const ground = add(group, new THREE.CircleGeometry(95, 48), flat('#2e4424'), 0, -1.6, 0); ground.rotation.x = -Math.PI / 2;
    // the Lu river, green and still, with the poison mist on it
    const river = add(group, new THREE.PlaneGeometry(190, 14), new THREE.MeshStandardMaterial({ color: '#3a5a3e', roughness: 0.3, metalness: 0.25 }), 0, -1.55, -26);
    river.rotation.x = -Math.PI / 2;
    const mist = [...drifts(ctx, group, ctx.low ? 8 : 16, '#9ad06a', 0.3, [10, 18], [2.5, 4], 70, [-1.2, 1], [-31, -21]),
      ...drifts(ctx, group, ctx.low ? 4 : 8, '#b48ad8', 0.22, [8, 14], [2, 3.5], 70, [-1, 1.5], [-31, -21])];
    // the jungle: palms, bamboo and broad-leaved trees, kept off the river
    for (let i = 0; i < (ctx.low ? 16 : 32); i++) {
      const a = rnd(0, Math.PI * 2), r = rnd(17, 55), x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (Math.abs(z + 26) < 8) continue;
      if (i % 3 === 0) bamboo(group, x, z); else palm(group, x, z, rnd(1.6, 2.6));
    }
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2, r = rnd(60, 80), t = new THREE.Group(); t.position.set(Math.cos(a) * r, -1.6, Math.sin(a) * r); group.add(t);
      add(t, new THREE.CylinderGeometry(0.8, 1.2, 10, 6), flat('#3a2e1e'), 0, 5, 0);
      for (let k = 0; k < 4; k++) add(t, new THREE.IcosahedronGeometry(rnd(5, 8), 0), flat(k % 2 ? '#2a5a2a' : '#356a30'), rnd(-4, 4), rnd(10, 15), rnd(-4, 4));
    }
    for (const [x, z] of [[-15, -15], [16, -13], [-18, 11]]) totem(group, x, z);
    // the king of the Nanman across the river, his war elephants walking the bank
    const mh = figure('manh-hoach', -1, 4.2, -8, -1.6, -38); group.add(mh);
    const herd = [];
    for (let i = 0; i < (ctx.low ? 2 : 3); i++) {
      const e = MODELS.warrior(-3); e.scale.setScalar(3.6); e.rotation.y = -Math.PI / 2; e.position.set(30 - i * 14, -1.6, -41 - (i % 2) * 3); group.add(e);
      herd.push({ e, j: e.userData.j, ph: i * 1.3 });
    }
    const flies = specks(ctx, ctx.low ? 40 : 90, '#e8ff9a', 0.2, [24, -1, 4], 0.85); group.add(flies);
    const fp = flies.geometry.attributes.position, home = Float32Array.from(fp.array);
    return {
      group, sky: skyDome('#5e7e66', '#d8d2a0', '#2e4424'), fog: '#71825a', fogSpan: 55, ambience: 'jungle',
      light: { hemi: ['#e0f0c8', '#2a3a1a', 0.9], key: ['#fff0c8', 1.45], rim: ['#c8ff9a', 0.35] },
      update(t, dt, camera) {
        drift(mist, dt * 0.6, 70);
        for (const M of mist) M.m.material.opacity = M.o * (0.75 + 0.25 * Math.sin(t / 1400 + M.ph));
        for (const H of herd) {
          H.e.position.x -= dt * 1.4; if (H.e.position.x < -60) H.e.position.x += 120;
          const ph = t / 380 + H.ph;
          if (H.j.legs) H.j.legs.forEach((L, i) => { L.rotation.x = Math.sin(ph + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI : 0)) * 0.35; });
          if (H.j.trunk) H.j.trunk.rotation.x = 0.5 + Math.sin(ph * 0.5) * 0.25;
        }
        for (let i = 0; i < fp.count; i++) {
          fp.setX(i, home[i * 3] + Math.sin(t / 1600 + i) * 1.3); fp.setY(i, home[i * 3 + 1] + Math.sin(t / 800 + i * 2) * 0.5); fp.setZ(i, home[i * 3 + 2] + Math.cos(t / 1400 + i) * 1.3);
        }
        fp.needsUpdate = true;
        faceBanners([mh, ...herd.map(H => H.e)], camera);
        if (mh.userData.j.armR) mh.userData.j.armR.rotation.x = -0.8 - 0.5 * Math.sin(t / 650);
      },
    };
  }

  // ---------- the West City: the gate wide open, Zhuge Liang playing the zither on the wall before Sima Yi's army ----------
  function tayThanh(ctx) {
    const group = new THREE.Group();
    const stone = stoneTexture('#8a8070'); stone.repeat.set(3, 3);
    add(group, new THREE.BoxGeometry(16, 0.5, 18), new THREE.MeshStandardMaterial({ map: stone, roughness: 0.95 }), 0, -1.15, 0);
    // the wall runs left and right under the terrace; the plain outside lies ahead, far below
    const wallTex = stoneTexture('#6e665a'); wallTex.repeat.set(24, 3);
    add(group, new THREE.BoxGeometry(150, 12, 12), new THREE.MeshStandardMaterial({ map: wallTex, roughness: 1 }), 0, -7.4, -3);
    for (let x = -72; x <= 72; x += 2.6) add(group, new THREE.BoxGeometry(1.4, 1.2, 0.8), flat('#6a6256'), x, -0.8, -9.4);   // battlements
    // the gateway below the terrace, doors thrown open, and two old soldiers sweeping before it
    add(group, new THREE.BoxGeometry(7, 8, 0.4), flat('#120e0c'), 0, -9.4, -9.1);
    for (const sx of [-1, 1]) { const d = add(group, new THREE.BoxGeometry(3.4, 7.6, 0.3), flat('#4a2c16'), sx * 4.6, -9.6, -10.6); d.rotation.y = sx * 1.1; }
    const ground = add(group, new THREE.CircleGeometry(95, 48), flat('#7a6a48'), 0, -13.4, 0); ground.rotation.x = -Math.PI / 2;
    const sweepers = [-3, 3].map((x, i) => {
      const w = MODELS.warrior(7); w.scale.setScalar(2.6); w.position.set(x, -13.4, -15); w.rotation.y = Math.PI + (i ? -0.6 : 0.6); group.add(w);
      const j = w.userData.j, broom = new THREE.Group(); broom.position.set(0, -0.18, 0.03); if (j.armR) j.armR.add(broom);
      add(broom, new THREE.CylinderGeometry(0.008, 0.008, 0.5, 4), flat('#6a4a2a'), 0, -0.1, 0);
      add(broom, new THREE.BoxGeometry(0.12, 0.08, 0.03), flat('#c8a85a'), 0, -0.36, 0);
      return { w, j, ph: i * 2 };
    });
    // Zhuge Liang on the wall beside the terrace: the zither on a low table, incense, two boys in attendance
    const kz = new THREE.Group(); kz.position.set(-11.5, -1.4, -4.5); group.add(kz);
    const kml = figure('gia-cat-luong', 1, 2.4, 0, 0, 0); kz.add(kml);
    add(kz, new THREE.BoxGeometry(1.6, 0.5, 0.6), flat('#3a2414'), 0, 0.25, -0.9);
    add(kz, new THREE.BoxGeometry(1.4, 0.1, 0.4), flat('#6a3a1c', { rough: 0.5 }), 0, 0.55, -0.9);        // the zither
    for (let i = 0; i < 7; i++) add(kz, new THREE.BoxGeometry(1.3, 0.01, 0.01), flat('#e8dcc0'), 0, 0.61, -1.05 + i * 0.05);
    for (const sx of [-1, 1]) { const b = MODELS.warrior(2); b.scale.setScalar(1.7); b.position.set(sx * 1.6, 0, 0.6); kz.add(b); }
    const smoke = [];
    add(kz, new THREE.CylinderGeometry(0.15, 0.12, 0.25, 8), flat('#8a6a3a', { metal: 0.5, rough: 0.5 }), 1.1, 0.62, -0.9);
    for (let i = 0; i < 5; i++) { const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: ctx.glowTex, color: '#e8e4e0', transparent: true, opacity: 0.3, depthWrite: false })); kz.add(m); smoke.push({ m, k: i / 5 }); }
    // Sima Yi's army on the plain, halted before the open gate
    army(group, ctx.low ? 90 : 180, 30, 0, -13.4, -40, 2.2, '#26324a');
    army(group, ctx.low ? 30 : 60, 10, -42, -13.4, -36, 2.2, '#26324a');
    army(group, ctx.low ? 30 : 60, 10, 42, -13.4, -36, 2.2, '#26324a');
    const flags = [], wei = flagTexture('魏', '#1c2436', '#c9d3de'), sima = flagTexture('懿', '#3a1a1a', '#e3b448');
    const nf = ctx.low ? 6 : 10;
    for (let i = 0; i < nf; i++) flags.push(flagPole(group, i % 3 ? wei : sima, -36 + (i * 72) / (nf - 1), -13.4, -37, 7));
    const smy = figure('tu-ma-y', -1, 4.2, 0, -13.4, -33); group.add(smy);
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2, m = add(group, new THREE.ConeGeometry(rnd(12, 20), rnd(10, 18), 5), flat('#6a5a4a'), Math.cos(a) * 82, -13.4, Math.sin(a) * 82); m.rotation.y = rnd(0, 3); }
    const dust = specks(ctx, ctx.low ? 60 : 140, '#ffd8a0', 0.13, [34, -12, 4], 0.5); group.add(dust);
    return {
      group, sky: skyDome('#3e4466', '#eca266', '#7a6a48'), fog: '#b08a66', fogSpan: 80, ambience: 'zither',
      light: { hemi: ['#ffe0c0', '#3a2a1a', 0.85], key: ['#ffc890', 1.5], rim: ['#8aa0ff', 0.35] },
      update(t, dt, camera) {
        for (const F of flags) F.f.rotation.y = Math.sin(t / 560 + F.ph) * 0.35;
        for (const S of sweepers) { const k = Math.sin(t / 500 + S.ph); if (S.j.armR) S.j.armR.rotation.x = -0.4 + k * 0.5; S.w.rotation.z = k * 0.04; }
        if (kml.userData.j.armL) kml.userData.j.armL.rotation.x = -0.9 + Math.sin(t / 300) * 0.15;   // the hand on the strings
        for (const S of smoke) {
          S.k = (S.k + dt * 0.12) % 1;
          S.m.position.set(1.1 + Math.sin(S.k * 5) * 0.25, 1 + S.k * 3, -0.9); S.m.scale.setScalar(0.4 + S.k * 1.8); S.m.material.opacity = 0.3 * Math.min(1, S.k * 5) * (1 - S.k);
        }
        dust.rotation.y += dt * 0.015;
        faceBanners([smy], camera);
      },
    };
  }

  const BUILD = { room, 'dao-vien': daoVien, 'ho-lao': hoLao, 'truong-ban': truongBan, 'xich-bich': xichBich, 'ngu-truong': nguTruong, 'dinh-quan': dinhQuan, 'nam-man': namMan, 'tay-thanh': tayThanh };
  return { list, byId, valid: id => typeof id === 'string' && id in byId, build: (id, ctx) => (BUILD[id] || room)(ctx) };
})();
