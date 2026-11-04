import { NextResponse } from "next/server";
import { posterThumb } from "@/lib/poster-url";
import { PosterError, PUBLIC_IMAGE_MAX_BYTES, storeImage } from "@/lib/posters";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const fail = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status });

/**
 * Imagen de un aporte público (póster o logo). Un solo archivo por solicitud.
 * Defensas: límite por IP, 3 MB, solo JPG/PNG/WebP (SVG y demás se rechazan) y re-codificación
 * completa a WebP, de modo que lo que se guarda nunca es el archivo original.
 */
export async function POST(req: Request) {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";
  if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("multipart/form-data")) {
    return fail("Envía la imagen como archivo.", 415);
  }
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > PUBLIC_IMAGE_MAX_BYTES + 64 * 1024) return fail("La imagen pesa más de 3 MB.", 413);

  const lim = rateLimit(`imagen:${ip}`, 6, 60 * 60 * 1000);
  if (!lim.ok) return fail("Has subido varias imágenes seguidas. Intenta de nuevo en un rato.", 429);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail("No se pudo leer el archivo.");
  }
  const files = form.getAll("file");
  if (files.length !== 1 || !(files[0] instanceof File)) return fail("Sube una sola imagen.");
  const file = files[0];
  if (file.size > PUBLIC_IMAGE_MAX_BYTES) return fail("La imagen pesa más de 3 MB.", 413);
  const kind = form.get("kind") === "logo" ? "logo" : "poster";

  try {
    const url = await storeImage(Buffer.from(await file.arrayBuffer()), kind, { origin: "public", maxBytes: PUBLIC_IMAGE_MAX_BYTES });
    return NextResponse.json({ ok: true, url, thumb: posterThumb(url) });
  } catch (e) {
    if (e instanceof PosterError) return fail(e.message);
    console.error("[aportes/imagen]", e);
    return fail("No pudimos guardar la imagen. Intenta de nuevo.", 500);
  }
}
