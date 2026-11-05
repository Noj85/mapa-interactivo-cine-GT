import { ArrowRight, Clapperboard, Inbox, Landmark } from "lucide-react";
import Link from "next/link";
import { adminStore } from "@/lib/auth";
import type { SubmissionOrigin, SubmissionStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const TABS: { id: SubmissionStatus; label: string }[] = [
  { id: "pending", label: "Pendientes" },
  { id: "approved", label: "Aprobados" },
  { id: "rejected", label: "Rechazados" },
];

const ORIGINS: { id: "todos" | SubmissionOrigin; label: string }[] = [
  { id: "todos", label: "Todos" },
  { id: "publico", label: "Del público" },
  { id: "recopilacion", label: "Recopilación" },
];

export default async function AportesPage({ searchParams }: { searchParams: Promise<{ estado?: string; origen?: string }> }) {
  const { estado, origen } = await searchParams;
  const status = (TABS.find((t) => t.id === estado)?.id ?? "pending") as SubmissionStatus;
  const origin = ORIGINS.find((o) => o.id === origen)?.id ?? "todos";
  const everything = await (await adminStore()).listSubmissions();
  const all = origin === "todos" ? everything : everything.filter((x) => x.origin === origin);
  const count = (s: SubmissionStatus) => all.filter((x) => x.status === s).length;
  const list = all.filter((x) => x.status === status);
  const href = (e: SubmissionStatus, o: string) => `/admin/aportes?estado=${e}${o !== "todos" ? `&origen=${o}` : ""}`;

  return (
    <div>
      <h1 className="font-display text-4xl tracking-tight">Aportes</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        Propuestas del público y datos que envió el equipo de una producción desde un enlace de recopilación. No se publican hasta que las revises: puedes aprobarlas tal cual, editarlas antes o rechazarlas.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
      <div className="inline-flex rounded-2xl border border-line bg-surface p-1" role="tablist">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={href(t.id, origin)}
            role="tab"
            aria-selected={status === t.id}
            className={cn("rounded-xl px-4 py-1.5 text-sm transition-colors", status === t.id ? "bg-surface-2 text-ink" : "text-muted hover:text-ink")}
          >
            {t.label} <span className="ml-1 text-xs text-muted">{count(t.id)}</span>
          </Link>
        ))}
      </div>
      <div className="inline-flex rounded-2xl border border-line bg-surface p-1" role="group" aria-label="Origen del aporte">
        {ORIGINS.map((o) => (
          <Link
            key={o.id}
            href={href(status, o.id)}
            aria-pressed={origin === o.id}
            className={cn("rounded-xl px-3 py-1.5 text-xs transition-colors", origin === o.id ? "bg-surface-2 text-ink" : "text-muted hover:text-ink")}
          >
            {o.label}
          </Link>
        ))}
      </div>
      </div>

      {list.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-line px-4 py-12 text-center text-sm text-muted">
          <Inbox className="mx-auto mb-2 h-6 w-6" />
          {status === "pending" ? "No hay aportes por revisar." : "Nada por aquí todavía."}
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {list.map((x) => (
            <li key={x.id}>
              <Link href={`/admin/aportes/${x.id}`} className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2/60">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/12 text-accent">
                  {x.kind === "film" ? <Clapperboard className="h-4 w-4" /> : <Landmark className="h-4 w-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-display text-[15px]">{x.label}</span>
                    {x.origin === "recopilacion" && <span className="chip !py-0 text-[11px] text-accent">Recopilación</span>}
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {x.target_id ? "Corrección" : "Registro nuevo"} · {x.kind === "film" ? "Producción" : "Entidad"} ·{" "}
                    {new Date(x.created_at).toLocaleString("es-GT", { dateStyle: "medium", timeStyle: "short" })}
                    {x.submitter ? ` · ${x.submitter}` : x.contact ? ` · ${x.contact}` : ""}
                  </span>
                </span>
                <ArrowRight className="h-4 w-4 text-muted transition-transform group-hover:translate-x-0.5" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
