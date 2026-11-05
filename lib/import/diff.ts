import { cleanGenres, formatLabel, MAX_GENRES, natureLabel } from "@/lib/film-types";
import { orgCategories, normalizeCategories } from "@/lib/categories";
import { NATIONALITIES, type Film, type FilmInput, type Org, type OrgInput } from "@/lib/types";
import { normalize } from "@/lib/utils";

/**
 * Qué cambiaría un archivo nuevo en un registro que ya existe. Lo usan el navegador (para mostrar la vista previa)
 * y el servidor (que vuelve a calcularlo y aplica solo lo que la persona aceptó).
 *
 * Reglas fijas:
 *  - Una celda vacía nunca borra nada.
 *  - El título y el estado no cambian.
 *  - La moneda viaja con el presupuesto.
 *  - El póster solo se pone si no había.
 *  - Lo que ya tiene otro valor nunca se cambia solo: se ofrece, apagado, como «Usar el del archivo».
 */

/** completa = campo vacío que el archivo llena · agrega = elemento nuevo de una lista · conflicto = ya tiene otro valor */
export type UpdateGroup = "fill" | "add" | "conflict";

export interface UpdateItem {
  /** Identificador estable: lo que se acepta viaja como lista de ids. */
  id: string;
  group: UpdateGroup;
  /** Nombre del campo («Director/a», «Locación», «Festival»). */
  label: string;
  /** Valor actual (solo en los conflictos). */
  current: string | null;
  /** Lo que trae el archivo. */
  incoming: string;
  /** Encendido de entrada: lo que completa o agrega sí; los conflictos no. */
  defaultOn: boolean;
}

export interface UpdatePlan {
  items: UpdateItem[];
  /** Cuántas cosas nuevas (completa + agrega) trae el archivo. */
  news: number;
}

export interface PlaceNames {
  muni?: (code: number | null | undefined) => string;
  depto?: (code: number | null | undefined) => string;
}

type Item<D> = UpdateItem & { apply(d: D): void };

const empty = (v: unknown) => v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
const same = (a: unknown, b: unknown) => (typeof a === "string" || typeof b === "string" ? normalize(String(a ?? "")) === normalize(String(b ?? "")) : a === b);
const money = (n: number | null | undefined, cur: string | null | undefined) => (n == null ? "" : `${cur === "USD" ? "US$" : "Q"} ${Math.round(n).toLocaleString("es-GT")}`);
const trunc = (s: string, n = 120) => (s.length > n ? `${s.slice(0, n).trim()}…` : s);
const natLabel = (n: string | null | undefined) => NATIONALITIES.find((x) => x.id === n)?.label ?? "";

type Loc = NonNullable<FilmInput["locations"]>[number];

const placeText = (l: Partial<Loc>, names?: PlaceNames) => {
  const muni = l.muni_ine != null ? names?.muni?.(l.muni_ine) || `municipio ${l.muni_ine}` : "";
  const depto = !muni && l.depto_ine != null ? names?.depto?.(l.depto_ine) || `departamento ${l.depto_ine}` : "";
  return [l.site, muni || depto].filter(Boolean).join(" · ") || "Sin lugar";
};

/** Ids con el mismo texto no se repiten: el segundo se descarta. */
function uniq<D>(items: Item<D>[]): Item<D>[] {
  const seen = new Set<string>();
  return items.filter((i) => (seen.has(i.id) ? false : (seen.add(i.id), true)));
}

// ───────────────────────── producciones ─────────────────────────

function filmItems(existing: Film, incoming: FilmInput, names?: PlaceNames): Item<FilmInput>[] {
  const items: Item<FilmInput>[] = [];
  const push = (it: Omit<Item<FilmInput>, "defaultOn" | "current"> & { current?: string | null }) =>
    items.push({ ...it, current: it.current ?? null, defaultOn: it.group !== "conflict" });

  // campos simples: vacío → se llena; con otro valor → conflicto
  const simple: { field: "year" | "format" | "nature" | "director" | "producer" | "nationality" | "synopsis"; label: string; show: (v: unknown) => string }[] = [
    { field: "year", label: "Año", show: (v) => String(v) },
    { field: "format", label: "Formato", show: (v) => formatLabel(v as string) },
    { field: "nature", label: "Naturaleza", show: (v) => natureLabel(v as string) },
    { field: "director", label: "Director/a", show: (v) => String(v) },
    { field: "producer", label: "Productor/a", show: (v) => String(v) },
    { field: "nationality", label: "Nacionalidad", show: (v) => natLabel(v as string) },
    { field: "synopsis", label: "Sinopsis", show: (v) => trunc(String(v)) },
  ];
  for (const s of simple) {
    const cur = existing[s.field];
    const inc = incoming[s.field];
    if (empty(inc)) continue;
    const apply = (d: FilmInput) => ((d as unknown as Record<string, unknown>)[s.field] = inc);
    if (empty(cur)) push({ id: `fill:${s.field}`, group: "fill", label: s.label, incoming: s.show(inc), apply });
    else if (!same(cur, inc)) push({ id: `conflict:${s.field}`, group: "conflict", label: s.label, current: s.show(cur), incoming: s.show(inc), apply });
  }

  // presupuesto: la moneda viaja con el monto
  if (incoming.budget != null) {
    const inc = incoming.budget;
    const cur = incoming.currency ?? "GTQ";
    const apply = (d: FilmInput) => {
      d.budget = inc;
      d.currency = cur;
    };
    if (existing.budget == null) push({ id: "fill:budget", group: "fill", label: "Presupuesto", incoming: money(inc, cur), apply });
    else if (Math.round(existing.budget) !== Math.round(inc))
      push({ id: "conflict:budget", group: "conflict", label: "Presupuesto", current: money(existing.budget, existing.currency), incoming: money(inc, cur), apply });
  }

  // póster: solo si no había
  if (!existing.poster_url && incoming.poster_url) push({ id: "fill:poster", group: "fill", label: "Póster", incoming: "Imagen del archivo", apply: (d) => (d.poster_url = incoming.poster_url) });

  // géneros: se agregan los nuevos mientras quepan
  let room = MAX_GENRES - existing.genres.length;
  const have = new Set(existing.genres.map(normalize));
  for (const g of cleanGenres(incoming.genres ?? [])) {
    if (have.has(normalize(g)) || room <= 0) continue;
    room--;
    push({ id: `add:genre:${normalize(g)}`, group: "add", label: "Género", incoming: g, apply: (d) => (d.genres = cleanGenres([...(d.genres ?? []), g])) });
  }

  // casas productoras
  for (const nc of incoming.companies ?? []) {
    const name = (nc.name ?? "").trim();
    if (!name) continue;
    const match = existing.companies.find((c) => normalize(c.name) === normalize(name));
    if (!match) {
      push({ id: `add:company:${normalize(name)}`, group: "add", label: "Casa productora", incoming: nc.country ? `${name} (${nc.country})` : name, apply: (d) => (d.companies = [...(d.companies ?? []), { name, country: nc.country ?? null }]) });
    } else if (!match.country && nc.country) {
      push({
        id: `fill:company-country:${normalize(name)}`,
        group: "fill",
        label: `País de ${match.name}`,
        incoming: nc.country,
        apply: (d) => (d.companies = (d.companies ?? []).map((c) => (normalize(c.name ?? "") === normalize(name) ? { ...c, country: nc.country ?? null } : c))),
      });
    }
  }

  // festivales
  const festKey = (f: { name?: string | null; year?: number | null; award?: string | null }) => `${normalize(f.name ?? "")}|${f.year ?? ""}|${normalize(f.award ?? "")}`;
  for (const nf of incoming.festivals ?? []) {
    if (!(nf.name ?? "").trim()) continue;
    if (existing.festivals.some((f) => festKey(f) === festKey(nf))) continue;
    push({
      id: `add:festival:${festKey(nf)}`,
      group: "add",
      label: "Festival",
      incoming: [nf.name, nf.year, nf.award].filter(Boolean).join(" · "),
      apply: (d) => (d.festivals = [...(d.festivals ?? []), { ...nf }]),
    });
  }

  // locaciones
  const claimed = new Set<string>();
  for (const nl of incoming.locations ?? []) {
    const hasAny = nl.muni_ine != null || nl.depto_ine != null || (nl.lat != null && nl.lng != null) || !!(nl.site ?? "").trim();
    if (!hasAny) continue;
    const site = normalize(nl.site ?? "");
    const deptoOf = nl.depto_ine ?? (nl.muni_ine != null ? Math.floor(nl.muni_ine / 100) : null);
    const lDepto = (l: { depto_ine: number | null; muni_ine: number | null }) => l.depto_ine ?? (l.muni_ine != null ? Math.floor(l.muni_ine / 100) : null);
    // 1. la misma locación: se completan solo sus cifras vacías
    let match = existing.locations.find((l) => (nl.muni_ine != null ? l.muni_ine === nl.muni_ine : l.muni_ine == null && lDepto(l) === deptoOf) && normalize(l.site ?? "") === site);
    let completesPlace = false;
    // 2. una locación existente sin municipio que este archivo sí ubica
    if (!match && nl.muni_ine != null) {
      match = existing.locations.find(
        (l) => l.muni_ine == null && !claimed.has(l.id) && normalize(l.site ?? "") === site && (lDepto(l) == null || lDepto(l) === deptoOf),
      );
      completesPlace = !!match;
    }
    if (match) {
      claimed.add(match.id);
      const m = match;
      const where = placeText({ ...m, ...(completesPlace ? { muni_ine: nl.muni_ine, depto_ine: nl.depto_ine } : {}) }, names);
      if (completesPlace) {
        push({
          id: `fill:location:${m.id}:place`,
          group: "fill",
          label: `Municipio de la locación «${m.site || "sin sitio"}»`,
          incoming: names?.muni?.(nl.muni_ine) || String(nl.muni_ine),
          apply: (d) => {
            d.locations = (d.locations ?? []).map((l) => (l.id === m.id ? { ...l, muni_ine: nl.muni_ine, depto_ine: nl.depto_ine ?? deptoOf } : l));
          },
        });
      }
      const nums: { k: "days" | "local_spend" | "jobs" | "lat" | "lng"; label: string }[] = [
        { k: "days", label: "Días de rodaje" },
        { k: "local_spend", label: "Inversión local" },
        { k: "jobs", label: "Empleos" },
      ];
      for (const n of nums) {
        if (m[n.k] == null && nl[n.k] != null) {
          const v = nl[n.k]!;
          push({
            id: `fill:location:${m.id}:${n.k}`,
            group: "fill",
            label: `${n.label} (${where})`,
            incoming: n.k === "local_spend" ? money(v, "GTQ") : String(v),
            apply: (d) => (d.locations = (d.locations ?? []).map((l) => (l.id === m.id ? { ...l, [n.k]: v } : l))),
          });
        }
      }
      if (m.lat == null && m.lng == null && nl.lat != null && nl.lng != null) {
        push({
          id: `fill:location:${m.id}:coords`,
          group: "fill",
          label: `Coordenadas (${where})`,
          incoming: `${nl.lat}, ${nl.lng}`,
          apply: (d) => (d.locations = (d.locations ?? []).map((l) => (l.id === m.id ? { ...l, lat: nl.lat, lng: nl.lng } : l))),
        });
      }
      continue;
    }
    // 3. una locación nueva
    const key = `${nl.muni_ine ?? ""}|${nl.muni_ine == null ? (deptoOf ?? "") : ""}|${site}|${nl.lat ?? ""},${nl.lng ?? ""}`;
    push({ id: `add:location:${key}`, group: "add", label: "Locación", incoming: placeText(nl, names), apply: (d) => (d.locations = [...(d.locations ?? []), { ...nl }]) });
  }
  return uniq(items);
}

/** Base para aplicar cambios: el registro tal como está. */
function draftFromFilm(f: Film): FilmInput {
  return {
    id: f.id,
    title: f.title,
    year: f.year,
    format: f.format,
    nature: f.nature,
    genres: [...f.genres],
    director: f.director,
    producer: f.producer,
    nationality: f.nationality,
    budget: f.budget,
    currency: f.currency,
    synopsis: f.synopsis,
    poster_url: f.poster_url,
    status: f.status,
    locations: f.locations.map((l) => ({ ...l })),
    festivals: f.festivals.map((x) => ({ ...x })),
    companies: f.companies.map((c) => ({ ...c })),
  };
}

function strip<D>(it: Item<D>): UpdateItem {
  const { id, group, label, current, incoming, defaultOn } = it;
  return { id, group, label, current, incoming, defaultOn };
}

export function planFilmUpdate(existing: Film, incoming: FilmInput, names?: PlaceNames): UpdatePlan {
  const items = filmItems(existing, incoming, names).map((i) => strip(i));
  return { items, news: items.filter((i) => i.group !== "conflict").length };
}

export interface FilmUpdateResult {
  input: FilmInput;
  /** Elementos aplicados (para el resumen). */
  applied: UpdateItem[];
  /** Si no se aplicó nada, el registro no se guarda. */
  changed: boolean;
}

/**
 * Aplica al registro solo lo aceptado. `accepted` es la lista de ids que eligió la persona; sin ella,
 * se aplica lo que viene encendido de entrada (completar y agregar, nunca los conflictos).
 */
export function applyFilmUpdate(existing: Film, incoming: FilmInput, accepted?: readonly string[]): FilmUpdateResult {
  const draft = draftFromFilm(existing);
  const ok = accepted ? new Set(accepted) : null;
  const applied: UpdateItem[] = [];
  for (const it of filmItems(existing, incoming)) {
    if (ok ? !ok.has(it.id) : !it.defaultOn) continue;
    it.apply(draft);
    applied.push(strip(it));
  }
  return { input: draft, applied, changed: applied.length > 0 };
}

// ───────────────────────── entidades ─────────────────────────

function orgItems(existing: Org, incoming: OrgInput, names?: PlaceNames): Item<OrgInput>[] {
  const items: Item<OrgInput>[] = [];
  const push = (it: Omit<Item<OrgInput>, "defaultOn" | "current"> & { current?: string | null }) =>
    items.push({ ...it, current: it.current ?? null, defaultOn: it.group !== "conflict" });

  const simple: { field: "initiative_type" | "city" | "web" | "instagram" | "contact" | "description"; label: string; show?: (v: unknown) => string }[] = [
    { field: "initiative_type", label: "Naturaleza", show: (v) => String(v) },
    { field: "city", label: "Ciudad o referencia" },
    { field: "web", label: "Sitio web" },
    { field: "instagram", label: "Instagram" },
    { field: "contact", label: "Contacto" },
    { field: "description", label: "Descripción", show: (v) => trunc(String(v)) },
  ];
  for (const s of simple) {
    const cur = existing[s.field];
    const inc = incoming[s.field];
    if (empty(inc)) continue;
    const show = s.show ?? ((v: unknown) => String(v));
    const apply = (d: OrgInput) => ((d as unknown as Record<string, unknown>)[s.field] = inc);
    if (empty(cur)) push({ id: `fill:${s.field}`, group: "fill", label: s.label, incoming: show(inc), apply });
    else if (!same(cur, inc)) push({ id: `conflict:${s.field}`, group: "conflict", label: s.label, current: show(cur), incoming: show(inc), apply });
  }

  // lugar (municipio y departamento van juntos)
  const where = (muni: number | null | undefined, depto: number | null | undefined) =>
    muni != null ? names?.muni?.(muni) || `municipio ${muni}` : depto != null ? names?.depto?.(depto) || `departamento ${depto}` : "";
  const incDepto = incoming.depto_ine ?? (incoming.muni_ine != null ? Math.floor(incoming.muni_ine / 100) : null);
  const curDepto = existing.depto_ine ?? (existing.muni_ine != null ? Math.floor(existing.muni_ine / 100) : null);
  const applyPlace = (d: OrgInput) => {
    d.muni_ine = incoming.muni_ine ?? null;
    d.depto_ine = incDepto;
  };
  if (incoming.muni_ine != null || incDepto != null) {
    if (existing.muni_ine == null && existing.depto_ine == null) {
      push({ id: "fill:place", group: "fill", label: "Lugar", incoming: where(incoming.muni_ine, incDepto), apply: applyPlace });
    } else if (existing.muni_ine == null && incoming.muni_ine != null) {
      if (curDepto == null || curDepto === incDepto) push({ id: "fill:place", group: "fill", label: "Municipio", incoming: where(incoming.muni_ine, incDepto), apply: applyPlace });
      else push({ id: "conflict:place", group: "conflict", label: "Lugar", current: where(existing.muni_ine, curDepto), incoming: where(incoming.muni_ine, incDepto), apply: applyPlace });
    } else if (existing.muni_ine != null && incoming.muni_ine != null && existing.muni_ine !== incoming.muni_ine) {
      push({ id: "conflict:place", group: "conflict", label: "Lugar", current: where(existing.muni_ine, curDepto), incoming: where(incoming.muni_ine, incDepto), apply: applyPlace });
    }
  }

  // coordenadas
  if (incoming.lat != null && incoming.lng != null) {
    const apply = (d: OrgInput) => {
      d.lat = incoming.lat;
      d.lng = incoming.lng;
    };
    if (existing.lat == null || existing.lng == null) push({ id: "fill:coords", group: "fill", label: "Coordenadas", incoming: `${incoming.lat}, ${incoming.lng}`, apply });
    else if (Math.abs(existing.lat - incoming.lat) > 0.001 || Math.abs(existing.lng - incoming.lng) > 0.001)
      push({ id: "conflict:coords", group: "conflict", label: "Coordenadas", current: `${existing.lat}, ${existing.lng}`, incoming: `${incoming.lat}, ${incoming.lng}`, apply });
  }

  // categorías: se suman las nuevas (la principal solo se llena si estaba vacía)
  const have = new Set(orgCategories(existing).map(normalize));
  for (const c of normalizeCategories(incoming.categories ?? (incoming.category ? [incoming.category] : []))) {
    if (have.has(normalize(c))) continue;
    push({ id: `add:category:${normalize(c)}`, group: "add", label: "Categoría", incoming: c, apply: (d) => (d.categories = normalizeCategories([...(d.categories ?? []), c])) });
  }
  return uniq(items);
}

function draftFromOrg(o: Org): OrgInput {
  return {
    id: o.id,
    name: o.name,
    layer: o.layer,
    category: o.category,
    categories: orgCategories(o),
    initiative_type: o.initiative_type,
    depto_ine: o.depto_ine,
    muni_ine: o.muni_ine,
    city: o.city,
    lat: o.lat,
    lng: o.lng,
    web: o.web,
    instagram: o.instagram,
    contact: o.contact,
    description: o.description,
    logo_url: o.logo_url ?? null,
    status: o.status,
  };
}

export function planOrgUpdate(existing: Org, incoming: OrgInput, names?: PlaceNames): UpdatePlan {
  const items = orgItems(existing, incoming, names).map((i) => strip(i));
  return { items, news: items.filter((i) => i.group !== "conflict").length };
}

export interface OrgUpdateResult {
  input: OrgInput;
  applied: UpdateItem[];
  changed: boolean;
}

export function applyOrgUpdate(existing: Org, incoming: OrgInput, accepted?: readonly string[]): OrgUpdateResult {
  const draft = draftFromOrg(existing);
  const ok = accepted ? new Set(accepted) : null;
  const applied: UpdateItem[] = [];
  for (const it of orgItems(existing, incoming)) {
    if (ok ? !ok.has(it.id) : !it.defaultOn) continue;
    it.apply(draft);
    applied.push(strip(it));
  }
  // la categoría principal es la primera
  draft.category = draft.categories?.[0] ?? draft.category;
  return { input: draft, applied, changed: applied.length > 0 };
}

/** Texto corto de lo aplicado para el resumen final: «Director/a, Géneros (2), Locación (3)». */
export function summarizeApplied(items: UpdateItem[]): string[] {
  const counts = new Map<string, number>();
  for (const i of items) {
    const k = i.id.startsWith("fill:location:") ? "Datos de locación" : i.id.startsWith("add:location") ? "Locación" : i.label.replace(/ \(.*\)$/, "");
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts].map(([k, n]) => (n > 1 ? `${k} (${n})` : k));
}
