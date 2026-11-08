"use client";

import { useMemo, useState } from "react";
import { LAYERS } from "@/lib/types";
import { cn, fmtInt, fmtMoney } from "@/lib/utils";
import Link from "next/link";
import { downloadHref } from "@/lib/view";
import { BrandFooter } from "@/components/site/Brand";
import { hasAnchor, isAbroad } from "@/lib/completeness";
import type { StatKey } from "@/lib/site-settings";
import type { Film } from "@/lib/types";
import { DownloadLink, Empty, FilmCard, OrgCard, PanelShell, type PanelCtx, SectionTitle, Stat, StatsGrid, LocacionChip, locacionCounts } from "./parts";

export default function OverviewPanel({ ctx }: { ctx: PanelCtx }) {
  const { data, gaz, aggs, view, go } = ctx;
  const layer = LAYERS.find((l) => l.id === view.layer)!;
  const [showAll, setShowAll] = useState(false);

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

  const t = aggs.total;
  // solo para el equipo: en cuántas producciones hay dato de cada cifra
  const cover = (k: StatKey) => {
    const has = (f: Film) => f.locations.some((l) => !isAbroad(l) && (k === "films" ? hasAnchor(l) : k === "days" ? l.days != null : k === "spend" ? l.local_spend != null : l.jobs != null));
    return `dato en ${data.films.filter(has).length} de ${data.films.length}`;
  };
  const list = view.layer === "produccion" ? films : orgs;
  const mobile = !!ctx.mobile;
  const full = ctx.sheet === "full";
  const previewN = mobile ? 8 : 6;
  const shown = showAll ? list : list.slice(0, previewN);

  const counts = useMemo(() => locacionCounts(ctx.allFilms), [ctx.allFilms]);
  const loc = view.filmFilter.locacion;

  const heading = (
    <>
      <h2 className={cn("font-display tracking-tight text-ink", mobile ? "text-[22px] leading-tight" : "text-[30px] leading-[1.05]")}>
        {view.layer === "produccion" && "Dónde se ha filmado en Guatemala"}
        {view.layer === "circulacion" && "Dónde se ve cine en Guatemala"}
        {view.layer === "industria" && "Quién hace cine en Guatemala"}
      </h2>
      {!mobile && (
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Toca un departamento o municipio, o busca con <span className="kbd">⌘ K</span>. Acércate al mapa para ver cada
          locación.
        </p>
      )}
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
    </>
  );

  const stats =
    view.layer === "produccion" ? (
      <StatsGrid
        className={mobile ? "mt-4" : "mt-5"}
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
      <div className={cn("grid grid-cols-2 gap-2.5", mobile ? "mt-4" : "mt-5")}>
        <Stat label={view.layer === "circulacion" ? "Espacios de circulación" : "Empresas e instituciones"} value={fmtInt(t.orgs)} />
        <Stat label="Departamentos presentes" value={fmtInt(aggs.depto.size)} sub="de 22" />
      </div>
    );

  // solo para el equipo: cuántos registros tienen datos pendientes
  const pendingNote = ctx.canEdit && !mobile && incomplete > 0 && (
    <p className="mt-3 text-xs text-muted">
      <span className="text-warn">{incomplete}</span> de {totalRecords} registros tienen información pendiente.
    </p>
  );

  const listTitle = view.layer === "produccion" ? "Producciones" : "Registros";
  const listBlock = (
    <>
      {view.layer === "produccion" && ctx.allFilms.length > 0 ? (
        <div className={cn("mb-2 flex items-center justify-between gap-2", mobile ? "mt-1" : "mt-7")}>
          <h3 className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
            {listTitle} <span className="tabular-nums">{list.length}</span>
          </h3>
          <div className="flex items-center gap-1.5">
            <LocacionChip value={loc} counts={counts} onChange={go.locacion} />
          </div>
        </div>
      ) : (
        <SectionTitle aside={`${list.length}`}>{listTitle}</SectionTitle>
      )}
      <div className="-mx-2 space-y-0.5">
        {view.layer === "produccion"
          ? (shown as typeof films).map((f) => <FilmCard key={f.id} film={f} gaz={gaz} hideBadge={mobile && !ctx.canEdit} onClick={() => go.film(f.slug)} />)
          : (shown as typeof orgs).map((o) => <OrgCard key={o.id} org={o} gaz={gaz} hideBadge={mobile && !ctx.canEdit} onClick={() => go.org(o.slug)} />)}
        {list.length === 0 && (
          <Empty>
            {view.layer !== "produccion"
              ? "Sin registros todavía."
              : loc === "con" && counts.sin > 0
                ? "Ninguna producción tiene locación todavía."
                : loc
                  ? "Ninguna producción coincide con este filtro."
                  : "Sin registros todavía."}
          </Empty>
        )}
      </div>
      {list.length > previewN && (
        <button className="btn-ghost mt-2 min-h-[44px] w-full text-xs" onClick={() => setShowAll((s) => !s)}>
          {showAll ? "Ver menos" : `Ver las ${list.length}`}
        </button>
      )}
    </>
  );

  if (mobile) {
    return (
      <PanelShell eyebrow={layer.blurb}>
        {heading}
        {listBlock}
        {stats}
        {list.length > 0 && <DownloadLink href={downloadHref(view)} label="Descargar estos datos" />}
        {full && <BrandFooter bare className="mt-6 border-t border-line pt-5 [&_img]:max-h-8" />}
      </PanelShell>
    );
  }

  return (
    <PanelShell eyebrow={layer.blurb}>
      {heading}
      {stats}
      {pendingNote}
      {listBlock}
      {list.length > 0 && <DownloadLink href={downloadHref(view)} label="Descargar estos datos" />}
      <BrandFooter bare className="mt-8 border-t border-line pt-5 [&_img]:max-h-8" />
    </PanelShell>
  );
}
