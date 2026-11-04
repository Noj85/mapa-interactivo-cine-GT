import type { Gazetteer } from "@/lib/geo/gazetteer";
import { filmFilterActive, locDepto, locationsMatching, orgFilterActive, type ExportKind, type FilmFilter, type OrgFilter } from "@/lib/filters";
import { FILM_KINDS, INITIATIVE_TYPES, NATIONALITIES, type Film, type Org } from "@/lib/types";

export interface Table {
  /** Nombre corto para el archivo. */
  name: string;
  title: string;
  header: string[];
  rows: (string | number | null | undefined)[][];
  /** Ancho aproximado de cada columna (caracteres) para el xlsx. */
  widths: number[];
}

const kindLabel = (k: string | null) => FILM_KINDS.find((x) => x.id === k)?.label ?? "";
const natLabel = (n: string | null) => NATIONALITIES.find((x) => x.id === n)?.label ?? "";
const iniLabel = (n: string | null) => INITIATIVE_TYPES.find((x) => x.id === n)?.label ?? "";
const estado = (s: string) => (s === "published" ? "Publicado" : "Borrador");

export function buildTable(
  tipo: ExportKind,
  films: Film[],
  orgs: Org[],
  gaz: Gazetteer,
  filters: { film: FilmFilter; org: OrgFilter },
): Table {
  const depto = (c: number | null) => gaz.depto(c)?.name ?? "";
  const muni = (c: number | null) => gaz.muni(c)?.name ?? "";

  if (tipo === "locaciones") {
    const f = filters.film;
    return {
      name: "locaciones",
      title: "Locaciones de rodaje",
      header: ["Película", "Año", "Tipo", "Departamento", "Municipio", "Sitio", "Latitud", "Longitud", "Días de rodaje", "Inversión local", "Moneda", "Empleos", "Registro completo (%)", "Estado"],
      widths: [34, 7, 14, 16, 18, 28, 10, 10, 10, 14, 8, 9, 12, 11],
      rows: films.flatMap((film) => {
        // Si se filtró por lugar, solo salen las locaciones de ese lugar.
        const locs = locationsMatching(film.locations, f);
        return (locs.length ? locs : film.locations.length ? [] : [null]).map((l) => [
          film.title,
          film.year,
          kindLabel(film.kind),
          depto(l ? locDepto(l) : null),
          muni(l?.muni_ine ?? null),
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

  if (tipo === "entidades") {
    const capa = filters.org.capa;
    return {
      name: capa ? `entidades-${capa}` : "entidades",
      title: "Entidades",
      header: ["Nombre", "Capa", "Categoría", "Naturaleza", "Departamento", "Municipio", "Ciudad o referencia", "Latitud", "Longitud", "Sitio web", "Instagram", "Contacto", "Descripción", "Registro completo (%)", "Estado"],
      widths: [34, 12, 26, 14, 16, 18, 22, 10, 10, 30, 22, 30, 60, 12, 11],
      rows: orgs.map((o) => [
        o.name,
        o.layer === "circulacion" ? "Circulación" : "Industria",
        o.category,
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
    name: "peliculas",
    title: "Películas",
    header: ["Título", "Año", "Tipo", "Dirección", "Productora", "Nacionalidad", "Presupuesto", "Moneda", "Locaciones", "Departamentos", "Días de rodaje", "Inversión local", "Empleos", "Sinopsis", "Registro completo (%)", "Falta", "Estado"],
    widths: [34, 7, 14, 26, 26, 14, 14, 8, 10, 28, 10, 14, 9, 70, 12, 30, 11],
    rows: films.map((f) => [
      f.title,
      f.year,
      kindLabel(f.kind),
      f.director,
      f.producer,
      natLabel(f.nationality),
      f.budget,
      f.currency,
      f.locations.length,
      [...new Set(f.locations.map((l) => depto(locDepto(l))).filter(Boolean))].join("; "),
      sum(f, "days"),
      sum(f, "local_spend"),
      sum(f, "jobs"),
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
    ["Mapa del Cine de Guatemala · Academia de Cine de Guatemala"],
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
  if (tipo === "entidades") {
    if (o.categoria.length === 1) parts.push(slug(o.categoria[0]));
    if (o.depto.length === 1) parts.push(slug(gaz.depto(o.depto[0])?.name ?? ""));
    if (!parts.length && orgFilterActive(o)) parts.push("filtrado");
  } else {
    if (f.depto.length === 1) parts.push(slug(gaz.depto(f.depto[0])?.name ?? ""));
    if (f.clase.length === 1) parts.push(f.clase[0]);
    if (f.presupuestoMin != null) parts.push(`presupuesto-min-${Math.round(f.presupuestoMin)}`);
    if (!parts.length && filmFilterActive(f)) parts.push("filtrado");
  }
  return parts.filter(Boolean).join("-");
};
