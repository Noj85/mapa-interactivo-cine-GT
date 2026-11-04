import { filmCompleteness, orgCompleteness } from "@/lib/completeness";
import type { Film, FilmInput, FilmLocation, Org, OrgInput } from "@/lib/types";
import { slugify } from "@/lib/utils";

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
};
const str = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
};

export const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** Slug único dentro de un conjunto: "la-llorona", "la-llorona-2019", "la-llorona-2". */
export function uniqueSlug(base: string, taken: Set<string>, year?: number | null) {
  const root = slugify(base) || "registro";
  let s = root;
  if (taken.has(s) && year) s = `${root}-${year}`;
  let i = 2;
  while (taken.has(s)) s = `${root}-${i++}`;
  return s;
}

export function buildFilm(input: FilmInput, opts: { id?: string; slug: string }): Film {
  const id = input.id ?? opts.id ?? newId();
  const locations: FilmLocation[] = (input.locations ?? []).map((l, i) => {
    const muni = num(l.muni_ine);
    const depto = num(l.depto_ine) ?? (muni != null ? Math.floor(muni / 100) : null);
    return {
      id: l.id ?? `${id}-loc-${i}`,
      film_id: id,
      depto_ine: depto,
      muni_ine: muni,
      site: str(l.site),
      lat: num(l.lat),
      lng: num(l.lng),
      days: num(l.days),
      local_spend: num(l.local_spend),
      jobs: num(l.jobs),
      confidence: l.confidence ?? null,
    };
  });
  const base = {
    title: input.title.trim(),
    year: num(input.year),
    kind: input.kind ?? null,
    director: str(input.director),
    producer: str(input.producer),
    nationality: input.nationality ?? null,
    budget: num(input.budget),
    currency: input.currency ?? ("GTQ" as const),
    synopsis: str(input.synopsis),
    poster_url: str(input.poster_url),
    locations,
  };
  const c = filmCompleteness(base);
  return {
    id,
    slug: opts.slug,
    ...base,
    // Sin el mínimo (título) nunca se publica. Sin lugar de rodaje sale en «Sin ubicación».
    status: c.publishable && input.status === "published" ? "published" : "draft",
    completeness: c.completeness,
    missing_fields: c.missing,
  };
}

export function buildOrg(input: OrgInput, opts: { id?: string; slug: string; source?: string | null }): Org {
  const muni = num(input.muni_ine);
  const depto = num(input.depto_ine) ?? (muni != null ? Math.floor(muni / 100) : null);
  const base = {
    name: input.name.trim(),
    category: input.category,
    initiative_type: input.initiative_type ?? null,
    depto_ine: depto,
    muni_ine: muni,
    lat: num(input.lat),
    lng: num(input.lng),
    web: str(input.web),
    instagram: str(input.instagram),
    contact: str(input.contact),
    description: str(input.description),
  };
  const c = orgCompleteness(base);
  return {
    id: input.id ?? opts.id ?? newId(),
    slug: opts.slug,
    layer: input.layer,
    city: str(input.city),
    logo_url: str(input.logo_url),
    source: str(input.source) ?? opts.source ?? null,
    ...base,
    status: c.publishable && input.status === "published" ? "published" : "draft",
    completeness: c.completeness,
    missing_fields: c.missing,
  };
}
