"use client";

import { AlertTriangle, Check, Eye, Loader2, Plus, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { approveImportSubmissionAction, rejectSubmissionAction } from "@/app/admin/actions";
import type { UpdateGroup, UpdateItem } from "@/lib/import/diff";
import type { RecordStatus, SubmissionCandidate, SubmissionKind } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface CargaOption {
  id: string;
  title: string;
  year: number | null;
  /** Qué tan seguro era el parecido cuando la carga lo propuso (solo en coincidencias dudosas). */
  level?: SubmissionCandidate["level"];
  score?: number;
  status: RecordStatus;
  /** Lo que el archivo completa, agrega o cambia en este registro, comparado con lo que tiene HOY. */
  items: UpdateItem[];
}

const GROUP: Record<UpdateGroup, string> = { fill: "Completa (estaba vacío)", add: "Agrega", conflict: "Ya tiene otro valor" };
const LEVEL = { seguro: "Parecido seguro", probable: "Parecido probable", dudoso: "Parecido dudoso" } as const;

/**
 * Revisión de un aporte «Carga de archivo»: la persona marca campo por campo qué se aplica al registro
 * (todo empieza sin marcar) o, si la carga dudaba de si ya existía, elige con cuál se corresponde o lo crea como nuevo.
 */
export function ImportSubmissionReview({ id, kind, doubt, options }: { id: string; kind: SubmissionKind; doubt: boolean; options: CargaOption[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [choice, setChoice] = useState<string>(doubt ? "new" : (options[0]?.id ?? "new"));
  const [on, setOn] = useState<Set<string>>(new Set());
  const [publishNew, setPublishNew] = useState(false);

  const opt = options.find((o) => o.id === choice) ?? null;
  const toggle = (itemId: string) =>
    setOn((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  const pick = (v: string) => {
    setChoice(v);
    setOn(new Set());
    setError(null);
  };

  const go = (res: Awaited<ReturnType<typeof approveImportSubmissionAction>>, edit = false) => {
    if (!res.ok) return setError(res.error);
    if (edit) router.push(res.kind === "film" ? `/admin/peliculas/${res.recordId}` : `/admin/entidades/${res.recordId}`);
    else router.replace("/admin/aportes");
    router.refresh();
  };
  const apply = (edit = false, show = false) => {
    if (!opt) return;
    setError(null);
    start(async () => go(await approveImportSubmissionAction(id, { mode: "update", targetId: opt.id, accepted: [...on], show, note: note || null }), edit));
  };
  const create = (edit = false) => {
    setError(null);
    start(async () => go(await approveImportSubmissionAction(id, { mode: "create", publish: publishNew && !edit, note: note || null }), edit));
  };
  const reject = () => {
    setError(null);
    start(async () => {
      const res = await rejectSubmissionAction(id, note || null);
      if (!res.ok) return setError(res.error);
      router.replace("/admin/aportes");
      router.refresh();
    });
  };

  const groups: UpdateGroup[] = ["conflict", "fill", "add"];
  const recordHref = (rid: string) => (kind === "film" ? `/admin/peliculas/${rid}` : `/admin/entidades/${rid}`);

  return (
    <div className="space-y-5">
      {doubt && (
        <section>
          <h2 className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted">¿Ya existe en el sistema?</h2>
          <p className="mb-3 text-sm text-muted">
            La carga encontró registros parecidos y no quiso decidir sola. Elige con cuál se corresponde (y marca abajo qué datos aplicar) o créalo como nuevo.
          </p>
          <div className="space-y-2" role="radiogroup" aria-label="Registro con el que se corresponde">
            {options.map((o) => (
              <label key={o.id} className={cn("flex cursor-pointer items-start gap-3 rounded-2xl border bg-surface px-4 py-3 text-sm", choice === o.id ? "border-accent" : "border-line")}>
                <input type="radio" name="carga-choice" className="mt-1 accent-[rgb(var(--accent))]" checked={choice === o.id} onChange={() => pick(o.id)} />
                <span className="min-w-0 flex-1">
                  <b>{o.title}</b>{o.year ? ` (${o.year})` : ""}
                  <span className="ml-2 text-xs text-muted">
                    {o.level ? LEVEL[o.level] : ""}{o.status === "draft" ? " · oculto" : ""}
                  </span>
                  <Link href={recordHref(o.id)} className="ml-2 text-xs text-accent hover:underline" target="_blank">ver registro ↗</Link>
                </span>
              </label>
            ))}
            <label className={cn("flex cursor-pointer items-start gap-3 rounded-2xl border bg-surface px-4 py-3 text-sm", choice === "new" ? "border-accent" : "border-line")}>
              <input type="radio" name="carga-choice" className="mt-1 accent-[rgb(var(--accent))]" checked={choice === "new"} onChange={() => pick("new")} />
              <span><b>Es nuevo:</b> crear el registro con los datos del archivo</span>
            </label>
          </div>
        </section>
      )}

      {opt && (
        <section>
          <h2 className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Qué aplicar a «{opt.title}»</h2>
          {opt.items.length === 0 ? (
            <p className="rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-muted">El registro ya tiene todo lo que trae el archivo: no hay nada que aplicar. Puedes rechazar el aporte.</p>
          ) : (
            <div className="rounded-2xl border border-line bg-surface p-4">
              <p className="mb-3 text-xs text-muted">Todo empieza sin marcar. Solo se cambia lo que marques; el resto del registro no se toca.</p>
              {groups.map((g) => {
                const items = opt.items.filter((i) => i.group === g);
                if (!items.length) return null;
                return (
                  <div key={g} className="mb-3 last:mb-0">
                    <p className={cn("text-[10px] font-semibold uppercase tracking-[0.12em]", g === "conflict" ? "text-warn" : "text-muted")}>{GROUP[g]}</p>
                    <ul className="mt-1.5 space-y-1.5">
                      {items.map((it) => (
                        <li key={it.id}>
                          <label className="flex cursor-pointer items-start gap-2 text-sm">
                            <input type="checkbox" className="mt-1 accent-[rgb(var(--accent))]" checked={on.has(it.id)} onChange={() => toggle(it.id)} />
                            <span className="min-w-0 flex-1">
                              <span className="text-muted">{it.label}: </span>
                              {g === "conflict" ? (
                                <span className="block sm:inline">
                                  <span className="text-muted line-through decoration-danger/40">{it.current}</span> <span aria-hidden>→</span> <span className="text-ink">{it.incoming}</span>
                                  <span className="ml-1.5 text-[11px] text-muted">usar el del archivo</span>
                                </span>
                              ) : (
                                <span className="text-ink">{it.incoming}</span>
                              )}
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {!opt && !doubt && (
        <p className="flex items-start gap-2 rounded-2xl border border-warn/30 bg-warn/5 px-4 py-3 text-sm text-warn">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> El registro que se quería completar ya no existe. Puedes crearlo como nuevo con los datos del archivo o rechazar el aporte.
        </p>
      )}

      <div className="rounded-2xl border border-line bg-surface p-4">
        <label className="label" htmlFor="rv-note">Nota de revisión (opcional, solo la ve el equipo)</label>
        <textarea id="rv-note" className="field min-h-16" value={note} onChange={(e) => setNote(e.target.value)} />
        {choice === "new" && (
          <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" className="accent-[rgb(var(--accent))]" checked={publishNew} onChange={(e) => setPublishNew(e.target.checked)} />
            Publicarlo en el mapa al crearlo (si no, queda como borrador)
          </label>
        )}
        {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          {choice === "new" ? (
            <>
              <button className="btn-primary" disabled={pending} onClick={() => create(false)}>
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Crear como nuevo
              </button>
              <button className="btn-outline" disabled={pending} onClick={() => create(true)}>Crear como borrador y editar</button>
            </>
          ) : (
            <>
              <button className="btn-primary" disabled={pending || on.size === 0} onClick={() => apply(false)}>
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Aplicar lo marcado ({on.size})
              </button>
              {opt?.status === "draft" && (
                <button className="btn-outline" disabled={pending || on.size === 0} onClick={() => apply(false, true)}>
                  <Eye className="h-4 w-4" /> Aplicar y poner en el mapa
                </button>
              )}
              <button className="btn-outline" disabled={pending || on.size === 0} onClick={() => apply(true)}>Aplicar y editar</button>
            </>
          )}
          {rejecting ? (
            <button className="btn-outline text-danger hover:!text-danger" disabled={pending} onClick={reject}>
              <X className="h-4 w-4" /> Confirmar rechazo
            </button>
          ) : (
            <button className="btn-ghost text-danger hover:!text-danger" disabled={pending} onClick={() => setRejecting(true)}>
              <X className="h-4 w-4" /> Rechazar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
