/**
 * Logo horizontal del Mapa del Cine de Guatemala: la marca (cinta de película y pin) más el nombre escrito en Biennale.
 *
 *   node scripts/brand-mapa-logo.mjs
 *
 * Parte de la marca que extrae scripts/brand-mapa.mjs (public/brand/mapa-mark-{light,dark}.png) y escribe
 *   public/brand/mapa-logo-{light,dark}.png   marca + «MAPA DEL CINE» (Biennale Bold) + «DE GUATEMALA» (Biennale SemiBold)
 * con fondo transparente. Es el único logo del mapa que se usa en la interfaz, en la imagen al compartir y en las descargas,
 * así que todos quedan iguales. Biennale es temporal: cuando llegue la tipografía institucional, cambia FONTS y vuelve a correrlo.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { ImageResponse } from "next/og.js";

const ROOT = process.cwd();
const BRAND = path.join(ROOT, "public", "brand");
const FONT_DIR = path.join(ROOT, "fonts", "biennale");
const PINK = "#e0369a";
const SCALE = 2; // el logo se dibuja al doble para que se vea nítido en pantallas de alta densidad

// Medidas sobre una marca de 657 x 355 px (su tamaño original), multiplicadas por SCALE
const MARK_W = 657 * SCALE;
const MARK_H = 355 * SCALE;
const GAP = 70 * SCALE;
const TITLE = 160 * SCALE; // «MAPA DEL CINE»
const SUB = 96 * SCALE; // «DE GUATEMALA»

const el = (type, style, children) => ({ type, props: { style, children } });

async function render(variant) {
  const [bold, semibold, mark] = await Promise.all([
    readFile(path.join(FONT_DIR, "Biennale Bold.otf")),
    readFile(path.join(FONT_DIR, "Biennale SemiBold.otf")),
    readFile(path.join(BRAND, `mapa-mark-${variant}.png`)),
  ]);
  const ink = variant === "dark" ? "#ffffff" : "#111111";
  const W = 4200 * (SCALE / 2); // ancho de sobra; luego se recorta al contenido
  const tree = el("div", { display: "flex", alignItems: "center", width: W, height: MARK_H, fontFamily: "Biennale" }, [
    {
      type: "img",
      props: { src: `data:image/png;base64,${mark.toString("base64")}`, width: MARK_W, height: MARK_H, style: { marginRight: GAP } },
    },
    el("div", { display: "flex", flexDirection: "column" }, [
      el("div", { fontSize: TITLE, fontWeight: 700, lineHeight: 1, letterSpacing: -3 * SCALE, color: ink, whiteSpace: "nowrap" }, "MAPA DEL CINE"),
      el("div", { marginTop: 28 * SCALE, fontSize: SUB, fontWeight: 600, lineHeight: 1, letterSpacing: 23 * SCALE, color: PINK, whiteSpace: "nowrap" }, "DE GUATEMALA"),
    ]),
  ]);
  const res = new ImageResponse(tree, {
    width: W,
    height: MARK_H,
    fonts: [
      { name: "Biennale", data: bold, weight: 700, style: "normal" },
      { name: "Biennale", data: semibold, weight: 600, style: "normal" },
    ],
  });
  const png = Buffer.from(await res.arrayBuffer());
  // recorta el espacio transparente sobrante (sin tocar el alto de la marca)
  const out = await sharp(png).trim({ threshold: 1 }).png({ compressionLevel: 9 }).toBuffer({ resolveWithObject: true });
  await writeFile(path.join(BRAND, `mapa-logo-${variant}.png`), out.data);
  console.log(`mapa-logo-${variant}`, out.info.width, "x", out.info.height);
}

for (const v of ["dark", "light"]) await render(v);
console.log("ok");
