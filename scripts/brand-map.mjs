/**
 * Genera la identidad visual del mapa (logo, favicon, iconos) a partir de la paleta de PROCINE:
 * magenta #db27bb, cian #00baed y amarillo #ffcc00. El logo es un marcador de mapa cuya cabeza lleva la estrella de PROCINE
 * recortada, entre el triángulo «play» (cian) y el abanico de luz (amarillo) del logotipo original.
 *
 *   node scripts/brand-map.mjs
 *
 * Escribe: public/brand/mapa-mark.svg y mapa-pin.svg, app/icon.svg, app/favicon.ico, app/apple-icon.png,
 * public/icon-192.png y public/icon-512.png. La imagen para compartir es app/opengraph-image.tsx (usa mapa-mark.svg).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = process.cwd();
const NAVY = "#12274d"; // --brand del modo claro
const C = { magenta: "#db27bb", violet: "#8a53c2", orange: "#ff9a3d", cyan: "#00baed", yellow: "#ffcc00" };

const defs = (id) => `
  <linearGradient id="g${id}" x1="46" y1="14" x2="116" y2="112" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="${C.violet}"/>
    <stop offset="0.35" stop-color="${C.magenta}"/>
    <stop offset="1" stop-color="${C.orange}"/>
  </linearGradient>
  <mask id="m${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="160" height="120">
    <rect width="160" height="120" fill="#fff"/>
    <g transform="translate(80 52)" stroke="#000" stroke-width="9" stroke-linecap="round" fill="none">
      <path d="M0 -21V21"/>
      <path d="M0 -21V21" transform="rotate(58)"/>
      <path d="M0 -21V21" transform="rotate(-58)"/>
    </g>
  </mask>`;

// marcador: cabeza circular de 34 de radio con la punta abajo
const PIN = "M80 115C61 95 46 75 46 52a34 34 0 0 1 68 0c0 23-15 43-34 63Z";

const pinOnly = (id) => `<path d="${PIN}" fill="url(#g${id})" mask="url(#m${id})"/>`;

const satellites = `
  <path d="M8 37 L34 52 L8 67Z" fill="${C.cyan}" stroke="${C.cyan}" stroke-width="6" stroke-linejoin="round"/>
  <g stroke="${C.yellow}" stroke-width="6.5" stroke-linecap="round" fill="none">
    <path d="M126 52H154"/>
    <path d="M124 41L150 33"/>
    <path d="M124 63L150 71"/>
  </g>`;

const markSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 120" width="160" height="120" role="img" aria-label="Mapa del Cine de Guatemala"><defs>${defs("a")}</defs>${satellites}${pinOnly("a")}</svg>\n`;
const pinSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="40 14 80 106" width="80" height="106" role="img" aria-label="Mapa del Cine de Guatemala"><defs>${defs("b")}</defs>${pinOnly("b")}</svg>\n`;

// icono cuadrado: marcador grande sobre el azul institucional
const iconSvg = (radius) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
  <defs>${defs("c")}</defs>
  <rect width="128" height="128" rx="${radius}" fill="${NAVY}"/>
  <g transform="translate(-8 4.2) scale(0.9)">${pinOnly("c")}</g>
</svg>\n`;

mkdirSync(path.join(ROOT, "public", "brand"), { recursive: true });
writeFileSync(path.join(ROOT, "public", "brand", "mapa-mark.svg"), markSvg);
writeFileSync(path.join(ROOT, "public", "brand", "mapa-pin.svg"), pinSvg);
writeFileSync(path.join(ROOT, "app", "icon.svg"), iconSvg(28));

const png = (svg, size) => sharp(Buffer.from(svg), { density: 384 }).resize(size, size).png().toBuffer();

// iOS y Android recortan ellos mismos las esquinas: el fondo va a sangre
const squareFull = iconSvg(0);
await sharp(await png(squareFull, 180)).toFile(path.join(ROOT, "app", "apple-icon.png"));
await sharp(await png(squareFull, 192)).toFile(path.join(ROOT, "public", "icon-192.png"));
await sharp(await png(squareFull, 512)).toFile(path.join(ROOT, "public", "icon-512.png"));

// favicon.ico (PNG de 16, 32 y 48 dentro del contenedor ICO)
const sizes = [16, 32, 48];
const imgs = await Promise.all(sizes.map((s) => png(iconSvg(Math.round(s * 0.22 * (128 / s))), s)));
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
