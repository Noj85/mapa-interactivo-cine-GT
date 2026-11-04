import "server-only";
import { PDFDocument } from "pdf-lib";
import { CIRC_CATEGORIES, IND_CATEGORIES } from "@/lib/types";
import type { ParsedFile, ParsedSheet } from "@/lib/import/types";
import { CLAUDE_MODEL, claude } from "./client";

/** Páginas por consulta: PDFs largos se parten para no cortar la respuesta ni perder detalle. */
const PAGES_PER_CHUNK = 6;
const CONCURRENCY = 3;

const str = { type: "string" as const };
const TOOL = {
  name: "submit_records",
  description: "Entrega los registros que aparecen en estas páginas del PDF.",
  input_schema: {
    type: "object" as const,
    properties: {
      films: {
        type: "array",
        description: "Películas, cortometrajes, series o producciones audiovisuales.",
        items: {
          type: "object",
          properties: {
            title: str,
            year: { type: "string", description: "Año de estreno o producción, solo el número." },
            kind: { type: "string", description: "ficción, documental, serie, comercial, corto u otro." },
            director: str,
            producer: str,
            nationality: { type: "string", description: "guatemalteca, coproducción o extranjera." },
            budget: { type: "string", description: "Solo el monto, tal como aparece." },
            currency: { type: "string", description: "GTQ o USD." },
            synopsis: str,
            place: { type: "string", description: "Lugar de rodaje tal como aparece (municipio, departamento o sitio)." },
            municipality: str,
            department: str,
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
            category: { type: "string", description: "Una de las categorías permitidas, la más cercana." },
            initiative_type: { type: "string", description: "pública, privada, comunitaria o transnacional." },
            place: { type: "string", description: "Ubicación tal como aparece en el documento." },
            municipality: str,
            department: str,
            website: str,
            instagram: str,
            contact: { type: "string", description: "Correo, teléfono y persona de contacto, separados por ·" },
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
Recibes páginas de un PDF (catálogo, directorio, informe, listado) y extraes SOLO los registros que aparecen: películas y entidades del ecosistema audiovisual.

Reglas:
- Transcribe lo que dice el documento. No inventes, no completes de memoria ni deduzcas datos que no estén.
- Si un dato no aparece, deja la cadena vacía. No pongas "N/A".
- Cada película o entidad se entrega una sola vez, aunque se mencione en varias páginas; usa la ficha más completa.
- Ignora portadas, índices, créditos, encabezados, pies de página y texto institucional que no describa un registro.
- Un nombre de persona NO es una entidad, salvo que sea claramente un colectivo, productora o empresa.
- Si el PDF es multicolumna, lee cada ficha completa antes de pasar a la siguiente.
- "municipality" y "department" solo si el documento los indica o si "place" nombra un municipio o departamento de Guatemala sin ambigüedad. Si el lugar está fuera de Guatemala, déjalos vacíos y conserva el texto en "place".
- Para "category" elige la categoría permitida más cercana al tipo de entidad; si ninguna encaja, la más cercana igualmente.
- Teléfonos y correos van en "contact", no en la descripción.
- Idioma de los datos: el original del documento.`;

interface RawFilm {
  title?: string;
  year?: string;
  kind?: string;
  director?: string;
  producer?: string;
  nationality?: string;
  budget?: string;
  currency?: string;
  synopsis?: string;
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

async function readChunk(bytes: Uint8Array, from: number, to: number, total: number): Promise<ChunkResult> {
  const res = await claude().messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 16000,
    system: SYSTEM,
    tools: [TOOL],
    tool_choice: { type: "tool", name: TOOL.name },
    messages: [
      {
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: Buffer.from(bytes).toString("base64") } },
          {
            type: "text",
            text:
              `Estas son las páginas ${from} a ${to} de un PDF de ${total} páginas. Extrae todos los registros.\n` +
              `Categorías permitidas para entidades de Circulación: ${CIRC_CATEGORIES.join(", ")}.\n` +
              `Categorías permitidas para entidades de Industria: ${IND_CATEGORIES.join(", ")}.`,
          },
        ],
      },
    ],
  });
  const block = res.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") return { films: [], orgs: [], notes: [] };
  const input = block.input as { films?: RawFilm[]; orgs?: RawOrg[]; notes?: string };
  const abs = (p?: number) => from - 1 + Math.max(1, Math.min(to - from + 1, Math.round(p ?? 1)));
  return {
    films: (input.films ?? []).map((f) => ({ ...f, page: abs(f.page) })),
    orgs: (input.orgs ?? []).map((o) => ({ ...o, page: abs(o.page) })),
    notes: input.notes ? [input.notes] : [],
  };
}

const key = (s?: string) =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const v = (s?: string) => (s ?? "").trim();

const FILM_HEADERS = ["Título", "Año", "Tipo", "Dirección", "Productora", "Nacionalidad", "Presupuesto", "Moneda", "Sinopsis", "Lugar", "Municipio", "Departamento", "Página del PDF"];
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

  const filmRows = new Map<string, Record<string, string>>();
  const orgRows = new Map<string, Record<string, string>>();
  const notes: string[] = [];
  for (const r of results) {
    notes.push(...r.notes);
    for (const f of r.films) {
      if (!v(f.title)) continue;
      const k = `${key(f.title)}|${v(f.year)}`;
      const row = {
        Título: v(f.title),
        Año: v(f.year),
        Tipo: v(f.kind),
        Dirección: v(f.director),
        Productora: v(f.producer),
        Nacionalidad: v(f.nationality),
        Presupuesto: v(f.budget),
        Moneda: v(f.currency),
        Sinopsis: v(f.synopsis),
        Lugar: v(f.place),
        Municipio: v(f.municipality),
        Departamento: v(f.department),
        "Página del PDF": String(f.page),
      };
      const prev = filmRows.get(k);
      // Si ya estaba, se completan solo los vacíos.
      if (prev) {
        for (const h of FILM_HEADERS) if (!prev[h] && row[h as keyof typeof row]) prev[h] = row[h as keyof typeof row];
      } else filmRows.set(k, row);
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
  if (filmRows.size) sheets.push({ name: "Películas", headers: FILM_HEADERS, rows: [...filmRows.values()], totalRows: filmRows.size });
  if (orgRows.size) sheets.push({ name: "Entidades", headers: ORG_HEADERS, rows: [...orgRows.values()], totalRows: orgRows.size });
  return { file: { filename, sheets }, pages, notes: [...new Set(notes)] };
}
