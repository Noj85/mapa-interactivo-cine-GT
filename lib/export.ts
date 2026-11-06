import { categoriesText } from "@/lib/categories";
import { isAbroad } from "@/lib/completeness";
import { companiesText } from "@/lib/companies";
import type { Gazetteer } from "@/lib/geo/gazetteer";
import { filmFilterActive, locDepto, locationsMatching, orgFilterActive, type ExportKind, type ExportRows, type FilmFilter, type OrgFilter } from "@/lib/filters";
import { formatLabel, natureLabel } from "@/lib/film-types";
import { FESTIVAL_RESULTS, INITIATIVE_TYPES, NATIONALITIES, type Film, type Org } from "@/lib/types";

export interface Table {
  /** Nombre corto para el archivo. */
  name: string;
  title: string;
  header: string[];
  rows: (string | number | null | undefined)[][];
  /** Ancho aproximado de cada columna (caracteres) para el xlsx. */
  widths: number[];
}

/** Formato, naturaleza y géneros de una producción, en tres columnas. */
const typeCells = (f: Film) => [formatLabel(f.format), natureLabel(f.nature), (f.genres ?? []).join("; ")];
const natLabel = (n: string | null) => NATIONALITIES.find((x) => x.id === n)?.label ?? "";
const iniLabel = (n: string | null) => INITIATIVE_TYPES.find((x) => x.id === n)?.label ?? "";
const estado = (s: string) => (s === "published" ? "Publicado" : "Borrador");

export function buildTable(
  tipo: ExportKind,
  filas: ExportRows,
  films: Film[],
  orgs: Org[],
  gaz: Gazetteer,
  filters: { film: FilmFilter; org: OrgFilter },
): Table {
  const depto = (c: number | null) => gaz.depto(c)?.name ?? "";
  const muni = (c: number | null) => gaz.muni(c)?.name ?? "";

  if (tipo === "producciones" && filas === "locaciones") {
    const f = filters.film;
    return {
      name: "locaciones",
      title: "Locaciones de rodaje",
      header: ["Producción", "Año", "Duración (min)", "Formato", "Naturaleza", "Géneros", "Departamento", "Municipio", "País (si fue fuera de Guatemala)", "Ciudad (fuera de Guatemala)", "Sitio", "Latitud", "Longitud", "Días de rodaje", "Inversión local", "Moneda", "Empleos", "Registro completo (%)", "Estado"],
      widths: [34, 7, 10, 16, 14, 26, 16, 18, 20, 20, 28, 10, 10, 10, 14, 8, 9, 12, 11],
      rows: films.flatMap((film) => {
        // Si se filtró por lugar, solo salen las locaciones de ese lugar.
        const locs = locationsMatching(film.locations, f);
        return (locs.length ? locs : film.locations.length ? [] : [null]).map((l) => [
          film.title,
          film.year,
          film.duration_min,
          ...typeCells(film),
          depto(l ? locDepto(l) : null),
          muni(l?.muni_ine ?? null),
          l && isAbroad(l) ? l.country : "",
          l && isAbroad(l) ? l.city : "",
          l?.site,
          l?.lat,
          l?.lng,
          l?.days,
          l?.local_spend,
          film.currency,
          l?.jobs,
          film.completeness,
          estado(film.status),
        ]);
      }),
    };
  }

  if (tipo === "producciones" && filas === "festivales") {
    const resultLabel = (r: string) => FESTIVAL_RESULTS.find((x) => x.id === r)?.label ?? r;
    return {
      name: "festivales",
      title: "Festivales y premios",
      header: ["Producción", "Año de la producción", "Duración (min)", "Formato", "Naturaleza", "Géneros", "Festival", "Año del festival", "País", "Ciudad", "Resultado", "Sección", "Premio", "Enlace", "Estado"],
      widths: [34, 10, 10, 16, 14, 26, 36, 10, 16, 18, 18, 26, 30, 36, 11],
      // las producciones sin festivales no aparecen: la hoja es una fila por participación
      rows: films.flatMap((film) =>
        (film.festivals ?? []).map((x) => [film.title, film.year, film.duration_min, ...typeCells(film), x.name, x.year, x.country, x.city, resultLabel(x.result), x.section, x.award, x.url, estado(film.status)]),
      ),
    };
  }

  if (tipo === "circulacion" || tipo === "entidades") {
    return {
      name: tipo,
      title: tipo === "circulacion" ? "Circulación" : "Entidades",
      header: ["Nombre", "Categorías", "Naturaleza", "Departamento", "Municipio", "Ciudad o referencia", "Latitud", "Longitud", "Sitio web", "Instagram", "Contacto", "Descripción", "Registro completo (%)", "Estado"],
      widths: [34, 26, 14, 16, 18, 22, 10, 10, 30, 22, 30, 60, 12, 11],
      rows: orgs.map((o) => [
        o.name,
        categoriesText(o, "; "),
        iniLabel(o.initiative_type),
        depto(o.depto_ine ?? (o.muni_ine != null ? Math.floor(o.muni_ine / 100) : null)),
        muni(o.muni_ine),
        o.city,
        o.lat,
        o.lng,
        o.web,
        o.instagram,
        o.contact,
        o.description,
        o.completeness,
        estado(o.status),
      ]),
    };
  }

  const sum = (f: Film, k: "days" | "local_spend" | "jobs") => {
    const vals = f.locations.map((l) => l[k]).filter((v): v is number => typeof v === "number");
    return vals.length ? vals.reduce((a, b) => a + b, 0) : "";
  };
  return {
    name: "producciones",
    title: "Producciones",
    header: ["Título", "Año", "Duración (min)", "Formato", "Naturaleza", "Géneros", "Director/a", "Productor/a", "Director/a de fotografía", "Guionista", "Casas productoras", "Nacionalidad", "Presupuesto", "Moneda", "Locaciones", "Departamentos", "Fuera de Guatemala", "Días de rodaje", "Inversión local", "Empleos", "Festivales", "Sinopsis", "Registro completo (%)", "Falta", "Estado"],
    widths: [34, 7, 10, 16, 14, 26, 26, 26, 26, 26, 40, 14, 14, 8, 10, 28, 22, 10, 14, 9, 10, 70, 12, 30, 11],
    rows: films.map((f) => [
      f.title,
      f.year,
      f.duration_min,
      ...typeCells(f),
      f.director,
      f.producer,
      f.cinematographer,
      f.screenwriter,
      companiesText(f.companies),
      natLabel(f.nationality),
      f.budget,
      f.currency,
      f.locations.length,
      [...new Set(f.locations.map((l) => depto(locDepto(l))).filter(Boolean))].join("; "),
      [...new Set(f.locations.filter(isAbroad).map((l) => l.country!.trim()))].join("; "),
      sum(f, "days"),
      sum(f, "local_spend"),
      sum(f, "jobs"),
      (f.festivals ?? []).length,
      f.synopsis,
      f.completeness,
      f.missing_fields.join("; "),
      estado(f.status),
    ]),
  };
}

// ───────────────────────── formatos ─────────────────────────

const esc = (v: unknown) => {
  if (v === null || v === undefined) return "";
  const s = String(v);
  // Evita que Excel interprete una celda como fórmula.
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? `'${s}` : s;
  return /[",\n\r;]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export const toCsv = (t: Table) =>
  // BOM para que Excel lea bien las tildes
  "\ufeff" + [t.header, ...t.rows].map((r) => r.map(esc).join(",")).join("\r\n") + "\r\n";

const safeCell = (v: string | number | null | undefined) => {
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "number") return v;
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
};

/** Libro de Excel con los datos y una hoja «Léeme» que dice qué filtros se aplicaron. */
export async function toXlsx(t: Table, notes: string[]): Promise<Buffer> {
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.aoa_to_sheet([t.header, ...t.rows.map((r) => r.map(safeCell))]);
  ws["!cols"] = t.widths.map((wch) => ({ wch }));
  ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(t.rows.length, 1), c: t.header.length - 1 } }) };

  const info = [
    ["Mapa del Cine de Guatemala · Academia Guatemalteca de Artes y Ciencias Cinematográficas"],
    [t.title],
    [`Descargado el ${new Date().toLocaleDateString("es-GT", { day: "numeric", month: "long", year: "numeric" })}`],
    [`Filas: ${t.rows.length}`],
    [],
    ["Filtros aplicados"],
    ...(notes.length ? notes.map((n) => [n]) : [["Ninguno (todos los registros)"]]),
  ];
  const wsInfo = XLSX.utils.aoa_to_sheet(info);
  wsInfo["!cols"] = [{ wch: 90 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, t.title.slice(0, 31));
  XLSX.utils.book_append_sheet(wb, wsInfo, "Léeme");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

/** Parte del nombre de archivo que resume los filtros (p. ej. «peten-ficcion»). */
export const filterSlug = (tipo: ExportKind, f: FilmFilter, o: OrgFilter, gaz: Gazetteer) => {
  const slug = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  const parts: string[] = [];
  if (tipo !== "producciones") {
    if (o.categoria.length === 1) parts.push(slug(o.categoria[0]));
    if (o.depto.length === 1) parts.push(slug(gaz.depto(o.depto[0])?.name ?? ""));
    if (!parts.length && orgFilterActive(o)) parts.push("filtrado");
  } else {
    if (f.depto.length === 1) parts.push(slug(gaz.depto(f.depto[0])?.name ?? ""));
    if (f.formato.length === 1) parts.push(f.formato[0].replace(/_/g, "-"));
    if (f.naturaleza.length === 1) parts.push(f.naturaleza[0]);
    if (f.presupuestoMin != null) parts.push(`presupuesto-min-${Math.round(f.presupuestoMin)}`);
    if (!parts.length && filmFilterActive(f)) parts.push("filtrado");
  }
  return parts.filter(Boolean).join("-");
};
