import type { FilmKind, InitiativeType, Nationality } from "@/lib/types";
import { CIRC_CATEGORIES, IND_CATEGORIES } from "@/lib/types";
import { normalize } from "@/lib/utils";

/** Texto limpio o null. */
export const cleanText = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/\s+/g, " ").trim();
  if (!s || /^(n\/a|na|s\/d|sd|-|—|ninguno|null|undefined)$/i.test(s)) return null;
  return s;
};

/** "Q 1,200.50" → 1200.5 ; "1.200,50" → 1200.5 ; "US$ 30 mil" → 30000. */
export function parseNumber(v: unknown): number | null {
  const s = cleanText(v);
  if (!s) return null;
  let t = s.toLowerCase().replace(/(q|gtq|us\$|usd|\$|usd\.)/g, "").trim();
  let mult = 1;
  if (/\bmillones?\b|\bm\b$/.test(t)) {
    mult = 1_000_000;
    t = t.replace(/\bmillones?\b|\bm\b$/, "");
  } else if (/\bmil\b|\bk\b$/.test(t)) {
    mult = 1000;
    t = t.replace(/\bmil\b|\bk\b$/, "");
  }
  t = t.replace(/\s/g, "");
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^\d+,\d+$/.test(t)) t = t.replace(",", ".");
  else t = t.replace(/,/g, "");
  const n = Number(t.replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) && t !== "" ? n * mult : null;
}

export function parseYear(v: unknown): number | null {
  const s = cleanText(v);
  if (!s) return null;
  const m = s.match(/(18|19|20)\d{2}/);
  return m ? Number(m[0]) : null;
}

export function parseCoord(v: unknown, kind: "lat" | "lng"): number | null {
  const n = parseNumber(String(v ?? "").replace(",", "."));
  if (n == null) return null;
  if (kind === "lat" && (n < 10 || n > 20)) return null; // Guatemala: ~13.7 a 17.8
  if (kind === "lng" && (n < -93 || n > -87)) return null; // ~-92.3 a -88.2
  return n;
}

export function detectCurrency(v: unknown): "GTQ" | "USD" | null {
  const s = String(v ?? "").toLowerCase();
  if (/us\$|usd|d[oó]lar/.test(s)) return "USD";
  if (/\bq\b|gtq|quetzal/.test(s) || /^q\s?\d/.test(s)) return "GTQ";
  return null;
}

export function normalizeKind(v: unknown, map?: Record<string, string>): FilmKind | null {
  const s = cleanText(v);
  if (!s) return null;
  const mapped = map?.[s] ?? map?.[normalize(s)];
  const t = normalize(mapped ?? s);
  if (/ficci|largometraje|pelicula|long/.test(t) && !/document/.test(t)) return "ficcion";
  if (/document/.test(t)) return "documental";
  if (/serie|tv|televis|novela/.test(t)) return "serie";
  if (/comercial|publicidad|spot|anuncio|campa/.test(t)) return "comercial";
  if (/corto|short/.test(t)) return "corto";
  if (["ficcion", "documental", "serie", "comercial", "corto", "otro"].includes(t)) return t as FilmKind;
  return "otro";
}

export function normalizeNationality(v: unknown, map?: Record<string, string>): Nationality | null {
  const s = cleanText(v);
  if (!s) return null;
  const t = normalize(map?.[s] ?? s);
  if (/co.?produ|coprod|mixta|co produccion/.test(t)) return "coproduccion";
  if (/guatemal|nacional|local/.test(t)) return "guatemalteca";
  if (/extranj|internacional|foraneo|usa|mexic|europe|espan|estados unidos/.test(t)) return "extranjera";
  if (["guatemalteca", "coproduccion", "extranjera"].includes(t)) return t as Nationality;
  return null;
}

export function normalizeInitiative(v: unknown, map?: Record<string, string>): InitiativeType | null {
  const s = cleanText(v);
  if (!s) return null;
  const t = normalize(map?.[s] ?? s);
  if (/public|estatal|gobierno|municipal|ministerio|universidad nacional|usac/.test(t)) return "publica";
  if (/privad|comercial|empresa/.test(t)) return "privada";
  if (/comunit|colectiv|independ|organizacion social|asociacion|sin fines/.test(t)) return "comunitaria";
  if (/transnacional|internacional|multinacional|cadena/.test(t)) return "transnacional";
  return null;
}

const CATEGORY_SYNONYMS: { layer: "circulacion" | "industria"; re: RegExp; to: string }[] = [
  { layer: "industria", re: /rental|renta|alquiler/, to: "Renta de equipo" },
  { layer: "industria", re: /post ?produccion|postpro/, to: "Postproducción" },
  { layer: "industria", re: /productora|casa productora|casas productoras/, to: "Productoras" },
  { layer: "industria", re: /conservacion|patrimonio|archivo|preservacion/, to: "Conservación y patrimonio" },
  { layer: "industria", re: /streaming|plataforma|medio/, to: "Medios y streaming" },
  { layer: "industria", re: /formacion|escuela|capacitacion/, to: "Formación" },
  { layer: "industria", re: /servicios? audiovisual|catering|fixer|sonido|equipo tecnico/, to: "Servicios audiovisuales" },
  { layer: "circulacion", re: /espacios? de formacion|capacitacion/, to: "Espacios de formación y capacitación" },
  { layer: "circulacion", re: /festival/, to: "Festivales" },
  { layer: "circulacion", re: /cine ?club|cineclub/, to: "Cine clubs" },
  { layer: "circulacion", re: /sala|cadena|multiplex/, to: "Salas de cine comerciales y cadenas" },
  { layer: "circulacion", re: /centro cultural|centros culturales/, to: "Centros culturales" },
  { layer: "circulacion", re: /colectivo|asociacion/, to: "Asociaciones y colectivos de cine" },
  { layer: "circulacion", re: /critica|revista/, to: "Crítica y medios especializados" },
  { layer: "circulacion", re: /podcast/, to: "Podcasts y proyectos digitales" },
  { layer: "circulacion", re: /institucion(es)? publica|instituto|ministerio/, to: "Instituciones públicas de cine" },
  { layer: "circulacion", re: /academic|universidad/, to: "Instituciones académicas" },
];

/** Acerca el texto libre de categoría a la taxonomía. Si no calza, conserva el original. */
export function normalizeCategory(v: unknown, layer: "circulacion" | "industria", map?: Record<string, string>): string | null {
  const s = cleanText(v);
  if (!s) return null;
  const mapped = map?.[s] ?? map?.[normalize(s)] ?? s;
  const list: readonly string[] = layer === "circulacion" ? CIRC_CATEGORIES : IND_CATEGORIES;
  const t = normalize(mapped);
  const exact = list.find((c) => normalize(c) === t);
  if (exact) return exact;
  const syn = CATEGORY_SYNONYMS.find((x) => x.layer === layer && x.re.test(t));
  if (syn) return syn.to;
  const partial = list.find((c) => normalize(c).includes(t) || t.includes(normalize(c)));
  return partial ?? mapped;
}

/** ¿Estas categorías son de Circulación o de Industria? null si no se puede saber. */
export function guessLayer(values: string[]): "circulacion" | "industria" | null {
  let circ = 0;
  let ind = 0;
  for (const v of values) {
    const t = normalize(v);
    if (!t) continue;
    const c = (CIRC_CATEGORIES as readonly string[]).some((x) => normalize(x) === t) || CATEGORY_SYNONYMS.some((x) => x.layer === "circulacion" && x.re.test(t));
    const i = (IND_CATEGORIES as readonly string[]).some((x) => normalize(x) === t) || CATEGORY_SYNONYMS.some((x) => x.layer === "industria" && x.re.test(t));
    if (c && !i) circ++;
    else if (i && !c) ind++;
  }
  if (circ + ind === 0 || circ === ind) return null;
  return circ > ind ? "circulacion" : "industria";
}

export function normalizeInstagram(v: unknown): string | null {
  const s = cleanText(v);
  if (!s) return null;
  const m = s.match(/instagram\.com\/([A-Za-z0-9._]+)/);
  if (m) return `@${m[1]}`;
  return s.startsWith("@") ? s : /^[A-Za-z0-9._]+$/.test(s) ? `@${s}` : s;
}

export function normalizeWeb(v: unknown): string | null {
  const s = cleanText(v);
  if (!s) return null;
  return s.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}
