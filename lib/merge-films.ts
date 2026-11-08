import { companyLabel } from "@/lib/companies";
import { cleanCrew, cleanLanguages, extraCrew } from "@/lib/crew";
import { describeFestival } from "@/lib/festivals";
import { durationLabel, formatLabel, natureLabel } from "@/lib/film-types";
import type { Gazetteer } from "@/lib/geo/gazetteer";
import { locText } from "@/lib/submissions";
import { NATIONALITIES, type Film, type FilmInput, type FilmLocation } from "@/lib/types";
import { fmtInt, normalize } from "@/lib/utils";

/**
 * Fusión de dos producciones duplicadas. Es código puro: la pantalla dibuja el plan y la acción del servidor
 * vuelve a calcularlo sobre los registros de hoy antes de aplicar lo elegido.
 *  - Campos simples: se elige la versión A o la B (solo aparecen los que difieren).
 *  - Listas (locaciones, festivales, casas productoras, géneros): una casilla por elemento; lo repetido sale una vez.
 *  - Se conserva el id y la dirección del registro que «se queda»; el otro se borra después.
 */

export type Side = "a" | "b";

export const MERGE_FIELDS = [
  { key: "title", label: "Título" },
  { key: "year", label: "Año" },
  { key: "duration_min", label: "Duración" },
  { key: "format", label: "Formato" },
  { key: "nature", label: "Naturaleza" },
  { key: "nationality", label: "Nacionalidad" },
  { key: "director", label: "Director/a" },
  { key: "producer", label: "Productor/a" },
  { key: "cinematographer", label: "Director/a de fotografía" },
  { key: "screenwriter", label: "Guionista" },
  { key: "budget", label: "Presupuesto" },
  { key: "synopsis", label: "Sinopsis" },
  { key: "trailer_url", label: "Tráiler" },
  { key: "film_url", label: "Película completa" },
] as const;

export type MergeFieldKey = (typeof MERGE_FIELDS)[number]["key"];

export interface MergeField {
  key: MergeFieldKey;
  label: string;
  a: string | null;
  b: string | null;
  /** Lo que viene elegido: la versión que tiene dato (A si ambas). */
  def: Side;
}

export interface MergeItem {
  key: string;
  text: string;
  /** De qué versión viene; «both» si está en las dos (se muestra una sola vez). */
  from: Side | "both";
}

export interface MergePlan {
  fields: MergeField[];
  locations: MergeItem[];
  festivals: MergeItem[];
  companies: MergeItem[];
  genres: MergeItem[];
  /** Solo si las dos tienen póster distinto o solo una tiene. */
  poster: { a: string | null; b: string | null; def: Side } | null;
}

export interface MergeChoice {
  /** Registro que se queda (conserva su id y dirección). */
  keep: Side;
  fields: Partial<Record<MergeFieldKey, Side>>;
  poster?: Side;
  locations: string[];
  festivals: string[];
  companies: string[];
  genres: string[];
}

const nat = (k: string | null) => NATIONALITIES.find((x) => x.id === k)?.label ?? null;
const money = (f: Film) => (f.budget == null ? null : `${f.currency === "USD" ? "US$" : "Q"} ${fmtInt(f.budget)}`);
const txt = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);

function fieldText(f: Film, key: MergeFieldKey): string | null {
  switch (key) {
    case "year":
      return f.year != null ? String(f.year) : null;
    case "duration_min":
      return durationLabel(f.duration_min) || null;
    case "format":
      return formatLabel(f.format) || null;
    case "nature":
      return natureLabel(f.nature) || null;
    case "nationality":
      return nat(f.nationality);
    case "budget":
      return money(f);
    default:
      return txt(f[key]);
  }
}

const n = (v: string | null | undefined) => normalize(v ?? "");
const locSig = (l: FilmLocation) => [l.muni_ine ?? "", l.depto_ine ?? "", n(l.country), n(l.city), n(l.site)].join("|");
const festSig = (x: Film["festivals"][number]) => [x.festival_id ?? n(x.name), x.year ?? "", x.result].join("|");
const compSig = (c: Film["companies"][number]) => n(c.name);

/** Une dos listas: lo de A, lo de B que no esté ya en A; lo que está en ambas se marca «both». */
function joinList<T>(a: T[], b: T[], sig: (x: T) => string, key: (side: Side, x: T, i: number) => string, text: (x: T) => string): MergeItem[] {
  const out: MergeItem[] = [];
  const bySig = new Map<string, MergeItem>();
  a.forEach((x, i) => {
    const it: MergeItem = { key: key("a", x, i), text: text(x), from: "a" };
    const s = sig(x);
    if (!bySig.has(s)) bySig.set(s, it);
    out.push(it);
  });
  b.forEach((x, i) => {
    const hit = bySig.get(sig(x));
    if (hit) hit.from = "both";
    else out.push({ key: key("b", x, i), text: text(x), from: "b" });
  });
  return out;
}

export function planMerge(a: Film, b: Film, gaz: Gazetteer): MergePlan {
  const fields: MergeField[] = [];
  for (const f of MERGE_FIELDS) {
    const va = fieldText(a, f.key);
    const vb = fieldText(b, f.key);
    if (va === vb) continue;
    fields.push({ key: f.key, label: f.label, a: va, b: vb, def: va == null && vb != null ? "b" : "a" });
  }
  const pa = a.poster_url ?? null;
  const pb = b.poster_url ?? null;
  return {
    fields,
    locations: joinList(a.locations, b.locations, locSig, (s, l) => `${s}:${l.id}`, (l) => locText(l, gaz)),
    festivals: joinList(a.festivals, b.festivals, festSig, (s, x) => `${s}:${x.id}`, describeFestival),
    companies: joinList(a.companies, b.companies, compSig, (s, c, i) => `${s}:${i}`, companyLabel),
    genres: joinList(a.genres, b.genres, (g) => n(g), (s, g) => `${s}:${n(g)}`, (g) => g),
    poster: pa === pb || (!pa && !pb) ? null : { a: pa, b: pb, def: pa ? "a" : "b" },
  };
}

/** Lo que viene elegido de entrada: el más completo se queda, cada campo con dato y todas las casillas marcadas. */
export function defaultChoice(plan: MergePlan, keep: Side = "a"): MergeChoice {
  return {
    keep,
    fields: Object.fromEntries(plan.fields.map((f) => [f.key, f.def])),
    poster: plan.poster?.def,
    locations: plan.locations.map((i) => i.key),
    festivals: plan.festivals.map((i) => i.key),
    companies: plan.companies.map((i) => i.key),
    genres: plan.genres.map((i) => i.key),
  };
}

/** El registro fusionado, listo para `saveFilm` (con el id del que se queda). */
export function applyMerge(a: Film, b: Film, gaz: Gazetteer, choice: MergeChoice): FilmInput {
  const plan = planMerge(a, b, gaz);
  const films = { a, b };
  const keep = films[choice.keep];
  const pick = (key: MergeFieldKey): Film => {
    const f = plan.fields.find((x) => x.key === key);
    return f ? films[choice.fields[key] ?? f.def] : keep;
  };
  const on = (list: string[]) => new Set(list);
  const locOn = on(choice.locations);
  const festOn = on(choice.festivals);
  const compOn = on(choice.companies);
  const genOn = on(choice.genres);
  // lo que viene del registro que se borra entra como nuevo (sin su id)
  const own = (side: Side) => side === choice.keep;

  const locations: FilmInput["locations"] = [];
  for (const it of plan.locations) {
    if (!locOn.has(it.key)) continue;
    const [side, id] = it.key.split(":") as [Side, string];
    const l = films[side].locations.find((x) => x.id === id);
    if (!l) continue;
    let merged: FilmLocation = { ...l };
    // la misma locación en ambas: se completan los datos que le falten con los de la otra
    if (it.from === "both") {
      const other = films[side === "a" ? "b" : "a"].locations.find((x) => locSig(x) === locSig(l));
      if (other)
        merged = {
          ...merged,
          lat: merged.lat ?? other.lat,
          lng: merged.lng ?? other.lng,
          days: merged.days ?? other.days,
          local_spend: merged.local_spend ?? other.local_spend,
          jobs: merged.jobs ?? other.jobs,
        };
    }
    const { film_id: _f, ...rest } = merged;
    void _f;
    locations.push(own(side) ? rest : { ...rest, id: undefined });
  }

  const festivals: NonNullable<FilmInput["festivals"]> = [];
  for (const it of plan.festivals) {
    if (!festOn.has(it.key)) continue;
    const [side, id] = it.key.split(":") as [Side, string];
    const x = films[side].festivals.find((f) => f.id === id);
    if (!x) continue;
    const { film_id: _f, ...rest } = x;
    void _f;
    festivals.push(own(side) ? rest : { ...rest, id: undefined });
  }

  const companies: NonNullable<FilmInput["companies"]> = [];
  for (const it of plan.companies) {
    if (!compOn.has(it.key)) continue;
    const [side, i] = it.key.split(":") as [Side, string];
    const c = films[side].companies[Number(i)];
    if (c) companies.push({ ...c });
  }

  const genres = plan.genres.filter((g) => genOn.has(g.key)).map((g) => g.text);

  const budgetFrom = pick("budget");
  return {
    id: keep.id,
    title: pick("title").title,
    year: pick("year").year,
    duration_min: pick("duration_min").duration_min,
    format: pick("format").format,
    nature: pick("nature").nature,
    nationality: pick("nationality").nationality,
    director: pick("director").director,
    producer: pick("producer").producer,
    cinematographer: pick("cinematographer").cinematographer,
    screenwriter: pick("screenwriter").screenwriter,
    budget: budgetFrom.budget,
    currency: budgetFrom.currency,
    synopsis: pick("synopsis").synopsis,
    // el enlace va con su miniatura, de la misma versión
    trailer_url: pick("trailer_url").trailer_url ?? null,
    trailer_thumb: pick("trailer_url").trailer_thumb ?? null,
    film_url: pick("film_url").film_url ?? null,
    film_thumb: pick("film_url").film_thumb ?? null,
    poster_url: plan.poster ? films[choice.poster ?? plan.poster.def].poster_url ?? null : keep.poster_url ?? null,
    // si cualquiera de las dos estaba en el mapa, la fusionada también
    status: a.status === "published" || b.status === "published" ? "published" : "draft",
    genres,
    // el equipo extra, el reparto y los idiomas de las dos producciones se unen (sin repetir); el del registro que se queda va primero
    crew: extraCrew(cleanCrew([...extraCrew(keep.crew), ...extraCrew(films[choice.keep === "a" ? "b" : "a"].crew)])),
    languages: cleanLanguages([...keep.languages, ...films[choice.keep === "a" ? "b" : "a"].languages]),
    locations,
    festivals,
    companies,
  };
}

/** Pares de producciones que parecen la misma (mismo título normalizado y, si ambas tienen año, el mismo año). */
export function likelyDuplicates(films: Pick<Film, "id" | "title" | "year">[]): [string, string][] {
  const byTitle = new Map<string, Pick<Film, "id" | "title" | "year">[]>();
  for (const f of films) {
    const k = n(f.title).replace(/[^a-z0-9]+/g, " ").trim();
    if (!k) continue;
    byTitle.set(k, [...(byTitle.get(k) ?? []), f]);
  }
  const pairs: [string, string][] = [];
  for (const list of byTitle.values())
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++)
        if (list[i].year == null || list[j].year == null || list[i].year === list[j].year) pairs.push([list[i].id, list[j].id]);
  return pairs;
}

