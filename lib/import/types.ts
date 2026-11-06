import type { Film, FilmInput, Org, OrgInput } from "@/lib/types";

// ───────────────────────── archivo leído ─────────────────────────

export interface ParsedSheet {
  name: string;
  headers: string[];
  /** Filas como texto, indexadas por encabezado. */
  rows: Record<string, string>[];
  /** Cantidad real de filas del archivo (rows puede estar recortado). */
  totalRows: number;
  /** Cómo venía armada la hoja si no era una tabla simple: encabezados en dos filas o una ficha «etiqueta | valor». */
  layout?: "dos filas" | "ficha";
  /** Con encabezados en dos filas: encabezado completo («Locación Días») -> el de la fila de abajo («Días»). */
  subHeaders?: Record<string, string>;
}

export interface ParsedFile {
  filename: string;
  sheets: ParsedSheet[];
  /** Solo si el archivo era un PDF o un Word: cómo se leyó (`pages` es 0 en un Word). */
  doc?: { kind: "pdf" | "docx"; pages: number; engine: "claude" | "heuristic"; notes: string[] };
}

// ───────────────────────── campos destino ─────────────────────────

export interface FieldDef {
  id: string;
  label: string;
  hint?: string;
}

export const FILM_FIELDS: FieldDef[] = [
  { id: "title", label: "Título", hint: "Nombre de la producción o proyecto" },
  { id: "year", label: "Año" },
  { id: "duration_min", label: "Duración (min)", hint: "Duración de la producción: «95», «95 min», «1h 35min», «01:35:00»; se guarda en minutos. No es la duración del rodaje (eso son los días de rodaje)" },
  { id: "format", label: "Formato", hint: "largometraje, mediometraje, cortometraje, serie, miniserie, video musical, publicidad, programa de TV, contenido web, videoarte; puede venir junto a la naturaleza («Largometraje documental»)" },
  { id: "nature", label: "Naturaleza", hint: "ficción, documental, híbrido (aplica a cualquier formato)" },
  { id: "genres", label: "Géneros", hint: "uno o varios separados por «;» o «,» (drama, comedia, terror, ciencia ficción…); si trae uno que no es estándar, se conserva tal cual" },
  { id: "director", label: "Director/a", hint: "Persona que dirigió la producción" },
  { id: "producer", label: "Productor/a", hint: "Persona productora (no la empresa)" },
  { id: "cinematographer", label: "Director/a de fotografía", hint: "Persona a cargo de la fotografía (DP, DoP, cinematografía)" },
  { id: "screenwriter", label: "Guionista", hint: "Persona que escribió el guion" },
  { id: "company", label: "Casa productora", hint: "Empresa productora; varias separadas por «;», con el país entre paréntesis si lo trae" },
  { id: "company_country", label: "País de la casa productora" },
  { id: "nationality", label: "Nacionalidad", hint: "guatemalteca, coproducción, extranjera" },
  { id: "budget", label: "Presupuesto" },
  { id: "currency", label: "Moneda" },
  { id: "synopsis", label: "Sinopsis" },
  { id: "poster", label: "Póster (enlace)", hint: "URL de una imagen; se descarga y se guarda al confirmar" },
  { id: "place", label: "Lugar (texto libre)", hint: "Municipio, departamento o sitio en una sola columna" },
  { id: "muni", label: "Municipio" },
  { id: "depto", label: "Departamento" },
  { id: "site", label: "Sitio de rodaje" },
  { id: "lat", label: "Latitud" },
  { id: "lng", label: "Longitud" },
  { id: "days", label: "Días de rodaje" },
  { id: "local_spend", label: "Inversión local" },
  { id: "jobs", label: "Empleos" },
  { id: "festival", label: "Festival", hint: "Festival donde fue seleccionada o premiada; una fila por festival repite el título" },
  { id: "festival_year", label: "Año del festival" },
  { id: "festival_result", label: "Resultado en el festival", hint: "selección, nominación, premio, mención" },
  { id: "festival_section", label: "Sección del festival" },
  { id: "festival_award", label: "Premio" },
  { id: "festival_url", label: "Enlace del festival o premio" },
];

export const ORG_FIELDS: FieldDef[] = [
  { id: "name", label: "Nombre" },
  { id: "category", label: "Categoría" },
  { id: "initiative_type", label: "Tipo de iniciativa", hint: "pública, privada, comunitaria, transnacional" },
  { id: "place", label: "Lugar (texto libre)" },
  { id: "muni", label: "Municipio" },
  { id: "depto", label: "Departamento" },
  { id: "city", label: "Ciudad o referencia" },
  { id: "lat", label: "Latitud" },
  { id: "lng", label: "Longitud" },
  { id: "web", label: "Sitio web" },
  { id: "instagram", label: "Instagram" },
  { id: "contact", label: "Contacto" },
  { id: "description", label: "Descripción" },
  { id: "logo", label: "Logo (enlace)", hint: "URL de una imagen; se descarga y se guarda al confirmar" },
];

// ───────────────────────── plan (lo que "entendimos") ─────────────────────────

export interface SheetPlan {
  sheet: string;
  /** Qué representa cada fila de esta hoja. */
  entity: "film" | "org" | "ignore";
  /** Solo para entidades: capa del mapa. */
  layer?: "circulacion" | "industria";
  /** La capa se dedujo de las categorías del archivo (no hace falta preguntar). */
  layerGuessed?: boolean;
  /** La hoja mezcla entidades de las dos capas: cada fila va a la capa que indica su categoría (`layer` es la de respaldo). */
  layer_by_row?: boolean;
  /** Producciones: una fila por producción o una fila por locación o festival (producción repetida). */
  grain: "row_per_film" | "row_per_location";
  /** campo destino -> encabezado de columna */
  columns: Record<string, string>;
  /** campo destino -> 0..1 */
  confidence: Record<string, number>;
  /** Separadores si una celda trae varios lugares ("Antigua; Panajachel"). */
  multi_place?: boolean;
  /** Valores crudos -> valor canónico, para campos de lista. */
  value_maps?: Record<string, Record<string, string>>;
  note?: string;
}

export interface PlanQuestion {
  id: string;
  question: string;
  options?: string[];
  /** Hoja y campo que afecta, para aplicar la respuesta. */
  sheet?: string;
  field?: string;
  /** Valor del archivo que se quiere traducir (la respuesta se guarda como equivalencia en «value_maps»). */
  value?: string;
}

export interface ImportPlan {
  sheets: SheetPlan[];
  summary: string;
  questions: PlanQuestion[];
  /** "claude" si el análisis lo hizo el modelo; "heuristic" si fue el modo sin conexión. */
  engine: "claude" | "heuristic";
  /** Una frase por cada instrucción del equipo: qué se hizo con ella o por qué no se pudo aplicar. */
  instructions_applied?: string[];
}

// ───────────────────────── resolución de lugares ─────────────────────────

export interface PlaceCandidate {
  type: "depto" | "muni";
  code: number;
  name: string;
  depto: string;
}

export interface PlaceResolution {
  status: "ok" | "ambiguous" | "unknown";
  muni_ine: number | null;
  depto_ine: number | null;
  candidates: PlaceCandidate[];
  via: "gazetteer" | "claude" | "user";
}

/**
 * Qué tan segura es una coincidencia con un registro existente:
 *  - seguro: mismo título y además el mismo año o director/a (o lugar, en entidades), sin contradicciones;
 *  - probable: título muy parecido y nada que lo contradiga;
 *  - dudoso: título parecido pero el año, el director/a o el lugar no cuadran. No se decide solo.
 */
export type MatchLevel = "seguro" | "probable" | "dudoso";

export interface DuplicateMatch {
  id: string;
  title: string;
  year: number | null;
  score: number;
  level: MatchLevel;
  /** Otras coincidencias posibles (hasta 2 más), de mayor a menor parecido. */
  alternatives?: DuplicateMatch[];
  /** Copia del registro que ya existe (con borradores), para mostrar qué se completaría. */
  record?: Film | Org;
}

// ───────────────────────── candidatos a publicar ─────────────────────────

/** update: completar el existente · create: crear uno nuevo · review: mandarlo a Aportes para decidir · skip: omitir. */
export type DuplicateDecision = "update" | "create" | "review" | "skip";

export interface Issue {
  /** film: "title" | "year" | "location:<i>" ... */
  field: string;
  level: "missing" | "doubt";
  message: string;
}

export interface Candidate {
  key: string;
  type: "film" | "org";
  film?: FilmInput;
  org?: OrgInput;
  /** Textos de lugar originales por locación (para resolver o preguntar). */
  placeTexts: string[];
  /** Filas del archivo que dieron origen: "Hoja!12". */
  rows: string[];
  issues: Issue[];
  include: boolean;
  duplicate?: DuplicateMatch;
  decision?: DuplicateDecision;
  /** Ids de lo que se aceptó actualizar del registro existente (ver `lib/import/diff.ts`); sin ella, lo que viene encendido. */
  accept?: string[];
}

export interface ResolveItem {
  key: string;
  type: "film" | "org";
  title: string;
  year: number | null;
  /** Producciones: director/a (ayuda a distinguir dos con el mismo título). */
  director?: string | null;
  /** Entidades: capa y lugar (el mismo nombre en otra capa o municipio no es la misma entidad). */
  layer?: "circulacion" | "industria" | null;
  muni_ine?: number | null;
  depto_ine?: number | null;
  /** Textos de lugar del renglón; el servidor los resuelve y completa muni_ine/depto_ine. */
  placeTexts?: string[];
}

/** Un registro que ya existe, con lo necesario para compararlo. */
export interface ExistingRef {
  id: string;
  type: "film" | "org";
  title: string;
  year: number | null;
  director?: string | null;
  layer?: "circulacion" | "industria" | null;
  muni_ine?: number | null;
  depto_ine?: number | null;
}

export interface ResolveResponse {
  places: Record<string, PlaceResolution>;
  duplicates: Record<string, DuplicateMatch>;
  engine: "claude" | "gazetteer";
}
