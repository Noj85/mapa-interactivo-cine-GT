#!/usr/bin/env node
/**
 * Genera data/festivals.seed.json: el catálogo base de festivales del admin.
 *
 * Fuente: «Festival library» del dataset Film Circulation (Zenodo, CC BY 4.0), que une los festivales
 * de IMDb y de una encuesta a festivales. https://zenodo.org/records/7887672
 *
 * Uso:
 *   node scripts/seed-festivals.mjs              # descarga el CSV y genera el JSON
 *   node scripts/seed-festivals.mjs ruta.csv     # usa un CSV ya descargado
 *
 * Limpia el archivo original: arregla acentos dañados, descarta festivales marcados como inexistentes
 * o no identificados, pone mayúsculas de título, traduce países al español y une duplicados.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const URL_CSV = "https://zenodo.org/records/7887672/files/4_festival-library_dataset_imdb-and-survey.csv?download=1";
const OUT = path.join(process.cwd(), "data", "festivals.seed.json");
const SOURCE = "Festival library · Zenodo (CC BY 4.0)";

// ───────── CSV con «;», comillas y BOM ─────────
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ";") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

// ───────── limpieza de texto ─────────
const fixMojibake = (s) => {
  if (!/[ÃÂâ]/.test(s)) return s;
  const fixed = Buffer.from(s, "latin1").toString("utf8");
  return fixed.includes("\uFFFD") ? s : fixed;
};
const na = (s) => {
  const t = (s ?? "").trim();
  if (!t || t.toUpperCase() === "NA") return null;
  const clean = fixMojibake(t).replace(/\s+/g, " ").trim();
  // valores sueltos como «0» o «1» son relleno del archivo original, no datos
  return /\p{L}/u.test(clean) ? clean : null;
};

const SMALL = new Set(["de", "del", "la", "las", "los", "el", "y", "e", "en", "of", "the", "and", "for", "a", "an", "in", "on", "at", "to", "du", "des", "le", "les", "et", "di", "da", "do", "das", "dos", "von", "van", "der", "den", "für", "und", "al", "i"]);
const UPPER = new Set(["lgbt", "lgbtq", "lgbtqia", "lgbtq+", "iff", "ff", "sxsw", "bafici", "bfi", "uk", "usa", "us", "tv", "ii", "iii", "iv", "vi", "vii", "viii", "ix", "xi", "xii", "hd", "3d", "idfa", "dok", "dox", "cph", "cine", "fidmarseille", "fipa", "fid", "uaf", "gff", "iffr", "nyff", "tiff", "bifan", "piff", "fest"]);
const UPPER_ONLY = new Set(["lgbt", "lgbtq", "lgbtqia", "iff", "ff", "sxsw", "bafici", "bfi", "uk", "usa", "us", "tv", "ii", "iii", "iv", "vi", "vii", "viii", "ix", "xi", "xii", "hd", "3d", "idfa", "dok", "cph", "fipa", "iffr", "nyff", "tiff", "bifan", "piff"]);
void UPPER;

function titleCase(s) {
  return s
    .split(" ")
    .map((w, i) => {
      if (!w) return w;
      const lower = w.toLowerCase();
      if (UPPER_ONLY.has(lower)) return lower.toUpperCase();
      if (i > 0 && SMALL.has(lower)) return lower;
      // respeta apóstrofos y guiones: d'angoulême → D'Angoulême, wiz-art → Wiz-Art
      return lower.replace(/(^|[-'’(/])(\p{L})/gu, (_m, p, ch) => p + ch.toUpperCase());
    })
    .join(" ");
}

const normalize = (s) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const slugify = (s) => normalize(s).replace(/\s+/g, "-").slice(0, 80);

// ───────── países en español ─────────
const enNames = new Intl.DisplayNames("en", { type: "region" });
const esNames = new Intl.DisplayNames("es", { type: "region" });
const countryEs = new Map();
for (let a = 65; a <= 90; a++) {
  for (let b = 65; b <= 90; b++) {
    const code = String.fromCharCode(a, b);
    try {
      const en = enNames.of(code);
      if (en && en !== code) countryEs.set(en.toLowerCase(), esNames.of(code));
    } catch {
      /* código inexistente */
    }
  }
}
const COUNTRY_ALIAS = { usa: "Estados Unidos", "united states": "Estados Unidos", uk: "Reino Unido", "united kingdom": "Reino Unido", "south korea": "Corea del Sur", "north macedonia": "Macedonia del Norte", macedonia: "Macedonia del Norte", czechia: "Chequia", "czech republic": "Chequia", russia: "Rusia", "hong kong": "Hong Kong", taiwan: "Taiwán", palestine: "Palestina", kosovo: "Kosovo", "ivory coast": "Costa de Marfil", "cote d'ivoire": "Costa de Marfil", turkey: "Turquía", turkiye: "Turquía" };
const toCountry = (en) => {
  if (!en) return null;
  const k = en.toLowerCase();
  return COUNTRY_ALIAS[k] ?? countryEs.get(k) ?? titleCase(en);
};

// ───────── proceso ─────────
const arg = process.argv[2];
const text = arg ? await readFile(arg, "utf8") : await (await fetch(URL_CSV)).text();
const [head, ...body] = parseCsv(text.replace(/^\uFEFF/, ""));
const col = (name) => head.indexOf(name);
const C = {
  name: col("fest.name"),
  alts: [1, 2, 3, 4, 5, 6].map((n) => col(`fest.name.mixed.alternative.${n}`)),
  country: col("fest.location.country.en.1.standrardized"),
  city: col("fest.location.city.en.1"),
  founded: col("found.year"),
  notExistBin: col("not.exist.bin"),
  notIdent: col("not.ident"),
  notFound: col("not.found"),
};
if (C.name < 0 || C.country < 0) throw new Error("El CSV no tiene las columnas esperadas");

const byKey = new Map();
let skipped = 0;
for (const r of body) {
  if (r[C.notExistBin] === "1" || r[C.notIdent] === "1" || r[C.notFound] === "1") {
    skipped++;
    continue;
  }
  const rawName = na(r[C.name]);
  if (!rawName || rawName.length < 3) continue;
  const name = titleCase(rawName);
  const country = toCountry(na(r[C.country]));
  const cityRaw = na(r[C.city]);
  // algunos festivales listan varias sedes separadas por «;»: se queda la primera
  const city = cityRaw ? titleCase(cityRaw.split(";")[0].trim()) : null;
  const founded = Number(na(r[C.founded]));
  const aliases = C.alts
    .map((i) => (i >= 0 ? na(r[i]) : null))
    .filter(Boolean)
    .map(titleCase);

  const key = `${normalize(name)}|${country ?? ""}`;
  const prev = byKey.get(key);
  if (prev) {
    for (const a of aliases) if (!prev.aliases.includes(a)) prev.aliases.push(a);
    prev.city ??= city;
    prev.founded ??= founded >= 1800 && founded <= 2100 ? founded : null;
    continue;
  }
  byKey.set(key, { name, aliases, country, city, founded: founded >= 1800 && founded <= 2100 ? founded : null });
}

const used = new Set();
const out = [...byKey.values()]
  .sort((a, b) => a.name.localeCompare(b.name, "es"))
  .map((f) => {
    let slug = slugify(f.name);
    if (used.has(slug) && f.country) slug = slugify(`${f.name} ${f.country}`);
    let n = 2;
    const root = slug;
    while (used.has(slug)) slug = `${root}-${n++}`;
    used.add(slug);
    const own = normalize(f.name);
    const aliases = [...new Set(f.aliases.filter((a) => normalize(a) !== own))].slice(0, 6);
    return { slug, name: f.name, aliases, country: f.country, city: f.city, founded: f.founded, source: SOURCE };
  });

await mkdir(path.dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(out));
console.log(`✓ ${out.length} festivales → data/festivals.seed.json (${skipped} descartados por no existir o no identificarse)`);
