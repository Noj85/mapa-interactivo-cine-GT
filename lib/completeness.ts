import type { Film, FilmLocation, Org } from "@/lib/types";

export interface Completeness {
  completeness: number;
  missing: string[];
  /** Cumple el mínimo para publicarse en el mapa. */
  publishable: boolean;
}

export const hasAnchor = (l: Pick<FilmLocation, "depto_ine" | "muni_ine" | "lat" | "lng">) =>
  l.muni_ine != null || l.depto_ine != null || (l.lat != null && l.lng != null);

/** Locación fuera de Guatemala: trae país y ese país no es Guatemala. */
export const isAbroad = (l: { country?: string | null }) => {
  const c = (l.country ?? "").trim().toLowerCase();
  return c !== "" && c !== "guatemala";
};

/** La locación dice dónde se rodó: un lugar de Guatemala o un país de afuera. */
export const hasPlace = (l: Pick<FilmLocation, "depto_ine" | "muni_ine" | "lat" | "lng"> & { country?: string | null }) => hasAnchor(l) || isAbroad(l);

/** Sin ninguna locación que diga dónde se rodó (ni en Guatemala ni afuera). */
export const isUnlocated = (f: { locations: (Pick<FilmLocation, "depto_ine" | "muni_ine" | "lat" | "lng"> & { country?: string | null })[] }) => !f.locations.some(hasPlace);

/**
 * Una producción se puede publicar con solo el título. Si todavía no tiene lugar de rodaje,
 * el mapa la muestra en el punto «Sin locación», fuera del territorio.
 * Todo lo demás suma al porcentaje y a la lista de faltantes.
 */
export function filmCompleteness(
  // Los festivales no cuentan en el porcentaje: una producción puede no haber ido a ninguno.
  // Director/a de fotografía, guionista, el resto del equipo, el reparto y los idiomas son opcionales: no cuentan en el porcentaje.
  // Director/a y productor/a siguen contando; su texto sale del rol base correspondiente del equipo.
  f: Omit<Film, "completeness" | "missing_fields" | "status" | "id" | "slug" | "locations" | "festivals" | "companies" | "duration_min" | "cinematographer" | "screenwriter" | "crew" | "languages"> & {
    companies?: { name?: string | null }[];
    locations: (Pick<FilmLocation, "depto_ine" | "muni_ine" | "lat" | "lng" | "days" | "local_spend" | "jobs"> & { country?: string | null })[];
  },
): Completeness {
  const missing: string[] = [];
  let points = 0;
  let total = 0;
  const check = (ok: boolean, label: string, weight = 1) => {
    total += weight;
    if (ok) points += weight;
    else missing.push(label);
  };

  check(!!f.title?.trim(), "Título", 2);
  check(f.locations.length > 0 && f.locations.some(hasPlace), "Locaciones", 3);
  check(f.locations.length === 0 || f.locations.every((l) => isAbroad(l) || l.muni_ine != null || (l.lat != null && l.lng != null)), "Municipio por confirmar", 2);
  check(f.year != null, "Año");
  check(!!f.format, "Formato");
  check(!!f.nature, "Naturaleza");
  check(!!f.nationality, "Nacionalidad");
  check((f.companies ?? []).some((c) => !!c.name?.trim()), "Casa productora");
  check(!!f.producer, "Productor/a");
  check(!!f.director, "Director/a");
  check(f.budget != null, "Presupuesto");
  check(!!f.synopsis, "Sinopsis");
  if (f.locations.length) {
    check(f.locations.every((l) => l.days != null), "Días de rodaje", 2);
    check(f.locations.every((l) => l.local_spend != null), "Inversión local", 2);
    check(f.locations.every((l) => l.jobs != null), "Empleos");
  } else {
    total += 5;
    missing.push("Días de rodaje", "Inversión local");
  }

  const publishable = !!f.title?.trim();
  return { completeness: Math.round((points / total) * 100), missing, publishable };
}

export function orgCompleteness(
  o: Pick<
    Org,
    "name" | "category" | "initiative_type" | "depto_ine" | "muni_ine" | "lat" | "lng" | "web" | "instagram" | "contact" | "description"
  >,
): Completeness {
  const missing: string[] = [];
  let points = 0;
  let total = 0;
  const check = (ok: boolean, label: string, weight = 1) => {
    total += weight;
    if (ok) points += weight;
    else missing.push(label);
  };
  check(!!o.name?.trim(), "Nombre", 2);
  check(!!o.category, "Categoría", 2);
  check(o.depto_ine != null || o.muni_ine != null || (o.lat != null && o.lng != null), "Locación", 3);
  check(o.muni_ine != null || (o.lat != null && o.lng != null), "Municipio por confirmar", 2);
  check(!!o.initiative_type, "Tipo de iniciativa");
  check(!!o.web || !!o.instagram, "Web o Instagram");
  check(!!o.contact, "Contacto");
  check(!!o.description, "Descripción");
  const publishable =
    !!o.name?.trim() && !!o.category && (o.depto_ine != null || o.muni_ine != null || (o.lat != null && o.lng != null));
  return { completeness: Math.round((points / total) * 100), missing, publishable };
}

export function completenessTone(pct: number): "ok" | "warn" | "danger" {
  if (pct >= 80) return "ok";
  if (pct >= 50) return "warn";
  return "danger";
}
