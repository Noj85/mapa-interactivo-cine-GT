import { NextResponse } from "next/server";
import { z } from "zod";
import { analyzeFile } from "@/lib/claude/analyze";
import { getSession } from "@/lib/auth";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

const body = z.object({
  filename: z.string().max(300),
  sheets: z
    .array(
      z.object({
        name: z.string().max(200),
        headers: z.array(z.string().max(300)).max(200),
        rows: z.array(z.record(z.string(), z.string())).max(60),
        totalRows: z.number(),
        layout: z.enum(["dos filas", "ficha"]).optional(),
        subHeaders: z.record(z.string().max(300), z.string().max(300)).optional(),
        // valores distintos de las columnas tipo lista, calculados en el navegador sobre todas las filas
        distinct: z
          .record(z.string().max(300), z.array(z.object({ v: z.string().max(200), n: z.number() })).max(40))
          .optional(),
      }),
    )
    .max(40),
  instructions: z.string().max(2000).optional(),
});

export async function POST(req: Request) {
  if (!(await getSession())) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Archivo inválido" }, { status: 400 });
  const { instructions, ...file } = parsed.data;
  const distinct = Object.fromEntries(file.sheets.map((s) => [s.name, s.distinct ?? {}]));
  const plan = await analyzeFile(
    { filename: file.filename, sheets: file.sheets.map(({ distinct: _d, ...s }) => s) },
    { instructions, distinct },
  );
  return NextResponse.json(plan);
}
