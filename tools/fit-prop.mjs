// fit-prop.mjs <in.glb> <out.glb> <scale> <lo> <hi> [y] [from by [to thin [above wide]]] [turn] — a weapon that came as a file,
// made ready for a hand: it stands along y as it did, shrunk by scale, its axis (the middle of what lies between the
// heights lo and hi of the file: the grip, or a ring of the shaft) on the y axis, the middle of lo and hi at height y
// (default 0), so the game holds it the way it holds the ones it builds.
// from, by, to: what lies between the heights from and to is drawn out by that much, and what is above goes up with
// it (to left out: all that is above from) — the files' blades are short for their hilts, and their shafts are
// asked for short, since a long one comes back bent. thin: what is below to is made that much thinner about the axis.
// above, wide: what is above the height above is made that much wider across its flat (x), for a blade that
// came too slight to be seen on the board.
// turn: turned half round, for a blade whose edge is towards -x (the game's are towards +x).
// As used (heights measured with a per-height listing of the model's extents):
//   sword:  kiem.glb 0.33 0.13 0.31 -0.008 0.5 1.35
//   glaive: dao.glb  0.58 0.11 0.19 -0.163 0.21 2.59 0.53 0.7 turn
//   halberd: kich.glb 0.55 0.08 0.20 -0.173 0.22 2.72 0.54 1
//   serpent spear: mau.glb 0.55 0.06 0.18 -0.184 0.22 3.2 0.52 0.8 0.79 1.8
//   spear: thuong.glb 0.55 0.05 0.14 -0.198 0.18 2.82 0.52 0.76
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
const args = process.argv.slice(2), turn = args[args.length - 1] === 'turn' ? (args.pop(), -1) : 1;
const [src, out, scale, lo, hi, gripY = 0, from = Infinity, by = 1, to = Infinity, thin = 1, above = Infinity, wide = 1] = args;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS), doc = await io.read(src), s = +scale;
const parts = [];
for (const node of doc.getRoot().listNodes()) {
  const mesh = node.getMesh(); if (!mesh) continue;
  const m = node.getWorldMatrix();
  for (const prim of mesh.listPrimitives()) {
    for (const [name, w] of [['POSITION', 1], ['NORMAL', 0]]) {
      const acc = prim.getAttribute(name); if (!acc) continue;
      const A = acc.getArray();
      for (let i = 0; i < A.length; i += 3) {
        const x = A[i], y = A[i + 1], z = A[i + 2];
        let v = [m[0] * x + m[4] * y + m[8] * z + w * m[12], m[1] * x + m[5] * y + m[9] * z + w * m[13], m[2] * x + m[6] * y + m[10] * z + w * m[14]];
        if (!w) { const l = Math.hypot(...v) || 1; v = [turn * v[0] / l, v[1] / l, turn * v[2] / l]; }
        A[i] = v[0]; A[i + 1] = v[1]; A[i + 2] = v[2];
      }
      acc.setArray(A);
    }
    parts.push(prim.getAttribute('POSITION'));
  }
}
for (const node of doc.getRoot().listNodes()) node.setMatrix([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
// the axis: the middle of what lies between the two heights
let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
for (const acc of parts) { const A = acc.getArray(); for (let i = 0; i < A.length; i += 3) if (A[i + 1] >= +lo && A[i + 1] <= +hi) { x0 = Math.min(x0, A[i]); x1 = Math.max(x1, A[i]); z0 = Math.min(z0, A[i + 2]); z1 = Math.max(z1, A[i + 2]); } }
const cx = (x0 + x1) / 2, cy = (+lo + +hi) / 2, cz = (z0 + z1) / 2;
let top = -Infinity, bot = Infinity;
for (const acc of parts) {
  const A = acc.getArray();
  for (let i = 0; i < A.length; i += 3) {
    const y = A[i + 1], k = y < +to ? +thin : 1;
    const drawn = y > +from ? +from + (Math.min(y, +to) - +from) * +by + Math.max(0, y - +to) : y;
    A[i] = turn * (A[i] - cx) * k * (y > +above ? +wide : 1) * s; A[i + 1] = (drawn - cy) * s + +gripY; A[i + 2] = turn * (A[i + 2] - cz) * k * s;
    top = Math.max(top, A[i + 1]); bot = Math.min(bot, A[i + 1]);
  }
  acc.setArray(A);
}
await io.write(out, doc);
console.log(out, 'axis band', ((x1 - x0) * s).toFixed(4), 'wide; from', bot.toFixed(3), 'to', top.toFixed(3));
