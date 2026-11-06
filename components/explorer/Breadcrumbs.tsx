"use client";

import { ChevronRight } from "lucide-react";
import type { Gazetteer } from "@/lib/geo/gazetteer";
import type { Dataset } from "@/lib/types";
import type { Place, ViewState } from "@/lib/view";

export function Breadcrumbs({
  view,
  gaz,
  data,
  onPlace,
  onClear,
}: {
  view: ViewState;
  gaz: Gazetteer;
  data: Dataset;
  onPlace(p: Place | null): void;
  onClear(): void;
}) {
  const crumbs: { label: string; onClick: () => void; current?: boolean }[] = [
    { label: "Guatemala", onClick: onClear, current: !view.place && !view.film && !view.org && !view.noloc && !view.abroad },
  ];
  if (view.noloc) crumbs.push({ label: "Sin locación", onClick: () => {}, current: true });
  if (view.abroad) crumbs.push({ label: "Fuera de Guatemala", onClick: () => {}, current: true });
  const place = view.place;
  if (place) {
    const e = place.type === "muni" ? gaz.muni(place.code) : gaz.depto(place.code);
    if (place.type === "muni" && e) {
      crumbs.push({ label: e.depto, onClick: () => onPlace({ type: "depto", code: e.depto_ine }) });
    }
    if (e) crumbs.push({ label: e.name, onClick: () => onPlace(place), current: !view.film && !view.org });
  }
  if (view.film) {
    const f = data.films.find((x) => x.slug === view.film);
    if (f) crumbs.push({ label: f.title, onClick: () => {}, current: true });
  }
  if (view.org) {
    const o = data.orgs.find((x) => x.slug === view.org);
    if (o) crumbs.push({ label: o.name, onClick: () => {}, current: true });
  }
  return (
    <nav aria-label="Ruta en el mapa" className="flex min-w-0 items-center gap-0.5 text-[13px]">
      {crumbs.map((c, i) => (
        <span key={i} className="flex min-w-0 items-center gap-0.5">
          {i > 0 && <ChevronRight className="h-3 w-3 shrink-0 text-muted/60" />}
          <button
            onClick={c.onClick}
            disabled={c.current}
            className={
              c.current
                ? "max-w-[180px] truncate font-medium text-ink"
                : "max-w-[140px] truncate text-muted transition-colors hover:text-ink"
            }
          >
            {c.label}
          </button>
        </span>
      ))}
    </nav>
  );
}
