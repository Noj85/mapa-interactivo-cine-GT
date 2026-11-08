import type { FilmCrewMember } from "@/lib/types";
import { normalize } from "@/lib/utils";

/**
 * Equipo de una producción: lista de { role, name, detail }, con varias personas por rol.
 *
 * Cuatro roles son «base» y tienen su propio campo en los formularios (y su fila en la ficha):
 * dirección, producción, fotografía y guion. Su texto vive como siempre en `director`, `producer`,
 * `cinematographer` y `screenwriter`, pero se guarda dentro de `crew` y de ahí se vuelve a leer.
 * Todos los demás roles son «extra» y se editan en la sección «Más equipo y reparto».
 *
 * Para agregar un rol nuevo basta con sumarlo a `CREW_ROLES`: no hace falta migración.
 */

export type CrewGroupId = "direccion" | "guion" | "imagen" | "sonido" | "edicion" | "reparto" | "otro";

export const CREW_GROUPS: { id: CrewGroupId; label: string }[] = [
  { id: "direccion", label: "Dirección y producción" },
  { id: "guion", label: "Guion" },
  { id: "imagen", label: "Imagen y arte" },
  { id: "sonido", label: "Sonido y música" },
  { id: "edicion", label: "Edición y postproducción" },
  { id: "reparto", label: "Reparto" },
  { id: "otro", label: "Otro" },
];

export interface CrewRoleDef {
  id: string;
  /** Cómo se llama el rol («Edición / montaje»). */
  label: string;
  group: CrewGroupId;
  /** Se muestra primero en el selector de roles. */
  popular?: boolean;
  /** Encabezados de columna que la carga de archivos reconoce (ya normalizados). */
  aliases?: string[];
}

/** Roles base: tienen campo propio. El texto de cada uno se guarda en la columna clásica del mismo nombre. */
export const CORE_ROLES = ["direccion", "produccion", "fotografia", "guion"] as const;
export type CoreRole = (typeof CORE_ROLES)[number];
export const CORE_FIELD: Record<CoreRole, "director" | "producer" | "cinematographer" | "screenwriter"> = {
  direccion: "director",
  produccion: "producer",
  fotografia: "cinematographer",
  guion: "screenwriter",
};

export const CREW_ROLES: CrewRoleDef[] = [
  // dirección y producción
  { id: "direccion", label: "Director/a", group: "direccion" },
  { id: "produccion", label: "Productor/a", group: "direccion" },
  { id: "produccion_ejecutiva", label: "Producción ejecutiva", group: "direccion", aliases: ["productor ejecutivo", "productora ejecutiva", "produccion ejecutiva", "productores ejecutivos", "executive producer", "executive producers"] },
  { id: "direccion_produccion", label: "Dirección de producción", group: "direccion", aliases: ["director de produccion", "directora de produccion", "direccion de produccion", "jefe de produccion", "jefa de produccion", "production manager"] },
  { id: "asistencia_direccion", label: "Asistencia de dirección", group: "direccion", aliases: ["asistente de direccion", "asistencia de direccion", "primer asistente de direccion", "assistant director", "1st ad"] },
  { id: "casting", label: "Casting", group: "direccion", aliases: ["casting", "direccion de casting", "director de casting", "casting director"] },
  // guion
  { id: "guion", label: "Guionista", group: "guion" },
  { id: "argumento", label: "Argumento / historia original", group: "guion", aliases: ["historia original", "story", "idea original", "argumento original"] },
  { id: "adaptacion", label: "Adaptación", group: "guion", aliases: ["adaptacion", "adaptado por", "adaptation"] },
  // imagen y arte
  { id: "fotografia", label: "Dirección de fotografía", group: "imagen" },
  { id: "camara", label: "Cámara", group: "imagen", aliases: ["camara", "camarografo", "camarografa", "operador de camara", "operadora de camara", "camera", "camera operator"] },
  { id: "iluminacion", label: "Iluminación", group: "imagen", aliases: ["iluminacion", "gaffer", "jefe de luces", "jefa de luces", "lighting"] },
  { id: "direccion_arte", label: "Dirección de arte", group: "imagen", popular: true, aliases: ["direccion de arte", "director de arte", "directora de arte", "diseno de produccion", "production design", "production designer", "art director"] },
  { id: "vestuario", label: "Vestuario", group: "imagen", aliases: ["vestuario", "diseno de vestuario", "vestuarista", "costume", "costume design"] },
  { id: "maquillaje", label: "Maquillaje y caracterización", group: "imagen", aliases: ["maquillaje", "caracterizacion", "maquillista", "makeup", "make up"] },
  // sonido y música
  { id: "sonido", label: "Sonido directo", group: "sonido", popular: true, aliases: ["sonido", "sonido directo", "sonidista", "ingeniero de sonido", "ingeniera de sonido", "sound", "production sound", "sound recordist"] },
  { id: "diseno_sonoro", label: "Diseño sonoro", group: "sonido", popular: true, aliases: ["diseno sonoro", "diseno de sonido", "disenador de sonido", "sound design", "sound designer", "post sonido", "postproduccion de sonido"] },
  { id: "mezcla_sonido", label: "Mezcla de sonido", group: "sonido", aliases: ["mezcla", "mezcla de sonido", "mezcla sonora", "mezclador", "mix", "sound mix", "re recording mixer"] },
  { id: "musica_original", label: "Música original", group: "sonido", popular: true, aliases: ["musica", "musica original", "compositor", "compositora", "composicion musical", "banda sonora", "banda sonora original", "score", "music", "original music", "composer"] },
  { id: "supervision_musical", label: "Supervisión musical", group: "sonido", aliases: ["supervision musical", "supervisor musical", "musica adicional", "music supervisor"] },
  // edición y postproducción
  { id: "edicion", label: "Edición / montaje", group: "edicion", popular: true, aliases: ["edicion", "editor", "editora", "editores", "montaje", "montajista", "montador", "montadora", "edicion y montaje", "editing", "editor s", "edited by", "film editor"] },
  { id: "colorizacion", label: "Colorización", group: "edicion", aliases: ["colorizacion", "colorista", "correccion de color", "etalonaje", "color grading", "colorist"] },
  { id: "efectos_visuales", label: "Efectos visuales", group: "edicion", aliases: ["efectos visuales", "vfx", "visual effects", "efectos especiales", "postproduccion visual"] },
  { id: "animacion", label: "Animación", group: "edicion", aliases: ["animacion", "animador", "animadora", "animacion y motion", "motion graphics", "animation", "animator"] },
  // reparto
  { id: "reparto", label: "Reparto", group: "reparto", popular: true, aliases: ["reparto", "reparto principal", "elenco", "actores", "actrices", "actores y actrices", "actor", "actriz", "protagonistas", "cast", "starring", "interpretes"] },
  // otro
  { id: "otro", label: "Otro rol", group: "otro" },
];

const ROLE_BY_ID = new Map(CREW_ROLES.map((r) => [r.id, r]));
export const isCrewRole = (id: unknown): id is string => typeof id === "string" && ROLE_BY_ID.has(id);
export const isCoreRole = (id: unknown): id is CoreRole => (CORE_ROLES as readonly string[]).includes(id as string);
export const roleLabel = (id: string) => ROLE_BY_ID.get(id)?.label ?? id;
export const roleGroup = (id: string): CrewGroupId => ROLE_BY_ID.get(id)?.group ?? "otro";

/** Roles que se pueden agregar en «Más equipo y reparto» (todos menos los cuatro base). */
export const EXTRA_ROLES = CREW_ROLES.filter((r) => !isCoreRole(r.id));

/** Rol del reparto: su `detail` es el personaje. */
export const CAST_ROLE = "reparto";
/** Rol libre: su `detail` es el nombre del rol. */
export const OTHER_ROLE = "otro";

export const MAX_CREW = 60;
export const MAX_CAST = 30;
export const MAX_CREW_TEXT = 300;

// ───────────────────────── limpieza ─────────────────────────

const text = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/** Lista de equipo limpia: roles válidos, nombres con texto, sin repetir a la misma persona en el mismo rol. */
export function cleanCrew(list: unknown): FilmCrewMember[] {
  const items = Array.isArray(list) ? list : [];
  const out: FilmCrewMember[] = [];
  const seen = new Set<string>();
  let cast = 0;
  for (const raw of items) {
    const r = (raw ?? {}) as Record<string, unknown>;
    const role = isCrewRole(r.role) ? r.role : OTHER_ROLE;
    const name = text(r.name, MAX_CREW_TEXT);
    if (!name) continue;
    const detail = text(r.detail, 120) || null;
    const key = `${role}|${normalize(name)}|${normalize(detail ?? "")}`;
    if (seen.has(key)) continue;
    if (role === CAST_ROLE && ++cast > MAX_CAST) continue;
    seen.add(key);
    out.push({ role, name, detail: role === CAST_ROLE || role === OTHER_ROLE ? detail : null });
    if (out.length >= MAX_CREW + MAX_CAST) break;
  }
  return out;
}

// ───────────────────────── roles base ↔ lista ─────────────────────────

type CoreStrings = Partial<Record<"director" | "producer" | "cinematographer" | "screenwriter", string | null | undefined>>;

/** Texto de un rol base: los nombres de ese rol, tal como se escribieron (varios se unen con coma). */
export function coreText(crew: FilmCrewMember[] | null | undefined, role: CoreRole): string | null {
  const names = (crew ?? []).filter((m) => m.role === role).map((m) => m.name);
  return names.length ? names.join(", ") : null;
}

/** Los cuatro textos clásicos (director, productor, fotografía, guion) a partir del equipo. */
export function coreFields(crew: FilmCrewMember[] | null | undefined): Record<"director" | "producer" | "cinematographer" | "screenwriter", string | null> {
  return {
    director: coreText(crew, "direccion"),
    producer: coreText(crew, "produccion"),
    cinematographer: coreText(crew, "fotografia"),
    screenwriter: coreText(crew, "guion"),
  };
}

/** Equipo que se arma con los cuatro textos clásicos (cada uno es una entrada, sin partir el texto). */
export function crewFromCore(f: CoreStrings): FilmCrewMember[] {
  const out: FilmCrewMember[] = [];
  for (const role of CORE_ROLES) {
    const name = text(f[CORE_FIELD[role]], MAX_CREW_TEXT);
    if (name) out.push({ role, name, detail: null });
  }
  return out;
}

/** Entradas que no son de un rol base. */
export const extraCrew = (crew: FilmCrewMember[] | null | undefined): FilmCrewMember[] => (crew ?? []).filter((m) => !isCoreRole(m.role));

/** Equipo completo: los cuatro textos base primero, luego los roles extra (los base que vengan en `extra` se descartan). */
export const composeCrew = (core: CoreStrings, extra: unknown): FilmCrewMember[] =>
  cleanCrew([...crewFromCore(core), ...extraCrew(cleanCrew(extra))]);

/**
 * Equipo guardado: si la fila ya trae `crew`, ese; si no (registros anteriores a la migración 0020),
 * se arma con las columnas clásicas.
 */
export function readCrew(stored: unknown, legacy: CoreStrings): FilmCrewMember[] {
  const list = cleanCrew(stored);
  return list.length ? list : crewFromCore(legacy);
}

// ───────────────────────── para mostrar, buscar y exportar ─────────────────────────

/** Etiqueta de un renglón: «Edición / montaje», o el nombre libre del «Otro rol». */
export const memberRoleLabel = (m: FilmCrewMember) => (m.role === OTHER_ROLE ? m.detail || "Otro rol" : roleLabel(m.role));

export interface CrewDisplayLine {
  /** Clave estable del renglón (el id del rol, o el texto libre en «Otro rol»). */
  key: string;
  label: string;
  members: { name: string; detail: string | null }[];
}
export interface CrewDisplayGroup {
  id: CrewGroupId;
  label: string;
  lines: CrewDisplayLine[];
}

/** Equipo extra agrupado para la ficha: por categoría y, dentro, un renglón por rol con todas sus personas. */
export function groupExtraCrew(crew: FilmCrewMember[] | null | undefined): CrewDisplayGroup[] {
  const groups: CrewDisplayGroup[] = [];
  for (const g of CREW_GROUPS) {
    const lines: CrewDisplayLine[] = [];
    for (const m of extraCrew(crew)) {
      if (roleGroup(m.role) !== g.id) continue;
      const label = memberRoleLabel(m);
      const key = m.role === OTHER_ROLE ? `otro:${normalize(label)}` : m.role;
      let line = lines.find((l) => l.key === key);
      if (!line) lines.push((line = { key, label, members: [] }));
      line.members.push({ name: m.name, detail: m.role === CAST_ROLE ? m.detail : null });
    }
    if (lines.length) groups.push({ id: g.id, label: g.label, lines });
  }
  return groups;
}

/** Cuántas personas hay fuera de los cuatro roles base. */
export const extraCrewCount = (crew: FilmCrewMember[] | null | undefined) => extraCrew(crew).length;

/** Texto para la búsqueda: todos los nombres del equipo y del reparto. */
export const crewSearchText = (crew: FilmCrewMember[] | null | undefined) => extraCrew(crew).map((m) => m.name).join(" ");

/** Equipo extra y reparto en texto, un renglón por rol: «Edición / montaje: Ana, Luis». Para comparar y mostrar cambios. */
export function extraCrewText(crew: { role?: string | null; name?: string | null; detail?: string | null }[] | null | undefined): string | null {
  const lines = groupExtraCrew(cleanCrew(crew)).flatMap((g) =>
    g.lines.map((l) => `${l.label}: ${l.members.map((m) => (m.detail ? `${m.name} (${m.detail})` : m.name)).join(", ")}`),
  );
  return lines.length ? lines.join("\n") : null;
}

/** Nombres de un rol (para exportar). */
export const namesOf = (crew: FilmCrewMember[] | null | undefined, role: string) => (crew ?? []).filter((m) => m.role === role).map((m) => m.name);

/** Reparto como texto: «Nombre (personaje); Nombre». */
export const castText = (crew: FilmCrewMember[] | null | undefined) =>
  (crew ?? [])
    .filter((m) => m.role === CAST_ROLE)
    .map((m) => (m.detail ? `${m.name} (${m.detail})` : m.name))
    .join("; ");

/** Alguien del equipo extra cuyo nombre coincide con lo buscado (ya normalizado); para mostrar «Equipo: nombre». */
export function crewMatch(crew: FilmCrewMember[] | null | undefined, nq: string): string | null {
  if (!nq) return null;
  const hit = extraCrew(crew).find((m) => normalize(m.name).includes(nq));
  return hit ? hit.name : null;
}

// ───────────────────────── lectura de celdas (carga de archivos) ─────────────────────────

/** Separa personas en una celda: «;», salto de línea o «|» (la coma no, porque «Pérez, Ana» es un nombre). */
export const splitPeople = (v: string) => v.split(/[;\n|]+/).map((x) => x.trim()).filter(Boolean);

/** «Ana Pérez (Doña Rosa)» -> nombre y personaje. */
export function parseCastEntry(raw: string): { name: string; detail: string | null } {
  const m = raw.match(/^(.*?)\s*[(（]\s*(.+?)\s*[)）]\s*$/);
  if (m && m[1].trim()) return { name: m[1].trim(), detail: m[2].trim() };
  const dash = raw.match(/^(.*?)\s+(?:como|as|-|–|—)\s+(.+)$/i);
  if (dash && dash[1].trim() && dash[2].trim()) return { name: dash[1].trim(), detail: dash[2].trim() };
  return { name: raw.trim(), detail: null };
}

/** Celda de un rol (varias personas) -> entradas de equipo. En el reparto lee el personaje entre paréntesis. */
export function crewFromCell(role: string, cell: unknown): FilmCrewMember[] {
  const parts = splitPeople(String(cell ?? ""));
  return parts.map((p) => {
    if (role === CAST_ROLE) {
      const e = parseCastEntry(p);
      return { role, name: e.name, detail: e.detail };
    }
    return { role, name: p, detail: null };
  });
}

// ───────────────────────── idiomas ─────────────────────────

/** Idiomas estándar. Se guardan por su nombre; los demás se escriben a mano. */
export const LANGUAGES: string[] = [
  "Español",
  "Inglés",
  "K'iche'",
  "Q'eqchi'",
  "Kaqchikel",
  "Mam",
  "Poqomchi'",
  "Tz'utujil",
  "Ixil",
  "Achi",
  "Garífuna",
  "Xinka",
  "Francés",
  "Portugués",
  "Lengua de señas",
  "Sin diálogos",
];

export const MAX_LANGUAGES = 8;
export const MAX_LANGUAGE_LENGTH = 40;

const LANGUAGE_SYNONYMS: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  const add = (label: string, ...keys: string[]) => keys.forEach((k) => (m[normalize(k)] = label));
  add("Español", "español", "espanol", "castellano", "spanish", "es", "esp");
  add("Inglés", "inglés", "ingles", "english", "en", "eng");
  add("K'iche'", "k'iche'", "kiche", "quiche", "k iche", "quiché", "kiche'");
  add("Q'eqchi'", "q'eqchi'", "qeqchi", "kekchi", "q eqchi", "kekchí", "q'eqchi");
  add("Kaqchikel", "kaqchikel", "cakchiquel", "kakchiquel");
  add("Mam", "mam");
  add("Poqomchi'", "poqomchi'", "poqomchi", "pocomchi", "poqomchi");
  add("Tz'utujil", "tz'utujil", "tzutujil", "tz utujil", "tzutuhil");
  add("Ixil", "ixil");
  add("Achi", "achi", "achí");
  add("Garífuna", "garífuna", "garifuna");
  add("Xinka", "xinka", "xinca");
  add("Francés", "francés", "frances", "french");
  add("Portugués", "portugués", "portugues", "portuguese");
  add("Lengua de señas", "lengua de señas", "lengua de senas", "lenguaje de señas", "lsg", "sign language");
  add("Sin diálogos", "sin diálogos", "sin dialogos", "mudo", "silent", "no dialogue");
  return m;
})();

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** Separa un texto de idiomas («Español, K'iche' / Inglés»). */
export const splitLanguageText = (t: string) => t.split(/[;,/|\n]+|\s+y\s+/i).map((x) => x.trim()).filter(Boolean);

/** Un texto -> idioma estándar si lo es; si no, el idioma propio tal como se escribió. */
export function canonicalLanguage(raw: unknown): string {
  const t = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  return LANGUAGE_SYNONYMS[normalize(t)] ?? cap(t.slice(0, MAX_LANGUAGE_LENGTH).trim());
}

/** Lista de idiomas limpia: estándar o propios, sin repetidos y con el máximo permitido. */
export function cleanLanguages(list: unknown): string[] {
  const items = Array.isArray(list) ? list : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of items) {
    const l = canonicalLanguage(raw);
    const k = normalize(l);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(l);
  }
  return out.slice(0, MAX_LANGUAGES);
}

/** Celda de idiomas -> idiomas. */
export const parseLanguageCell = (cell: unknown) => cleanLanguages(splitLanguageText(String(cell ?? "")));

const STANDARD_LANGUAGE_KEYS = new Set(LANGUAGES.map(normalize));
export const isStandardLanguage = (l: string) => STANDARD_LANGUAGE_KEYS.has(normalize(l));

/** Idiomas propios que hay en los datos, de la A a la Z. */
export function customLanguages(films: { languages?: string[] }[]): string[] {
  const out = new Map<string, string>();
  for (const f of films) for (const l of f.languages ?? []) if (!isStandardLanguage(l) && !out.has(normalize(l))) out.set(normalize(l), l);
  return [...out.values()].sort((a, b) => a.localeCompare(b, "es"));
}

/** Opciones del filtro de idioma: los estándar que existen en los datos y, aparte bajo «Otros», los propios. */
export function languageOptions(films: { languages?: string[] }[]): { value: string; label: string; group?: string }[] {
  const used = new Set(films.flatMap((f) => (f.languages ?? []).map(normalize)));
  return [
    ...LANGUAGES.filter((l) => used.has(normalize(l))).map((l) => ({ value: l, label: l })),
    ...customLanguages(films).map((l) => ({ value: l, label: l, group: "Otros" })),
  ];
}
