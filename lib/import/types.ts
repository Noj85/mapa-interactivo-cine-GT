import type { Film, FilmInput, Org, OrgInput } from "@/lib/types";

// ───────────────────────── archivo leído ─────────────────────────

export interface ParsedSheet {
  name: string;
  headers: string[];
  /** Filas como texto, indexadas por encabezado. */
  rows: Record<string, string>[];
  /** Cantidad real de filas del archivo (rows puede estar recortado). */
  totalRows: number;
}

export interface ParsedFile {
  filename: string;
  sheets: ParsedSheet[];
  /** Solo si el archivo era un PDF: cómo se leyó. */
  pdf?: { pages: number; engine: "claude" | "heuristic"; notes: string[] };
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
  { id: "format", label: "Formato", hint: "largometraje, mediometraje, cortometraje, serie, miniserie, video musical, publicidad, programa de TV, contenido web, videoarte; puede venir junto a la naturaleza («Largometraje documental»)" },
  { id: "nature", label: "Naturaleza", hint: "ficción, documental, híbrido (aplica a cualquier formato)" },
  { id: "genres", label: "Géneros", hint: "uno o varios separados por «;» o «,» (drama, comedia, terror, ciencia ficción…); si trae uno que no es estándar, se conserva tal cual" },
  { id: "director", label: "Director/a", hint: "Persona que dirigió la producción" },
  { id: "producer", label: "Productor/a", hint: "Persona productora (no la empresa)" },
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

export interface DuplicateMatch {
  id: string;
  title: string;
  year: number | null;
  score: number;
  /** Copia del registro que ya existe (con borradores), para mostrar qué se completaría. */
  record?: Film | Org;
}

// ───────────────────────── candidatos a publicar ─────────────────────────

export type DuplicateDecision = "update" | "create" | "skip";

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
}

export interface ResolveResponse {
  places: Record<string, PlaceResolution>;
  duplicates: Record<string, DuplicateMatch>;
  engine: "claude" | "gazetteer";
}
