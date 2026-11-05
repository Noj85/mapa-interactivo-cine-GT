import { contactFromFields, contactParts } from "@/lib/contact";
import { orgCategories } from "@/lib/categories";
import type { FilmFormat, FilmNature } from "@/lib/film-types";
import type { FestivalResult, Film, InitiativeType, Nationality, Org } from "@/lib/types";

/**
 * Borradores de formulario: todo como texto, igual que lo escribe la persona.
 * Los usan el editor del equipo y el formulario público para que sean la misma interfaz.
 */

export interface LocDraft {
  id?: string;
  muni_ine: number | null;
  depto_ine: number | null;
  site: string;
  lat: number | null;
  lng: number | null;
  days: string;
  local_spend: string;
  jobs: string;
}

export const blankLoc = (): LocDraft => ({ muni_ine: null, depto_ine: null, site: "", lat: null, lng: null, days: "", local_spend: "", jobs: "" });

export const isBlankLoc = (l: LocDraft) =>
  l.muni_ine == null && l.depto_ine == null && !l.site.trim() && l.lat == null && l.lng == null && !l.days.trim() && !l.local_spend.trim() && !l.jobs.trim();

const s = (v: number | null | undefined) => (v == null ? "" : String(v));
/** "1,200.5" o "Q 1200" → número; vacío → null; basura → null. */
export const toNum = (v: string) => {
  const t = v.trim();
  if (t === "") return null;
  const x = Number(t.replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(x) ? x : null;
};

/** Una participación en un festival, como se escribe en el formulario. */
export interface FestDraft {
  id?: string;
  /** Festival del catálogo; null si se escribió a mano. */
  festival_id: string | null;
  name: string;
  year: string;
  country: string;
  city: string;
  result: FestivalResult;
  section: string;
  award: string;
  url: string;
}

export const blankFest = (): FestDraft => ({ festival_id: null, name: "", year: "", country: "", city: "", result: "seleccion", section: "", award: "", url: "" });

export const isBlankFest = (f: FestDraft) => !f.name.trim() && !f.year.trim() && !f.section.trim() && !f.award.trim() && !f.url.trim();

/** Una casa productora, como se escribe en el formulario. */
export interface CompanyDraft {
  name: string;
  country: string;
}

export const blankCompany = (country = ""): CompanyDraft => ({ name: "", country });

export interface FilmDraft {
  title: string;
  year: string;
  duration: string;
  format: FilmFormat | "";
  nature: FilmNature | "";
  genres: string[];
  nationality: Nationality | "";
  director: string;
  producer: string;
  budget: string;
  currency: "GTQ" | "USD";
  synopsis: string;
  poster: string | null;
  locs: LocDraft[];
  fests: FestDraft[];
  companies: CompanyDraft[];
}

export function filmDraft(film?: Film): FilmDraft {
  return {
    title: film?.title ?? "",
    year: s(film?.year),
    duration: s(film?.duration_min),
    format: film?.format ?? "",
    nature: film?.nature ?? "",
    genres: film?.genres ?? [],
    nationality: film?.nationality ?? "",
    director: film?.director ?? "",
    producer: film?.producer ?? "",
    budget: s(film?.budget),
    currency: film?.currency ?? "GTQ",
    synopsis: film?.synopsis ?? "",
    poster: film?.poster_url ?? null,
    locs: film && film.locations?.length
      ? film.locations.map((l) => ({
          id: l.id,
          muni_ine: l.muni_ine,
          depto_ine: l.depto_ine,
          site: l.site ?? "",
          lat: l.lat,
          lng: l.lng,
          days: s(l.days),
          local_spend: s(l.local_spend),
          jobs: s(l.jobs),
        }))
      : film
        ? []
        : [blankLoc()],
    companies: (film?.companies ?? []).map((c) => ({ name: c.name, country: c.country ?? "" })),
    fests: (film?.festivals ?? []).map((x) => ({
      id: x.id,
      festival_id: x.festival_id,
      name: x.name,
      year: s(x.year),
      country: x.country ?? "",
      city: x.city ?? "",
      result: x.result,
      section: x.section ?? "",
      award: x.award ?? "",
      url: x.url ?? "",
    })),
  };
}

/** Datos de la producción listos para enviar (sin estado ni id: los agrega quien llama). */
export function filmPayload(d: FilmDraft) {
  return {
    title: d.title,
    year: toNum(d.year),
    duration_min: toNum(d.duration),
    format: d.format || null,
    nature: d.nature || null,
    genres: d.genres,
    nationality: d.nationality || null,
    director: d.director || null,
    producer: d.producer || null,
    budget: toNum(d.budget),
    currency: d.currency,
    synopsis: d.synopsis || null,
    poster_url: d.poster,
    locations: d.locs
      .filter((l) => !isBlankLoc(l))
      .map((l) => ({
        id: l.id,
        muni_ine: l.muni_ine,
        depto_ine: l.depto_ine,
        site: l.site || null,
        lat: l.lat,
        lng: l.lng,
        days: toNum(l.days),
        local_spend: toNum(l.local_spend),
        jobs: toNum(l.jobs),
      })),
    // en una producción guatemalteca el país de todas las casas es Guatemala
    companies: d.companies
      .filter((c) => c.name.trim())
      .map((c) => ({ name: c.name.trim(), country: d.nationality === "guatemalteca" ? "Guatemala" : c.country.trim() || null })),
    festivals: d.fests
      .filter((x) => x.name.trim())
      .map((x) => ({
        id: x.id,
        festival_id: x.festival_id,
        name: x.name.trim(),
        year: toNum(x.year),
        country: x.country.trim() || null,
        city: x.city.trim() || null,
        result: x.result,
        section: x.section.trim() || null,
        award: x.award.trim() || null,
        url: x.url.trim() || null,
      })),
  };
}

export type OrgLayerId = "circulacion" | "industria";

export interface OrgDraft {
  name: string;
  layer: OrgLayerId;
  /** Todas las categorías; la primera es la principal. */
  categories: string[];
  type: InitiativeType | "";
  muni_ine: number | null;
  depto_ine: number | null;
  city: string;
  lat: number | null;
  lng: number | null;
  web: string;
  instagram: string;
  /** Contacto: teléfono y correo por separado; se guardan juntos en formato estándar. */
  phone: string;
  email: string;
  description: string;
  logo: string | null;
}

export function orgDraft(org?: Org, defaultLayer: OrgLayerId = "circulacion"): OrgDraft {
  return {
    name: org?.name ?? "",
    layer: org?.layer ?? defaultLayer,
    categories: org ? orgCategories(org) : [],
    type: org?.initiative_type ?? "",
    muni_ine: org?.muni_ine ?? null,
    depto_ine: org?.depto_ine ?? null,
    city: org?.city ?? "",
    lat: org?.lat ?? null,
    lng: org?.lng ?? null,
    web: org?.web ?? "",
    instagram: org?.instagram ?? "",
    ...(() => {
      const c = contactParts(org?.contact);
      return { phone: c.phone ?? "", email: c.email ?? "" };
    })(),
    description: org?.description ?? "",
    logo: org?.logo_url ?? null,
  };
}

export function orgPayload(d: OrgDraft) {
  return {
    name: d.name,
    layer: d.layer,
    category: d.categories[0] ?? "",
    categories: d.categories,
    initiative_type: d.type || null,
    muni_ine: d.muni_ine,
    depto_ine: d.depto_ine,
    city: d.city || null,
    lat: d.lat,
    lng: d.lng,
    web: d.web || null,
    instagram: d.instagram || null,
    contact: contactFromFields(d.phone, d.email).value,
    description: d.description || null,
    logo_url: d.logo,
  };
}

/** Errores del contacto de una entidad (null si está bien o vacío). */
export const orgContactErrors = (d: Pick<OrgDraft, "phone" | "email">) => {
  const c = contactFromFields(d.phone, d.email);
  return { phone: c.phoneError, email: c.emailError, ok: !c.phoneError && !c.emailError };
};
