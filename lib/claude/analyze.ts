import "server-only";
import { z } from "zod";
import { heuristicPlan } from "@/lib/import/heuristic";
import { FILM_FIELDS, ORG_FIELDS, type ImportPlan, type ParsedFile, type SheetPlan } from "@/lib/import/types";
import { CIRC_CATEGORIES, IND_CATEGORIES } from "@/lib/types";
import { CLAUDE_MODEL, claude, claudeEnabled } from "./client";

const planSchema = z.object({
  summary: z.string().default(""),
  sheets: z.array(
    z.object({
      sheet: z.string(),
      entity: z.enum(["film", "org", "ignore"]),
      layer: z.enum(["circulacion", "industria"]).nullish(),
      grain: z.enum(["row_per_film", "row_per_location"]).default("row_per_film"),
      columns: z.record(z.string(), z.string()).default({}),
      confidence: z.record(z.string(), z.number()).default({}),
      multi_place: z.boolean().nullish(),
      value_maps: z.record(z.string(), z.record(z.string(), z.string())).nullish(),
      note: z.string().nullish(),
    }),
  ),
  questions: z
    .array(
      z.object({
        id: z.string(),
        question: z.string(),
        options: z.array(z.string()).nullish(),
        sheet: z.string().nullish(),
        field: z.string().nullish(),
      }),
    )
    .default([]),
});

const TOOL = {
  name: "submit_plan",
  description: "Entrega el plan de importación: qué representa cada hoja y a qué campo corresponde cada columna.",
  input_schema: {
    type: "object" as const,
    properties: {
      summary: { type: "string", description: "Resumen en español, una o dos frases, de lo que contiene el archivo." },
      sheets: {
        type: "array",
        items: {
          type: "object",
          properties: {
            sheet: { type: "string", description: "Nombre exacto de la hoja." },
            entity: { type: "string", enum: ["film", "org", "ignore"] },
            layer: { type: "string", enum: ["circulacion", "industria"], description: "Solo si entity=org." },
            grain: { type: "string", enum: ["row_per_film", "row_per_location"] },
            columns: {
              type: "object",
              description: "campo destino -> encabezado EXACTO de la columna del archivo.",
              additionalProperties: { type: "string" },
            },
            confidence: { type: "object", description: "campo destino -> confianza 0 a 1.", additionalProperties: { type: "number" } },
            multi_place: { type: "boolean", description: "true si una celda de lugar puede traer varios lugares separados por ; o saltos de línea." },
            value_maps: {
              type: "object",
              description: "Para campos de lista (kind, nationality, initiative_type, category): valor crudo del archivo -> valor canónico.",
              additionalProperties: { type: "object", additionalProperties: { type: "string" } },
            },
            note: { type: "string" },
          },
          required: ["sheet", "entity", "grain", "columns", "confidence"],
        },
      },
      questions: {
        type: "array",
        description: "Dudas reales sobre el significado del archivo (máximo 5). No preguntes por datos faltantes de cada fila.",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            question: { type: "string" },
            options: { type: "array", items: { type: "string" } },
            sheet: { type: "string" },
            field: { type: "string" },
          },
          required: ["id", "question"],
        },
      },
    },
    required: ["summary", "sheets", "questions"],
  },
};

const cut = (s: string, n = 140) => (s.length > n ? `${s.slice(0, n)}…` : s);

function sample(file: ParsedFile) {
  return file.sheets.map((s) => {
    const head = s.rows.slice(0, 18);
    const tail = s.rows.length > 30 ? s.rows.slice(-4) : [];
    return {
      sheet: s.name,
      totalRows: s.totalRows,
      headers: s.headers,
      sampleRows: [...head, ...tail].map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, cut(v)]))),
    };
  });
}

const SYSTEM = `Eres el asistente de carga del "Mapa del Cine de Guatemala", de la Academia de Cine de Guatemala.
Recibes la estructura de un archivo CSV/XLSX con formato libre y debes decidir cómo mapearlo a la base de datos. Tu trabajo es SOLO el mapeo: el código procesará las filas después.

Reglas:
- Cada hoja representa películas ("film"), entidades del ecosistema ("org") o nada útil ("ignore").
- Película: "row_per_film" = una fila por película; "row_per_location" = el título se repite y cada fila es una locación distinta.
- Entidades: "circulacion" (festivales, salas, cineclubs, centros culturales, exhibición, medios, crítica, formación en circulación) o "industria" (productoras, postproducción, renta de equipo, formación, servicios, patrimonio).
- En "columns" usa SIEMPRE el encabezado exacto del archivo. Si una columna no corresponde a ningún campo, no la incluyas. No inventes columnas.
- Si hay una sola columna con el lugar completo (ej. "Panajachel, Sololá" o "Antigua; Flores"), mapea "place". Si hay columnas separadas, mapea "muni" y "depto".
- "confidence" es honesta: baja (<0.6) si dudas.
- En "value_maps" normaliza los valores distintos que veas en columnas de lista (tipo de película, nacionalidad, naturaleza de la iniciativa, categoría) hacia los valores canónicos.
- Sé breve y concreto. Haz preguntas solo si el significado de una columna es realmente ambiguo (ej. una columna "Fecha": ¿estreno o rodaje?).
- Idioma de resumen y preguntas: español de Guatemala, tono cercano.`;

export async function analyzeFile(file: ParsedFile): Promise<ImportPlan> {
  if (!claudeEnabled()) return heuristicPlan(file);

  const catalog = {
    campos_pelicula: FILM_FIELDS.map((f) => ({ id: f.id, nombre: f.label, pista: f.hint })),
    campos_entidad: ORG_FIELDS.map((f) => ({ id: f.id, nombre: f.label, pista: f.hint })),
    categorias_circulacion: CIRC_CATEGORIES,
    categorias_industria: IND_CATEGORIES,
    valores_kind: ["ficcion", "documental", "serie", "comercial", "corto", "otro"],
    valores_nationality: ["guatemalteca", "coproduccion", "extranjera"],
    valores_initiative_type: ["publica", "privada", "comunitaria", "transnacional"],
  };

  try {
    const res = await claude().messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      system: SYSTEM,
      tools: [TOOL],
      tool_choice: { type: "tool", name: TOOL.name },
      messages: [
        {
          role: "user",
          content: `Catálogo de campos destino:\n${JSON.stringify(catalog)}\n\nArchivo "${file.filename}":\n${JSON.stringify(sample(file))}`,
        },
      ],
    });
    const block = res.content.find((b) => b.type === "tool_use");
    if (!block || block.type !== "tool_use") throw new Error("Sin plan en la respuesta");
    const parsed = planSchema.parse(block.input);

    // Limpieza: solo columnas que existen de verdad en cada hoja.
    const sheets: SheetPlan[] = parsed.sheets
      .filter((sp) => file.sheets.some((s) => s.name === sp.sheet))
      .map((sp) => {
        const headers = new Set(file.sheets.find((s) => s.name === sp.sheet)!.headers);
        const columns: Record<string, string> = {};
        const confidence: Record<string, number> = {};
        for (const [field, header] of Object.entries(sp.columns)) {
          if (!headers.has(header)) continue;
          columns[field] = header;
          confidence[field] = Math.max(0, Math.min(1, sp.confidence[field] ?? 0.6));
        }
        return {
          sheet: sp.sheet,
          entity: sp.entity,
          layer: sp.entity === "org" ? (sp.layer ?? "circulacion") : undefined,
          grain: sp.grain,
          columns,
          confidence,
          multi_place: sp.multi_place ?? false,
          value_maps: sp.value_maps ?? undefined,
          note: sp.note ?? undefined,
        };
      });
    // Hojas que el modelo omitió: ignorar explícitamente.
    for (const s of file.sheets) {
      if (!sheets.some((x) => x.sheet === s.name))
        sheets.push({ sheet: s.name, entity: "ignore", grain: "row_per_film", columns: {}, confidence: {} });
    }
    return {
      sheets,
      engine: "claude",
      summary: parsed.summary,
      questions: parsed.questions.map((q) => ({
        id: q.id,
        question: q.question,
        options: q.options ?? undefined,
        sheet: q.sheet ?? undefined,
        field: q.field ?? undefined,
      })),
    };
  } catch (e) {
    console.error("[import/analyze] Claude falló, uso el modo sin conexión:", (e as Error).message);
    const plan = heuristicPlan(file);
    plan.summary = `No pudimos consultar a Claude (${(e as Error).message.slice(0, 80)}). ` + plan.summary;
    return plan;
  }
}
