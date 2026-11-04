import { NextResponse } from "next/server";
import { z } from "zod";
import { analyzeFile } from "@/lib/claude/analyze";
import { getSession } from "@/lib/auth";

export const maxDuration = 60;
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
      }),
    )
    .max(40),
});

export async function POST(req: Request) {
  if (!(await getSession())) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Archivo inválido" }, { status: 400 });
  const plan = await analyzeFile(parsed.data);
  return NextResponse.json(plan);
}
