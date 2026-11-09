"use client";

import { AlertTriangle, Check, Layers, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { unifyLocationsAction } from "@/app/admin/actions";
import { UNIFY_REASON_LABEL, type UnifyReason } from "@/lib/locations";

export interface UnifyCard {
  id: string;
  title: string;
  year: number | null;
  /** Locaciones antes y después, ya escritas en texto. */
  before: string[];
  after: string[];
  groups: { reason: UnifyReason; rows: string[]; result: string; changes: string[] }[];
  manual: { depto: string; munis: string[]; rows: string[] }[];
}

/** Revisión y aplicación de la regla «un municipio distinto por locación» sobre las producciones existentes. */
export function LocationsUnify({ cards }: { cards: UnifyCard[] }) {
  const router = useRouter();
  const [confirmAll, setConfirmAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const applicable = cards.filter((c) => c.groups.length > 0);

  const run = (ids: string[], key: string) => {
    setError(null);
    setNotice(null);
    setBusy(key);
    start(async () => {
      const res = await unifyLocationsAction(ids);
      setBusy(null);
      setConfirmAll(false);
      if (!res.ok) return setError(res.error);
      setNotice(`Listo: ${res.films} ${res.films === 1 ? "producción" : "producciones"} y ${res.merged} ${res.merged === 1 ? "locación unificada" : "locaciones unificadas"}.`);
      router.refresh();
    });
  };

  return (
    <div>
      {applicable.length > 0 && (
        <div className="mb-6 rounded-2xl border border-warn/30 bg-warn/5 px-4 py-3 text-sm">
          <p className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
            <span>
              Al aplicar, las filas que se unen se borran y no se puede deshacer. Antes de aplicar a todas conviene un respaldo de la base en Supabase.
            </span>
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {!confirmAll ? (
              <button className="btn-outline" disabled={pending} onClick={() => setConfirmAll(true)}>
                <Layers className="h-4 w-4" /> Aplicar a todas ({applicable.length})
              </button>
            ) : (
              <>
                <button className="btn-primary" disabled={pending} onClick={() => run(applicable.map((c) => c.id), "all")}>
                  {busy === "all" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Confirmar: unificar {applicable.length}
                </button>
                <button className="btn-ghost" disabled={pending} onClick={() => setConfirmAll(false)}>
                  Cancelar
                </button>
              </>
            )}
          </div>
        </div>
      )}
      {notice && <p className="mb-4 rounded-xl border border-accent/30 bg-accent/10 px-4 py-2.5 text-sm">{notice}</p>}
      {error && <p className="mb-4 text-sm text-danger">{error}</p>}

      {cards.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line px-4 py-12 text-center text-sm text-muted">
          No hay producciones con locaciones repetidas por departamento.
        </div>
      ) : (
        <ul className="space-y-4">
          {cards.map((c) => (
            <li key={c.id} className="rounded-2xl border border-line bg-surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-display text-lg">
                    {c.title} {c.year ? <span className="text-muted">({c.year})</span> : null}
                  </h2>
                  <p className="text-xs text-muted">
                    {c.before.length} {c.before.length === 1 ? "locación" : "locaciones"} hoy
                    {c.groups.length > 0 ? ` · quedarían ${c.after.length}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/admin/peliculas/${c.id}`} className="text-sm text-accent underline underline-offset-2">
                    Abrir
                  </Link>
                  {c.groups.length > 0 && (
                    <button className="btn-outline" disabled={pending} onClick={() => run([c.id], c.id)}>
                      {busy === c.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Aplicar a esta producción
                    </button>
                  )}
                </div>
              </div>

              {c.groups.length > 0 && (
                <div className="mt-3 space-y-2.5">
                  {c.groups.map((g, i) => (
                    <div key={i} className="rounded-xl border border-line/70 px-3 py-2.5 text-sm">
                      <p className="label !mb-1.5">{UNIFY_REASON_LABEL[g.reason]}</p>
                      <ul className="space-y-0.5 text-muted">
                        {g.rows.map((r, j) => (
                          <li key={j} className="flex gap-2">
                            <span className="shrink-0">{j === 0 ? "Se queda:" : "Se une:"}</span>
                            <span className="min-w-0">{r}</span>
                          </li>
                        ))}
                      </ul>
                      <p className="mt-1.5 flex gap-2">
                        <span className="shrink-0 text-muted">Queda:</span>
                        <span className="min-w-0 font-medium">{g.result}</span>
                      </p>
                      {g.changes.length > 0 && <p className="mt-1 text-xs text-muted">Datos que pasan de otra fila: {g.changes.join(" · ")}</p>}
                    </div>
                  ))}
                </div>
              )}

              {c.manual.length > 0 && (
                <div className="mt-3 rounded-xl border border-warn/30 bg-warn/5 px-3 py-2.5 text-sm">
                  <p className="label !mb-1.5">Revisión manual</p>
                  {c.manual.map((m, i) => (
                    <div key={i} className="text-muted">
                      <p>
                        {m.depto} tiene {m.munis.length} municipios ({m.munis.join(", ")}) y una fila sin municipio; no se sabe de cuál es. No se toca:
                      </p>
                      <ul className="mt-0.5 list-disc pl-5">
                        {m.rows.map((r, j) => (
                          <li key={j}>{r}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
