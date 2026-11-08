import { filmCompleteness, isAbroad, orgCompleteness } from "@/lib/completeness";
import { normalizeCategories } from "@/lib/categories";
import { cleanGenres, cleanMinutes } from "@/lib/film-types";
import { cleanLanguages, composeCrew, coreFields } from "@/lib/crew";
import { FESTIVAL_RESULTS, type Film, type FilmCompany, type FilmCrewMember, type FilmFestival, type FilmInput, type FilmLocation, type Org, type OrgInput } from "@/lib/types";
import { slugify, upperTitle } from "@/lib/utils";

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

const FESTIVAL_RESULT_IDS = new Set(FESTIVAL_RESULTS.map((r) => r.id));

export function buildFilm(input: FilmInput, opts: { id?: string; slug: string; existing?: Film | null }): Film {
  const id = input.id ?? opts.id ?? newId();
  // Sin `festivals` en la entrada se conservan los que ya tenía (p. ej. al publicar o cambiar el póster).
  const festivals: FilmFestival[] = (input.festivals ?? opts.existing?.festivals ?? [])
    .filter((f) => str(f.name))
    .map((f, i) => ({
      id: f.id ?? `${id}-fest-${i}`,
      film_id: id,
      festival_id: str(f.festival_id),
      name: str(f.name)!,
      year: num(f.year),
      country: str(f.country),
      city: str(f.city),
      result: f.result && FESTIVAL_RESULT_IDS.has(f.result) ? f.result : "seleccion",
      section: str(f.section),
      award: str(f.award),
      url: str(f.url),
    }));
  // Sin `companies` en la entrada se conservan las que ya tenía.
  const companies: FilmCompany[] = (input.companies ?? opts.existing?.companies ?? [])
    .filter((c) => str(c.name))
    .map((c) => ({ name: str(c.name)!, country: str(c.country) }));
  // Sin `crew` en la entrada se conserva el equipo extra y el reparto que ya tenía.
  const crew: FilmCrewMember[] = composeCrew(
    {
      director: str(input.director),
      producer: str(input.producer),
      cinematographer: str(input.cinematographer),
      screenwriter: str(input.screenwriter),
    },
    input.crew ?? opts.existing?.crew ?? [],
  );
  const locations: FilmLocation[] = (input.locations ?? []).map((l, i) => {
    // fuera de Guatemala no hay departamento ni municipio; «Guatemala» como país es lo normal y no se guarda
    const country = str(l.country);
    const abroad = isAbroad({ country });
    const muni = abroad ? null : num(l.muni_ine);
    const depto = abroad ? null : num(l.depto_ine) ?? (muni != null ? Math.floor(muni / 100) : null);
    return {
      id: l.id ?? `${id}-loc-${i}`,
      film_id: id,
      depto_ine: depto,
      muni_ine: muni,
      country: abroad ? country : null,
      city: abroad ? str(l.city) : null,
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
    title: upperTitle(input.title),
    year: num(input.year),
    format: input.format !== undefined ? input.format : opts.existing?.format ?? null,
    nature: input.nature !== undefined ? input.nature : opts.existing?.nature ?? null,
    genres: input.genres !== undefined ? cleanGenres(input.genres) : opts.existing?.genres ?? [],
    duration_min: input.duration_min !== undefined ? cleanMinutes(input.duration_min) : opts.existing?.duration_min ?? null,
    languages: input.languages !== undefined ? cleanLanguages(input.languages) : opts.existing?.languages ?? [],
    // los cuatro roles base se guardan dentro de `crew`; sus textos se vuelven a leer de ahí
    crew,
    ...coreFields(crew),
    nationality: input.nationality ?? null,
    budget: num(input.budget),
    currency: input.currency ?? ("GTQ" as const),
    synopsis: str(input.synopsis),
    poster_url: str(input.poster_url),
    trailer_url: str(input.trailer_url),
    // sin enlace no hay miniatura
    trailer_thumb: str(input.trailer_url) ? str(input.trailer_thumb) : null,
    film_url: str(input.film_url),
    film_thumb: str(input.film_url) ? str(input.film_thumb) : null,
    locations,
    companies,
  };
  const c = filmCompleteness(base);
  return {
    id,
    slug: opts.slug,
    ...base,
    festivals,
    // Sin el mínimo (título) nunca se publica. Sin lugar de rodaje sale en «Sin locación».
    status: c.publishable && input.status === "published" ? "published" : "draft",
    completeness: c.completeness,
    missing_fields: c.missing,
  };
}

export function buildOrg(input: OrgInput, opts: { id?: string; slug: string; source?: string | null }): Org {
  const muni = num(input.muni_ine);
  const depto = num(input.depto_ine) ?? (muni != null ? Math.floor(muni / 100) : null);
  const categories = normalizeCategories(input.categories, input.category);
  const base = {
    name: input.name.trim(),
    category: categories[0] ?? "",
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
    categories,
    city: str(input.city),
    logo_url: str(input.logo_url),
    source: str(input.source) ?? opts.source ?? null,
    ...base,
    status: c.publishable && input.status === "published" ? "published" : "draft",
    completeness: c.completeness,
    missing_fields: c.missing,
  };
}
