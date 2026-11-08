import "server-only";
import type { RecordRow } from "@/components/admin/RecordsTable";
import { categoriesText } from "@/lib/categories";
import { isAbroad } from "@/lib/completeness";
import { companyNames } from "@/lib/companies";
import { crewSearchText } from "@/lib/crew";
import { isUnlocated } from "@/lib/map/features";
import { posterThumb } from "@/lib/poster-url";
import { requestState } from "@/lib/request-state";
import { filmTypeLabel } from "@/lib/film-types";
import { LAYERS, type Film, type InfoRequest, type Org } from "@/lib/types";
import { normalize } from "@/lib/utils";
import { orgCategories } from "@/lib/categories";
import type { Gazetteer } from "@/lib/geo/gazetteer";

/** Solicitudes activas por registro. */
export function openRequestCounts(requests: InfoRequest[]) {
  const out: Record<string, number> = {};
  for (const r of requests) if (requestState(r) === "active") for (const id of r.target_ids ?? [r.target_id]) out[id] = (out[id] ?? 0) + 1;
  return out;
}

export function filmRows(films: Film[], gaz: Gazetteer, open: Record<string, number>): RecordRow[] {
  return films.map((f) => {
    const places = f.locations.map((l) => (isAbroad(l) ? [l.city, l.country].filter(Boolean).join(", ") : gaz.muni(l.muni_ine)?.name ?? gaz.depto(l.depto_ine)?.name ?? l.site ?? "")).filter(Boolean);
    const kind = filmTypeLabel(f);
    return {
      id: f.id,
      name: f.title,
      meta: [f.year, kind].filter(Boolean).join(" · "),
      place: f.locations.length ? `${f.locations.length} ${f.locations.length === 1 ? "locación" : "locaciones"}` : "Sin locaciones",
      types: [f.format ?? "sin_formato"],
      status: f.status,
      completeness: f.completeness,
      missing: f.missing_fields,
      publishable: !!f.title.trim(),
      unlocated: isUnlocated(f),
      noFestivals: f.festivals.length === 0,
      openRequests: open[f.id] ?? 0,
      thumb: posterThumb(f.poster_url) ?? null,
      search: normalize([f.title, f.director, f.producer, f.cinematographer, f.screenwriter, crewSearchText(f.crew), f.year, kind, ...f.genres, ...f.languages, ...places, ...f.festivals.map((x) => x.name), ...companyNames(f.companies)].filter(Boolean).join(" ")),
    };
  });
}

export function orgRows(orgs: Org[], gaz: Gazetteer, open: Record<string, number>): RecordRow[] {
  return orgs.map((o) => {
    const place = gaz.muni(o.muni_ine)?.name ?? gaz.depto(o.depto_ine)?.name ?? "";
    const layer = LAYERS.find((l) => l.id === o.layer)?.label ?? "";
    const hasPlace = o.depto_ine != null || o.muni_ine != null || (o.lat != null && o.lng != null);
    return {
      id: o.id,
      name: o.name,
      meta: [layer, categoriesText(o)].filter(Boolean).join(" · "),
      place,
      types: orgCategories(o),
      status: o.status,
      completeness: o.completeness,
      missing: o.missing_fields,
      publishable: !!o.name.trim() && !!o.category && hasPlace,
      unlocated: !hasPlace,
      openRequests: open[o.id] ?? 0,
      thumb: posterThumb(o.logo_url) ?? o.logo_url ?? null,
      search: normalize([o.name, categoriesText(o), layer, place, o.city].filter(Boolean).join(" ")),
    };
  });
}
