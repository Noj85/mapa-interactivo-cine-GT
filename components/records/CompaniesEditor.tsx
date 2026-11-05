"use client";

import { Plus, Trash2 } from "lucide-react";
import { useId } from "react";
import { COUNTRIES, HOME_COUNTRY } from "@/lib/countries";
import type { Nationality } from "@/lib/types";
import { blankCompany, type CompanyDraft } from "./drafts";

const MAX_COMPANIES = 20;

const HELP: Record<Nationality, string> = {
  guatemalteca: "Producción guatemalteca: escribe el nombre de cada casa productora. El país es Guatemala.",
  coproduccion: "Coproducción internacional: agrega cada casa productora con su país. Puedes poner varias.",
  extranjera: "Producción extranjera: agrega cada casa productora con su país. Puedes poner varias.",
};

/**
 * Casas productoras de la producción. Lo que se pide depende de la nacionalidad elegida:
 * en una producción guatemalteca el país queda fijo; en las demás se escribe el país de cada casa.
 */
export function CompaniesEditor({
  companies,
  nationality,
  onChange,
}: {
  companies: CompanyDraft[];
  nationality: Nationality | "";
  onChange: (next: CompanyDraft[]) => void;
}) {
  const listId = useId();
  const local = nationality === "guatemalteca";
  const set = (i: number, patch: Partial<CompanyDraft>) => onChange(companies.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const filled = companies.filter((c) => c.name.trim()).length;
  // en una coproducción la primera casa suele ser guatemalteca
  const nextCountry = local ? HOME_COUNTRY : nationality === "coproduccion" && companies.length === 0 ? HOME_COUNTRY : "";

  return (
    <section aria-label="Casas productoras">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Casas productoras ({filled})</h2>
        {nationality && (
          <button type="button" className="btn-outline !px-3 !py-1.5 text-xs" disabled={companies.length >= MAX_COMPANIES} onClick={() => onChange([...companies, blankCompany(nextCountry)])}>
            <Plus className="h-3.5 w-3.5" /> Agregar casa productora
          </button>
        )}
      </div>

      {!nationality ? (
        <p className="rounded-2xl border border-dashed border-line px-4 py-4 text-sm text-muted">
          Elige primero la nacionalidad de la producción para registrar sus casas productoras.
        </p>
      ) : (
        <>
          <p className="mb-3 text-xs leading-relaxed text-muted">{HELP[nationality]}</p>
          <div className="space-y-3">
            {companies.map((c, i) => (
              <div key={i} className="grid items-end gap-3 rounded-2xl border border-line bg-surface p-3 sm:grid-cols-[1fr_220px_auto]">
                <div>
                  <label className="label" htmlFor={`co-name-${i}`}>Casa productora {i + 1}</label>
                  <input id={`co-name-${i}`} className="field" maxLength={300} value={c.name} onChange={(e) => set(i, { name: e.target.value })} />
                </div>
                <div>
                  <label className="label" htmlFor={`co-country-${i}`}>País</label>
                  {local ? (
                    <div id={`co-country-${i}`} className="field flex items-center text-muted">{HOME_COUNTRY}</div>
                  ) : (
                    <input
                      id={`co-country-${i}`}
                      className="field"
                      list={listId}
                      maxLength={100}
                      autoComplete="off"
                      placeholder="Escribe o elige"
                      value={c.country}
                      onChange={(e) => set(i, { country: e.target.value })}
                    />
                  )}
                </div>
                <button type="button" className="mb-2 justify-self-end text-muted hover:text-danger" aria-label={`Quitar casa productora ${i + 1}`} onClick={() => onChange(companies.filter((_, j) => j !== i))}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            {companies.length === 0 && (
              <div className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">
                Todavía no hay casas productoras. Usa «Agregar casa productora».
              </div>
            )}
          </div>
          {!local && (
            <datalist id={listId}>
              {COUNTRIES.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          )}
        </>
      )}
    </section>
  );
}
