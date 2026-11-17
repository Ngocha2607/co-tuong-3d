// gild.mjs <in.glb> <out.glb> [sat] [val] — the pale brass the files' weapons come in, made gold: what is of a
// yellow-brown hue in the model's colour texture is drawn to gold's hue, its saturation and brightness scaled
// (default 2.6 and 1.2, the saturation no further than gold's, or it is lemon); the steel, the wood and the cord are left alone. Run before fit-prop.mjs.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import sharp from 'sharp';
const [, , src, out, sat = 2.6, val = 1.2] = process.argv;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS), doc = await io.read(src);
const tex = doc.getRoot().listMaterials()[0].getBaseColorTexture();
const { data, info } = await sharp(Buffer.from(tex.getImage())).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const step = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function hsv(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, mx ? d / mx : 0, mx];
}
function rgb(h, s, v) {
  h = ((h % 360) + 360) % 360 / 60;
  const c = v * s, x = c * (1 - Math.abs(h % 2 - 1)), m = v - c;
  const [r, g, b] = h < 1 ? [c, x, 0] : h < 2 ? [x, c, 0] : h < 3 ? [0, c, x] : h < 4 ? [0, x, c] : h < 5 ? [x, 0, c] : [c, 0, x];
  return [r + m, g + m, b + m];
}
let n = 0;
for (let i = 0; i < data.length; i += 4) {
  const [h, s, v] = hsv(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255);
  // how brassy: of the hues between orange and yellow, coloured a little (not the steel), and not dark (not the wood)
  const w = step(14, 24, h) * (1 - step(62, 75, h)) * step(0.1, 0.16, s) * step(0.22, 0.34, v);
  if (!w) continue;
  n++;
  const [r, g, b] = rgb(43 + (h - 40) * 0.35, Math.min(0.56, s * +sat), Math.min(1, v * +val));
  data[i] += (r * 255 - data[i]) * w; data[i + 1] += (g * 255 - data[i + 1]) * w; data[i + 2] += (b * 255 - data[i + 2]) * w;
}
tex.setImage(await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).webp({ quality: 90 }).toBuffer()).setMimeType('image/webp');
await io.write(out, doc);
console.log(out, 'gilded', (100 * n / (data.length / 4)).toFixed(1) + '% of the picture');
