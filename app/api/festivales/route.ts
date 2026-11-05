import { NextResponse } from "next/server";
import { publicStore } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** Autocompletado del catálogo de festivales (público: el catálogo no tiene datos privados). */
export async function GET(req: Request) {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";
  if (!rateLimit(`festivales:${ip}`, 240, 60_000).ok) return NextResponse.json({ items: [] }, { status: 429 });

  const q = (new URL(req.url).searchParams.get("q") ?? "").slice(0, 80).trim();
  if (q.length < 2) return NextResponse.json({ items: [] });
  try {
    const { rows } = await publicStore().searchFestivals(q, { limit: 8 });
    return NextResponse.json({
      items: rows.map((f) => ({ id: f.id, name: f.name, country: f.country, city: f.city })),
    });
  } catch {
    // catálogo todavía sin crear: el campo sigue funcionando como texto libre
    return NextResponse.json({ items: [] });
  }
}
