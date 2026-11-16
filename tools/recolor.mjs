// recolor.mjs <in.glb> <out.webp> <hue> <sat> <val> [preview.png] — the model's colour texture with what is blue
// turned to another hue (degrees), its saturation and brightness scaled; the rest (skin, gold, cloth) is left alone.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import sharp from 'sharp';
const [, , src, out, hue, sat, val, preview] = process.argv;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(src);
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
  // how blue: within the hues of the armour, and coloured at all
  const w = step(180, 200, h) * (1 - step(255, 275, h)) * step(0.12, 0.3, s);
  if (!w) continue;
  n++;
  const [r, g, b] = rgb(+hue + (h - 225) * 0.4, Math.min(1, s * +sat), Math.min(1, v * +val));
  data[i] += (r * 255 - data[i]) * w; data[i + 1] += (g * 255 - data[i + 1]) * w; data[i + 2] += (b * 255 - data[i + 2]) * w;
}
const img = sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } });
await img.clone().webp({ quality: 88 }).toFile(out);
if (preview) await img.clone().png().toFile(preview);
console.log(out, info.width + 'x' + info.height, 'blue pixels', (100 * n / (data.length / 4)).toFixed(1) + '%');
