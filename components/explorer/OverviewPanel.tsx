"use client";

import { useMemo, useState } from "react";
import { metricText, metricValueText } from "@/lib/format";
import { metricValue } from "@/lib/aggregate";
import { LAYERS, METRICS } from "@/lib/types";
import { fmtInt, fmtMoney } from "@/lib/utils";
import Link from "next/link";
import { downloadHref } from "@/lib/view";
import { BrandFooter } from "@/components/site/Brand";
import { hasAnchor, isAbroad } from "@/lib/completeness";
import type { StatKey } from "@/lib/site-settings";
import type { Film } from "@/lib/types";
import { Globe2, MapPinOff } from "lucide-react";
import { abroadFilms, unlocatedFilms } from "@/lib/map/features";
import { BarRow, DownloadLink, Empty, FilmCard, OrgCard, PanelShell, type PanelCtx, SectionTitle, Stat, StatsGrid, LocacionFilter } from "./parts";

export default function OverviewPanel({ ctx }: { ctx: PanelCtx }) {
  const { data, gaz, aggs, view, go } = ctx;
  const layer = LAYERS.find((l) => l.id === view.layer)!;
  const [showAll, setShowAll] = useState(false);

  const top = useMemo(() => {
    return gaz.entries
      .filter((e) => e.type === "depto")
      .map((e) => ({ e, v: metricValue(aggs.depto.get(e.code), view.metric) }))
      .filter((x) => x.v > 0)
      .sort((a, b) => b.v - a.v)
      .slice(0, 6);
  }, [gaz, aggs, view.metric]);

  const films = useMemo(
    () => [...data.films].sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || a.title.localeCompare(b.title)),
    [data.films],
  );
  const orgs = useMemo(
    () => data.orgs.filter((o) => o.layer === view.layer).sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)),
    [data.orgs, view.layer],
  );
  const incomplete =
    view.layer === "produccion"
      ? data.films.filter((f) => f.completeness < 100).length
      : orgs.filter((o) => o.completeness < 100).length;
  const totalRecords = view.layer === "produccion" ? films.length : orgs.length;

  const unlocated = useMemo(() => unlocatedFilms(data.films).length, [data.films]);
  const abroad = useMemo(() => abroadFilms(data.films).length, [data.films]);
  const t = aggs.total;
  // solo para el equipo: en cuántas producciones hay dato de cada cifra
  const cover = (k: StatKey) => {
    const has = (f: Film) => f.locations.some((l) => !isAbroad(l) && (k === "films" ? hasAnchor(l) : k === "days" ? l.days != null : k === "spend" ? l.local_spend != null : l.jobs != null));
    return `dato en ${data.films.filter(has).length} de ${data.films.length}`;
  };
  const list = view.layer === "produccion" ? films : orgs;
  const shown = showAll ? list : list.slice(0, 6);

  return (
    <PanelShell eyebrow={layer.blurb}>
      <h2 className="font-display text-[30px] leading-[1.05] tracking-tight text-ink">
        {view.layer === "produccion" && "Dónde se ha filmado en Guatemala"}
        {view.layer === "circulacion" && "Dónde se ve cine en Guatemala"}
        {view.layer === "industria" && "Quién hace cine en Guatemala"}
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Toca un departamento o municipio, o busca con <span className="kbd">⌘ K</span>. Acércate al mapa para ver cada
        locación.
      </p>
      {data.films.length + data.orgs.length === 0 && (
        <div className="mt-4 rounded-xl border border-dashed border-line px-3.5 py-3 text-sm text-muted">
          <p className="font-medium text-ink">Todavía no hay información publicada.</p>
          {ctx.canEdit ? (
            <p className="mt-1 text-xs leading-relaxed">
              Empieza en <Link href="/admin/agregar" className="text-accent underline underline-offset-2">Agregar datos</Link>.
            </p>
          ) : (
            <p className="mt-1 text-xs leading-relaxed">El mapa se llenará a medida que el equipo de la Academia publique registros.</p>
          )}
        </div>
      )}

      {view.layer === "produccion" ? (
        <StatsGrid
          className="mt-5"
          stats={data.publicStats}
          canEdit={ctx.canEdit}
          items={[
            { key: "films", label: "Producciones con locación", value: fmtInt(t.films), coverage: cover("films") },
            { key: "days", label: "Días de rodaje", value: fmtInt(t.days), coverage: cover("days") },
            { key: "spend", label: "Inversión local", value: fmtMoney(t.spend), coverage: cover("spend") },
            { key: "jobs", label: "Empleos generados", value: fmtInt(t.jobs), coverage: cover("jobs") },
          ]}
        />
      ) : (
        <div className="mt-5 grid grid-cols-2 gap-2.5">
          <Stat label={view.layer === "circulacion" ? "Espacios de circulación" : "Empresas e instituciones"} value={fmtInt(t.orgs)} />
          <Stat label="Departamentos presentes" value={fmtInt(aggs.depto.size)} sub="de 22" />
        </div>
      )}

      {view.layer === "produccion" && unlocated > 0 && (
        <button
          onClick={go.unlocated}
          className="mt-3 flex w-full items-center gap-2 rounded-xl border border-dashed border-line px-3 py-2 text-left text-xs text-muted transition hover:border-accent hover:text-ink"
        >
          <MapPinOff className="h-4 w-4 shrink-0" />
          <span>
            <b className="font-medium text-ink">{fmtInt(unlocated)}</b> {unlocated === 1 ? "producción no tiene" : "producciones no tienen"} lugar de rodaje. Están en la zona «Sin locación».
          </span>
        </button>
      )}

      {view.layer === "produccion" && abroad > 0 && (
        <button
          onClick={go.abroad}
          className="mt-3 flex w-full items-center gap-2 rounded-xl border border-dashed border-line px-3 py-2 text-left text-xs text-muted transition hover:border-accent hover:text-ink"
        >
          <Globe2 className="h-4 w-4 shrink-0" />
          <span>
            <b className="font-medium text-ink">{fmtInt(abroad)}</b> {abroad === 1 ? "producción se rodó" : "producciones se rodaron"} fuera de Guatemala. Están en la zona «Fuera de Guatemala».
          </span>
        </button>
      )}

      {incomplete > 0 && (
        <p className="mt-3 text-xs text-muted">
          <span className="text-warn">{incomplete}</span> de {totalRecords} registros tienen información pendiente.
        </p>
      )}

      <SectionTitle aside={METRICS[view.metric].label}>Más actividad por departamento</SectionTitle>
      {top.length === 0 ? (
        <Empty>Aún no hay registros con locación en esta capa.</Empty>
      ) : (
        <div className="-mx-1">
          {top.map(({ e, v }) => (
            <BarRow
              key={e.code}
              label={e.name}
              value={v}
              max={top[0].v}
              text={metricText(aggs.depto.get(e.code), view.metric, view.layer) || metricValueText(v, view.metric)}
              onClick={() => go.place({ type: "depto", code: e.code })}
            />
          ))}
        </div>
      )}

      <SectionTitle aside={`${list.length}`}>{view.layer === "produccion" ? "Producciones" : "Registros"}</SectionTitle>
      {view.layer === "produccion" && (films.length > 0 || view.filmFilter.locacion) && <LocacionFilter value={view.filmFilter.locacion} onChange={go.locacion} />}
      <div className="-mx-2 space-y-0.5">
        {view.layer === "produccion"
          ? (shown as typeof films).map((f) => <FilmCard key={f.id} film={f} gaz={gaz} onClick={() => go.film(f.slug)} />)
          : (shown as typeof orgs).map((o) => <OrgCard key={o.id} org={o} gaz={gaz} onClick={() => go.org(o.slug)} />)}
        {list.length === 0 && <Empty>{view.layer === "produccion" && view.filmFilter.locacion ? "Ninguna producción coincide con este filtro." : "Sin registros todavía."}</Empty>}
      </div>
      {list.length > 6 && (
        <button className="btn-ghost mt-2 w-full text-xs" onClick={() => setShowAll((s) => !s)}>
          {showAll ? "Ver menos" : `Ver las ${list.length}`}
        </button>
      )}
      {list.length > 0 && <DownloadLink href={downloadHref(view)} label="Descargar estos datos" />}
      <BrandFooter bare className="mt-8 border-t border-line pt-5 [&_img]:max-h-8" />
    </PanelShell>
  );
}
