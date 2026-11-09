import { NextResponse } from "next/server";
import { publicStore } from "@/lib/auth";
import { sanitizeFestivalIds } from "@/lib/festivals-server";
import { rateLimit } from "@/lib/rate-limit";
import { submissionMetaSchema, submissionSchema } from "@/lib/schemas";
import { upperTitle } from "@/lib/utils";
import type { FilmInput, OrgInput, PersonInput } from "@/lib/types";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status });

/** Recibe un aporte del público (registro nuevo o corrección). Queda «pendiente» hasta que el equipo lo revise. */
export async function POST(req: Request) {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";

  // Solo registros individuales en JSON: nada de archivos (Excel, CSV, PDF) desde el público.
  if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return fail("Aquí solo se envían registros uno por uno. Para aportar una base de datos o un archivo, escribe a contacto@academiadecinegt.org.", 415);
  }

  const raw = await req.text();
  if (raw.length > 60_000) return fail("El aporte es demasiado grande.", 413);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return fail("Solicitud no válida.");
  }

  const meta = submissionMetaSchema.safeParse(body);
  if (!meta.success) return fail(meta.error.issues[0]?.message ?? "Solicitud no válida.");
  // anti-spam: los robots llenan el campo trampa o envían demasiado rápido
  const m = meta.data;
  if (m.website_url_hp) return NextResponse.json({ ok: true }); // se descarta en silencio
  if (m.opened_at && Date.now() - m.opened_at < 4000) return fail("Revisa los datos antes de enviar.");

  const parsed = submissionSchema.safeParse(body);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Datos inválidos");
  const target = m.target_id && UUID.test(m.target_id) ? m.target_id : null;
  if (m.target_id && !target) return fail("Registro a corregir no válido.");

  // el límite solo cuenta aportes válidos, para no castigar errores de captura
  const lim = rateLimit(`aporte:${ip}`, 10, 60 * 60 * 1000);
  if (!lim.ok) return fail("Has enviado varios aportes seguidos. Intenta de nuevo en un rato.", 429);

  try {
    const store = publicStore();
    const d = parsed.data;
    if (target) {
      const exists = d.kind === "film" ? await store.getFilm(target) : d.kind === "person" ? await store.getPerson(target) : await store.getOrg(target);
      if (!exists) return fail("No encontramos el registro que quieres corregir.", 404);
    }
    if (d.kind === "film") d.data.festivals = await sanitizeFestivalIds(store, d.data.festivals);
    let payload = d.data as unknown as FilmInput | OrgInput | PersonInput;
    if (d.kind === "person") {
      const { consent: _consent, ...rest } = d.data;
      payload = rest;
    }
    await store.createSubmission({
      kind: d.kind,
      target_id: target,
      label: d.kind === "film" ? upperTitle(d.data.title) : d.data.name,
      payload,
      note: m.note,
      contact: m.contact,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[aportes]", e);
    return fail("No pudimos guardar tu aporte. Intenta de nuevo más tarde.", 500);
  }
}
