"use client";

import { Check, Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { savePublicStatsAction } from "@/app/admin/settings";
import { STAT_KEYS, type PublicStats, type StatKey } from "@/lib/site-settings";
import { cn } from "@/lib/utils";

export interface StatRow {
  key: StatKey;
  label: string;
  hint: string;
  /** Valor actual ya formateado. */
  value: string;
  /** Producciones publicadas con dato de esta cifra, y producciones publicadas en total. */
  covered: number;
  total: number;
}

/** Un interruptor por cifra, con su valor actual y qué tanto respalda el dato. */
export function PublicStatsForm({ rows, initial }: { rows: StatRow[]; initial: PublicStats }) {
  const [on, setOn] = useState<PublicStats>(initial);
  const [saved, setSaved] = useState<PublicStats>(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const dirty = STAT_KEYS.some((k) => on[k] !== saved[k]);

  const save = () =>
    start(async () => {
      setMsg(null);
      const r = await savePublicStatsAction(on);
      if (r.ok) {
        setSaved(on);
        setMsg({ ok: true, text: "Guardado. El mapa público ya usa estas cifras." });
      } else setMsg({ ok: false, text: r.error });
    });

  return (
    <div>
      <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
        {rows.map((r) => {
          const pct = r.total ? Math.round((r.covered / r.total) * 100) : 0;
          return (
            <li key={r.key} className="flex items-start gap-4 px-4 py-4">
              <button
                type="button"
                role="switch"
                aria-checked={on[r.key]}
                aria-label={`Mostrar «${r.label}» en el mapa público`}
                onClick={() => setOn({ ...on, [r.key]: !on[r.key] })}
                className={cn("relative mt-1 h-6 w-11 shrink-0 rounded-full border transition-colors", on[r.key] ? "border-accent bg-accent" : "border-line bg-surface-2")}
              >
                <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", on[r.key] ? "left-[22px]" : "left-0.5")} />
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <h3 className="text-sm font-medium text-ink">{r.label}</h3>
                  <span className="font-display text-xl tabular-nums text-ink">{r.value}</span>
                </div>
                <p className="mt-0.5 text-xs text-muted">{r.hint}</p>
                <p className="mt-1.5 text-xs text-muted">
                  Dato en <b className="font-medium text-ink">{r.covered.toLocaleString("es-GT")}</b> de {r.total.toLocaleString("es-GT")} producciones publicadas
                  {r.total ? ` (${pct} %)` : ""}.
                </p>
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                  <div className={cn("h-full rounded-full", pct >= 70 ? "bg-accent" : "bg-warn")} style={{ width: `${pct}%` }} />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mt-4 flex items-center gap-3">
        <button type="button" className="btn-primary" disabled={!dirty || pending} onClick={save}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Guardar
        </button>
        {dirty && !pending && <span className="text-xs text-muted">Hay cambios sin guardar.</span>}
        {msg && (
          <span role="status" className={cn("text-sm", msg.ok ? "text-accent" : "text-danger")}>
            {msg.text}
          </span>
        )}
      </div>
    </div>
  );
}
