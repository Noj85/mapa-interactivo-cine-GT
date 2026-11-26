import { recordServerEvent } from "@/lib/analytics-server";
import { EVENT_KINDS, type EventKind } from "@/lib/analytics";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const done = () => new Response(null, { status: 204 });

/**
 * Registro anónimo de visitas y uso del mapa. Siempre responde 204, haya o no guardado el evento
 * (bots, equipo, «no rastrear»...), para no dar pistas ni estorbar al sitio.
 *
 * Cuerpo JSON: { kind, path?, label?, ref? }   (ver lib/analytics.ts y supabase/migrations/0023_analytics.sql)
 */
export async function POST(req: Request) {
  try {
    const raw = await req.text();
    if (raw.length > 2000) return done();
    const b = JSON.parse(raw) as { kind?: unknown; path?: unknown; label?: unknown; ref?: unknown };
    if (!EVENT_KINDS.includes(b.kind as EventKind)) return done();
    await recordServerEvent(req, { kind: b.kind as EventKind, path: b.path, label: b.label, ref: b.ref });
  } catch {
    // JSON inválido u otro problema: no se registra nada
  }
  return done();
}
