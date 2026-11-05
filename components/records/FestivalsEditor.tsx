"use client";

import { Plus, Trash2 } from "lucide-react";
import { FESTIVAL_RESULTS, type FestivalResult } from "@/lib/types";
import { blankFest, isBlankFest, type FestDraft } from "./drafts";
import { FestivalPicker } from "./FestivalPicker";

const MAX_FESTS = 40;

/** Festivales a los que llegó la producción: selecciones, nominaciones y premios (una entrada por participación). */
export function FestivalsEditor({ fests, onChange }: { fests: FestDraft[]; onChange: (next: FestDraft[]) => void }) {
  const set = (i: number, patch: Partial<FestDraft>) => onChange(fests.map((f, j) => (j === i ? { ...f, ...patch } : f)));

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
          Festivales y premios ({fests.filter((f) => !isBlankFest(f)).length})
        </h2>
        <button type="button" className="btn-outline !px-3 !py-1.5 text-xs" disabled={fests.length >= MAX_FESTS} onClick={() => onChange([...fests, blankFest()])}>
          <Plus className="h-3.5 w-3.5" /> Agregar festival
        </button>
      </div>
      <p className="-mt-1 mb-3 text-xs leading-relaxed text-muted">
        Una entrada por cada participación: la selección oficial, la nominación o el premio en un festival. Si el festival no aparece en la lista, escríbelo igual.
      </p>
      <div className="space-y-3">
        {fests.map((f, i) => (
          <div key={f.id ?? i} className="rounded-2xl border border-line bg-surface p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-ink">{i + 1}</span>
              <button type="button" className="text-muted hover:text-danger" aria-label="Quitar festival" onClick={() => onChange(fests.filter((_, j) => j !== i))}>
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_110px]">
              <div>
                <label className="label" htmlFor={`fest-name-${i}`}>Festival *</label>
                <FestivalPicker
                  id={`fest-name-${i}`}
                  name={f.name}
                  festivalId={f.festival_id}
                  onChange={(v) =>
                    set(i, {
                      name: v.name,
                      festival_id: v.festival_id,
                      // al elegir uno del catálogo se traen país y ciudad; al escribir a mano se conservan los que ya había
                      ...(v.country !== undefined ? { country: v.country } : {}),
                      ...(v.city !== undefined ? { city: v.city } : {}),
                    })
                  }
                />
              </div>
              <div>
                <label className="label" htmlFor={`fest-year-${i}`}>Año</label>
                <input id={`fest-year-${i}`} className="field" inputMode="numeric" maxLength={4} placeholder="2024" value={f.year} onChange={(e) => set(i, { year: e.target.value })} />
              </div>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor={`fest-res-${i}`}>Resultado</label>
                <select id={`fest-res-${i}`} className="field" value={f.result} onChange={(e) => set(i, { result: e.target.value as FestivalResult })}>
                  {FESTIVAL_RESULTS.map((r) => (
                    <option key={r.id} value={r.id}>{r.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor={`fest-award-${i}`}>Premio o categoría (opcional)</label>
                <input id={`fest-award-${i}`} className="field" maxLength={200} placeholder="Mejor película" value={f.award} onChange={(e) => set(i, { award: e.target.value })} />
              </div>
              <div>
                <label className="label" htmlFor={`fest-sec-${i}`}>Sección o competencia (opcional)</label>
                <input id={`fest-sec-${i}`} className="field" maxLength={200} placeholder="Largometraje ficción" value={f.section} onChange={(e) => set(i, { section: e.target.value })} />
              </div>
              <div>
                <label className="label" htmlFor={`fest-url-${i}`}>Enlace de referencia (opcional)</label>
                <input id={`fest-url-${i}`} className="field" type="url" inputMode="url" maxLength={300} placeholder="https://" value={f.url} onChange={(e) => set(i, { url: e.target.value })} />
              </div>
              {!f.festival_id && f.name.trim() && (
                <>
                  <div>
                    <label className="label" htmlFor={`fest-city-${i}`}>Ciudad del festival (opcional)</label>
                    <input id={`fest-city-${i}`} className="field" maxLength={150} value={f.city} onChange={(e) => set(i, { city: e.target.value })} />
                  </div>
                  <div>
                    <label className="label" htmlFor={`fest-country-${i}`}>País del festival (opcional)</label>
                    <input id={`fest-country-${i}`} className="field" maxLength={100} value={f.country} onChange={(e) => set(i, { country: e.target.value })} />
                  </div>
                </>
              )}
            </div>
          </div>
        ))}
        {fests.length === 0 && (
          <div className="rounded-2xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
            Sin festivales todavía. Si la producción tuvo selecciones o premios, agrégalos aquí.
          </div>
        )}
      </div>
    </section>
  );
}
