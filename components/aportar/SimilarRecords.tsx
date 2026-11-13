"use client";

import { Lightbulb } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { correctionHref, SIMILAR_MIN_CHARS, type SimilarKind, type SimilarRecord } from "@/lib/similar";

const ONE: Record<SimilarKind, string> = { film: "producción", org: "entidad", person: "persona" };
const MANY: Record<SimilarKind, string> = { film: "producciones", org: "entidades", person: "personas" };

/**
 * Debajo del campo principal (título o nombre): si lo que se escribe se parece a una ficha ya publicada, la ofrece.
 * Elegirla abre esa ficha como una sugerencia de corrección, con todos sus datos cargados, en vez de crear un duplicado.
 */
export function SimilarRecords({ kind, text, hasOtherData }: { kind: SimilarKind; text: string; /** Ya escribió algo más que el título o el nombre. */ hasOtherData: boolean }) {
  const router = useRouter();
  const [found, setFound] = useState<{ text: string; matches: SimilarRecord[] }>({ text: "", matches: [] });
  // «No, es otra»: esas fichas no se vuelven a ofrecer mientras se sigue escribiendo
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const typed = text.trim();

  useEffect(() => {
    if (typed.length < SIMILAR_MIN_CHARS) return;
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/aportes/similares?kind=${kind}&q=${encodeURIComponent(typed)}`, { signal: ctl.signal });
        if (!res.ok) return;
        const j = (await res.json()) as { ok?: boolean; matches?: SimilarRecord[] };
        if (j.ok) setFound({ text: typed, matches: j.matches ?? [] });
      } catch {
        // sin red o petición cancelada: simplemente no hay sugerencia
      }
    }, 350);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [kind, typed]);

  // lo que se ve es siempre del texto actual: al borrar, o mientras llega la respuesta nueva, no queda nada viejo
  const matches = typed.length >= SIMILAR_MIN_CHARS && found.text === typed ? found.matches.filter((m) => !dismissed.has(m.id)) : [];
  if (!matches.length) return null;

  const choose = (m: SimilarRecord) => {
    if (hasOtherData && !window.confirm("Vas a pasar a la ficha que ya existe y se pierde lo que escribiste en este formulario. ¿Quieres continuar?")) return;
    router.push(correctionHref(m.kind, m.slug));
  };

  return (
    <div role="status" aria-live="polite" className="mt-3 rounded-2xl border border-accent/40 bg-accent/5 p-3">
      <p className="flex items-start gap-2 text-sm leading-relaxed">
        <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
        <span>
          {matches.length === 1 ? `Parece que ya tenemos esta ${ONE[kind]}.` : `Parece que ya tenemos estas ${MANY[kind]}.`} Si es la misma, puedes sugerir un cambio sobre su ficha en vez de crear otra.
        </span>
      </p>
      <ul className="mt-2 space-y-2">
        {matches.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{m.label}</p>
              {m.detail && <p className="truncate text-xs text-muted">{m.detail}</p>}
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <button type="button" className="btn-primary" onClick={() => choose(m)}>
                Sí, es esta. Sugerir cambios
              </button>
              <button type="button" className="btn-outline" onClick={() => setDismissed((s) => new Set(s).add(m.id))}>
                No, es otra
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
