/**
 * Logo del Mapa del Cine de Guatemala: extrae las versiones de la lámina de identidad y genera los íconos.
 *
 * Fuente: brand-source/mapa-identidad.pdf (una lámina raster con el logo en blanco sobre negro y en negro sobre claro).
 * El script trabaja sobre la imagen que lleva dentro, brand-source/mapa-identidad.jpg (2640 x 1680), que se extrajo con
 *   pdfimages -all brand-source/mapa-identidad.pdf brand-source/img   (poppler)
 * Se usa la versión grande (blanco sobre negro) porque tiene mucha más resolución que la pequeña, y de ella se obtienen
 * las dos: se separa el fondo (#121212) de la tinta, de modo que el logo queda con transparencia real. El pin conserva
 * su degradado magenta a violeta; lo blanco pasa a blanco (para fondo oscuro) o a casi negro (para fondo claro).
 *
 *   node scripts/brand-mapa.mjs
 *
 * Escribe:
 *   public/brand/mapa-logo-{light,dark}.png   logo horizontal (marca + «MAPA DEL CINE DE GUATEMALA»)
 *   public/brand/mapa-mark-{light,dark}.png   solo la marca (cinta de película + pin)
 *   app/icon.png, app/favicon.ico, app/apple-icon.png, public/icon-192.png, public/icon-512.png   íconos sobre azul institucional
 * «light» es para fondo claro y «dark» para fondo oscuro, igual que los logos de la Academia y PROCINE.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "brand-source", "mapa-identidad.jpg");
const OUT = path.join(ROOT, "public", "brand");
const NAVY = { r: 18, g: 39, b: 77 }; // --brand de la interfaz
const INK = 17; // negro de la versión para fondo claro
const BG = 18; // fondo de la lámina oscura
mkdirSync(OUT, { recursive: true });

const { data, info } = await sharp(SRC).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width;
const H = info.height;
const at = (x, y) => (y * W + x) * 3;

// panel oscuro: hasta donde empieza el fondo claro
let split = W;
for (let x = 0; x < W; x++) if (data[at(x, 5)] > 150) { split = x; break; }
split -= 4;

const inkAt = (x, y) => Math.max(data[at(x, y)], data[at(x, y) + 1], data[at(x, y) + 2]) > 60;
const box = { x0: split, x1: 0, y0: H, y1: 0 };
for (let y = 0; y < H; y++) for (let x = 0; x < split; x++) if (inkAt(x, y)) { box.x0 = Math.min(box.x0, x); box.x1 = Math.max(box.x1, x); box.y0 = Math.min(box.y0, y); box.y1 = Math.max(box.y1, y); }

// la marca termina en el primer hueco vertical largo (entre la cinta y la tipografía)
let markEnd = box.x0;
for (let x = box.x0, gap = 0; x <= box.x1; x++) {
  let any = false;
  for (let y = box.y0; y <= box.y1; y++) if (inkAt(x, y)) { any = true; break; }
  if (any) { markEnd = x; gap = 0; } else if (++gap > 40) break;
}
const MARK = { x0: box.x0, x1: markEnd, y0: box.y0, y1: box.y1 };
console.log("logo", box, "marca", MARK);

/** Separa tinta y fondo de una región. Devuelve RGBA para fondo oscuro y para fondo claro. */
function extract(r) {
  const pad = 8;
  const x0 = r.x0 - pad, y0 = r.y0 - pad;
  const w = r.x1 - r.x0 + 1 + pad * 2, h = r.y1 - r.y0 + 1 + pad * 2;
  const mx = new Float32Array(w * h), sat = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = at(x0 + x, y0 + y);
    const R = data[i], G = data[i + 1], B = data[i + 2];
    const max = Math.max(R, G, B), min = Math.min(R, G, B);
    mx[y * w + x] = max;
    sat[y * w + x] = max > 0 ? (max - min) / max : 0;
  }
  // brillo de referencia de lo coloreado (pin y subtítulo): máximo en un entorno de 4 px entre píxeles bien saturados
  const strong = (k) => sat[k] > 0.4 && mx[k] > 70;
  const ref = new Float32Array(w * h);
  const R = 4;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let m = 0;
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      const k = yy * w + xx;
      if (strong(k) && mx[k] > m) m = mx[k];
    }
    ref[y * w + x] = m;
  }
  const dark = Buffer.alloc(w * h * 4), light = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const k = y * w + x, i = at(x0 + x, y0 + y), o = k * 4;
    const P = [data[i], data[i + 1], data[i + 2]];
    const colored = sat[k] > 0.3 && mx[k] >= 30 && ref[k] > 0;
    let a, c;
    if (colored) {
      // 0.88: el interior del pin (con ruido de JPEG y degradado) queda opaco; solo los bordes quedan parciales
      a = Math.min(1, Math.max(0, (mx[k] - BG) / (ref[k] * 0.88 - BG)));
      c = P.map((v) => Math.min(255, Math.max(0, Math.round((v - BG * (1 - a)) / Math.max(a, 0.05)))));
    } else {
      a = Math.min(1, Math.max(0, ((P[0] + P[1] + P[2]) / 3 - BG) / (255 - BG)));
      c = null;
    }
    if (a < 0.04) a = 0;
    else if (a > 0.97) a = 1;
    const A = Math.round(a * 255);
    const d = c ?? [255, 255, 255];
    const l = c ?? [INK, INK, INK];
    dark.set([d[0], d[1], d[2], A], o);
    light.set([l[0], l[1], l[2], A], o);
  }
  return { dark: { data: dark, w, h }, light: { data: light, w, h } };
}

const toPng = (img) => sharp(img.data, { raw: { width: img.w, height: img.h, channels: 4 } }).trim({ threshold: 1 }).png({ compressionLevel: 9 });

const logo = extract(box);
const mark = extract(MARK);
for (const v of ["dark", "light"]) {
  await toPng(logo[v]).toFile(path.join(OUT, `mapa-logo-${v}.png`));
  await toPng(mark[v]).toFile(path.join(OUT, `mapa-mark-${v}.png`));
  for (const n of ["logo", "mark"]) {
    const m = await sharp(path.join(OUT, `mapa-${n}-${v}.png`)).metadata();
    console.log(`mapa-${n}-${v}`, m.width, "x", m.height);
  }
}

// Íconos: la marca (versión para fondo oscuro) centrada sobre el azul institucional.
const markPng = await sharp(path.join(OUT, "mapa-mark-dark.png")).toBuffer();
async function icon(size, { radius = 0, fill = 0.8 } = {}) {
  const mw = Math.round(size * fill);
  const m = await sharp(markPng).resize({ width: mw, kernel: "lanczos3" }).toBuffer();
  const mh = (await sharp(m).metadata()).height;
  const bg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${Math.round(size * radius)}" fill="rgb(${NAVY.r},${NAVY.g},${NAVY.b})"/></svg>`,
  );
  return sharp(bg)
    .composite([{ input: m, left: Math.round((size - mw) / 2), top: Math.round((size - mh) / 2) }])
    .png()
    .toBuffer();
}

// iOS y Android recortan ellos mismos las esquinas: el fondo va a sangre
await sharp(await icon(180)).toFile(path.join(ROOT, "app", "apple-icon.png"));
await sharp(await icon(192)).toFile(path.join(ROOT, "public", "icon-192.png"));
await sharp(await icon(512)).toFile(path.join(ROOT, "public", "icon-512.png"));
await sharp(await icon(256, { radius: 0.2 })).toFile(path.join(ROOT, "app", "icon.png"));

// favicon.ico (PNG de 16, 32 y 48 dentro del contenedor ICO), con la marca más grande para que se lea pequeña
const sizes = [16, 32, 48];
const imgs = await Promise.all(sizes.map((s) => icon(s, { radius: 0.2, fill: 0.9 })));
const head = Buffer.alloc(6);
head.writeUInt16LE(1, 2);
head.writeUInt16LE(sizes.length, 4);
let offset = 6 + 16 * sizes.length;
const dir = Buffer.concat(
  imgs.map((b, i) => {
    const e = Buffer.alloc(16);
    e[0] = sizes[i];
    e[1] = sizes[i];
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(b.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += b.length;
    return e;
  }),
);
writeFileSync(path.join(ROOT, "app", "favicon.ico"), Buffer.concat([head, dir, ...imgs]));

console.log("ok");
