/**
 * Logo horizontal del Mapa del Cine de Guatemala: la marca (cinta de película y pin) más el nombre escrito en Montserrat.
 *
 *   node scripts/brand-mapa-logo.mjs
 *
 * Parte de la marca que extrae scripts/brand-mapa.mjs (public/brand/mapa-mark-{light,dark}.png) y escribe
 *   public/brand/mapa-logo-{light,dark}.png   marca + «MAPA DEL CINE» (Montserrat Bold) + «DE GUATEMALA» (Montserrat SemiBold)
 * con fondo transparente. Es el único logo del mapa que se usa en la interfaz, en la imagen al compartir y en las descargas,
 * así que todos quedan iguales. Montserrat es libre (SIL OFL 1.1) y viene de @fontsource/montserrat. Si algún día llega la
 * tipografía institucional, cambia FONTS y vuelve a correrlo.
 *
 * Tamaño: el logo mide siempre 3700 x 710 px (el componente MapLogo y la imagen al compartir cuentan con esa proporción).
 * Como cada tipografía tiene anchos distintos, el script mide el texto y ajusta solo el tamaño de «MAPA DEL CINE» para llenar
 * ese ancho, y el espaciado de «DE GUATEMALA» para que mida lo mismo que la línea de arriba.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { ImageResponse } from "next/og.js";

const ROOT = process.cwd();
const BRAND = path.join(ROOT, "public", "brand");
const FONT_DIR = path.join(ROOT, "node_modules", "@fontsource", "montserrat", "files");
const FONTS = { bold: "montserrat-latin-700-normal.woff", semibold: "montserrat-latin-600-normal.woff" };
const FAMILY = "Montserrat";
const PINK = "#e0369a";
const SCALE = 2; // el logo se dibuja al doble para que se vea nítido en pantallas de alta densidad

// Medidas sobre una marca de 657 x 355 px (su tamaño original), multiplicadas por SCALE
const MARK_W = 657 * SCALE;
const MARK_H = 355 * SCALE;
const GAP = 70 * SCALE;
const LOGO_W = 3700; // ancho final del logo
const TEXT_W = LOGO_W - MARK_W - GAP; // ancho que ocupa el nombre
const SUB_RATIO = 0.6; // «DE GUATEMALA» mide el 60 % de «MAPA DEL CINE»
const TITLE_TRACK = -0.01875; // espaciado de «MAPA DEL CINE», en em
const SUB_GAP = 0.0875; // separación entre las dos líneas, en em del título

const el = (type, style, children) => ({ type, props: { style, children } });

async function loadFonts() {
  const [bold, semibold] = await Promise.all([readFile(path.join(FONT_DIR, FONTS.bold)), readFile(path.join(FONT_DIR, FONTS.semibold))]);
  return [
    { name: FAMILY, data: bold, weight: 700, style: "normal" },
    { name: FAMILY, data: semibold, weight: 600, style: "normal" },
  ];
}

/** Ancho real (en px) de una línea de texto, medido dibujándola y recortando lo transparente. */
async function measure(fonts, text, fontSize, fontWeight, letterSpacing) {
  const W = 6000;
  const H = Math.ceil(fontSize * 1.6);
  const tree = el("div", { display: "flex", alignItems: "center", width: W, height: H, fontFamily: FAMILY }, [
    el("div", { fontSize, fontWeight, lineHeight: 1, letterSpacing, color: "#000", whiteSpace: "nowrap" }, text),
  ]);
  const png = Buffer.from(await new ImageResponse(tree, { width: W, height: H, fonts }).arrayBuffer());
  const out = await sharp(png).trim({ threshold: 1 }).toBuffer({ resolveWithObject: true });
  return out.info.width;
}

/** Tamaño de «MAPA DEL CINE» y espaciado de «DE GUATEMALA» para que ambas líneas midan TEXT_W. */
async function fit(fonts) {
  const probe = 200;
  const w = await measure(fonts, "MAPA DEL CINE", probe, 700, probe * TITLE_TRACK);
  const title = Math.round((probe * TEXT_W) / w);
  const titleTrack = title * TITLE_TRACK;
  const sub = Math.round(title * SUB_RATIO);
  const natural = await measure(fonts, "DE GUATEMALA", sub, 600, 0);
  const subTrack = (TEXT_W - natural) / ("DE GUATEMALA".length - 1);
  return { title, titleTrack, sub, subTrack, gap: Math.round(title * SUB_GAP) };
}

async function render(variant, fonts, m) {
  const mark = await readFile(path.join(BRAND, `mapa-mark-${variant}.png`));
  const ink = variant === "dark" ? "#ffffff" : "#111111";
  const W = LOGO_W + 500; // ancho de sobra; luego se recorta al contenido
  const tree = el("div", { display: "flex", alignItems: "center", width: W, height: MARK_H, fontFamily: FAMILY }, [
    {
      type: "img",
      props: { src: `data:image/png;base64,${mark.toString("base64")}`, width: MARK_W, height: MARK_H, style: { marginRight: GAP } },
    },
    el("div", { display: "flex", flexDirection: "column" }, [
      el("div", { fontSize: m.title, fontWeight: 700, lineHeight: 1, letterSpacing: m.titleTrack, color: ink, whiteSpace: "nowrap" }, "MAPA DEL CINE"),
      el("div", { marginTop: m.gap, fontSize: m.sub, fontWeight: 600, lineHeight: 1, letterSpacing: m.subTrack, color: PINK, whiteSpace: "nowrap" }, "DE GUATEMALA"),
    ]),
  ]);
  const res = new ImageResponse(tree, { width: W, height: MARK_H, fonts });
  const png = Buffer.from(await res.arrayBuffer());
  // recorta el espacio transparente sobrante (sin tocar el alto de la marca)
  const out = await sharp(png).trim({ threshold: 1 }).png({ compressionLevel: 9 }).toBuffer({ resolveWithObject: true });
  await writeFile(path.join(BRAND, `mapa-logo-${variant}.png`), out.data);
  console.log(`mapa-logo-${variant}`, out.info.width, "x", out.info.height);
}

const fonts = await loadFonts();
const m = await fit(fonts);
console.log("título", m.title, "px · subtítulo", m.sub, "px, espaciado", m.subTrack.toFixed(1));
for (const v of ["dark", "light"]) await render(v, fonts, m);
console.log("ok");
