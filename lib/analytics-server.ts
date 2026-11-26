import "server-only";
import { createHash } from "node:crypto";
import { publicStore, LOCAL_COOKIE } from "@/lib/auth";
import { cleanLabel, cleanPath, cleanSearchTerm, gtDay, isBot, parseUA, refHost, type EventKind } from "@/lib/analytics";
import { rateLimit } from "@/lib/rate-limit";

/** Lo que el sitio (o el servidor) quiere registrar; todo se vuelve a limpiar aquí. */
export interface RawEvent {
  kind: EventKind;
  path?: unknown;
  label?: unknown;
  /** Página desde la que llegó la persona (solo se guarda el dominio). */
  ref?: unknown;
  meta?: Record<string, unknown> | null;
}

const cookieNames = (req: Request) =>
  (req.headers.get("cookie") ?? "")
    .split(";")
    .map((c) => c.split("=")[0].trim())
    .filter(Boolean);

/** Quien tiene sesión del equipo no se cuenta: así las visitas del propio equipo no inflan los números. */
function isTeamRequest(req: Request) {
  return cookieNames(req).some((n) => n === LOCAL_COOKIE || (n.startsWith("sb-") && n.includes("auth-token")));
}

/** Hash que cambia cada día: sirve para contar visitantes únicos por día sin guardar la IP. */
function visitorHash(ip: string, ua: string) {
  const salt = process.env.ANALYTICS_SALT || "mapa-cine-gt";
  return createHash("sha256").update(`${salt}|${gtDay(Date.now())}|${ip}|${ua}`).digest("hex").slice(0, 32);
}

/**
 * Registra un evento de forma anónima. Nunca falla hacia afuera: si algo sale mal (la migración 0023 aún no
 * está aplicada, Supabase no responde...) se ignora, porque medir visitas jamás debe romper el sitio.
 * Devuelve true si se guardó.
 */
export async function recordServerEvent(req: Request, raw: RawEvent): Promise<boolean> {
  try {
    const h = req.headers;
    if (h.get("dnt") === "1" || h.get("sec-gpc") === "1") return false;
    const ua = h.get("user-agent") ?? "";
    if (isBot(ua) || isTeamRequest(req)) return false;
    const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";
    if (!rateLimit(`track:${ip}`, 240, 60_000).ok) return false;

    const path = cleanPath(raw.path);
    if (path && (path.startsWith("/admin") || path.startsWith("/api") || path.startsWith("/auth"))) return false;
    const label = raw.kind === "search" ? cleanSearchTerm(raw.label) : cleanLabel(raw.label);
    if (raw.kind === "view" && !path) return false;
    if (raw.kind !== "view" && !label) return false;

    const { device, browser } = parseUA(ua);
    const country = (h.get("x-vercel-ip-country") ?? "").toUpperCase();
    await publicStore().recordEvent({
      kind: raw.kind,
      path: raw.kind === "view" ? path : null,
      visitor: visitorHash(ip, ua),
      country: /^[A-Z]{2}$/.test(country) ? country : null,
      device,
      browser,
      ref_host: raw.kind === "view" ? refHost(raw.ref, h.get("host")) : null,
      label: raw.kind === "view" ? null : label,
      meta: raw.meta ?? null,
    });
    return true;
  } catch {
    return false;
  }
}
