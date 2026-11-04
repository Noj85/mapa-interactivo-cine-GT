import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import type { Gazetteer } from "@/lib/geo/gazetteer";
import type { PlaceResolution } from "@/lib/import/types";
import { CLAUDE_MODEL, claude, claudeEnabled } from "./client";

const TOOLS: Anthropic.Tool[] = [
  {
    name: "lookup_municipio",
    description:
      "Busca en la lista oficial (22 departamentos, 340 municipios, con alias) y devuelve candidatos con su código. Úsala antes de decidir.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string" },
        depto_hint: { type: "string", description: "Departamento sospechado, opcional." },
      },
      required: ["query"],
    },
  },
  {
    name: "submit_resolutions",
    description: "Entrega la decisión final para cada texto de lugar.",
    input_schema: {
      type: "object",
      properties: {
        resolutions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              text: { type: "string" },
              type: { type: "string", enum: ["muni", "depto", "none"] },
              code: { type: "number", description: "Código INE del municipio o departamento." },
              confidence: { type: "number", description: "0 a 1" },
            },
            required: ["text", "type", "confidence"],
          },
        },
      },
      required: ["resolutions"],
    },
  },
];

const SYSTEM = `Eres un geocodificador de lugares de Guatemala para el Mapa del Cine de Guatemala.
Recibes textos de lugar escritos libremente en un archivo (apodos, sitios turísticos, volcanes, lagos, barrios, errores de ortografía).
Para cada uno decide el MUNICIPIO oficial donde está ese lugar, usando la herramienta lookup_municipio para obtener códigos reales. Nunca inventes códigos: usa solo los que devuelva la herramienta.
- Si el texto es un sitio dentro de un municipio (ej. "Tikal" → Flores, "Semuc Champey" → Lanquín, "Volcán de Pacaya" → San Vicente Pacaya), elige ese municipio con confianza media-alta.
- Si el lugar abarca varios municipios (ej. "Lago de Atitlán", "Petén") o es ambiguo, responde type "depto" con el departamento si es claro, o "none" si no. Confianza baja (<0.6).
- Confianza >= 0.8 solo si estás seguro.
Cuando termines con todos los textos, llama a submit_resolutions una sola vez.`;

export async function resolveWithClaude(
  texts: string[],
  gaz: Gazetteer,
  fallback: Record<string, PlaceResolution>,
): Promise<Record<string, PlaceResolution>> {
  const out: Record<string, PlaceResolution> = { ...fallback };
  if (!claudeEnabled() || texts.length === 0) return out;

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: `Textos de lugar a resolver:\n${JSON.stringify(texts)}` },
  ];

  try {
    for (let turn = 0; turn < 6; turn++) {
      const res = await claude().messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 4096,
        system: SYSTEM,
        tools: TOOLS,
        messages,
      });
      const uses = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      const final = uses.find((u) => u.name === "submit_resolutions");
      if (final) {
        const list = (final.input as { resolutions?: { text: string; type: string; code?: number; confidence: number }[] }).resolutions ?? [];
        for (const r of list) {
          if (r.type === "none" || r.code == null) continue;
          const entry = r.type === "muni" ? gaz.muni(r.code) : gaz.depto(r.code);
          if (!entry) continue; // el modelo inventó un código: se descarta
          const prev = out[r.text];
          out[r.text] = {
            status: r.confidence >= 0.8 && entry.type === "muni" ? "ok" : "ambiguous",
            muni_ine: entry.type === "muni" ? entry.code : null,
            depto_ine: entry.depto_ine,
            candidates: [
              { type: entry.type, code: entry.code, name: entry.name, depto: entry.depto },
              ...(prev?.candidates ?? []).filter((c) => !(c.type === entry.type && c.code === entry.code)),
            ].slice(0, 5),
            via: "claude",
          };
        }
        return out;
      }
      if (!uses.length) break;
      messages.push({ role: "assistant", content: res.content });
      messages.push({
        role: "user",
        content: uses.map((u) => {
          const input = u.input as { query?: string; depto_hint?: string };
          const hits = gaz.resolve(input.query ?? "", input.depto_hint ?? null).length
            ? gaz.resolve(input.query ?? "", input.depto_hint ?? null)
            : gaz.search(input.query ?? "", 5);
          return {
            type: "tool_result" as const,
            tool_use_id: u.id,
            content: JSON.stringify(
              hits.slice(0, 5).map((h) => ({ tipo: h.entry.type, codigo: h.entry.code, nombre: h.entry.name, departamento: h.entry.depto, puntaje: Number(h.score.toFixed(2)) })),
            ),
          };
        }),
      });
    }
  } catch (e) {
    console.error("[import/places] Claude falló:", (e as Error).message);
  }
  return out;
}
