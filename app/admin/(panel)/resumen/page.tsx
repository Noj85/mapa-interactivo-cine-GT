import { AlertCircle, ArrowRight, Clapperboard, Inbox, Landmark } from "lucide-react";
import Link from "next/link";
import { ExportLinks } from "@/components/admin/ExportLinks";
import { QuestionRow } from "@/components/admin/QuestionRow";
import { CompletenessBadge } from "@/components/ui/Badges";
import { adminStore } from "@/lib/auth";

export default async function AdminHome() {
  const store = await adminStore();
  const [films, orgs, questions, submissions] = await Promise.all([
    store.listFilms({ drafts: true }),
    store.listOrgs({ drafts: true }),
    store.listQuestions(),
    store.listSubmissions({ status: "pending" }).catch(() => []),
  ]);

  const pendingFilms = films.filter((f) => f.completeness < 100 || f.status === "draft");
  const pendingOrgs = orgs.filter((o) => o.completeness < 100 || o.status === "draft");
  const pending = [
    ...pendingFilms.map((f) => ({ kind: "film" as const, id: f.id, name: f.title, c: f.completeness, miss: f.missing_fields, draft: f.status === "draft", slug: f.slug })),
    ...pendingOrgs.map((o) => ({ kind: "org" as const, id: o.id, name: o.name, c: o.completeness, miss: o.missing_fields, draft: o.status === "draft", slug: o.slug })),
  ].sort((a, b) => a.c - b.c);
  const openQs = questions.filter((q) => q.status !== "answered");
  const labelOf = (ref: string | null) => {
    if (!ref) return undefined;
    const [k, ...rest] = ref.split(":");
    const slug = rest.join(":");
    const name = k === "film" ? films.find((f) => f.slug === slug)?.title : orgs.find((o) => o.slug === slug)?.name;
    return name ?? undefined;
  };

  const stat = (label: string, value: number | string, sub?: string) => (
    <div className="rounded-2xl border border-line bg-surface px-4 py-3.5">
      <div className="font-display text-3xl tracking-tight">{value}</div>
      <div className="mt-1 text-xs text-muted">{label}</div>
      {sub && <div className="text-[11px] text-muted/70">{sub}</div>}
    </div>
  );

  return (
    <div>
      <div>
        <h1 className="font-display text-4xl tracking-tight">Resumen</h1>
        <p className="mt-1 text-sm text-muted">Lo que falta para que el mapa esté completo.</p>
      </div>

      {submissions.length > 0 && (
        <Link
          href="/admin/aportes"
          className="mt-6 flex items-center gap-3 rounded-2xl border border-accent/40 bg-accent/5 px-4 py-3 transition-colors hover:bg-accent/10"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-accent-ink">
            <Inbox className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-display text-[15px]">
              {submissions.length} {submissions.length === 1 ? "aporte por revisar" : "aportes por revisar"}
              {submissions.some((x) => x.origin === "recopilacion") && ` (${submissions.filter((x) => x.origin === "recopilacion").length} de recopilación)`}
            </span>
            <span className="block truncate text-xs text-muted">{submissions.slice(0, 3).map((x) => x.label).join(" · ")}</span>
          </span>
          <ArrowRight className="h-4 w-4 text-muted" />
        </Link>
      )}

      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {stat("Producciones registradas", films.length, `${films.filter((f) => f.status === "published").length} en el mapa`)}
        {stat("Entidades registradas", orgs.length, `${orgs.filter((o) => o.status === "published").length} en el mapa`)}
        {stat("Con información pendiente", pending.length)}
        {stat("Preguntas sin responder", openQs.length)}
      </div>

      <ExportLinks />

      <section className="mt-10">
        <h2 className="mb-3 text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Para completar</h2>
        {pending.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line px-4 py-10 text-center text-sm text-muted">
            Todo al día.{" "}
            {films.length + orgs.length === 0 && (
              <>
                Empieza en <Link className="text-accent underline" href="/admin/agregar">Agregar datos</Link>.
              </>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {pending.slice(0, 25).map((p) => (
              <li key={p.kind + p.id}>
                <Link
                  href={p.kind === "film" ? `/admin/peliculas/${p.id}` : `/admin/entidades/${p.id}`}
                  className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2/60"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/12 text-accent">
                    {p.kind === "film" ? <Clapperboard className="h-4 w-4" /> : <Landmark className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-display text-[15px]">{p.name}</span>
                      {p.draft && <span className="chip !py-0 text-[11px]">Oculto del mapa</span>}
                    </span>
                    <span className="block truncate text-xs text-muted">
                      <AlertCircle className="mr-1 inline h-3 w-3 text-warn" />
                      Falta: {p.miss.join(", ") || "revisar"}
                    </span>
                  </span>
                  <CompletenessBadge pct={p.c} compact />
                  <ArrowRight className="h-4 w-4 text-muted transition-transform group-hover:translate-x-0.5" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {openQs.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Preguntas pendientes</h2>
          <ul className="space-y-2">
            {openQs.slice(0, 20).map((q) => (
              <QuestionRow key={q.id} q={q} label={labelOf(q.record_ref)} />
            ))}
          </ul>
        </section>
      )}

    </div>
  );
}
