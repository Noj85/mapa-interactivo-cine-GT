import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { posterThumb } from "@/lib/poster-url";
import { POSTER_MAX_BYTES, PosterError, storeImage } from "@/lib/posters";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Sube un póster o un logo (multipart: «file» y opcional «kind» = poster | logo). Solo el equipo. */
export async function POST(req: Request) {
  if (!(await getSession())) return NextResponse.json({ error: "Tu sesión expiró. Vuelve a entrar." }, { status: 401 });
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "No se pudo leer el archivo." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Falta el archivo." }, { status: 400 });
  const kind = form.get("kind") === "logo" ? "logo" : "poster";
  if (file.size > POSTER_MAX_BYTES) return NextResponse.json({ error: "La imagen pesa más de 5 MB." }, { status: 413 });
  try {
    const url = await storeImage(Buffer.from(await file.arrayBuffer()), kind);
    return NextResponse.json({ url, thumb: posterThumb(url) });
  } catch (e) {
    if (e instanceof PosterError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error("[posters]", e);
    return NextResponse.json({ error: "No se pudo guardar la imagen." }, { status: 500 });
  }
}
