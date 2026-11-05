import { orgCategories } from "@/lib/categories";
import { companiesText } from "@/lib/companies";
import { describeFestival, sortFestivals } from "@/lib/festivals";
import type { Gazetteer } from "@/lib/geo/gazetteer";
import { formatLabel, natureLabel } from "@/lib/film-types";
import { INITIATIVE_TYPES, LAYERS, NATIONALITIES, type Film, type FilmInput, type Org, type OrgInput, type Submission } from "@/lib/types";
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

const festsText = (list: Parameters<typeof describeFestival>[0][]) =>
  list.length ? sortFestivals(list).map(describeFestival).join("\n") : null;

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
    const fmt = (k: string | null | undefined) => formatLabel(k) || null;
    const natu = (k: string | null | undefined) => natureLabel(k) || null;
    const gens = (g: string[] | undefined) => (g && g.length ? g.join(", ") : null);
    const nat = (k: string | null | undefined) => NATIONALITIES.find((x) => x.id === k)?.label ?? null;
    const money = (v: number | null | undefined, cur?: string) => (v == null ? null : `${cur === "USD" ? "US$" : "Q"} ${fmtInt(v)}`);
    const rows = [
      row("Título", c?.title ?? null, p.title, isNew),
      row("Año", c?.year != null ? String(c.year) : null, p.year != null ? String(p.year) : null, isNew),
      row("Formato", fmt(c?.format), fmt(p.format), isNew),
      row("Naturaleza", natu(c?.nature), natu(p.nature), isNew),
      row("Géneros", gens(c?.genres), gens(p.genres), isNew),
      row("Nacionalidad", nat(c?.nationality), nat(p.nationality), isNew),
      row("Casas productoras", c ? companiesText(c.companies, "\n") || null : null, companiesText(p.companies, "\n") || null, isNew),
      row("Director/a", c?.director ?? null, p.director ?? null, isNew),
      row("Productor/a", c?.producer ?? null, p.producer ?? null, isNew),
      row("Presupuesto", money(c?.budget, c?.currency), money(p.budget, p.currency), isNew),
      row("Sinopsis", c?.synopsis ?? null, p.synopsis ?? null, isNew),
      row("Locaciones", c ? locsText(c.locations, gaz) : null, locsText(p.locations ?? [], gaz), isNew),
    ];
    // los aportes anteriores a los festivales no los traen: no se muestran como «vaciar»
    if (p.festivals !== undefined) {
      const mine = p.festivals.filter((x) => x.name).map((x) => ({ name: x.name!, year: x.year ?? null, result: x.result ?? "seleccion", award: x.award ?? null, section: x.section ?? null }));
      rows.push(row("Festivales y premios", c ? festsText(c.festivals) : null, festsText(mine), isNew));
    }
    return rows;
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
