import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { PDFDocument } from "pdf-lib";
import { FORMATS, GENRES, NATURES } from "@/lib/film-types";
import { CIRC_CATEGORIES, IND_CATEGORIES } from "@/lib/types";
import type { ParsedFile, ParsedSheet } from "@/lib/import/types";
import { CLAUDE_MODEL, claude } from "./client";

/** Páginas por consulta: PDFs largos se parten para no cortar la respuesta ni perder detalle. */
const PAGES_PER_CHUNK = 6;
const CONCURRENCY = 3;

const str = { type: "string" as const };
const TOOL = {
  name: "submit_records",
  description: "Entrega los registros que aparecen en este fragmento del documento.",
  input_schema: {
    type: "object" as const,
    properties: {
      films: {
        type: "array",
        description: "Producciones audiovisuales: películas, cortometrajes, series, etc.",
        items: {
          type: "object",
          properties: {
            title: str,
            year: { type: "string", description: "Año de estreno o producción, solo el número." },
            duration: { type: "string", description: "Duración de la producción en minutos o en horas y minutos, tal como la dice el documento («95 min», «1h 35min»). Vacío si no se dice." },
            format: { type: "string", description: `Formato: ${FORMATS.map((f) => f.label).join(", ")}. Si el documento no lo dice, vacío.` },
            nature: { type: "string", description: `Naturaleza: ${NATURES.map((n) => n.label).join(", ")}. Aplica a cualquier formato («cortometraje documental» = formato Cortometraje, naturaleza Documental). Si no se dice, vacío.` },
            genres: {
              type: "string",
              description: `Géneros, separados por «;». Usa los estándar cuando correspondan (${GENRES.join(", ")}); si el documento trae otro, escríbelo tal cual. Solo lo que el documento diga.`,
            },
            director: { type: "string", description: "Persona que dirigió la producción." },
            producer: { type: "string", description: "Persona productora (no la empresa)." },
            production_company: {
              type: "string",
              description: "Casa(s) productora(s) (empresas). Si hay varias, sepáralas con «;». Si el documento indica el país de una casa, escríbelo entre paréntesis: «Casa Uno (México); Casa Dos (Guatemala)».",
            },
            production_company_country: { type: "string", description: "País de la casa productora, solo si el documento lo da aparte (varios países, uno por casa, separados por «;»)." },
            nationality: { type: "string", description: "guatemalteca, coproducción o extranjera." },
            budget: { type: "string", description: "Solo el monto, tal como aparece." },
            currency: { type: "string", description: "GTQ o USD." },
            synopsis: str,
            locations: {
              type: "array",
              description: "Lugares de rodaje. Uno por lugar distinto; si solo hay uno, un solo elemento.",
              items: {
                type: "object",
                properties: {
                  place: { type: "string", description: "Lugar tal como aparece (municipio, departamento o sitio)." },
                  site: { type: "string", description: "Sitio o escenario específico, si se nombra." },
                  municipality: str,
                  department: str,
                  country: { type: "string", description: "País, solo si el lugar de rodaje está fuera de Guatemala." },
                  city: { type: "string", description: "Ciudad o lugar dentro de ese país, si se nombra." },
                },
              },
            },
            festivals: {
              type: "array",
              description: "Festivales donde fue seleccionada o premiada. Uno por participación.",
              items: {
                type: "object",
                properties: {
                  festival: { type: "string", description: "Nombre del festival." },
                  year: { type: "string", description: "Año de esa edición, solo el número." },
                  result: { type: "string", description: "selección, nominación, premio, mención o proyección." },
                  section: { type: "string", description: "Sección o competencia." },
                  award: { type: "string", description: "Nombre del premio, si ganó uno." },
                },
              },
            },
            page: { type: "integer", description: "Página dentro del fragmento recibido, empezando en 1." },
          },
          required: ["title"],
        },
      },
      orgs: {
        type: "array",
        description: "Entidades: festivales, salas, productoras, escuelas, proveedores de servicios, medios, archivos.",
        items: {
          type: "object",
          properties: {
            name: str,
            category: { type: "string", description: "Categoría(s) permitida(s) más cercana(s). Si aplican varias, sepáralas con «;»." },
            initiative_type: { type: "string", description: "pública, privada, comunitaria o transnacional." },
            place: { type: "string", description: "Ubicación tal como aparece en el documento." },
            municipality: str,
            department: str,
            website: str,
            instagram: str,
            contact: { type: "string", description: "Teléfono(s) y correo(s) de contacto, sin nombres de personas." },
            description: str,
            page: { type: "integer", description: "Página dentro del fragmento recibido, empezando en 1." },
          },
          required: ["name"],
        },
      },
      notes: { type: "string", description: "Algo importante que el equipo deba saber sobre estas páginas (opcional)." },
    },
    required: ["films", "orgs"],
  },
};

const SYSTEM = `Eres el asistente de carga del "Mapa del Cine de Guatemala", de la Academia de Cine de Guatemala.
Recibes páginas de un PDF o el contenido de un documento de Word (catálogo, directorio, informe, listado, fichas) y extraes SOLO los registros que aparecen: producciones (películas, cortometrajes, series) y entidades del ecosistema audiovisual.

Reglas:
- Transcribe lo que dice el documento. No inventes, no completes de memoria ni deduzcas datos que no estén.
- Si un dato no aparece, deja la cadena vacía. No pongas "N/A".
- Cada producción o entidad se entrega una sola vez, aunque se mencione en varias páginas; usa la ficha más completa.
- Ignora portadas, índices, créditos, encabezados, pies de página y texto institucional que no describa un registro.
- Un nombre de persona NO es una entidad, salvo que sea claramente un colectivo, productora o empresa.
- Si el PDF es multicolumna, lee cada ficha completa antes de pasar a la siguiente.
- En un documento de Word, las tablas llegan como filas de celdas separadas por « | » (la primera fila suele ser el encabezado) y los títulos como líneas que empiezan con «#». Una tabla de dos columnas «etiqueta | valor» suele ser la ficha de una sola producción o entidad; el título que la antecede suele ser el nombre.
- "municipality" y "department" solo si el documento los indica o si "place" nombra un municipio o departamento de Guatemala sin ambigüedad. Si el lugar está fuera de Guatemala (por ejemplo «Oaxaca, México»), déjalos vacíos y llena "country" (el país) y "city" (la ciudad o lugar); no lo mapees a un municipio de Guatemala.
- Para "category" elige la categoría permitida más cercana al tipo de entidad; si la entidad hace varias cosas (por ejemplo producción y postproducción), enumera todas las que apliquen separadas por «;», la principal primero. Si ninguna encaja, la más cercana igualmente.
- Teléfonos y correos van en "contact" (solo números de teléfono y direcciones de correo), no en la descripción.
- Producciones: "format" es el formato (largometraje, cortometraje, serie, video musical…), "nature" es ficción, documental o híbrido, y "genres" son los géneros. Son tres datos distintos: «cortometraje documental de terror» = formato Cortometraje, naturaleza Documental, género Terror. No inventes ninguno que el documento no diga.
- Duración: "duration" es la duración de la producción (minutos u horas), no los días de rodaje ni el año.
- Festivales y lugares de una producción van en las listas "festivals" y "locations", uno por elemento; no los juntes en un solo texto.
- Idioma de los datos: el original del documento.`;

interface RawFilm {
  title?: string;
  year?: string;
  duration?: string;
  format?: string;
  nature?: string;
  genres?: string;
  director?: string;
  producer?: string;
  production_company?: string;
  production_company_country?: string;
  nationality?: string;
  budget?: string;
  currency?: string;
  synopsis?: string;
  locations?: { place?: string; site?: string; municipality?: string; department?: string; country?: string; city?: string }[];
  festivals?: { festival?: string; year?: string; result?: string; section?: string; award?: string }[];
  /** Respuestas anteriores a las listas: un solo lugar. */
  place?: string;
  municipality?: string;
  department?: string;
  page?: number;
}
interface RawOrg {
  name?: string;
  category?: string;
  initiative_type?: string;
  place?: string;
  municipality?: string;
  department?: string;
  website?: string;
  instagram?: string;
  contact?: string;
  description?: string;
  page?: number;
}
interface FilmAgg {
  base: Record<string, string>;
  locs: { place: string; site: string; municipality: string; department: string }[];
  fests: { festival: string; year: string; result: string; section: string; award: string }[];
}
interface ChunkResult {
  films: (RawFilm & { page: number })[];
  orgs: (RawOrg & { page: number })[];
  notes: string[];
}

async function splitPdf(data: Uint8Array): Promise<{ chunks: { bytes: Uint8Array; from: number; to: number }[]; pages: number }> {
  const src = await PDFDocument.load(data, { ignoreEncryption: true });
  const pages = src.getPageCount();
  if (pages <= PAGES_PER_CHUNK + 2) return { chunks: [{ bytes: data, from: 1, to: pages }], pages };
  const chunks: { bytes: Uint8Array; from: number; to: number }[] = [];
  for (let start = 0; start < pages; start += PAGES_PER_CHUNK) {
    const end = Math.min(pages, start + PAGES_PER_CHUNK);
    const doc = await PDFDocument.create();
    const copied = await doc.copyPages(src, Array.from({ length: end - start }, (_, i) => start + i));
    copied.forEach((p) => doc.addPage(p));
    chunks.push({ bytes: await doc.save(), from: start + 1, to: end });
  }
  return { chunks, pages };
}

const ALLOWED = () =>
  `Categorías permitidas para entidades de Circulación: ${CIRC_CATEGORIES.join(", ")}.\n` +
  `Categorías permitidas para entidades de Industria: ${IND_CATEGORIES.join(", ")}.`;

/** Una consulta a Claude. `pages` (solo PDF) convierte la página relativa que devuelve el modelo en página del documento. */
async function ask(content: Anthropic.Messages.ContentBlockParam[], pages?: { from: number; to: number }): Promise<ChunkResult> {
  const res = await claude().messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 16000,
    system: SYSTEM,
    tools: [TOOL],
    tool_choice: { type: "tool", name: TOOL.name },
    messages: [{ role: "user", content }],
  });
  const block = res.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") return { films: [], orgs: [], notes: [] };
  const input = block.input as { films?: RawFilm[]; orgs?: RawOrg[]; notes?: string };
  const abs = (p?: number) => (pages ? pages.from - 1 + Math.max(1, Math.min(pages.to - pages.from + 1, Math.round(p ?? 1))) : 1);
  return {
    films: (input.films ?? []).map((f) => ({ ...f, page: abs(f.page) })),
    orgs: (input.orgs ?? []).map((o) => ({ ...o, page: abs(o.page) })),
    notes: input.notes ? [input.notes] : [],
  };
}

function readChunk(bytes: Uint8Array, from: number, to: number, total: number): Promise<ChunkResult> {
  return ask(
    [
      { type: "document", source: { type: "base64", media_type: "application/pdf", data: Buffer.from(bytes).toString("base64") } },
      { type: "text", text: `Estas son las páginas ${from} a ${to} de un PDF de ${total} páginas. Extrae todos los registros.\n${ALLOWED()}` },
    ],
    { from, to },
  );
}

const key = (s?: string) =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const v = (s?: string) => (s ?? "").trim();

const FILM_HEADERS = [
  "Título",
  "Año",
  "Duración (min)",
  "Formato",
  "Naturaleza",
  "Géneros",
  "Director/a",
  "Productor/a",
  "Casa productora",
  "País de la casa productora",
  "Nacionalidad",
  "Presupuesto",
  "Moneda",
  "Sinopsis",
  "Lugar",
  "Sitio de rodaje",
  "Municipio",
  "Departamento",
  "Festival",
  "Año del festival",
  "Resultado en el festival",
  "Sección del festival",
  "Premio",
  "Página del PDF",
];
const ORG_HEADERS = ["Nombre", "Categoría", "Tipo de iniciativa", "Lugar", "Municipio", "Departamento", "Sitio web", "Instagram", "Contacto", "Descripción", "Página del PDF"];

export interface ClaudePdfResult {
  file: ParsedFile;
  pages: number;
  notes: string[];
}

/** Lee el PDF completo con Claude (texto, tablas y maquetación en columnas). Lanza si falla. */
export async function claudePdf(data: Uint8Array, filename: string): Promise<ClaudePdfResult> {
  const { chunks, pages } = await splitPdf(data);
  const results: ChunkResult[] = new Array(chunks.length);
  let next = 0;
  const worker = async () => {
    while (next < chunks.length) {
      const i = next++;
      results[i] = await readChunk(chunks[i].bytes, chunks[i].from, chunks[i].to, pages);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, chunks.length) }, worker));
  return aggregate(results, "Página del PDF", filename, pages);
}

/** Lee el texto de un documento de Word (ya convertido a texto por fragmentos) con Claude. Lanza si falla. */
export async function claudeText(parts: string[], filename: string): Promise<ClaudePdfResult> {
  const results: ChunkResult[] = new Array(parts.length);
  let next = 0;
  const worker = async () => {
    while (next < parts.length) {
      const i = next++;
      results[i] = await ask([
        {
          type: "text",
          text:
            `Este es el contenido del documento de Word «${filename}»` +
            (parts.length > 1 ? ` (parte ${i + 1} de ${parts.length}; una ficha puede quedar partida entre partes: entrega lo que veas)` : "") +
            `. Extrae todos los registros.\n${ALLOWED()}\n\n--- INICIO ---\n${parts[i]}\n--- FIN ---`,
        },
      ]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, parts.length) }, worker));
  return aggregate(results, null, filename, 0);
}

function aggregate(results: ChunkResult[], refHeader: string | null, filename: string, pages: number): ClaudePdfResult {
  // Una producción puede salir en varias páginas: los datos se completan y sus lugares y festivales se suman.
  const films = new Map<string, FilmAgg>();
  const orgRows = new Map<string, Record<string, string>>();
  const notes: string[] = [];
  for (const r of results) {
    notes.push(...r.notes);
    for (const f of r.films) {
      if (!v(f.title)) continue;
      const k = `${key(f.title)}|${v(f.year)}`;
      const base: Record<string, string> = {
        Título: v(f.title),
        Año: v(f.year),
        "Duración (min)": v(f.duration),
        Formato: v(f.format),
        Naturaleza: v(f.nature),
        Géneros: v(f.genres),
        "Director/a": v(f.director),
        "Productor/a": v(f.producer),
        "Casa productora": v(f.production_company),
        "País de la casa productora": v(f.production_company_country),
        Nacionalidad: v(f.nationality),
        Presupuesto: v(f.budget),
        Moneda: v(f.currency),
        Sinopsis: v(f.synopsis),
        "Página del PDF": String(f.page),
      };
      const locs = (f.locations ?? [])
        .map((l) => {
          // un lugar fuera de Guatemala viaja como «Ciudad, País» en el texto del lugar: el resto del flujo lo reconoce
          const country = v(l.country);
          const abroad = country && country.toLowerCase() !== "guatemala";
          const place = abroad ? [v(l.city) || v(l.place) || v(l.site), country].filter(Boolean).join(", ") : v(l.place);
          return { place, site: abroad ? "" : v(l.site), municipality: abroad ? "" : v(l.municipality), department: abroad ? "" : v(l.department) };
        })
        .filter((l) => l.place || l.site || l.municipality || l.department);
      if (!locs.length && (v(f.place) || v(f.municipality) || v(f.department)))
        locs.push({ place: v(f.place), site: "", municipality: v(f.municipality), department: v(f.department) });
      const fests = (f.festivals ?? [])
        .map((x) => ({ festival: v(x.festival), year: v(x.year), result: v(x.result), section: v(x.section), award: v(x.award) }))
        .filter((x) => x.festival);
      const prev = films.get(k);
      if (!prev) {
        films.set(k, { base, locs, fests });
        continue;
      }
      // Si ya estaba, se completan solo los vacíos.
      for (const h of Object.keys(base)) if (!prev.base[h] && base[h]) prev.base[h] = base[h];
      for (const l of locs) if (!prev.locs.some((x) => key(`${x.place} ${x.site} ${x.municipality} ${x.department}`) === key(`${l.place} ${l.site} ${l.municipality} ${l.department}`))) prev.locs.push(l);
      for (const x of fests) if (!prev.fests.some((y) => key(`${y.festival} ${y.year} ${y.award}`) === key(`${x.festival} ${x.year} ${x.award}`))) prev.fests.push(x);
    }
    for (const o of r.orgs) {
      if (!v(o.name)) continue;
      const k = key(o.name);
      const row = {
        Nombre: v(o.name),
        Categoría: v(o.category),
        "Tipo de iniciativa": v(o.initiative_type),
        Lugar: v(o.place),
        Municipio: v(o.municipality),
        Departamento: v(o.department),
        "Sitio web": v(o.website),
        Instagram: v(o.instagram),
        Contacto: v(o.contact),
        Descripción: v(o.description),
        "Página del PDF": String(o.page),
      };
      const prev = orgRows.get(k);
      if (prev) {
        for (const h of ORG_HEADERS) if (!prev[h] && row[h as keyof typeof row]) prev[h] = row[h as keyof typeof row];
      } else orgRows.set(k, row);
    }
  }

  const sheets: ParsedSheet[] = [];
  // Un lugar o un festival de más es una fila más con el mismo título: así el sistema las junta en una sola producción.
  const filmRows: Record<string, string>[] = [];
  for (const f of films.values()) {
    const n = Math.max(f.locs.length, f.fests.length, 1);
    for (let i = 0; i < n; i++) {
      const l = f.locs[i];
      const x = f.fests[i];
      filmRows.push({
        ...f.base,
        Lugar: l?.place ?? "",
        "Sitio de rodaje": l?.site ?? "",
        Municipio: l?.municipality ?? "",
        Departamento: l?.department ?? "",
        Festival: x?.festival ?? "",
        "Año del festival": x?.year ?? "",
        "Resultado en el festival": x?.result ?? "",
        "Sección del festival": x?.section ?? "",
        Premio: x?.award ?? "",
      });
    }
  }
  // Un Word no tiene páginas: sin la columna de referencia.
  const heads = (h: string[]) => (refHeader ? h : h.filter((x) => x !== "Página del PDF"));
  const orgList = [...orgRows.values()];
  if (!refHeader) for (const r of [...filmRows, ...orgList]) delete r["Página del PDF"];
  if (filmRows.length) sheets.push({ name: "Producciones", headers: heads(FILM_HEADERS), rows: filmRows, totalRows: filmRows.length });
  if (orgList.length) sheets.push({ name: "Entidades", headers: heads(ORG_HEADERS), rows: orgList, totalRows: orgList.length });
  return { file: { filename, sheets }, pages, notes: [...new Set(notes)] };
}
