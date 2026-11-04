"use client";

import { MapPinned } from "lucide-react";
import { useState } from "react";
import { LocationPicker } from "@/components/admin/LocationPicker";
import { PlaceField } from "@/components/admin/PlaceField";
import { CIRC_CATEGORIES, IND_CATEGORIES, INITIATIVE_TYPES, LAYERS, type InitiativeType } from "@/lib/types";
import type { OrgDraft, OrgLayerId } from "./drafts";

/** Campos de una entidad. Los usa el editor del equipo y el formulario público. */
export function OrgFields({ draft: d, onChange }: { draft: OrgDraft; onChange: (patch: Partial<OrgDraft>) => void }) {
  const [picker, setPicker] = useState(false);
  const categories = d.layer === "circulacion" ? CIRC_CATEGORIES : IND_CATEGORIES;
  const layers = LAYERS.filter((l) => l.id !== "produccion");
  const blurb = layers.find((l) => l.id === d.layer)?.blurb;

  return (
    <section className="space-y-4">
      <div>
        <label className="label" htmlFor="o-name">Nombre *</label>
        <input id="o-name" className="field text-base" maxLength={300} value={d.name} onChange={(e) => onChange({ name: e.target.value })} />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="o-layer">Capa</label>
          <select id="o-layer" className="field" value={d.layer} onChange={(e) => onChange({ layer: e.target.value as OrgLayerId, category: "" })}>
            {layers.map((l) => (
              <option key={l.id} value={l.id}>{l.label}</option>
            ))}
          </select>
          {blurb && <p className="mt-1 text-[11px] leading-snug text-muted">{blurb}</p>}
        </div>
        <div>
          <label className="label" htmlFor="o-cat">Categoría *</label>
          <select id="o-cat" className="field" value={d.category} onChange={(e) => onChange({ category: e.target.value })}>
            <option value="">Elegir…</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
            {d.category && !(categories as readonly string[]).includes(d.category) && <option value={d.category}>{d.category}</option>}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="o-type">Tipo de iniciativa</label>
          <select id="o-type" className="field" value={d.type} onChange={(e) => onChange({ type: e.target.value as InitiativeType | "" })}>
            <option value="">Sin definir</option>
            {INITIATIVE_TYPES.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Lugar</label>
          <PlaceField value={{ muni_ine: d.muni_ine, depto_ine: d.depto_ine }} onChange={(v) => onChange(v)} />
        </div>
        <div>
          <label className="label" htmlFor="o-city">Ciudad o referencia</label>
          <input id="o-city" className="field" maxLength={200} value={d.city} onChange={(e) => onChange({ city: e.target.value })} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <button type="button" className="btn-outline !px-3 !py-1.5 text-xs" onClick={() => setPicker(true)}>
          <MapPinned className="h-3.5 w-3.5" /> {d.lat != null ? "Mover punto en el mapa" : "Elegir punto exacto en el mapa"}
        </button>
        {d.lat != null && (
          <>
            <span>{d.lat}, {d.lng}</span>
            <button type="button" className="hover:text-danger" onClick={() => onChange({ lat: null, lng: null })}>quitar punto</button>
          </>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="o-web">Sitio web</label>
          <input id="o-web" className="field" inputMode="url" maxLength={300} value={d.web} onChange={(e) => onChange({ web: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="o-ig">Instagram</label>
          <input id="o-ig" className="field" maxLength={100} placeholder="@usuario" value={d.instagram} onChange={(e) => onChange({ instagram: e.target.value })} />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="o-contact">Contacto</label>
        <input id="o-contact" className="field" maxLength={300} value={d.contact} onChange={(e) => onChange({ contact: e.target.value })} />
      </div>
      <div>
        <label className="label" htmlFor="o-desc">Descripción</label>
        <textarea id="o-desc" className="field min-h-24" maxLength={2000} value={d.description} onChange={(e) => onChange({ description: e.target.value })} />
      </div>

      {picker && (
        <LocationPicker
          initial={{ lat: d.lat, lng: d.lng, muni_ine: d.muni_ine, depto_ine: d.depto_ine }}
          onClose={() => setPicker(false)}
          onPick={(p) => {
            onChange({ lat: p.lat, lng: p.lng, ...(p.muni_ine != null ? { muni_ine: p.muni_ine, depto_ine: p.depto_ine } : {}) });
            setPicker(false);
          }}
        />
      )}
    </section>
  );
}
