"use client";

import type { ReactNode } from "react";
import { FORMATS, NATURES, type FilmFormat, type FilmNature } from "@/lib/film-types";
import { NATIONALITIES, type Nationality } from "@/lib/types";
import { CompaniesEditor } from "./CompaniesEditor";
import { CrewEditor } from "./CrewEditor";
import { GenresEditor } from "./GenresEditor";
import { LanguagesEditor } from "./LanguagesEditor";
import { VideoLinkField } from "./VideoLinkField";
import { numericInput, type FilmDraft } from "./drafts";

/** Campos de una producción. Los usa el editor del equipo y el formulario público. */
export function FilmFields({ draft: d, onChange, belowMain }: { draft: FilmDraft; onChange: (patch: Partial<FilmDraft>) => void; belowMain?: ReactNode }) {
  return (
    <section className="space-y-4">
      <div>
        <label className="label" htmlFor="f-title">Título *</label>
        <input id="f-title" className="field text-base uppercase" maxLength={300} value={d.title} onChange={(e) => onChange({ title: e.target.value })} />
        {belowMain}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <label className="label" htmlFor="f-year">Año</label>
          <input id="f-year" className="field" inputMode="numeric" value={d.year} onChange={(e) => onChange({ year: numericInput(e.target.value) })} />
        </div>
        <div>
          <label className="label" htmlFor="f-dur">Duración (min)</label>
          <input id="f-dur" className="field" inputMode="numeric" maxLength={4} placeholder="Ej.: 95" value={d.duration} onChange={(e) => onChange({ duration: numericInput(e.target.value) })} />
        </div>
        <div>
          <label className="label" htmlFor="f-format">Formato</label>
          <select id="f-format" className="field" value={d.format} onChange={(e) => onChange({ format: e.target.value as FilmFormat | "" })}>
            <option value="">Sin definir</option>
            {FORMATS.map((k) => (
              <option key={k.id} value={k.id}>{k.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="f-nature">Naturaleza</label>
          <select id="f-nature" className="field" value={d.nature} onChange={(e) => onChange({ nature: e.target.value as FilmNature | "" })}>
            <option value="">Sin definir</option>
            {NATURES.map((k) => (
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
      {d.nationality === "extranjera" && (
        <p className="-mt-2 text-xs leading-relaxed text-muted">
          Incluye producciones extranjeras rodadas en Guatemala o sobre Guatemala; si se rodó afuera, registra la locación con su país.
        </p>
      )}
      <GenresEditor genres={d.genres} onChange={(genres) => onChange({ genres })} />
      <LanguagesEditor languages={d.languages} onChange={(languages) => onChange({ languages })} />
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
        <div>
          <label className="label" htmlFor="f-dp">Director/a de fotografía</label>
          <input id="f-dp" className="field" maxLength={300} value={d.cinematographer} onChange={(e) => onChange({ cinematographer: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="f-guion">Guionista</label>
          <input id="f-guion" className="field" maxLength={300} value={d.screenwriter} onChange={(e) => onChange({ screenwriter: e.target.value })} />
        </div>
      </div>
      <CrewEditor crew={d.crew} onChange={(crew) => onChange({ crew })} />
      <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
        <div>
          <label className="label" htmlFor="f-budget">Presupuesto</label>
          <input id="f-budget" className="field" inputMode="decimal" value={d.budget} onChange={(e) => onChange({ budget: numericInput(e.target.value, true) })} />
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
      <div className="grid gap-4 sm:grid-cols-2">
        <VideoLinkField
          id="f-trailer"
          label="Tráiler (enlace)"
          hint="YouTube, Vimeo u otra plataforma. Se guarda la miniatura si está disponible."
          url={d.trailerUrl}
          thumb={d.trailerThumb}
          onChange={({ url, thumb }) => onChange({ trailerUrl: url, trailerThumb: thumb })}
        />
        <VideoLinkField
          id="f-film"
          label="Película completa (enlace, si está disponible)"
          hint="Donde se puede ver completa en línea. Opcional."
          url={d.filmUrl}
          thumb={d.filmThumb}
          onChange={({ url, thumb }) => onChange({ filmUrl: url, filmThumb: thumb })}
        />
      </div>
    </section>
  );
}
