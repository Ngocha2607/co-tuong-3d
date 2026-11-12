// rig-figure.mjs <in.glb> <out.glb> [figure] — gives a one-piece standing figure (arms held out from the sides, facing +z once its
// node's turn is baked in) a skeleton named as the game names its joints, with skin weights worked out from how
// near each vertex is to each bone, then smoothed over the mesh.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(process.argv[2]);
const root = doc.getRoot(), scene = root.listScenes()[0], node = root.listNodes()[0], prim = node.getMesh().listPrimitives()[0];
const buffer = root.listBuffers()[0];

// bake the node's quarter turn about x: (x, y, z) -> (x, -z, y)
const posA = prim.getAttribute('POSITION'), norA = prim.getAttribute('NORMAL');
const P = Float32Array.from(posA.getArray()), Q = Float32Array.from(norA.getArray()), n = P.length / 3;
for (const A of [P, Q]) for (let i = 0; i < n; i++) { const y = A[3 * i + 1], z = A[3 * i + 2]; A[3 * i + 1] = -z; A[3 * i + 2] = y; }
posA.setArray(P); norA.setArray(Q);
node.setRotation([0, 0, 0, 1]);

// each figure's measures (once turned: y up, 1.1 tall, facing +z), for his left side: where the shoulder, elbow and
// wrist are, and the hip, knee and ankle
const SHAPES = {
  'quan-vu': { fist: 'R', tip: [0.255, 0.47, 0.07], sho: [0.13, 0.88, -0.01], elbow: [0.215, 0.71, 0], wrist: [0.255, 0.53, 0.06], hip: [0.07, 0.54, 0], knee: [0.12, 0.30, 0], ankle: [0.165, 0.04, 0] },
  'tao-thao': { fist: 'R', tip: [0.245, 0.49, 0.065], sho: [0.145, 0.86, -0.02], elbow: [0.20, 0.70, 0], wrist: [0.245, 0.55, 0.055], hip: [0.07, 0.54, 0], knee: [0.12, 0.30, 0], ankle: [0.15, 0.04, 0] },
};
const M = SHAPES[process.argv[4] || 'quan-vu'];
if (!M) throw new Error('no such figure: ' + process.argv[4]);
// the skeleton: name, parent, where it turns, where it ends, how thick the flesh round it; side: -1 his right, 1 his left
const B = [];
const bone = (name, parent, at, to, r, o = {}) => B.push({ name, parent, at, to: to || at, r, ...o });
bone('hips', null, [0, 0.56, 0], [0, 0.50, 0], 0.13);
bone('skirt', 'hips', [0, 0.50, 0], [0, 0.16, 0], 0.07);          // the robe's hanging panels: they stay with the hips, so half follow the legs
bone('body', 'hips', [0, 0.60, 0], [0, 0.90, 0], 0.13);
bone('head', 'body', [0, 0.95, 0], [0, 1.07, 0], 0.085, { above: [0.91, 0.97] });
for (const [s, sx] of [['R', -1], ['L', 1]]) {
  const at = p => [sx * p[0], p[1], p[2]];
  bone('arm' + s, 'body', at(M.sho), null, 0);                                                  // the one the game turns: no flesh of its own
  bone('sho' + s, 'arm' + s, at(M.sho), at(M.elbow), 0.055, { side: sx, out: [0.1, 0.16] });
  bone('fore' + s, 'sho' + s, at(M.elbow), at(M.wrist), 0.05, { side: sx, out: [0.12, 0.18] });
  // what the hand holds hangs here; a hand that grips (fist: 'R', tip: the fingertips) bends at the wrist with it
  if (M.fist === s) bone('hand' + s, 'fore' + s, at(M.wrist), at(M.tip), 0.04, { side: sx, out: [0.12, 0.18], below: [M.wrist[1] + 0.04, M.wrist[1] + 0.01] });
  else bone('hand' + s, 'fore' + s, at(M.wrist), null, 0);
  bone('leg' + s, 'hips', at(M.hip), at(M.knee), 0.075, { side: sx, below: [0.62, 0.5] });
  bone('shin' + s, 'leg' + s, at(M.knee), at(M.ankle), 0.065, { side: sx, below: [0.62, 0.5] });
}
const step = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function dist(v, a, b) {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], av = [v[0] - a[0], v[1] - a[1], v[2] - a[2]];
  const l = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2], t = l ? Math.min(1, Math.max(0, (av[0] * ab[0] + av[1] * ab[1] + av[2] * ab[2]) / l)) : 0;
  return Math.hypot(av[0] - t * ab[0], av[1] - t * ab[1], av[2] - t * ab[2]);
}
const nb = B.length;
let W = new Float32Array(n * nb);
for (let i = 0; i < n; i++) {
  const v = [P[3 * i], P[3 * i + 1], P[3 * i + 2]];
  let sum = 0;
  for (let k = 0; k < nb; k++) {
    const b = B[k];
    if (!b.r) continue;
    let w = Math.pow(b.r / (dist(v, b.at, b.to) + 0.004), 4);
    if (b.side) w *= step(-0.03, 0.03, b.side * v[0]);
    if (b.out) w *= step(b.out[0], b.out[1], Math.abs(v[0]));
    if (b.below) w *= step(b.below[0], b.below[1], v[1]);
    if (b.above) w *= step(b.above[0], b.above[1], v[1]);
    W[i * nb + k] = w; sum += w;
  }
  for (let k = 0; k < nb; k++) W[i * nb + k] /= sum;
}
// neighbours over the surface, vertices at the same place (split along the texture's seams) counted as one
const idx = prim.getIndices().getArray(), place = new Map(), same = new Int32Array(n);
for (let i = 0; i < n; i++) { const key = `${Math.round(P[3 * i] * 2e4)},${Math.round(P[3 * i + 1] * 2e4)},${Math.round(P[3 * i + 2] * 2e4)}`; if (!place.has(key)) place.set(key, i); same[i] = place.get(key); }
const near = Array.from({ length: n }, () => new Set());
for (let t = 0; t < idx.length; t += 3) for (let e = 0; e < 3; e++) { const a = same[idx[t + e]], b = same[idx[t + (e + 1) % 3]]; near[a].add(b); near[b].add(a); }
for (let pass = 0; pass < 8; pass++) {
  const N = new Float32Array(W.length);
  for (let i = 0; i < n; i++) {
    if (same[i] !== i) continue;
    const m = near[i].size;
    for (let k = 0; k < nb; k++) { let s = 0; for (const o of near[i]) s += W[o * nb + k]; N[i * nb + k] = m ? 0.5 * W[i * nb + k] + 0.5 * s / m : W[i * nb + k]; }
  }
  W = N;
}
// the four strongest bones of each vertex
const J = new Uint8Array(n * 4), WT = new Float32Array(n * 4);
for (let i = 0; i < n; i++) {
  const o = same[i] * nb, best = [...Array(nb).keys()].sort((a, b) => W[o + b] - W[o + a]).slice(0, 4);
  let sum = 0; for (const k of best) sum += W[o + k];
  best.forEach((k, c) => { const w = W[o + k] / sum; J[4 * i + c] = w > 0 ? k : 0; WT[4 * i + c] = w; });
}
prim.setAttribute('JOINTS_0', doc.createAccessor().setType('VEC4').setArray(J).setBuffer(buffer));
prim.setAttribute('WEIGHTS_0', doc.createAccessor().setType('VEC4').setArray(WT).setBuffer(buffer));

const skin = doc.createSkin('rig'), nodes = {}, inv = new Float32Array(nb * 16);
B.forEach((b, k) => {
  const p = b.parent ? B.find(x => x.name === b.parent).at : [0, 0, 0];
  nodes[b.name] = doc.createNode(b.name).setTranslation([b.at[0] - p[0], b.at[1] - p[1], b.at[2] - p[2]]);
  if (b.parent) nodes[b.parent].addChild(nodes[b.name]); else scene.addChild(nodes[b.name]);
  skin.addJoint(nodes[b.name]);
  inv.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -b.at[0], -b.at[1], -b.at[2], 1], k * 16);
});
skin.setSkeleton(nodes.hips).setInverseBindMatrices(doc.createAccessor().setType('MAT4').setArray(inv).setBuffer(buffer));
node.setSkin(skin).setName('skin');
await io.write(process.argv[3], doc);
console.log('rigged', n, 'vertices,', nb, 'bones');
