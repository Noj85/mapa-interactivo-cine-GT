/**
 * Genera las variantes de los logos para modo claro y oscuro en public/brand/.
 * Fuentes (proyecto VARDA): logo.png (Academia, tinta negra) y procine_logo.png (PROCINE, texto blanco).
 *
 *   node scripts/brand.mjs "<carpeta con logo.png>" "<carpeta con procine_logo.png>"
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = process.cwd();
const ACADEMIA = path.join(process.argv[2] ?? "../VARDA/_assets", "logo.png");
const PROCINE = path.join(process.argv[3] ?? "../VARDA/planteamiento procine/assets", "procine_logo.png");
const OUT = path.join(ROOT, "public", "brand");
mkdirSync(OUT, { recursive: true });

const INK = [15, 23, 42]; // --ink del modo claro

async function raw(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: Buffer.from(data), w: info.width, h: info.height };
}
const png = (img) => sharp(img.data, { raw: { width: img.w, height: img.h, channels: 4 } });

/** Pinta de un solo color todo lo que no sea de color (conserva el alfa). */
function recolorNeutral(img, to, isNeutral) {
  const d = Buffer.from(img.data);
  for (let i = 0; i < d.length; i += 4) {
    const [r, g, b] = [d[i], d[i + 1], d[i + 2]];
    if (isNeutral(r, g, b)) {
      d[i] = to[0];
      d[i + 1] = to[1];
      d[i + 2] = to[2];
    }
  }
  return { ...img, data: d };
}
const sat = (r, g, b) => Math.max(r, g, b) - Math.min(r, g, b);

// Academia: el original es negro con transparencia.
const ac = await raw(ACADEMIA);
// El PNG viene con fondo blanco opaco: la opacidad de cada pixel sale de qué tan oscuro es.
for (let i = 0; i < ac.data.length; i += 4) {
  const lum = (ac.data[i] + ac.data[i + 1] + ac.data[i + 2]) / 3;
  ac.data[i + 3] = Math.min(ac.data[i + 3], Math.round(255 - lum));
}
const acInk = recolorNeutral(ac, INK, () => true);
const acWhite = recolorNeutral(ac, [255, 255, 255], () => true);
await png(acInk).trim().png().toFile(path.join(OUT, "academia-light.png")); // para fondos claros
await png(acWhite).trim().png().toFile(path.join(OUT, "academia-dark.png")); // para fondos oscuros

// Solo el sello (la cinta de película), sin el texto: ~48 % izquierdo.
const cropW = Math.round(ac.w * 0.49);
for (const [img, name] of [[acInk, "light"], [acWhite, "dark"]]) {
  const part = await png(img).extract({ left: 0, top: 0, width: cropW, height: ac.h }).png().toBuffer();
  await sharp(part).trim().png().toFile(path.join(OUT, `academia-mark-${name}.png`));
}

// PROCINE: el original trae el texto en blanco (fondos oscuros); para fondos claros el texto pasa a tinta.
const pr = await raw(PROCINE);
await png(pr).trim().png().toFile(path.join(OUT, "procine-dark.png"));
const prInk = recolorNeutral(pr, INK, (r, g, b) => sat(r, g, b) < 40 && r > 150);
await png(prInk).trim().png().toFile(path.join(OUT, "procine-light.png"));

for (const f of ["academia-light", "academia-dark", "academia-mark-light", "academia-mark-dark", "procine-light", "procine-dark"]) {
  const m = await sharp(path.join(OUT, `${f}.png`)).metadata();
  console.log(f, m.width, "x", m.height);
}
