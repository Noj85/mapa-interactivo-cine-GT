import { normalize, upperTitle } from "@/lib/utils";

/**
 * Cómo se describe una producción:
 *  - Formato (uno): largometraje, cortometraje, serie, video musical…
 *  - Naturaleza (una, opcional): ficción, documental o híbrido.
 *  - Géneros (varios): lista estándar de festivales más géneros propios escritos a mano.
 */

export type FilmFormat =
  | "largometraje"
  | "mediometraje"
  | "cortometraje"
  | "serie"
  | "miniserie"
  | "video_musical"
  | "publicidad"
  | "programa_tv"
  | "web"
  | "videoarte"
  | "otro";

export type FilmNature = "ficcion" | "documental" | "hibrido";

export const FORMATS: { id: FilmFormat; label: string }[] = [
  { id: "largometraje", label: "Largometraje" },
  { id: "mediometraje", label: "Mediometraje" },
  { id: "cortometraje", label: "Cortometraje" },
  { id: "serie", label: "Serie" },
  { id: "miniserie", label: "Miniserie" },
  { id: "video_musical", label: "Video musical" },
  { id: "publicidad", label: "Publicidad / comercial" },
  { id: "programa_tv", label: "Programa de TV" },
  { id: "web", label: "Contenido web / digital" },
  { id: "videoarte", label: "Videoarte" },
  { id: "otro", label: "Otro" },
];

export const NATURES: { id: FilmNature; label: string }[] = [
  { id: "ficcion", label: "Ficción" },
  { id: "documental", label: "Documental" },
  { id: "hibrido", label: "Híbrido" },
];

/** Géneros estándar (los de festivales grandes). Se guardan por su nombre. */
export const GENRES: string[] = [
  "Acción",
  "Aventura",
  "Animación",
  "Biográfico",
  "Ciencia ficción",
  "Comedia",
  "Crimen",
  "Drama",
  "Experimental",
  "Familiar",
  "Fantasía",
  "Guerra",
  "Histórico",
  "Misterio",
  "Musical",
  "Noir",
  "Romance",
  "Suspenso / thriller",
  "Terror",
  "Western",
  "Deportes",
  "Música",
  "Coming of age",
  "Road movie",
];

export const MAX_GENRES = 8;
export const MAX_GENRE_LENGTH = 40;

const FORMAT_IDS = new Set<string>(FORMATS.map((f) => f.id));
const NATURE_IDS = new Set<string>(NATURES.map((n) => n.id));
export const isFormat = (v: unknown): v is FilmFormat => typeof v === "string" && FORMAT_IDS.has(v);
export const isNature = (v: unknown): v is FilmNature => typeof v === "string" && NATURE_IDS.has(v);

export const formatLabel = (f: string | null | undefined) => FORMATS.find((x) => x.id === f)?.label ?? "";
export const natureLabel = (n: string | null | undefined) => NATURES.find((x) => x.id === n)?.label ?? "";

/** «Largometraje documental», «Cortometraje de ficción», «Serie», «Documental»… */
export function filmTypeLabel(f: { format?: string | null; nature?: string | null }): string {
  const fmt = formatLabel(f.format);
  const nat = f.nature;
  if (!fmt) return natureLabel(nat);
  if (nat === "ficcion") return `${fmt} de ficción`;
  if (nat === "documental") return `${fmt} documental`;
  if (nat === "hibrido") return `${fmt} híbrido`;
  return fmt;
}

// ───────────────────────── lectura de texto libre ─────────────────────────

/** Formato que describe un texto («Largometraje documental» → largometraje); null si no lo reconoce. */
export function parseFormat(text: unknown): FilmFormat | null {
  const t = normalize(String(text ?? ""));
  if (!t) return null;
  if (FORMAT_IDS.has(t.replace(/ /g, "_"))) return t.replace(/ /g, "_") as FilmFormat;
  if (/\b(corto|cortos|cortometraje|short)/.test(t)) return "cortometraje";
  if (/medio ?metraje|mediometraje|medium length/.test(t)) return "mediometraje";
  if (/mini ?serie|limited series/.test(t)) return "miniserie";
  if (/video ?musical|video ?clip|music video|clip musical/.test(t)) return "video_musical";
  if (/\b(serie|series|telenovela|novela|tv series)\b/.test(t)) return "serie";
  if (/publicidad|comercial|\bspot\b|anuncio|campana|advert/.test(t)) return "publicidad";
  if (/programa (de )?(tv|television)|programa televis|tv show|televisi/.test(t)) return "programa_tv";
  if (/contenido (web|digital)|web ?serie|\bweb\b|\bonline\b|\bdigital\b/.test(t)) return "web";
  if (/video ?arte|instalacion/.test(t)) return "videoarte";
  if (/largo|feature|long ?metr|\bpelicula\b|\bfilm\b|\bmovie\b/.test(t)) return "largometraje";
  if (t === "otro" || t === "otros" || t === "other") return "otro";
  return null;
}

/** Naturaleza que describe un texto; null si no la reconoce. */
export function parseNature(text: unknown): FilmNature | null {
  const t = normalize(String(text ?? ""));
  if (!t) return null;
  if (/hibrid|hybrid|mixt|docu ?ficcion|ficcion documental/.test(t)) return "hibrido";
  if (/document/.test(t)) return "documental";
  if (/ficci|fiction|dramatizad/.test(t)) return "ficcion";
  return null;
}

/** Texto normalizado -> género(s) estándar. */
const GENRE_SYNONYMS: Record<string, string[]> = (() => {
  const m: Record<string, string[]> = {};
  const add = (labels: string[], ...keys: string[]) => keys.forEach((k) => (m[normalize(k)] = labels));
  add(["Acción"], "acción", "accion", "action");
  add(["Aventura"], "aventura", "aventuras", "adventure");
  add(["Animación"], "animación", "animacion", "animation", "animated", "animada");
  add(["Biográfico"], "biográfico", "biografico", "biografía", "biografia", "biopic", "biography", "biográfica");
  add(["Ciencia ficción"], "ciencia ficción", "ciencia ficcion", "sci-fi", "sci fi", "scifi", "science fiction", "cifi", "cf");
  add(["Comedia"], "comedia", "comedy", "humor", "comico", "cómico");
  add(["Comedia", "Drama"], "comedia dramática", "comedia dramatica", "dramedy", "comedy drama", "comedia-drama");
  add(["Crimen"], "crimen", "crime", "policiaco", "policíaco", "policial", "criminal", "gangsters");
  add(["Drama"], "drama", "dramático", "dramatico");
  add(["Experimental"], "experimental", "experimento");
  add(["Familiar"], "familiar", "family", "infantil", "niños", "ninos", "kids", "children");
  add(["Fantasía"], "fantasía", "fantasia", "fantasy", "fantástico", "fantastico");
  add(["Guerra"], "guerra", "war", "bélico", "belico", "bélica");
  add(["Histórico"], "histórico", "historico", "historia", "history", "historical", "period", "de época", "de epoca");
  add(["Misterio"], "misterio", "mystery");
  add(["Musical"], "musical");
  add(["Noir"], "noir", "cine negro", "film noir");
  add(["Romance"], "romance", "romántico", "romantico", "romantic", "love story", "historia de amor");
  add(["Suspenso / thriller"], "suspenso", "suspense", "thriller", "suspenso / thriller", "thriller psicológico", "thriller psicologico", "intriga");
  add(["Terror"], "terror", "horror", "miedo", "slasher");
  add(["Western"], "western", "oeste", "spaghetti western");
  add(["Deportes"], "deportes", "deporte", "sport", "sports", "deportivo");
  add(["Música"], "música", "musica", "music");
  add(["Coming of age"], "coming of age", "coming-of-age", "iniciático", "iniciatico", "bildungsroman");
  add(["Road movie"], "road movie", "road trip", "road", "película de carretera");
  return m;
})();

const NATURE_WORDS = new Set(["ficcion", "fiction", "documental", "documentary", "hibrido", "hybrid"]);

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** Un texto -> géneros estándar si lo es; si no, el género propio tal como se escribió (limpio). */
export function canonicalGenre(raw: unknown): string[] {
  const text = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!text) return [];
  const hit = GENRE_SYNONYMS[normalize(text)];
  if (hit) return hit;
  return [cap(text.slice(0, MAX_GENRE_LENGTH).trim())];
}

/** Lista de géneros limpia: estándar o propios, sin repetidos (sin acentos ni mayúsculas) y con el máximo permitido. */
export function cleanGenres(list: unknown): string[] {
  const items = Array.isArray(list) ? list : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of items) {
    for (const g of canonicalGenre(raw)) {
      const k = normalize(g);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      out.push(g);
    }
  }
  return out.slice(0, MAX_GENRES);
}

/** Separa un texto de géneros («Drama; Comedia / Terror»). */
export const splitGenreText = (text: string) => text.split(/[;,/|\n]+/).map((x) => x.trim()).filter(Boolean);

/**
 * Celda de géneros -> géneros, más formato o naturaleza si la celda los trae (por ejemplo «Documental, Drama»):
 * eso no es un género, es la naturaleza.
 */
export function parseGenreCell(text: unknown, map?: Record<string, string>): { genres: string[]; nature: FilmNature | null; format: FilmFormat | null } {
  const tokens = splitGenreText(String(text ?? ""));
  const genres: string[] = [];
  let nature: FilmNature | null = null;
  let format: FilmFormat | null = null;
  for (const raw of tokens) {
    const mapped = map?.[raw] ?? map?.[normalize(raw)] ?? raw;
    const n = normalize(mapped);
    if (!GENRE_SYNONYMS[n] && NATURE_WORDS.has(n)) {
      nature = nature ?? parseNature(mapped);
      continue;
    }
    if (!GENRE_SYNONYMS[n]) {
      const f = parseFormat(mapped);
      if (f && f !== "otro" && /\b(corto|cortometraje|largometraje|serie|miniserie|mediometraje)\b/.test(n)) {
        format = format ?? f;
        continue;
      }
    }
    // una equivalencia puede traer varios géneros separados por «;»
    genres.push(...splitGenreText(mapped));
  }
  return { genres: cleanGenres(genres), nature, format };
}

/** Valor antiguo del campo «Tipo» -> formato y naturaleza. */
export function legacyKind(kind: string | null | undefined): { format: FilmFormat | null; nature: FilmNature | null } {
  switch (kind) {
    case "ficcion":
      return { format: null, nature: "ficcion" };
    case "documental":
      return { format: null, nature: "documental" };
    case "corto":
      return { format: "cortometraje", nature: null };
    case "serie":
      return { format: "serie", nature: null };
    case "comercial":
      return { format: "publicidad", nature: null };
    default:
      return { format: null, nature: null };
  }
}

// ───────────────────────── opciones para filtros ─────────────────────────

const STANDARD_GENRE_KEYS = new Set(GENRES.map((g) => normalize(g)));
export const isStandardGenre = (g: string) => STANDARD_GENRE_KEYS.has(normalize(g));

/** Géneros propios que hay en los datos (los que no son de la lista estándar), de la A a la Z. */
export function customGenres(films: { genres?: string[] }[]): string[] {
  const out = new Map<string, string>();
  for (const f of films) for (const g of f.genres ?? []) if (!isStandardGenre(g) && !out.has(normalize(g))) out.set(normalize(g), g);
  return [...out.values()].sort((a, b) => a.localeCompare(b, "es"));
}

/** Opciones de un filtro de género: los estándar y, aparte bajo «Otros», los propios que existen. */
export function genreOptions(custom: string[]): { value: string; label: string; group?: string }[] {
  return [
    ...GENRES.map((g) => ({ value: g, label: g })),
    ...custom.map((g) => ({ value: g, label: g, group: "Otros" })),
  ];
}

/**
 * Aportes guardados antes de cambios anteriores: «kind» se convierte a formato y naturaleza,
 * y el título se lleva a mayúsculas (así se ve igual al revisarlo que cuando se publique).
 */
export function upgradeFilmPayload<T extends object>(payload: T): T {
  let p = payload as { kind?: string | null; format?: unknown; nature?: unknown; title?: unknown };
  if ("kind" in p && p.format === undefined && p.nature === undefined) {
    const { kind, ...rest } = p;
    p = { ...rest, ...legacyKind(kind) };
  }
  if (typeof p.title === "string" && p.title !== upperTitle(p.title)) p = { ...p, title: upperTitle(p.title) };
  return p as T;
}

/** Duración máxima aceptada, en minutos (incluye series largas). */
export const MAX_DURATION_MIN = 2000;

/** Duración en minutos como entero de 1 a 2000; cualquier otra cosa queda vacía. */
export function cleanMinutes(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", ".").replace(/[^0-9.\-]/g, ""));
  if (!Number.isFinite(n)) return null;
  const m = Math.round(n);
  return m >= 1 && m <= MAX_DURATION_MIN ? m : null;
}

/** «95 min» para mostrar; vacío si no hay duración. */
export const durationLabel = (m: number | null | undefined) => (m ? `${m} min` : "");
