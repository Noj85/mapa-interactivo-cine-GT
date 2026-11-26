import type { EventKind } from "@/lib/analytics";

/**
 * Registro anónimo de visitas y uso del mapa (lado del navegador). No usa cookies ni guarda nada en el
 * dispositivo; el servidor filtra bots, al equipo y a quien pida «no rastrear» (ver lib/analytics-server.ts).
 * Nunca lanza errores: medir no debe romper el sitio.
 */
const recent = new Map<string, number>();
let firstView = true;

export function track(kind: EventKind, label?: string | null, path?: string) {
  if (typeof window === "undefined") return;
  try {
    if (navigator.doNotTrack === "1") return;
    const where = path ?? window.location.pathname;
    if (where.startsWith("/admin")) return;
    // el mismo evento seguido (p. ej. efectos que corren dos veces en desarrollo) se cuenta una sola vez
    const key = `${kind}|${label ?? where}`;
    const now = Date.now();
    if (now - (recent.get(key) ?? 0) < 3000) return;
    recent.set(key, now);
    const body = JSON.stringify({
      kind,
      label: label ?? undefined,
      path: where,
      // el origen solo se manda en la primera página de la visita (después, document.referrer sigue siendo el mismo)
      ref: kind === "view" && firstView ? document.referrer : undefined,
    });
    if (kind === "view") firstView = false;
    const sent = navigator.sendBeacon?.("/api/track", new Blob([body], { type: "application/json" }));
    if (!sent) void fetch("/api/track", { method: "POST", body, keepalive: true, headers: { "content-type": "application/json" } }).catch(() => {});
  } catch {
    // sin medición, el sitio sigue igual
  }
}
