"use client";

import { Check, MapPinned } from "lucide-react";
import { useState } from "react";
import { LocationPicker } from "@/components/admin/LocationPicker";
import { PlaceSelect } from "./PlaceSelect";
import { MAX_CATEGORIES } from "@/lib/categories";
import { CIRC_CATEGORIES, IND_CATEGORIES, INITIATIVE_TYPES, LAYERS, type InitiativeType } from "@/lib/types";
import { cn } from "@/lib/utils";
import { normalizeEmail, normalizePhone } from "@/lib/contact";
import { orgContactErrors, type OrgDraft, type OrgLayerId } from "./drafts";

/** Campos de una entidad. Los usa el editor del equipo y el formulario público. */
export function OrgFields({ draft: d, onChange }: { draft: OrgDraft; onChange: (patch: Partial<OrgDraft>) => void }) {
  const [picker, setPicker] = useState(false);
  const base: readonly string[] = d.layer === "circulacion" ? CIRC_CATEGORIES : IND_CATEGORIES;
  // categorías antiguas que no están en la lista (p. ej. de una importación) se conservan y se pueden quitar
  const options = [...base, ...d.categories.filter((c) => !base.includes(c))];
  const contactErr = orgContactErrors(d);
  const toggle = (c: string) => onChange({ categories: d.categories.includes(c) ? d.categories.filter((x) => x !== c) : [...d.categories, c] });
  const layers = LAYERS.filter((l) => l.id !== "produccion");
  const blurb = layers.find((l) => l.id === d.layer)?.blurb;

  return (
    <section className="space-y-4">
      <div>
        <label className="label" htmlFor="o-name">Nombre *</label>
        <input id="o-name" className="field text-base" maxLength={300} value={d.name} onChange={(e) => onChange({ name: e.target.value })} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="o-layer">Capa</label>
          <select id="o-layer" className="field" value={d.layer} onChange={(e) => onChange({ layer: e.target.value as OrgLayerId, categories: [] })}>
            {layers.map((l) => (
              <option key={l.id} value={l.id}>{l.label}</option>
            ))}
          </select>
          {blurb && <p className="mt-1 text-[11px] leading-snug text-muted">{blurb}</p>}
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
      <fieldset>
        <legend className="label">Categorías * <span className="font-normal text-muted">(elige todas las que apliquen)</span></legend>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Categorías">
          {options.map((c) => {
            const idx = d.categories.indexOf(c);
            const on = idx >= 0;
            return (
              <button
                key={c}
                type="button"
                role="checkbox"
                aria-checked={on}
                disabled={!on && d.categories.length >= MAX_CATEGORIES}
                onClick={() => toggle(c)}
                className={cn(
                  "flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm transition-colors disabled:opacity-40",
                  on ? "border-accent bg-accent/10 text-ink" : "border-line text-muted hover:border-accent/60 hover:text-ink",
                )}
              >
                {on && <Check className="h-3.5 w-3.5 text-accent" />}
                {c}
                {on && idx === 0 && d.categories.length > 1 && <span className="rounded bg-accent px-1 text-[10px] font-semibold uppercase text-accent-ink">principal</span>}
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-[11px] leading-snug text-muted">
          Una entidad puede tener varias (por ejemplo, producción y postproducción). La primera que elijas es la principal.
        </p>
      </fieldset>
      <div>
        <label className="label">Departamento y municipio</label>
        <PlaceSelect idPrefix="org" value={{ muni_ine: d.muni_ine, depto_ine: d.depto_ine }} onChange={(v) => onChange(v)} />
      </div>
      <div>
        <label className="label" htmlFor="o-city">Dirección exacta (opcional)</label>
        <input id="o-city" className="field" maxLength={200} placeholder="Calle, zona, edificio, referencia…" value={d.city} onChange={(e) => onChange({ city: e.target.value })} />
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
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="o-phone">Teléfono</label>
          <input
            id="o-phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            className="field"
            maxLength={30}
            placeholder="5555 1234 o +502 5555 1234"
            aria-invalid={!!contactErr.phone}
            value={d.phone}
            onChange={(e) => onChange({ phone: e.target.value })}
            onBlur={() => {
              const n = normalizePhone(d.phone);
              if (n) onChange({ phone: n });
            }}
          />
          {contactErr.phone && <p role="alert" className="mt-1 text-xs text-danger">{contactErr.phone}</p>}
        </div>
        <div>
          <label className="label" htmlFor="o-email">Correo</label>
          <input
            id="o-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            className="field"
            maxLength={200}
            placeholder="nombre@dominio.org"
            aria-invalid={!!contactErr.email}
            value={d.email}
            onChange={(e) => onChange({ email: e.target.value })}
            onBlur={() => {
              const n = normalizeEmail(d.email);
              if (n) onChange({ email: n });
            }}
          />
          {contactErr.email && <p role="alert" className="mt-1 text-xs text-danger">{contactErr.email}</p>}
        </div>
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
