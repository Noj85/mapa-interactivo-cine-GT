import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { claudeText } from "@/lib/claude/pdf";
import { claudeEnabled } from "@/lib/claude/client";
import { MAX_DOC_CHARS, docTables, docToText, proseLength, readDocx } from "@/lib/import/docx";
import type { ParsedFile } from "@/lib/import/types";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const MAX_BYTES = 15 * 1024 * 1024;

export interface DocxResponse {
  file: ParsedFile;
  /** "claude" si leyó el texto el modelo; "heuristic" si se usaron las tablas del documento. */
  engine: "claude" | "heuristic";
  notes: string[];
}

const total = (f: ParsedFile) => f.sheets.reduce((n, s) => n + s.totalRows, 0);

export async function POST(req: Request) {
  if (!(await getSession())) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Falta el archivo." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "El documento pesa más de 15 MB. Divídelo en partes." }, { status: 413 });
  const data = new Uint8Array(await file.arrayBuffer());
  if (data[0] === 0xd0 && data[1] === 0xcf) {
    return NextResponse.json({ error: "Este es un Word antiguo (.doc). Ábrelo en Word y guárdalo como .docx, o súbelo como PDF." }, { status: 400 });
  }
  if (data[0] !== 0x50 || data[1] !== 0x4b) {
    return NextResponse.json({ error: "Ese archivo no parece un documento de Word (.docx) válido." }, { status: 400 });
  }

  let blocks;
  try {
    blocks = readDocx(data);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  const tables = docTables(blocks);
  const prose = proseLength(blocks);
  const notes: string[] = [];
  const tableFile = (): NextResponse => {
    const hasProse = prose > 1500;
    notes.push(
      `Lectura de las tablas del documento (${tables.sheets.length} ${tables.sheets.length === 1 ? "tabla" : "tablas"}, ${tables.rows} filas).` +
        (hasProse ? " El texto fuera de las tablas no se incluyó." : "") +
        (claudeEnabled() ? "" : " Con una clave de Claude el análisis también entiende texto corrido y fichas."),
    );
    return NextResponse.json({ file: { filename: file.name, sheets: tables.sheets }, engine: "heuristic", notes } satisfies DocxResponse);
  };

  // Un documento hecho de tablas con muchas filas se lee directo (más exacto y sin costo); el texto corrido o las fichas, con Claude.
  const tableLed = tables.rows >= 20 || (tables.rows > 0 && prose <= 1500);
  if (claudeEnabled() && !(tableLed && tables.sheets.length > 0)) {
    const parts = docToText(blocks);
    const chars = parts.reduce((n, p) => n + p.length, 0);
    if (chars > MAX_DOC_CHARS) {
      return NextResponse.json({ error: "El documento es demasiado extenso para analizarlo de una vez. Divídelo en partes." }, { status: 413 });
    }
    if (parts.length) {
      try {
        const r = await claudeText(parts, file.name);
        if (total(r.file) > 0) return NextResponse.json({ file: r.file, engine: "claude", notes: r.notes } satisfies DocxResponse);
        notes.push("Claude no encontró producciones ni entidades en el documento.");
      } catch (e) {
        console.error("[import/docx] Claude falló:", (e as Error).message);
        notes.push(`No pudimos leer el documento con Claude (${(e as Error).message.slice(0, 120)}). Probamos con la lectura básica.`);
      }
    }
  }

  if (tables.sheets.length > 0) return tableFile();

  return NextResponse.json(
    {
      error: claudeEnabled()
        ? "No encontramos registros que cargar en este documento."
        : "Este documento no tiene tablas que podamos leer sin ayuda. Configura ANTHROPIC_API_KEY para que Claude lea texto y fichas, o pasa los datos a una tabla de Word, Excel o CSV.",
      notes,
    },
    { status: 422 },
  );
}
