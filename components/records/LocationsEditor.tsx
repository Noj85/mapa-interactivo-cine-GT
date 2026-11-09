"use client";

import { Layers, MapPinned, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { LocationPicker, type PickedPoint } from "@/components/admin/LocationPicker";
import { PlaceSelect } from "./PlaceSelect";
import { COUNTRIES } from "@/lib/countries";
import { loadGeo, type GeoBundle } from "@/lib/geo/load";
import { unifyLocations } from "@/lib/locations";
import { blankLoc, isBlankLoc, numericInput, wholeHint, type LocDraft } from "./drafts";

const MAX_LOCS = 20;

/** Aviso solo cuando el valor trae decimales: dice a qué entero se redondea. */
function RoundNotes({ days, jobs }: { days: string; jobs: string }) {
  const d = wholeHint(days);
  const j = wholeHint(jobs);
  if (!d && !j) return null;
  return (
    <div className="mt-2 space-y-1">
      {d && <p className="text-xs leading-snug text-warn">Los días de rodaje se registran en jornadas completas: {d.shown} se guardará como {d.to}.</p>}
      {j && <p className="text-xs leading-snug text-warn">Los empleos se registran como número entero: {j.shown} se guardará como {j.to}.</p>}
    </div>
  );
}

/** Dónde se rodó una producción: una locación por lugar, con su punto en el mapa, días, inversión y empleos. */
export function LocationsEditor({ locs, onChange }: { locs: LocDraft[]; onChange: (next: LocDraft[]) => void }) {
  const [picker, setPicker] = useState<number | null>(null);
  const [geo, setGeo] = useState<GeoBundle | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");

  useEffect(() => {
    loadGeo().then(setGeo).catch(() => {});
  }, []);

  // dentro de un departamento solo cuenta como otra locación la de un municipio distinto: se avisa antes de guardar
  const unifyNote = (() => {
    const res = unifyLocations(locs.filter((l) => !isBlankLoc(l)).map((l) => ({ muni_ine: l.muni_ine, depto_ine: l.depto_ine, country: l.abroad ? l.country || "fuera" : null })));
    const parts: string[] = [];
    if (res.merged.length) parts.push(`Al guardar, ${res.merged.length === 1 ? "una locación repetida se unirá" : `${res.merged.length} locaciones repetidas se unirán`} con otra del mismo departamento: dentro de un departamento solo cuenta como locación aparte la de un municipio distinto, y se conserva la cifra mayor de días, inversión y empleos.`);
    if (res.manual.length) parts.push("Hay un departamento con varios municipios y una locación sin municipio: elige a qué municipio corresponde o quítala.");
    return parts.join(" ");
  })();

  const setLoc = (i: number, patch: Partial<LocDraft>) => onChange(locs.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  /** Pega varios lugares ("Antigua; Panajachel, Sololá; Flores") y crea una locación por cada uno. */
  const addMany = () => {
    const parts = bulkText.split(/[\n;]+/).map((t) => t.trim()).filter(Boolean);
    if (!parts.length) return;
    const rows: LocDraft[] = parts.map((text) => {
      const m = geo?.gaz.resolve(text) ?? [];
      const best = m[0];
      const clear = best && best.score >= 0.85 && (m.length === 1 || best.score - m[1].score >= 0.1);
      if (!clear) return { ...blankLoc(), site: text };
      return {
        ...blankLoc(),
        muni_ine: best.entry.type === "muni" ? best.entry.code : null,
        depto_ine: best.entry.depto_ine,
      };
    });
    onChange([...locs.filter((l) => !isBlankLoc(l)), ...rows].slice(0, MAX_LOCS));
    setBulkText("");
    setBulkOpen(false);
  };

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Locaciones ({locs.filter((l) => !isBlankLoc(l)).length})</h2>
        <div className="flex gap-2">
          <button type="button" className="btn-ghost !px-3 !py-1.5 text-xs" onClick={() => setBulkOpen((o) => !o)} aria-expanded={bulkOpen}>
            <Layers className="h-3.5 w-3.5" /> Pegar varios lugares
          </button>
          <button type="button" className="btn-outline !px-3 !py-1.5 text-xs" disabled={locs.length >= MAX_LOCS} onClick={() => onChange([...locs, blankLoc()])}>
            <Plus className="h-3.5 w-3.5" /> Agregar locación
          </button>
        </div>
      </div>
      <p className="-mt-1 mb-3 text-xs leading-relaxed text-muted">
        Una producción puede rodarse en varios lugares: agrega una locación por cada uno, con sus propios días, inversión y empleos.
      </p>
      {bulkOpen && (
        <div className="mb-3 rounded-2xl border border-line bg-surface p-4">
          <label className="label" htmlFor="bulk-places">Lugares de rodaje</label>
          <textarea
            id="bulk-places"
            className="field min-h-24"
            placeholder={"Antigua Guatemala\nPanajachel, Sololá\nFlores, Petén"}
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
          />
          <p className="mt-1.5 text-xs text-muted">Uno por línea o separados por «;». Los que no reconozcamos quedan como sitio para que elijas el municipio.</p>
          <div className="mt-3 flex gap-2">
            <button type="button" className="btn-primary !py-1.5 text-xs" disabled={!bulkText.trim()} onClick={addMany}>Agregar lugares</button>
            <button type="button" className="btn-ghost !py-1.5 text-xs" onClick={() => setBulkOpen(false)}>Cancelar</button>
          </div>
        </div>
      )}
      <div className="space-y-3">
        {locs.map((l, i) => (
          <div key={i} className="rounded-2xl border border-line bg-surface p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-ink">{i + 1}</span>
              <button type="button" className="text-muted hover:text-danger" aria-label="Quitar locación" onClick={() => onChange(locs.filter((_, j) => j !== i))}>
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <label className="mb-3 flex w-fit cursor-pointer items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={l.abroad}
                onChange={(e) =>
                  setLoc(
                    i,
                    e.target.checked
                      ? { abroad: true, muni_ine: null, depto_ine: null, lat: null, lng: null }
                      : { abroad: false, country: "", city: "" },
                  )
                }
              />
              Fuera de Guatemala
            </label>
            {l.abroad ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor={`loc-${i}-country`}>País</label>
                  <input
                    id={`loc-${i}-country`}
                    className="field"
                    list="loc-countries"
                    maxLength={100}
                    autoComplete="off"
                    placeholder="Escribe o elige"
                    value={l.country}
                    onChange={(e) => setLoc(i, { country: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label" htmlFor={`loc-${i}-city`}>Ciudad o lugar (opcional)</label>
                  <input id={`loc-${i}-city`} className="field" maxLength={150} placeholder="Ciudad de México, Oaxaca…" value={l.city} onChange={(e) => setLoc(i, { city: e.target.value })} />
                </div>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label">Departamento y municipio</label>
                  <PlaceSelect idPrefix={`loc-${i}`} geo={geo} value={{ muni_ine: l.muni_ine, depto_ine: l.depto_ine }} onChange={(v) => setLoc(i, v)} />
                </div>
                <div>
                  <label className="label">Dirección exacta (opcional)</label>
                  <input className="field" maxLength={200} placeholder="Calle, zona, finca, sitio de rodaje…" value={l.site} onChange={(e) => setLoc(i, { site: e.target.value })} />
                </div>
              </div>
            )}
            {!l.abroad && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
              <button type="button" className="btn-outline !px-3 !py-1.5 text-xs" onClick={() => setPicker(i)}>
                <MapPinned className="h-3.5 w-3.5" /> {l.lat != null ? "Mover punto en el mapa" : "Elegir punto en el mapa"}
              </button>
              {l.lat != null && (
                <>
                  <span>{l.lat}, {l.lng}</span>
                  <button type="button" className="hover:text-danger" onClick={() => setLoc(i, { lat: null, lng: null })}>quitar punto</button>
                </>
              )}
            </div>
            )}
            <div className="mt-3 grid grid-cols-3 gap-3">
              <div>
                <label className="label">Días</label>
                <input className="field" inputMode="decimal" value={l.days} onChange={(e) => setLoc(i, { days: numericInput(e.target.value, true) })} />
                <p className="mt-1 text-xs leading-snug text-muted">Jornadas completas; la fracción se redondea.</p>
              </div>
              <div>
                <label className="label">Inversión local (Q)</label>
                <input className="field" inputMode="decimal" value={l.local_spend} onChange={(e) => setLoc(i, { local_spend: numericInput(e.target.value, true) })} />
              </div>
              <div>
                <label className="label">Empleos</label>
                <input className="field" inputMode="decimal" value={l.jobs} onChange={(e) => setLoc(i, { jobs: numericInput(e.target.value, true) })} />
              </div>
            </div>
            <RoundNotes days={l.days} jobs={l.jobs} />
          </div>
        ))}
        <datalist id="loc-countries">
          {COUNTRIES.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
        {locs.length === 0 && (
          <div className="rounded-2xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
            Sin locaciones todavía. La producción se muestra en la zona «Sin locación» del mapa hasta que agregues dónde se rodó.
          </div>
        )}
      </div>

      {unifyNote && <p className="mt-3 rounded-xl border border-line bg-surface-2/50 px-3 py-2 text-xs leading-relaxed text-muted">{unifyNote}</p>}

      {picker != null && locs[picker] && (
        <LocationPicker
          initial={locs[picker]}
          onClose={() => setPicker(null)}
          onPick={(p: PickedPoint) => {
            setLoc(picker, { lat: p.lat, lng: p.lng, ...(p.muni_ine != null ? { muni_ine: p.muni_ine, depto_ine: p.depto_ine } : {}) });
            setPicker(null);
          }}
        />
      )}
    </section>
  );
}
