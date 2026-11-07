import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { posterThumb } from "@/lib/poster-url";
import { rateLimit } from "@/lib/rate-limit";
import { videoThumbFromUrl } from "@/lib/video";
import { normalizeVideoUrl, parseVideo } from "@/lib/video-url";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

const fail = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status });

/**
 * Busca y guarda la miniatura de un enlace de video (tráiler o película completa).
 * Equipo: se guarda con su sesión. Público: límite por IP y las imágenes quedan con el prefijo `ap-`,
 * como cualquier imagen de un aporte (se borran si el aporte se rechaza).
 * Responde `{ ok, url, thumb, provider, label, embed }`; `url` es null si la plataforma no publica miniatura.
 */
export async function POST(req: Request) {
  let body: { url?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail("Solicitud no válida.");
  }
  const raw = typeof body.url === "string" ? body.url.trim().slice(0, 500) : "";
  const link = normalizeVideoUrl(raw);
  const parsed = parseVideo(raw);
  if (!link || !parsed) return fail("El enlace no parece válido.");

  const team = !!(await getSession());
  if (!team) {
    const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";
    const lim = rateLimit(`video-thumb:${ip}`, 12, 60 * 60 * 1000);
    if (!lim.ok) return fail("Has probado varios enlaces seguidos. Intenta de nuevo en un rato.", 429);
  }

  try {
    const url = await videoThumbFromUrl(link.toString(), team ? "team" : "public");
    return NextResponse.json({ ok: true, url, thumb: posterThumb(url), provider: parsed.provider, label: parsed.label, embed: parsed.embed ?? null });
  } catch (e) {
    console.error("[videos/miniatura]", e);
    return fail("No pudimos revisar el enlace. Intenta de nuevo.", 500);
  }
}
