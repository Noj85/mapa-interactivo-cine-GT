"use client";

import { Plus, X } from "lucide-react";
import type { ReactNode } from "react";
import { LanguagesEditor } from "@/components/records/LanguagesEditor";
import { PlaceSelect } from "@/components/records/PlaceSelect";
import { numericInput, type PersonDraft } from "@/components/records/drafts";
import { CREW_GROUPS, CREW_ROLES, OTHER_ROLE } from "@/lib/crew";
import { MAX_BIO, MAX_CREDITS, MAX_PERSON_ROLES } from "@/lib/people";
import { cn } from "@/lib/utils";

/** Oficios, lugar, presentación y contacto de una persona del directorio. Lo usan el público y el equipo. */
export function PersonFields({ draft, onChange, belowMain }: { draft: PersonDraft; onChange: (patch: Partial<PersonDraft>) => void; belowMain?: ReactNode }) {
  const toggleRole = (id: string) => {
    const on = draft.roles.includes(id);
    if (on) onChange({ roles: draft.roles.filter((r) => r !== id) });
    else if (draft.roles.length < MAX_PERSON_ROLES) onChange({ roles: [...draft.roles, id] });
  };
  const full = draft.roles.length >= MAX_PERSON_ROLES;

  return (
    <div className="space-y-8">
      <div>
        <label className="label" htmlFor="person-name">Nombre *</label>
        <input id="person-name" className="field" maxLength={300} value={draft.name} onChange={(e) => onChange({ name: e.target.value })} />
        {belowMain}
      </div>

      <section aria-label="Oficios">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Oficios ({draft.roles.length}/{MAX_PERSON_ROLES})</h2>
        </div>
        <p className="mb-3 text-xs leading-relaxed text-muted">
          Marca lo que haces. Un productor o una productora independiente marca «Productor/a». Hasta {MAX_PERSON_ROLES}.
        </p>
        <div className="space-y-3">
          {CREW_GROUPS.map((g) => {
            const roles = CREW_ROLES.filter((r) => r.group === g.id);
            if (!roles.length) return null;
            return (
              <div key={g.id}>
                <p className="mb-1.5 text-[11px] text-muted">{g.label}</p>
                <div className="flex flex-wrap gap-1.5">
                  {roles.map((r) => {
                    const on = draft.roles.includes(r.id);
                    return (
                      <button
                        key={r.id}
                        type="button"
                        aria-pressed={on}
                        disabled={!on && full}
                        onClick={() => toggleRole(r.id)}
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-xs transition-colors",
                          on ? "border-accent bg-accent/10 text-ink" : "border-line text-muted hover:text-ink",
                          !on && full && "opacity-40",
                        )}
                      >
                        {r.id === OTHER_ROLE ? "Otro oficio" : r.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        {(draft.roles.includes(OTHER_ROLE) || draft.otherRole) && (
          <div className="mt-3">
            <label className="label" htmlFor="person-other">Otro oficio</label>
            <input id="person-other" className="field" maxLength={120} placeholder="El nombre del oficio" value={draft.otherRole} onChange={(e) => onChange({ otherRole: e.target.value })} />
          </div>
        )}
      </section>

      <section aria-label="Dónde trabajas">
        <h2 className="mb-1 text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Dónde trabajas</h2>
        <p className="mb-2 text-xs leading-relaxed text-muted">Departamento y municipio. No se muestra como un punto en el mapa.</p>
        <PlaceSelect idPrefix="person-place" value={{ depto_ine: draft.depto_ine, muni_ine: draft.muni_ine }} onChange={(v) => onChange(v)} />
      </section>

      <LanguagesEditor
        languages={draft.languages}
        onChange={(languages) => onChange({ languages })}
        hint="Idiomas en los que trabajas. Marca los que apliquen; si falta alguno, escríbelo abajo."
      />

      <div>
        <label className="label" htmlFor="person-bio">Presentación</label>
        <textarea id="person-bio" className="field min-h-24" maxLength={MAX_BIO} placeholder="Una breve presentación de tu trabajo." value={draft.bio} onChange={(e) => onChange({ bio: e.target.value })} />
        <p className="mt-1 text-[11px] text-muted">{draft.bio.length}/{MAX_BIO}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="person-web">Sitio web</label>
          <input id="person-web" className="field" placeholder="https://" value={draft.web} onChange={(e) => onChange({ web: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="person-ig">Instagram</label>
          <input id="person-ig" className="field" placeholder="@usuario" value={draft.instagram} onChange={(e) => onChange({ instagram: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="person-imdb">IMDb u otra ficha</label>
          <input id="person-imdb" className="field" placeholder="https://" value={draft.imdb} onChange={(e) => onChange({ imdb: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="person-port">Portafolio</label>
          <input id="person-port" className="field" placeholder="https://" value={draft.portfolio} onChange={(e) => onChange({ portfolio: e.target.value })} />
        </div>
      </div>

      <section aria-label="Contacto público">
        <h2 className="mb-1 text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Contacto en el directorio</h2>
        <p className="mb-3 text-xs leading-relaxed text-muted">Opcional. Solo se publica lo que marques. El correo de verificación, más abajo, no se publica.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="person-mail">Correo</label>
            <input id="person-mail" type="email" className="field" value={draft.publicEmail} onChange={(e) => onChange({ publicEmail: e.target.value })} />
            <label className="mt-2 flex items-center gap-2 text-xs text-muted">
              <input type="checkbox" checked={draft.showEmail} onChange={(e) => onChange({ showEmail: e.target.checked })} />
              Mostrar en el directorio
            </label>
          </div>
          <div>
            <label className="label" htmlFor="person-phone">Teléfono</label>
            <input id="person-phone" className="field" value={draft.publicPhone} onChange={(e) => onChange({ publicPhone: e.target.value })} />
            <label className="mt-2 flex items-center gap-2 text-xs text-muted">
              <input type="checkbox" checked={draft.showPhone} onChange={(e) => onChange({ showPhone: e.target.checked })} />
              Mostrar en el directorio
            </label>
          </div>
        </div>
      </section>

      <section aria-label="Créditos destacados">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Créditos destacados ({draft.credits.length}/{MAX_CREDITS})</h2>
          {draft.credits.length < MAX_CREDITS && (
            <button type="button" className="btn-ghost text-xs" onClick={() => onChange({ credits: [...draft.credits, { title: "", year: "", role: "" }] })}>
              <Plus className="h-3.5 w-3.5" /> Agregar
            </button>
          )}
        </div>
        <p className="mb-3 text-xs leading-relaxed text-muted">Producciones en las que trabajaste: título, año y tu rol. Hasta {MAX_CREDITS}.</p>
        <div className="space-y-2">
          {draft.credits.map((c, i) => (
            <div key={i} className="grid grid-cols-[1fr_5.5rem_1fr_auto] items-center gap-2">
              <input className="field" placeholder="Producción" aria-label="Producción" value={c.title} onChange={(e) => onChange({ credits: draft.credits.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} />
              <input className="field" placeholder="Año" inputMode="numeric" aria-label="Año" value={c.year} onChange={(e) => onChange({ credits: draft.credits.map((x, j) => (j === i ? { ...x, year: numericInput(e.target.value) } : x)) })} />
              <input className="field" placeholder="Tu rol" aria-label="Rol" value={c.role} onChange={(e) => onChange({ credits: draft.credits.map((x, j) => (j === i ? { ...x, role: e.target.value } : x)) })} />
              <button type="button" className="btn-ghost px-2" aria-label="Quitar crédito" onClick={() => onChange({ credits: draft.credits.filter((_, j) => j !== i) })}>
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
