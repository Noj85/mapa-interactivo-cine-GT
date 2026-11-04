import "server-only";

/**
 * Límite simple por IP en memoria. Frena el abuso básico de los formularios públicos;
 * en un despliegue serverless cada instancia cuenta por separado, así que no sustituye
 * un límite en el borde (Vercel Firewall / Cloudflare) si hiciera falta algo más estricto.
 */
const hits = new Map<string, number[]>();

export function rateLimit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    hits.set(key, recent);
    return { ok: false as const, retryAfter: Math.ceil((windowMs - (now - recent[0])) / 1000) };
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
  return { ok: true as const };
}
