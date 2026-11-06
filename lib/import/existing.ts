import type { Film, Org } from "@/lib/types";
import { planFilmUpdate, planOrgUpdate } from "./diff";
import type { Candidate, DuplicateDecision, DuplicateMatch, ExistingRef, ResolveItem } from "./types";

/** Lo ya guardado, en la forma que usa la comparación. */
export function existingRefs(films: Film[], orgs: Org[]): ExistingRef[] {
  return [
    ...films.map((f) => ({ id: f.id, type: "film" as const, title: f.title, year: f.year, director: f.director })),
    ...orgs.map((o) => ({
      id: o.id,
      type: "org" as const,
      title: o.name,
      year: null,
      layer: o.layer,
      muni_ine: o.muni_ine,
      depto_ine: o.depto_ine,
    })),
  ];
}

/** Lo que se sabe de un renglón del archivo para buscarle coincidencias. */
export function resolveItemOf(c: Candidate): ResolveItem | null {
  if (c.type === "film" && c.film?.title) {
    return { key: c.key, type: "film", title: c.film.title, year: c.film.year ?? null, director: c.film.director ?? null };
  }
  if (c.type === "org" && c.org?.name) {
    return {
      key: c.key,
      type: "org",
      title: c.org.name,
      year: null,
      layer: c.org.layer ?? null,
      muni_ine: c.org.muni_ine ?? null,
      depto_ine: c.org.depto_ine ?? null,
    };
  }
  return null;
}

/**
 * Qué se hace por defecto con un renglón que coincide con un registro existente:
 *  - seguro o probable → completar el existente (si no trae nada nuevo, se omite);
 *  - dudoso → mandarlo a Aportes para que una persona decida. Nunca se decide solo.
 */
export function decisionFor(c: Candidate, dup: DuplicateMatch): DuplicateDecision {
  if (dup.level === "dudoso") return "review";
  const rec = dup.record;
  const news = !rec ? 1 : c.type === "film" && c.film ? planFilmUpdate(rec as Film, c.film).news : c.org ? planOrgUpdate(rec as Org, c.org).news : 1;
  return news > 0 ? "update" : "skip";
}
