import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { claudeEnabled } from "@/lib/claude/client";
import { extractEntries, type ExtractResult } from "@/lib/claude/extract";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

/** Filas por consulta: el navegador manda los lotes y muestra el avance. */
const MAX_ROWS_PER_CALL = 25;

const list = z.array(z.string().max(200)).max(40).optional();
const body = z.object({
  concepts: z.array(z.enum(["location", "festival", "company"])).min(1).max(3),
  rows: z
    .array(
      z.object({
        id: z.string().max(120),
        title: z.string().max(300),
        year: z.string().max(10).nullish(),
        texts: z.array(z.object({ header: z.string().max(300), text: z.string().max(6000) })).min(1).max(6),
        known: z.object({ locations: list, festivals: list, companies: list }).optional(),
      }),
    )
    .min(1)
    .max(MAX_ROWS_PER_CALL),
});

export interface ExtractResponse {
  results: ExtractResult[];
}

export async function POST(req: Request) {
  if (!(await getSession())) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!claudeEnabled()) return NextResponse.json({ error: "Claude no está configurado." }, { status: 503 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  try {
    // un reintento por lote: la respuesta puede cortarse o no tener la forma esperada
    let results: ExtractResult[];
    try {
      results = await extractEntries(parsed.data.rows, parsed.data.concepts);
    } catch (e) {
      console.error("[import/extract] primer intento falló:", e instanceof Error ? e.message : e);
      results = await extractEntries(parsed.data.rows, parsed.data.concepts);
    }
    return NextResponse.json({ results } satisfies ExtractResponse);
  } catch (e) {
    console.error("[import/extract] Claude falló:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "No pudimos leer estos textos con Claude." }, { status: 502 });
  }
}
