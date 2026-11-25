import { categoriesText } from "@/lib/categories";
import { locDepto, type SortKey } from "@/lib/filters";
import { personDepto } from "@/lib/people";
import type { Film, FilmFestival, FilmLocation, Org } from "@/lib/types";

/**
 * Orden de las descargas. Funciones puras: sirven en el servidor (el archivo) y en el navegador (la vista previa).
 * Alfabético en español (sin distinguir tildes ni mayúsculas); lo vacío va siempre al final; el empate se resuelve por título o nombre.
 */

/** Nombres de lugares a partir de su código INE. */
export interface PlaceNames {
  depto(code: number | null): string;
  muni(code: number | null): string;
}

type Cmp<T> = (a: T, b: T) => number;

const collator = new Intl.Collator("es", { sensitivity: "base", numeric: true });

const blank = (v: unknown) => v == null || (typeof v === "string" && v.trim() === "");

/** Texto A–Z con lo vacío al final. */
const textCmp = (a: string | null | undefined, b: string | null | undefined) => {
  if (blank(a)) return blank(b) ? 0 : 1;
  if (blank(b)) return -1;
  return collator.compare(a!.trim(), b!.trim());
};

/** Número ascendente (dir 1) o descendente (dir -1), con lo vacío al final. */
const numCmp = (a: number | null | undefined, b: number | null | undefined, dir: 1 | -1) => {
  if (a == null) return b == null ? 0 : 1;
  if (b == null) return -1;
  return (a - b) * dir;
};

const chain =
  <T>(...cmps: Cmp<T>[]): Cmp<T> =>
  (a, b) => {
    for (const c of cmps) {
      const r = c(a, b);
      if (r) return r;
    }
    return 0;
  };

/** Lo mismo que muestra la columna «Departamentos» de las producciones. */
const deptosText = (f: Film, n: PlaceNames) => [...new Set(f.locations.map((l) => n.depto(locDepto(l))).filter(Boolean))].join("; ");

function filmCmp(key: SortKey, n: PlaceNames): Cmp<Film> {
  const title: Cmp<Film> = (a, b) => textCmp(a.title, b.title);
  switch (key) {
    case "anio_desc":
      return chain((a, b) => numCmp(a.year, b.year, -1), title);
    case "anio_asc":
      return chain((a, b) => numCmp(a.year, b.year, 1), title);
    case "titulo":
      return title;
    case "director":
      return chain((a, b) => textCmp(a.director, b.director), title);
    case "locacion":
      return chain((a, b) => textCmp(deptosText(a, n), deptosText(b, n)), title);
    default:
      return () => 0;
  }
}

/** Producciones en el orden pedido (una copia; sin `key` queda igual). */
export function sortFilms(films: Film[], key: SortKey | null, n: PlaceNames): Film[] {
  return key ? [...films].sort(filmCmp(key, n)) : films;
}

/** Una fila de «una por locación»: la producción y uno de sus lugares de rodaje (null si no tiene ninguno). */
export interface FilmLocRow {
  film: Film;
  loc: FilmLocation | null;
}

/** Con `locacion` ordena por departamento, municipio y sitio de cada fila; con otro campo, por la producción (y sus lugares siguen en su orden). */
export function sortFilmLocs(rows: FilmLocRow[], key: SortKey | null, n: PlaceNames): FilmLocRow[] {
  if (!key) return rows;
  if (key !== "locacion") {
    const c = filmCmp(key, n);
    return [...rows].sort((a, b) => c(a.film, b.film));
  }
  const title = filmCmp("titulo", n);
  const cmp = chain<FilmLocRow>(
    (a, b) => textCmp(n.depto(a.loc ? locDepto(a.loc) : null), n.depto(b.loc ? locDepto(b.loc) : null)),
    (a, b) => textCmp(n.muni(a.loc?.muni_ine ?? null), n.muni(b.loc?.muni_ine ?? null)),
    (a, b) => textCmp(a.loc?.site, b.loc?.site),
    (a, b) => title(a.film, b.film),
  );
  return [...rows].sort(cmp);
}

/** Una fila de «una por festival»: la producción y una de sus participaciones. */
export interface FilmFestRow {
  film: Film;
  fest: FilmFestival;
}

export function sortFilmFests(rows: FilmFestRow[], key: SortKey | null, n: PlaceNames): FilmFestRow[] {
  if (!key) return rows;
  const base = filmCmp(key === "festival" ? "titulo" : key, n);
  const cmp =
    key === "festival"
      ? chain<FilmFestRow>(
          (a, b) => textCmp(a.fest.name, b.fest.name),
          (a, b) => numCmp(a.fest.year, b.fest.year, -1),
          (a, b) => base(a.film, b.film),
        )
      : (a: FilmFestRow, b: FilmFestRow) => base(a.film, b.film);
  return [...rows].sort(cmp);
}

const orgDepto = (o: Org) => o.depto_ine ?? (o.muni_ine != null ? Math.floor(o.muni_ine / 100) : null);

export function sortOrgs(orgs: Org[], key: SortKey | null, n: PlaceNames): Org[] {
  if (!key) return orgs;
  const name: Cmp<Org> = (a, b) => textCmp(a.name, b.name);
  const cmp: Cmp<Org> =
    key === "departamento"
      ? chain(
          (a, b) => textCmp(n.depto(orgDepto(a)), n.depto(orgDepto(b))),
          (a, b) => textCmp(n.muni(a.muni_ine), n.muni(b.muni_ine)),
          name,
        )
      : key === "categoria"
        ? chain((a, b) => textCmp(categoriesText(a, "; "), categoriesText(b, "; ")), name)
        : name;
  return [...orgs].sort(cmp);
}

type PersonSortable = { name: string; depto_ine: number | null; muni_ine: number | null };

export function sortPeople<T extends PersonSortable>(people: T[], key: SortKey | null, n: PlaceNames): T[] {
  if (!key) return people;
  const name: Cmp<T> = (a, b) => textCmp(a.name, b.name);
  const cmp: Cmp<T> =
    key === "departamento"
      ? chain(
          (a, b) => textCmp(n.depto(personDepto(a)), n.depto(personDepto(b))),
          (a, b) => textCmp(n.muni(a.muni_ine), n.muni(b.muni_ine)),
          name,
        )
      : name;
  return [...people].sort(cmp);
}
