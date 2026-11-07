import type { PublicStats } from "@/lib/site-settings";
import type { FilmFormat, FilmNature } from "@/lib/film-types";
export type LayerId = "produccion" | "circulacion" | "industria";

export type MetricId = "films" | "days" | "spend" | "jobs" | "orgs";

export type RecordStatus = "draft" | "published";

export interface FilmLocation {
  id: string;
  film_id: string;
  depto_ine: number | null;
  muni_ine: number | null;
  /** País de la locación cuando es fuera de Guatemala (entonces no hay departamento ni municipio). */
  country: string | null;
  /** Ciudad o lugar de la locación fuera de Guatemala. */
  city: string | null;
  /** Nombre del sitio ("Calle del Arco", "Volcán de Pacaya") */
  site: string | null;
  lat: number | null;
  lng: number | null;
  days: number | null;
  local_spend: number | null;
  jobs: number | null;
  /** 0..1. Qué tan seguro estamos del lugar (carga automática). */
  confidence: number | null;
}

export type FestivalResult = "seleccion" | "nominacion" | "premio" | "mencion" | "proyeccion";

export const FESTIVAL_RESULTS: { id: FestivalResult; label: string }[] = [
  { id: "premio", label: "Premio" },
  { id: "nominacion", label: "Nominación" },
  { id: "mencion", label: "Mención especial" },
  { id: "seleccion", label: "Selección oficial" },
  { id: "proyeccion", label: "Proyección especial" },
];

/** Una participación de la producción en un festival: selección, nominación o premio. */
export interface FilmFestival {
  id: string;
  film_id: string;
  /** Festival del catálogo, o null si se escribió a mano. */
  festival_id: string | null;
  /** Nombre del festival tal como se registra (siempre presente). */
  name: string;
  /** Año de la edición. */
  year: number | null;
  country: string | null;
  city: string | null;
  result: FestivalResult;
  /** Sección o competencia ("Largometraje ficción"). */
  section: string | null;
  /** Nombre del premio o categoría ("Mejor película"). */
  award: string | null;
  url: string | null;
}

/** Festival del catálogo (semilla pública + los que agrega el equipo). */
export interface Festival {
  id: string;
  slug: string;
  name: string;
  aliases: string[];
  country: string | null;
  city: string | null;
  founded: number | null;
  source: string | null;
  /** Entidad de Circulación (categoría Festivales) a la que está vinculado, si la hay. */
  org_id: string | null;
}

/** Casa productora de una producción, con su país. */
export interface FilmCompany {
  name: string;
  country: string | null;
}

export interface Film {
  id: string;
  slug: string;
  title: string;
  year: number | null;
  /** Largometraje, cortometraje, serie, video musical… */
  format: FilmFormat | null;
  /** Ficción, documental o híbrido. */
  nature: FilmNature | null;
  /** Géneros estándar o propios (por su nombre). */
  genres: string[];
  /** Duración en minutos. */
  duration_min: number | null;
  director: string | null;
  producer: string | null;
  /** Director/a de fotografía (persona). */
  cinematographer: string | null;
  /** Guionista (persona). */
  screenwriter: string | null;
  nationality: Nationality | null;
  budget: number | null;
  currency: "GTQ" | "USD";
  synopsis: string | null;
  /** Póster (900 px de ancho). La miniatura se obtiene con `posterThumb`. */
  poster_url?: string | null;
  /** Tráiler: enlace a la plataforma (YouTube, Vimeo, etc.) y su miniatura guardada (imagen grande; la chica se obtiene con `posterThumb`). */
  trailer_url?: string | null;
  trailer_thumb?: string | null;
  /** Película completa, si se puede ver en línea: enlace y miniatura. */
  film_url?: string | null;
  film_thumb?: string | null;
  status: RecordStatus;
  /** 0..100 */
  completeness: number;
  missing_fields: string[];
  locations: FilmLocation[];
  festivals: FilmFestival[];
  /** Casas productoras (nombre y país). */
  companies: FilmCompany[];
}

export type Nationality = "guatemalteca" | "coproduccion" | "extranjera";

export type InitiativeType = "publica" | "privada" | "comunitaria" | "transnacional";

export interface Org {
  id: string;
  slug: string;
  name: string;
  layer: Exclude<LayerId, "produccion">;
  /** Categoría principal (la primera de `categories`). */
  category: string;
  /** Todas las categorías de la entidad. */
  categories: string[];
  initiative_type: InitiativeType | null;
  depto_ine: number | null;
  muni_ine: number | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
  web: string | null;
  instagram: string | null;
  contact: string | null;
  description: string | null;
  /** Logo (512 px máx., con transparencia). La miniatura se obtiene con `posterThumb`. */
  logo_url?: string | null;
  status: RecordStatus;
  completeness: number;
  missing_fields: string[];
  source: string | null;
}

export interface Dataset {
  films: Film[];
  orgs: Org[];
  /** Festival del catálogo -> entidad de Circulación publicada con la que está vinculado. */
  festivalOrgs: Record<string, string>;
  /** "supabase" | "local" */
  mode: "supabase" | "local";
  /** Qué cifras muestra el mapa público (Ajustes → Cifras públicas). */
  publicStats: PublicStats;
}

export interface GazetteerEntry {
  type: "depto" | "muni";
  code: number;
  name: string;
  depto_ine: number;
  depto: string;
  center: [number, number];
  /** [oeste, sur, este, norte] */
  bbox: [number, number, number, number];
  aliases: string[];
}

export const NATIONALITIES: { id: Nationality; label: string }[] = [
  { id: "guatemalteca", label: "Guatemalteca" },
  { id: "coproduccion", label: "Coproducción" },
  { id: "extranjera", label: "Extranjera" },
];

/** Taxonomía del Atlas de Circulación de Cine (Círculo de Industria). */
export const CIRC_CATEGORIES = [
  "Festivales",
  "Centros culturales",
  "Proyectos de exhibición",
  "Espacios de exhibición",
  "Cine clubs",
  "Salas de cine comerciales y cadenas",
  "Asociaciones y colectivos de cine",
  "Crítica y medios especializados",
  "Podcasts y proyectos digitales",
  "Instituciones públicas de cine",
  "Instituciones académicas",
  "Espacios de formación y capacitación",
] as const;

/** Categorías de industria, tomadas del Catálogo de Servicios 2025 de la Academia. */
export const IND_CATEGORIES = [
  "Productoras",
  "Postproducción",
  "Renta de equipo",
  "Formación",
  "Conservación y patrimonio",
  "Servicios audiovisuales",
  "Medios y streaming",
] as const;

export const INITIATIVE_TYPES: { id: InitiativeType; label: string }[] = [
  { id: "publica", label: "Pública" },
  { id: "privada", label: "Privada" },
  { id: "comunitaria", label: "Comunitaria" },
  { id: "transnacional", label: "Transnacional" },
];

export const LAYERS: { id: LayerId; label: string; blurb: string }[] = [
  { id: "produccion", label: "Producción", blurb: "Dónde se ha filmado" },
  { id: "circulacion", label: "Circulación", blurb: "Festivales, salas y cineclubs" },
  { id: "industria", label: "Industria", blurb: "Productoras, servicios y formación" },
];

export const METRICS: Record<
  MetricId,
  { id: MetricId; label: string; unit: string; layer: LayerId; format: "int" | "money" }
> = {
  films: { id: "films", label: "Producciones", unit: "producciones", layer: "produccion", format: "int" },
  days: { id: "days", label: "Días de rodaje", unit: "días", layer: "produccion", format: "int" },
  spend: { id: "spend", label: "Inversión local", unit: "GTQ", layer: "produccion", format: "money" },
  jobs: { id: "jobs", label: "Empleos", unit: "empleos", layer: "produccion", format: "int" },
  orgs: { id: "orgs", label: "Iniciativas", unit: "registros", layer: "circulacion", format: "int" },
};

export const LAYER_METRICS: Record<LayerId, MetricId[]> = {
  produccion: ["films", "days", "spend", "jobs"],
  circulacion: ["orgs"],
  industria: ["orgs"],
};

// ───────────────────────── cargas inteligentes ─────────────────────────

export type ImportStatus = "uploaded" | "analyzed" | "reviewing" | "committed" | "cancelled";

export interface ImportRecord {
  id: string;
  filename: string;
  status: ImportStatus;
  /** Resumen de lo que se entendió y de lo que se publicó. */
  summary: Record<string, unknown> | null;
  created_at: string;
}

export type QuestionStatus = "open" | "answered" | "deferred";

export interface ImportQuestion {
  id: string;
  import_id: string;
  /** "film:<slug>" | "org:<slug>" */
  record_ref: string | null;
  field: string | null;
  question: string;
  options: string[] | null;
  answer: string | null;
  status: QuestionStatus;
  created_at: string;
}

/** Entrada para crear o editar una producción (ids y completitud se calculan en el servidor). */
export interface FilmInput {
  id?: string;
  title: string;
  year?: number | null;
  format?: FilmFormat | null;
  nature?: FilmNature | null;
  genres?: string[];
  duration_min?: number | null;
  director?: string | null;
  producer?: string | null;
  cinematographer?: string | null;
  screenwriter?: string | null;
  nationality?: Nationality | null;
  budget?: number | null;
  currency?: "GTQ" | "USD";
  synopsis?: string | null;
  poster_url?: string | null;
  trailer_url?: string | null;
  trailer_thumb?: string | null;
  film_url?: string | null;
  film_thumb?: string | null;
  status?: RecordStatus;
  source?: string | null;
  locations: Partial<Omit<FilmLocation, "film_id">>[];
  /** Si no viene, se conservan los festivales que ya tiene la producción. */
  festivals?: Partial<Omit<FilmFestival, "film_id">>[];
  /** Sin este campo se conservan las casas productoras actuales. */
  companies?: Partial<FilmCompany>[];
}

export interface OrgInput {
  id?: string;
  name: string;
  layer: Exclude<LayerId, "produccion">;
  category: string;
  /** Si viene, manda sobre `category`. */
  categories?: string[];
  initiative_type?: InitiativeType | null;
  depto_ine?: number | null;
  muni_ine?: number | null;
  city?: string | null;
  lat?: number | null;
  lng?: number | null;
  web?: string | null;
  instagram?: string | null;
  contact?: string | null;
  description?: string | null;
  logo_url?: string | null;
  status?: RecordStatus;
  source?: string | null;
}

// ───────────────────────── aportes del público ─────────────────────────

export type SubmissionStatus = "pending" | "approved" | "rejected";
export type SubmissionKind = "film" | "org";

/**
 * Propuesta enviada desde el mapa público. Nunca toca los registros publicados:
 * el equipo la revisa y, al aprobarla, se crea o actualiza el registro.
 */
export type SubmissionOrigin = "publico" | "recopilacion" | "carga";

/** Registro existente que podría ser el mismo que el de una carga de archivo (aportes «Carga de archivo» dudosos). */
export interface SubmissionCandidate {
  id: string;
  title: string;
  year: number | null;
  score: number;
  level: "seguro" | "probable" | "dudoso";
}

export interface Submission {
  id: string;
  kind: SubmissionKind;
  /** "publico" = formulario abierto; "recopilacion" = enlace privado de una solicitud de información; "carga" = lo que una carga de archivo no pudo decidir sola. */
  origin: SubmissionOrigin;
  /** Solicitud de información desde la que se envió (solo recopilación). */
  request_id: string | null;
  /** Nombre y rol de quien envía (recopilación) o archivo de donde viene (carga). */
  submitter: string | null;
  /** Carga de archivo de la que viene el aporte (solo carga). */
  import_id?: string | null;
  /** Coincidencias posibles cuando la carga no supo si el registro ya existía (solo carga). */
  candidates?: SubmissionCandidate[] | null;
  /** Registro que se propone corregir; null si es un registro nuevo. */
  target_id: string | null;
  /** Nombre del registro al enviar el aporte (para mostrarlo en la lista). */
  label: string;
  /** Datos propuestos (producción u organización, sin estado ni póster). */
  payload: FilmInput | OrgInput;
  /** Comentario o fuente que acompaña el aporte. */
  note: string | null;
  /** Correo opcional para avisar o pedir aclaraciones. */
  contact: string | null;
  status: SubmissionStatus;
  reviewer_note: string | null;
  /** Registro creado o actualizado al aprobar. */
  result_id: string | null;
  created_at: string;
  reviewed_at: string | null;
}

export type SubmissionInput = Pick<Submission, "kind" | "target_id" | "label" | "payload" | "note" | "contact">;

/** Aporte creado por una carga de archivo (solo el equipo lo puede crear). */
export type ImportSubmissionInput = SubmissionInput & {
  import_id: string;
  /** Nombre del archivo. */
  submitter: string;
  candidates: SubmissionCandidate[] | null;
};

// ───────────────────────── solicitudes de información ─────────────────────────

/** Enlace privado con contraseña para que alguien del equipo de una producción o entidad complete sus datos. */
export interface InfoRequest {
  id: string;
  kind: SubmissionKind;
  target_id: string;
  /** Todas las producciones del enlace, la principal primero (una sola salvo en solicitudes consolidadas). */
  target_ids: string[];
  /** Nombre o rol de la persona a quien se envía (opcional). */
  recipient: string | null;
  recipient_email: string | null;
  expires_at: string;
  revoked_at: string | null;
  failed_attempts: number;
  last_used_at: string | null;
  created_at: string;
  /** Aportes recibidos por este enlace. */
  submissions_count: number;
}

export type InfoRequestState = "active" | "expired" | "revoked" | "locked";

export type OpenInfoResult =
  | {
      ok: true;
      request: InfoRequest;
      /** La producción principal (o la primera que exista). */
      film?: Film;
      /** Todas las producciones del enlace (una sola salvo en solicitudes consolidadas). */
      films?: Film[];
      org?: Org;
      /** Producciones que ya recibieron un aporte por este enlace. */
      submitted?: string[];
    }
  | { ok: false; reason: "not_found" | "bad_password" | "expired" | "revoked" | "locked" };
