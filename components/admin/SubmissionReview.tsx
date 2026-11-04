"use client";

import { Check, Loader2, Pencil, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { approveSubmissionAction, rejectSubmissionAction } from "@/app/admin/actions";

/** Acciones del equipo sobre un aporte pendiente. */
export function SubmissionReview({ id, isCorrection }: { id: string; isCorrection: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [rejecting, setRejecting] = useState(false);

  const approve = (publish: boolean, edit: boolean) => {
    setError(null);
    start(async () => {
      const res = await approveSubmissionAction(id, { publish, note: note || null });
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
      <label className="label" htmlFor="rv-note">Nota de revisión (opcional, solo la ve el equipo)</label>
      <textarea id="rv-note" className="field min-h-16" value={note} onChange={(e) => setNote(e.target.value)} />
      {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        {isCorrection ? (
          <>
            <button className="btn-primary" disabled={pending} onClick={() => approve(false, false)}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Aplicar corrección
            </button>
            <button className="btn-outline" disabled={pending} onClick={() => approve(false, true)}>
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
