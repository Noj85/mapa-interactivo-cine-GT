import { z } from "zod";

/** Claude a veces entrega una lista como JSON en texto, un solo objeto, o un objeto como cadena. */
export function asArray(v: unknown): unknown {
  if (Array.isArray(v)) return v;
  if (v == null) return v;
  if (typeof v === "object") return [v];
  if (typeof v === "string") {
    const t = v.trim();
    if (!t) return [];
    try {
      const parsed = JSON.parse(t);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      /* el texto no era JSON: una sola frase cuenta como un elemento */
    }
    return [t];
  }
  return v;
}

export function asObject(v: unknown): unknown {
  if (v && typeof v === "object" && !Array.isArray(v)) return v;
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch {
      /* se deja tal cual para que el esquema falle con claridad */
    }
  }
  return v;
}

export function unwrapInput(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

const sheetSchema = z.object({
  sheet: z.string(),
  entity: z.enum(["film", "org", "ignore"]),
  layer: z.enum(["circulacion", "industria"]).nullish(),
  layer_by_row: z.boolean().nullish(),
  grain: z.enum(["row_per_film", "row_per_location"]).default("row_per_film"),
  columns: z.preprocess(asObject, z.record(z.string(), z.string()).default({})),
  confidence: z.preprocess(asObject, z.record(z.string(), z.number()).default({})),
  multi_place: z.boolean().nullish(),
  value_maps: z.preprocess(asObject, z.record(z.string(), z.record(z.string(), z.string())).nullish()),
  note: z.string().nullish(),
});

export const planSchema = z.object({
  summary: z.string().default(""),
  instructions_applied: z.preprocess(asArray, z.array(z.string()).default([])),
  sheets: z.preprocess(asArray, z.array(sheetSchema)),
  questions: z.preprocess(
    asArray,
    z
      .array(
        z.object({
          id: z.string(),
          question: z.string(),
          options: z.preprocess(asArray, z.array(z.string()).nullish()),
          sheet: z.string().nullish(),
          field: z.string().nullish(),
          value: z.string().nullish(),
        }),
      )
      .default([]),
  ),
});

export type ClaudePlan = z.infer<typeof planSchema>;

export function parseClaudePlan(raw: unknown): ClaudePlan {
  return planSchema.parse(unwrapInput(raw));
}

/** Frase corta para la pantalla: no se muestra el JSON de validación. */
export function claudeFailReason(e: unknown, stopReason?: string | null): string {
  if (stopReason === "max_tokens") return "la respuesta de Claude llegó incompleta";
  if (stopReason === "refusal") return "Claude no pudo completar el análisis de este archivo";
  const issues = e && typeof e === "object" && "issues" in e ? (e as z.ZodError).issues : null;
  if (issues?.length) {
    const first = issues[0];
    const root = first?.path[0];
    if (first?.code === "invalid_type" && (root === "sheets" || root === undefined)) {
      return "la respuesta de Claude llegó incompleta";
    }
    return "la respuesta de Claude no tuvo la forma esperada";
  }
  const msg = e instanceof Error ? e.message : String(e ?? "");
  if (/incompleta|max_tokens|Sin plan|incomplete/i.test(msg)) return "la respuesta de Claude llegó incompleta";
  if (/api.?key|401|unauthorized/i.test(msg)) return "no se pudo autenticar con Claude";
  if (/timeout|timed out|ECONNRESET|fetch failed/i.test(msg)) return "se agotó el tiempo de espera de Claude";
  return "no se pudo completar la consulta";
}
