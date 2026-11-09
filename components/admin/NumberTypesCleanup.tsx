"use client";

import { AlertTriangle, Check, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cleanNumberTypesAction } from "@/app/admin/actions";
import type { TypeCard } from "@/lib/type-cleanup";

/** Lista de números ya guardados con el tipo mal, y el botón que los deja en entero. */
export function NumberTypesCleanup({ cards }: { cards: TypeCard[] }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = () => {
    setError(null);
    setNotice(null);
    start(async () => {
      const res = await cleanNumberTypesAction();
      setConfirm(false);
      if (!res.ok) return setError(res.error);
      const parts = [
        res.films ? `${res.films} ${res.films === 1 ? "producción" : "producciones"}` : null,
        res.submissions ? `${res.submissions} ${res.submissions === 1 ? "aporte" : "aportes"}` : null,
      ].filter(Boolean);
      setNotice(parts.length ? `Listo: ${parts.join(" y ")}, ${res.fields} ${res.fields === 1 ? "valor" : "valores"}.` : "No había nada que limpiar.");
      router.refresh();
    });
  };

  if (!cards.length) {
    return (
      <div className="rounded-2xl border border-dashed border-line px-4 py-12 text-center text-sm text-muted">
        No hay números con el tipo mal. Días, empleos, años y montos ya guardados están como número.
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 rounded-2xl border border-warn/30 bg-warn/5 px-4 py-3 text-sm">
        <p className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
          <span>
            Se reescribe solo el valor que está mal: un texto como «3 d» o un decimal en días y empleos pasa a entero. Lo que no es un número queda vacío. No se puede deshacer.
          </span>
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {!confirm ? (
            <button className="btn-outline" disabled={pending} onClick={() => setConfirm(true)}>
              Limpiar ({cards.length})
            </button>
          ) : (
            <>
              <button className="btn-primary" disabled={pending} onClick={run}>
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Confirmar limpieza
              </button>
              <button className="btn-ghost" disabled={pending} onClick={() => setConfirm(false)}>
                Cancelar
              </button>
            </>
          )}
        </div>
      </div>
      {notice && <p className="mb-4 rounded-xl border border-accent/30 bg-accent/10 px-4 py-2.5 text-sm">{notice}</p>}
      {error && <p className="mb-4 text-sm text-danger">{error}</p>}
      <ul className="space-y-3">
        {cards.map((c) => (
          <li key={c.key} className="rounded-2xl border border-line bg-surface px-4 py-3">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">{c.kindLabel}</span>
              <Link className="font-medium text-ink hover:underline" href={c.href}>{c.title}</Link>
            </div>
            <ul className="mt-2 space-y-1 text-sm">
              {c.fixes.map((f, i) => (
                <li key={`${f.label}-${i}`} className="text-muted">
                  <span className="text-ink">{f.label}:</span> {f.from} → {f.to}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
