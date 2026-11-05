import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { claudePdf } from "@/lib/claude/pdf";
import { claudeEnabled } from "@/lib/claude/client";
import { heuristicPdf } from "@/lib/import/pdf-heuristic";
import type { ParsedFile } from "@/lib/import/types";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const MAX_BYTES = 25 * 1024 * 1024;

export interface PdfResponse {
  file: ParsedFile;
  engine: "claude" | "heuristic";
  pages: number;
  /** Avisos para mostrar al equipo. */
  notes: string[];
}

const total = (f: ParsedFile) => f.sheets.reduce((n, s) => n + s.totalRows, 0);

export async function POST(req: Request) {
  if (!(await getSession())) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Falta el archivo." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "El PDF pesa más de 25 MB. Divídelo en partes." }, { status: 413 });
  const data = new Uint8Array(await file.arrayBuffer());
  if (new TextDecoder("latin1").decode(data.slice(0, 5)) !== "%PDF-") {
    return NextResponse.json({ error: "Ese archivo no parece un PDF válido." }, { status: 400 });
  }

  const notes: string[] = [];

  if (claudeEnabled()) {
    try {
      const r = await claudePdf(data, file.name);
      if (total(r.file) > 0) return NextResponse.json({ file: r.file, engine: "claude", pages: r.pages, notes: r.notes } satisfies PdfResponse);
      notes.push("Claude no encontró producciones ni entidades en el PDF.");
    } catch (e) {
      console.error("[import/pdf] Claude falló:", (e as Error).message);
      notes.push(`No pudimos leer el PDF con Claude (${(e as Error).message.slice(0, 120)}). Probamos con la lectura básica.`);
    }
  }

  try {
    const r = await heuristicPdf(data, file.name);
    if (r && total(r.file) > 0) {
      const what = r.kind === "fichas" ? "fichas con etiquetas repetidas" : "tablas";
      notes.push(
        `Lectura básica del PDF (${what}). ${claudeEnabled() ? "" : "Con una clave de Claude el análisis entiende cualquier maquetación. "}Revisa bien las columnas.`,
      );
      return NextResponse.json({ file: r.file, engine: "heuristic", pages: r.pages, notes } satisfies PdfResponse);
    }
  } catch (e) {
    console.error("[import/pdf] lectura básica falló:", (e as Error).message);
  }

  return NextResponse.json(
    {
      error: claudeEnabled()
        ? "No encontramos registros que cargar en este PDF. Si es un escaneo (imágenes), conviértelo a texto o pásalo a Excel."
        : "No pudimos leer este PDF sin ayuda: no tiene una tabla ni fichas repetidas reconocibles. Configura ANTHROPIC_API_KEY para que Claude lo analice, o súbelo como Excel o CSV.",
      notes,
    },
    { status: 422 },
  );
}
