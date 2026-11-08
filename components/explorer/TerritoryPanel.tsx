"use client";

import { useMemo } from "react";
import { filmsIn, metricValue, orgsIn, type Agg } from "@/lib/aggregate";
import { metricText } from "@/lib/format";
import { LAYERS, type LayerId } from "@/lib/types";
import { fmtInt, fmtMoney } from "@/lib/utils";
import { downloadHref } from "@/lib/view";
import { BarRow, DownloadLink, Empty, FilmCard, OrgCard, PanelShell, type PanelCtx, SectionTitle, Stat, StatsGrid } from "./parts";

const ZERO: Agg = { films: 0, days: 0, spend: 0, jobs: 0, orgs: 0 };

export default function TerritoryPanel({ ctx }: { ctx: PanelCtx }) {
  const { data, gaz, aggs, view, go } = ctx;
  const place = view.place!;
  const entry = place.type === "muni" ? gaz.muni(place.code) : gaz.depto(place.code);
  const scope = place.type === "muni" ? { muni: place.code } : { depto: place.code };
  const agg = (place.type === "muni" ? aggs.muni : aggs.depto).get(place.code) ?? ZERO;

  const films = useMemo(() => filmsIn(data, scope), [data, place.type, place.code]); // eslint-disable-line react-hooks/exhaustive-deps
  const orgs = useMemo(() => orgsIn(data, view.layer, scope), [data, view.layer, place.type, place.code]); // eslint-disable-line react-hooks/exhaustive-deps

  const munis = useMemo(() => {
    if (place.type !== "depto") return [];
    return gaz
      .munisOf(place.code)
      .map((e) => ({ e, v: metricValue(aggs.muni.get(e.code), view.metric) }))
      .filter((x) => x.v > 0)
      .sort((a, b) => b.v - a.v);
  }, [gaz, aggs, place, view.metric]);

  // conteos en las otras capas
  const otherLayers = useMemo(
    () =>
      (["produccion", "circulacion", "industria"] as LayerId[])
        .filter((l) => l !== view.layer)
        .map((l) => ({
          l,
          n: l === "produccion" ? filmsIn(data, scope).length : orgsIn(data, l, scope).length,
        }))
        .filter((x) => x.n > 0),
    [data, view.layer, place.type, place.code], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const eyebrow =
    place.type === "muni" ? (
      <button className="hover:text-ink" onClick={() => go.place({ type: "depto", code: entry!.depto_ine })}>
        {entry?.depto} · Municipio
      </button>
    ) : (
      "Departamento"
    );

  return (
    <PanelShell eyebrow={eyebrow} onBack={go.up} onClose={go.clear}>
      <h2 className={ctx.mobile ? "font-display text-[26px] leading-tight tracking-tight text-ink" : "font-display text-[34px] leading-[1.05] tracking-tight text-ink"}>{entry?.name}</h2>

      {view.layer === "produccion" ? (
        <StatsGrid
          className="mt-4"
          stats={data.publicStats}
          canEdit={ctx.canEdit}
          items={[
            { key: "films", label: agg.films === 1 ? "Producción" : "Producciones", value: fmtInt(agg.films) },
            { key: "days", label: "Días de rodaje", value: fmtInt(agg.days) },
            { key: "spend", label: "Inversión local", value: fmtMoney(agg.spend) },
            { key: "jobs", label: "Empleos", value: fmtInt(agg.jobs) },
          ]}
        />
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <Stat label={LAYERS.find((l) => l.id === view.layer)!.label} value={fmtInt(agg.orgs)} sub="registros" />
        </div>
      )}

      {otherLayers.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {otherLayers.map(({ l, n }) => (
            <button key={l} className="chip transition hover:border-accent hover:text-ink" onClick={() => go.layer(l)}>
              {n} en {LAYERS.find((x) => x.id === l)!.label}
            </button>
          ))}
        </div>
      )}

      {place.type === "depto" && munis.length > 0 && (
        <>
          <SectionTitle>Municipios con actividad</SectionTitle>
          <div className="-mx-1">
            {munis.map(({ e, v }) => (
              <BarRow
                key={e.code}
                label={e.name}
                value={v}
                max={munis[0].v}
                text={metricText(aggs.muni.get(e.code), view.metric, view.layer)}
                onClick={() => go.place({ type: "muni", code: e.code })}
              />
            ))}
          </div>
        </>
      )}

      <SectionTitle aside={view.layer === "produccion" ? films.length : orgs.length}>
        {view.layer === "produccion" ? "Producciones rodadas aquí" : "Registros aquí"}
      </SectionTitle>
      <div className="-mx-2 space-y-0.5">
        {view.layer === "produccion" ? (
          films.length ? (
            films.map((f) => (
              <FilmCard
                key={f.id}
                film={f}
                gaz={gaz}
                hereMuni={place.type === "muni" ? place.code : undefined}
                hereDepto={place.type === "depto" ? place.code : undefined}
                hideBadge={!ctx.canEdit}
                onClick={() => go.film(f.slug)}
              />
            ))
          ) : (
            <Empty>Todavía no hay producciones registradas en {entry?.name}.</Empty>
          )
        ) : orgs.length ? (
          orgs.map((o) => <OrgCard key={o.id} org={o} gaz={gaz} hideBadge={!ctx.canEdit} onClick={() => go.org(o.slug)} />)
        ) : (
          <Empty>Sin registros en esta capa para {entry?.name}.</Empty>
        )}
      </div>
      {(view.layer === "produccion" ? films.length : orgs.length) > 0 && (
        <DownloadLink href={downloadHref({ layer: view.layer, place, filmFilter: view.filmFilter, orgFilter: view.orgFilter })} label={`Descargar datos de ${entry?.name ?? "este lugar"}`} />
      )}
    </PanelShell>
  );
}
