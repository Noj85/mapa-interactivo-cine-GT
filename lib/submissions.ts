import { orgCategories } from "@/lib/categories";
import type { Gazetteer } from "@/lib/geo/gazetteer";
import { FILM_KINDS, INITIATIVE_TYPES, LAYERS, NATIONALITIES, type Film, type FilmInput, type Org, type OrgInput, type Submission } from "@/lib/types";
import { fmtInt, fmtMoney } from "@/lib/utils";

export interface DiffRow {
  label: string;
  /** Valor actual del registro (null si el aporte es un registro nuevo). */
  before: string | null;
  after: string | null;
  changed: boolean;
}

const dash = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);

type Loc = Partial<{ muni_ine: number | null; depto_ine: number | null; site: string | null; days: number | null; local_spend: number | null; jobs: number | null }>;

function locText(l: Loc, gaz: Gazetteer) {
  const muni = gaz.muni(l.muni_ine ?? null);
  const depto = gaz.depto(l.depto_ine ?? muni?.depto_ine ?? null);
  const place = muni ? `${muni.name}, ${muni.depto}` : depto ? `${depto.name} (municipio por confirmar)` : "Sin lugar";
  const extra = [
    l.days != null ? `${fmtInt(l.days)} d` : null,
    l.local_spend != null ? fmtMoney(l.local_spend) : null,
    l.jobs != null ? `${fmtInt(l.jobs)} empleos` : null,
  ].filter(Boolean);
  return [place + (l.site ? ` · ${l.site}` : ""), extra.length ? `(${extra.join(", ")})` : ""].filter(Boolean).join(" ");
}

const locsText = (list: Loc[], gaz: Gazetteer) => (list.length ? list.map((l) => locText(l, gaz)).join("\n") : null);

const row = (label: string, before: string | null, after: string | null, isNew: boolean): DiffRow => ({
  label,
  before: isNew ? null : dash(before),
  after: dash(after),
  changed: !isNew && dash(before) !== dash(after),
});

/** Campos del aporte, comparados con el registro actual cuando es una corrección. */
export function diffSubmission(sub: Submission, current: Film | Org | null, gaz: Gazetteer): DiffRow[] {
  const isNew = !current;
  if (sub.kind === "film") {
    const p = sub.payload as FilmInput;
    const c = (current as Film | null) ?? null;
    const kind = (k: string | null | undefined) => FILM_KINDS.find((x) => x.id === k)?.label ?? null;
    const nat = (k: string | null | undefined) => NATIONALITIES.find((x) => x.id === k)?.label ?? null;
    const money = (v: number | null | undefined, cur?: string) => (v == null ? null : `${cur === "USD" ? "US$" : "Q"} ${fmtInt(v)}`);
    return [
      row("Título", c?.title ?? null, p.title, isNew),
      row("Año", c?.year != null ? String(c.year) : null, p.year != null ? String(p.year) : null, isNew),
      row("Tipo", kind(c?.kind), kind(p.kind), isNew),
      row("Nacionalidad", nat(c?.nationality), nat(p.nationality), isNew),
      row("Dirección", c?.director ?? null, p.director ?? null, isNew),
      row("Productora", c?.producer ?? null, p.producer ?? null, isNew),
      row("Presupuesto", money(c?.budget, c?.currency), money(p.budget, p.currency), isNew),
      row("Sinopsis", c?.synopsis ?? null, p.synopsis ?? null, isNew),
      row("Locaciones", c ? locsText(c.locations, gaz) : null, locsText(p.locations ?? [], gaz), isNew),
    ];
  }
  const p = sub.payload as OrgInput;
  const c = (current as Org | null) ?? null;
  const layer = (k: string | null | undefined) => LAYERS.find((x) => x.id === k)?.label ?? null;
  const itype = (k: string | null | undefined) => INITIATIVE_TYPES.find((x) => x.id === k)?.label ?? null;
  const place = (o: { muni_ine?: number | null; depto_ine?: number | null } | null) => {
    if (!o) return null;
    const m = gaz.muni(o.muni_ine ?? null);
    const d = gaz.depto(o.depto_ine ?? m?.depto_ine ?? null);
    return m ? `${m.name}, ${m.depto}` : d ? `${d.name} (municipio por confirmar)` : null;
  };
  return [
    row("Nombre", c?.name ?? null, p.name, isNew),
    row("Capa", layer(c?.layer), layer(p.layer), isNew),
    row("Categorías", c ? orgCategories(c).join(", ") : null, orgCategories(p).join(", "), isNew),
    row("Iniciativa", itype(c?.initiative_type), itype(p.initiative_type), isNew),
    row("Lugar", place(c), place(p), isNew),
    row("Ciudad o referencia", c?.city ?? null, p.city ?? null, isNew),
    row("Sitio web", c?.web ?? null, p.web ?? null, isNew),
    row("Instagram", c?.instagram ?? null, p.instagram ?? null, isNew),
    row("Contacto", c?.contact ?? null, p.contact ?? null, isNew),
    row("Descripción", c?.description ?? null, p.description ?? null, isNew),
  ];
}
