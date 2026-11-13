import { NextResponse } from "next/server";
import { publicStore } from "@/lib/auth";
import { loadDatasetCached } from "@/lib/data/load";
import { serverGazetteer } from "@/lib/geo/server";
import { personRoleLabels } from "@/lib/people";
import { rateLimit } from "@/lib/rate-limit";
import { rankSimilar, SIMILAR_MIN_CHARS, type SimilarKind, type SimilarRecord } from "@/lib/similar";

export const dynamic = "force-dynamic";

const KINDS = new Set<SimilarKind>(["film", "org", "person"]);
const none = () => NextResponse.json({ ok: true, matches: [] satisfies SimilarRecord[] });

/**
 * Fichas publicadas que se parecen a lo que alguien está escribiendo en /aportar.
 * Compara solo con el campo principal (título o nombre) y devuelve únicamente datos que ya son públicos.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind") as SimilarKind | null;
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 300);
  if (!kind || !KINDS.has(kind)) return NextResponse.json({ ok: false, error: "Tipo no válido." }, { status: 400 });
  if (q.length < SIMILAR_MIN_CHARS) return none();

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";
  const lim = rateLimit(`similares:${ip}`, 60, 60 * 1000);
  if (!lim.ok) return NextResponse.json({ ok: false, error: "Demasiadas consultas seguidas." }, { status: 429, headers: { "retry-after": String(lim.retryAfter) } });

  try {
    const gaz = await serverGazetteer();
    const place = (depto: number | null) => (depto != null ? gaz.depto(depto)?.name ?? null : null);
    const line = (...parts: (string | number | null | undefined)[]) => parts.filter((x) => x != null && String(x).trim() !== "").join(" · ");
    let matches: SimilarRecord[] = [];

    if (kind === "person") {
      const people = await publicStore().listPeople().catch(() => []);
      matches = rankSimilar(q, people, (p) => p.name, kind).map(({ item: p, exact }) => ({
        kind,
        id: p.id,
        slug: p.slug,
        label: p.name,
        detail: line(personRoleLabels(p).slice(0, 3).join(", "), place(p.depto_ine)),
        exact,
      }));
    } else {
      const data = await loadDatasetCached();
      if (kind === "film") {
        matches = rankSimilar(q, data.films, (f) => f.title, kind).map(({ item: f, exact }) => ({
          kind,
          id: f.id,
          slug: f.slug,
          label: f.title,
          detail: line(f.year, f.director),
          exact,
        }));
      } else {
        matches = rankSimilar(q, data.orgs, (o) => o.name, kind).map(({ item: o, exact }) => ({
          kind,
          id: o.id,
          slug: o.slug,
          label: o.name,
          detail: line(o.category, place(o.depto_ine)),
          exact,
        }));
      }
    }
    return NextResponse.json({ ok: true, matches });
  } catch (e) {
    console.error("[similares]", e);
    return none();
  }
}
