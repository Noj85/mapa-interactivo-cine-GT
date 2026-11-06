"use client";

import { Loader2, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { revokeInfoRequestAction } from "@/app/admin/requests";
import { RequestInfoDialog } from "@/components/admin/RequestInfoDialog";
import { REQUEST_STATE_LABEL, requestState } from "@/lib/request-state";
import type { InfoRequest, SubmissionKind } from "@/lib/types";
import { cn } from "@/lib/utils";

const fmt = (iso: string) => new Intl.DateTimeFormat("es-GT", { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));

/** Solicitudes de información de un registro: crear una nueva, ver su estado y revocarlas. */
export function RequestsPanel({ kind, id, title, requests }: { kind: SubmissionKind; id: string; title: string; requests: InfoRequest[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const revoke = (r: InfoRequest) => {
    if (!confirm("¿Revocar este enlace? Quien lo tenga ya no podrá abrirlo.")) return;
    setError(null);
    start(async () => {
      const res = await revokeInfoRequestAction(r.id);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  };

  return (
    <section className="mt-10 rounded-2xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-lg">Solicitudes de información</h2>
          <p className="mt-0.5 max-w-xl text-sm text-muted">
            Genera un enlace privado con contraseña para que alguien del equipo {kind === "film" ? "de la producción" : "de la entidad"} complete lo que falta. Lo que envíen llega a «Aportes» para que lo revises.
          </p>
        </div>
        <button className="btn-primary" onClick={() => setOpen(true)}>
          <Send className="h-4 w-4" /> Solicitar información
        </button>
      </div>

      {requests.length > 0 && (
        <ul className="mt-4 divide-y divide-line overflow-hidden rounded-xl border border-line">
          {requests.map((r) => {
            const st = requestState(r);
            return (
              <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
                <span
                  className={cn(
                    "chip",
                    st === "active" && "border-ok/40 text-ok",
                    st === "locked" && "border-danger/45 text-danger",
                  )}
                >
                  {REQUEST_STATE_LABEL[st]}
                </span>
                <span className="min-w-0 flex-1 text-muted">
                  <span className="text-ink">{r.recipient || "Sin destinatario"}</span>
                  {r.target_ids.length > 1 ? ` · incluye ${r.target_ids.length} producciones` : ""}
                  {" · "}creada {fmt(r.created_at)} · vence {fmt(r.expires_at)}
                  {r.last_used_at ? ` · último uso ${fmt(r.last_used_at)}` : " · sin usar"}
                </span>
                <span className="text-xs text-muted">
                  {r.submissions_count} {r.submissions_count === 1 ? "envío" : "envíos"}
                </span>
                {st === "active" && (
                  <button className="text-xs text-muted hover:text-danger" disabled={pending} onClick={() => revoke(r)}>
                    {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Revocar"}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}

      {open && <RequestInfoDialog kind={kind} targets={[{ id, title }]} onClose={() => setOpen(false)} />}
    </section>
  );
}
