"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { CAST_ROLE, CREW_GROUPS, EXTRA_ROLES, MAX_CAST, MAX_CREW, OTHER_ROLE } from "@/lib/crew";
import { blankCrew, type CrewDraft } from "./drafts";

const POPULAR = EXTRA_ROLES.filter((r) => r.popular);

/**
 * Equipo extra y reparto de la producción. Director/a, productor/a, fotografía y guion tienen su campo propio arriba;
 * aquí se agregan los demás roles (edición, sonido, música original, reparto…), con varias personas por rol.
 * Empieza cerrado si todavía no hay nadie, para no alargar el formulario.
 */
export function CrewEditor({ crew, onChange }: { crew: CrewDraft[]; onChange: (next: CrewDraft[]) => void }) {
  const [open, setOpen] = useState(crew.length > 0);
  const cast = crew.filter((m) => m.role === CAST_ROLE).length;
  const team = crew.length - cast;
  const filled = crew.filter((m) => m.name.trim()).length;
  const fullTeam = team >= MAX_CREW;
  const fullCast = cast >= MAX_CAST;

  const set = (i: number, patch: Partial<CrewDraft>) => onChange(crew.map((m, j) => (j === i ? { ...m, ...patch } : m)));
  const add = (role: string) => {
    if (role === CAST_ROLE ? fullCast : fullTeam) return;
    setOpen(true);
    onChange([...crew, blankCrew(role)]);
  };
  const lastRole = crew.length ? crew[crew.length - 1].role : null;

  return (
    <section aria-label="Más equipo y reparto">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Más equipo y reparto ({filled})</h2>
        <button type="button" className="btn-outline !px-3 !py-1.5 text-xs" disabled={fullTeam && fullCast} onClick={() => add(POPULAR[0]?.id ?? "edicion")}>
          <Plus className="h-3.5 w-3.5" /> Agregar equipo
        </button>
      </div>

      {!open && crew.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line px-4 py-4 text-sm text-muted">
          Edición, sonido, música original, dirección de arte, reparto y más. Usa «Agregar equipo» si quieres sumarlos.
        </p>
      ) : (
        <>
          <p className="mb-3 text-xs leading-relaxed text-muted">
            Elige el rol y escribe el nombre. Para varias personas con el mismo rol, agrega una fila por persona.
          </p>
          <div className="space-y-3">
            {crew.map((m, i) => (
              <div key={i} className="grid items-end gap-3 rounded-2xl border border-line bg-surface p-3 sm:grid-cols-[210px_1fr_auto]">
                <div>
                  <label className="label" htmlFor={`cr-role-${i}`}>Rol</label>
                  <select id={`cr-role-${i}`} className="field" value={m.role} onChange={(e) => set(i, { role: e.target.value, detail: "" })}>
                    <optgroup label="Más usados">
                      {POPULAR.map((r) => (
                        <option key={r.id} value={r.id}>{r.label}</option>
                      ))}
                    </optgroup>
                    {CREW_GROUPS.map((g) => {
                      const roles = EXTRA_ROLES.filter((r) => r.group === g.id && !r.popular);
                      return roles.length ? (
                        <optgroup key={g.id} label={g.label}>
                          {roles.map((r) => (
                            <option key={r.id} value={r.id}>{r.label}</option>
                          ))}
                        </optgroup>
                      ) : null;
                    })}
                  </select>
                </div>
                <div className={m.role === CAST_ROLE || m.role === OTHER_ROLE ? "grid gap-3 sm:grid-cols-2" : ""}>
                  <div>
                    <label className="label" htmlFor={`cr-name-${i}`}>Nombre</label>
                    <input id={`cr-name-${i}`} className="field" maxLength={300} autoComplete="off" value={m.name} onChange={(e) => set(i, { name: e.target.value })} />
                  </div>
                  {(m.role === CAST_ROLE || m.role === OTHER_ROLE) && (
                    <div>
                      <label className="label" htmlFor={`cr-detail-${i}`}>{m.role === CAST_ROLE ? "Personaje (opcional)" : "Nombre del rol"}</label>
                      <input id={`cr-detail-${i}`} className="field" maxLength={120} autoComplete="off" value={m.detail} onChange={(e) => set(i, { detail: e.target.value })} />
                    </div>
                  )}
                </div>
                <button type="button" className="mb-2 justify-self-end text-muted hover:text-danger" aria-label={`Quitar a ${m.name.trim() || `la persona ${i + 1}`}`} onClick={() => onChange(crew.filter((_, j) => j !== i))}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            {crew.length === 0 && (
              <div className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">
                Todavía no hay equipo adicional. Usa «Agregar equipo».
              </div>
            )}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {lastRole && (
              <button type="button" className="btn-outline !px-3 !py-1.5 text-xs" disabled={lastRole === CAST_ROLE ? fullCast : fullTeam} onClick={() => add(lastRole)}>
                <Plus className="h-3.5 w-3.5" /> Otra persona con el mismo rol
              </button>
            )}
            {(fullTeam || fullCast) && (
              <span className="text-xs text-muted">
                {fullTeam ? `Llegaste al máximo de ${MAX_CREW} personas de equipo.` : `Llegaste al máximo de ${MAX_CAST} personas del reparto.`}
              </span>
            )}
          </div>
        </>
      )}
    </section>
  );
}
