"use client";

import { FILM_KINDS, NATIONALITIES, type FilmKind, type Nationality } from "@/lib/types";
import { CompaniesEditor } from "./CompaniesEditor";
import type { FilmDraft } from "./drafts";

/** Campos de una producción. Los usa el editor del equipo y el formulario público. */
export function FilmFields({ draft: d, onChange }: { draft: FilmDraft; onChange: (patch: Partial<FilmDraft>) => void }) {
  return (
    <section className="space-y-4">
      <div>
        <label className="label" htmlFor="f-title">Título *</label>
        <input id="f-title" className="field text-base" maxLength={300} value={d.title} onChange={(e) => onChange({ title: e.target.value })} />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="f-year">Año</label>
          <input id="f-year" className="field" inputMode="numeric" value={d.year} onChange={(e) => onChange({ year: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="f-kind">Tipo</label>
          <select id="f-kind" className="field" value={d.kind} onChange={(e) => onChange({ kind: e.target.value as FilmKind | "" })}>
            <option value="">Sin definir</option>
            {FILM_KINDS.map((k) => (
              <option key={k.id} value={k.id}>{k.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="f-nat">Nacionalidad</label>
          <select id="f-nat" className="field" value={d.nationality} onChange={(e) => onChange({ nationality: e.target.value as Nationality | "" })}>
            <option value="">Sin definir</option>
            {NATIONALITIES.map((k) => (
              <option key={k.id} value={k.id}>{k.label}</option>
            ))}
          </select>
        </div>
      </div>
      <CompaniesEditor companies={d.companies} nationality={d.nationality} onChange={(companies) => onChange({ companies })} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="f-dir">Director/a</label>
          <input id="f-dir" className="field" maxLength={300} value={d.director} onChange={(e) => onChange({ director: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="f-prod">Productor/a</label>
          <input id="f-prod" className="field" maxLength={300} value={d.producer} onChange={(e) => onChange({ producer: e.target.value })} />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
        <div>
          <label className="label" htmlFor="f-budget">Presupuesto</label>
          <input id="f-budget" className="field" inputMode="decimal" value={d.budget} onChange={(e) => onChange({ budget: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="f-cur">Moneda</label>
          <select id="f-cur" className="field" value={d.currency} onChange={(e) => onChange({ currency: e.target.value as "GTQ" | "USD" })}>
            <option value="GTQ">Q (GTQ)</option>
            <option value="USD">US$</option>
          </select>
        </div>
      </div>
      <div>
        <label className="label" htmlFor="f-syn">Sinopsis</label>
        <textarea id="f-syn" className="field min-h-24" maxLength={2000} value={d.synopsis} onChange={(e) => onChange({ synopsis: e.target.value })} />
      </div>
    </section>
  );
}
