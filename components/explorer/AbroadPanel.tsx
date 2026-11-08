"use client";

import { Globe2, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { isAbroad } from "@/lib/completeness";
import { companyNames } from "@/lib/companies";
import { abroadFilms } from "@/lib/map/features";
import type { Film } from "@/lib/types";
import { normalize } from "@/lib/utils";
import { Empty, FilmCard, PanelShell, type PanelCtx, SectionTitle } from "./parts";

const STEP = 40;

const countriesOf = (f: Film) => [...new Set(f.locations.filter(isAbroad).map((l) => (l.country ?? "").trim()))].filter(Boolean);

/** Producciones guatemaltecas con alguna locación en otro país. Cuentan como ubicadas; solo están fuera del territorio. */
export default function AbroadPanel({ ctx }: { ctx: PanelCtx }) {
  const { data, gaz, go } = ctx;
  const films = useMemo(() => abroadFilms(data.films), [data.films]);
  const [q, setQ] = useState("");
  const [shown, setShown] = useState(STEP);

  const list = useMemo(() => {
    const nq = normalize(q);
    const match = (f: Film) =>
      normalize(`${f.title} ${f.director ?? ""} ${f.producer ?? ""} ${f.cinematographer ?? ""} ${f.screenwriter ?? ""} ${companyNames(f.companies).join(" ")} ${f.locations.map((l) => `${l.city ?? ""} ${l.country ?? ""}`).join(" ")}`).includes(nq);
    return (nq ? films.filter(match) : films).sort((a, b) => a.title.localeCompare(b.title, "es"));
  }, [films, q]);

  // una producción rodada en dos países aparece en los dos grupos
  const groups = useMemo(() => {
    const by = new Map<string, Film[]>();
    for (const f of list) for (const c of countriesOf(f)) by.set(c, [...(by.get(c) ?? []), f]);
    return [...by.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], "es"));
  }, [list]);

  let left = shown;

  return (
    <PanelShell eyebrow="Fuera del territorio" onBack={go.up} onClose={go.clear}>
      <div className="flex items-start gap-3">
        <span className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-muted">
          <Globe2 className="h-5 w-5" />
        </span>
        <h2 className="font-display text-[30px] leading-[1.05] tracking-tight text-ink">Rodadas fuera de Guatemala</h2>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        {films.length === 1 ? "Esta producción guatemalteca se rodó" : `Estas ${films.length.toLocaleString("es-GT")} producciones guatemaltecas se rodaron`} total o parcialmente en otros países. Se muestran en el marcador
        «Fuera de Guatemala», en el Pacífico frente a la costa.
      </p>

      {films.length > 8 && (
        <label className="relative mt-5 block">
          <span className="sr-only">Buscar entre las producciones rodadas fuera de Guatemala</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            className="field !pl-9"
            placeholder="Buscar por título, país, ciudad o persona"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setShown(STEP);
            }}
          />
        </label>
      )}

      {groups.length ? (
        groups.map(([country, items]) => {
          const part = items.slice(0, Math.max(0, left));
          left -= part.length;
          if (!part.length) return null;
          return (
            <section key={country}>
              <SectionTitle aside={items.length.toLocaleString("es-GT")}>{country}</SectionTitle>
              <div className="-mx-2 space-y-0.5">
                {part.map((f) => (
                  <FilmCard key={`${country}-${f.id}`} film={f} gaz={gaz} hideBadge={!ctx.canEdit} onClick={() => go.film(f.slug)} />
                ))}
              </div>
            </section>
          );
        })
      ) : (
        <Empty>{films.length ? "Ninguna coincide con la búsqueda." : "Ninguna producción tiene locaciones fuera de Guatemala."}</Empty>
      )}
      {groups.reduce((n, [, items]) => n + items.length, 0) > shown && (
        <button className="btn-outline mt-3 w-full text-xs" onClick={() => setShown((n) => n + STEP)}>
          Mostrar más
        </button>
      )}
    </PanelShell>
  );
}
