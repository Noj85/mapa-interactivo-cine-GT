"use client";

import { Check, Eye, Loader2, Pencil, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { approveSubmissionAction, rejectSubmissionAction } from "@/app/admin/actions";
import type { CorrectionItem } from "@/lib/submissions-plan";
import { cn } from "@/lib/utils";

const GROUP_LABEL: Record<CorrectionItem["group"], string> = { change: "Cambia", add: "Agrega", remove: "Quita" };

/**
 * Acciones del equipo sobre un aporte pendiente. En una corrección con cambios sueltos (`items`) se puede aceptar todo
 * o solo lo marcado; lo demás del aporte queda sin aplicar. Los aportes nuevos se aprueban enteros.
 */
export function SubmissionReview({
  id,
  isCorrection,
  hidden,
  items,
}: {
  id: string;
  isCorrection: boolean;
  /** El registro corregido hoy está oculto del mapa. */
  hidden?: boolean;
  /** Cambios sueltos de la corrección, para marcar uno por uno. */
  items?: CorrectionItem[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const list = isCorrection ? (items ?? []) : [];
  const [on, setOn] = useState<Set<string>>(() => new Set(list.filter((i) => i.defaultOn).map((i) => i.id)));
  const all = list.length > 0 && on.size === list.length;

  const toggle = (itemId: string) =>
    setOn((prev) => {
      const next = new Set(prev);
      if (!next.delete(itemId)) next.add(itemId);
      return next;
    });

  const approve = (publish: boolean, edit: boolean) => {
    setError(null);
    start(async () => {
      // con todo marcado se aprueba el aporte entero, igual que siempre; si no, solo lo marcado
      const partial = list.length > 0 && !all;
      const res = await approveSubmissionAction(id, { publish, note: note || null, ...(partial ? { accepted: [...on] } : {}) });
      if (!res.ok) return setError(res.error);
      if (edit) router.push(res.kind === "film" ? `/admin/peliculas/${res.recordId}` : `/admin/entidades/${res.recordId}`);
      else router.replace("/admin/aportes");
      router.refresh();
    });
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

  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      {list.length > 0 && (
        <fieldset className="mb-5">
          <legend className="label">Qué aceptar de esta corrección</legend>
          <p className="mb-2 text-xs text-muted">Marca lo que quieres aplicar al registro. Lo que dejes sin marcar no se aplica. Quitar algo no viene marcado.</p>
          <div className="mb-2 flex gap-3 text-xs">
            <button type="button" className="text-accent hover:underline" onClick={() => setOn(new Set(list.map((i) => i.id)))}>Marcar todo</button>
            <button type="button" className="text-muted hover:text-ink hover:underline" onClick={() => setOn(new Set())}>Quitar todas las marcas</button>
          </div>
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
            {list.map((i) => {
              const checked = on.has(i.id);
              return (
                <li key={i.id}>
                  <label className={cn("flex cursor-pointer items-start gap-3 px-3 py-3 transition-colors hover:bg-surface-2/60", checked && "bg-accent/5")}>
                    <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-[rgb(var(--accent))]" checked={checked} onChange={() => toggle(i.id)} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 text-sm font-medium text-ink">
                        {i.label}
                        <span className={cn("chip !py-0 text-[11px]", i.group === "remove" && "!border-danger/40 !text-danger")}>{GROUP_LABEL[i.group]}</span>
                      </span>
                      {i.before && <span className={cn("mt-1 block whitespace-pre-line text-sm text-muted", i.after ? "line-through decoration-danger/50" : "")}>{i.before}</span>}
                      <span className="mt-0.5 block whitespace-pre-line text-sm text-ink">{i.after ?? <span className="text-muted">— (se quitaría)</span>}</span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>
      )}
      <label className="label" htmlFor="rv-note">Nota de revisión (opcional, solo la ve el equipo)</label>
      <textarea id="rv-note" className="field min-h-16" value={note} onChange={(e) => setNote(e.target.value)} />
      {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        {isCorrection ? (
          <>
            <button className="btn-primary" disabled={pending || (list.length > 0 && on.size === 0)} onClick={() => approve(false, false)}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{" "}
              {list.length > 0 && !all ? `Aplicar solo lo marcado (${on.size} de ${list.length})` : "Aplicar corrección"}
            </button>
            {hidden && (
              <button className="btn-outline" disabled={pending || (list.length > 0 && on.size === 0)} onClick={() => approve(true, false)}>
                <Eye className="h-4 w-4" /> Aplicar y poner en el mapa
              </button>
            )}
            <button className="btn-outline" disabled={pending || (list.length > 0 && on.size === 0)} onClick={() => approve(false, true)}>
              <Pencil className="h-4 w-4" /> Aplicar y editar
            </button>
          </>
        ) : (
          <>
            <button className="btn-primary" disabled={pending} onClick={() => approve(true, false)}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Aprobar y publicar
            </button>
            <button className="btn-outline" disabled={pending} onClick={() => approve(false, true)}>
              <Pencil className="h-4 w-4" /> Aprobar como borrador y editar
            </button>
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
  );
}
