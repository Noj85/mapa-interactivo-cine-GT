import type { Gazetteer } from "@/lib/geo/gazetteer";
import { filmSchema, orgSchema } from "@/lib/schemas";
import { diffSubmission, locText } from "@/lib/submissions";
import type { Film, FilmInput, Org, OrgInput, Submission } from "@/lib/types";

/**
 * Aportes parciales: una corrección a un registro que ya existe se puede aceptar entera (como siempre) o solo en parte.
 * Aquí se parte la corrección en cambios sueltos («la nacionalidad», «esta locación nueva») y se aplica solo lo marcado,
 * sobre el registro tal como está HOY. Es código puro: lo usan la página de revisión (para dibujar las casillas)
 * y la acción del servidor (para aplicar), y ambos calculan exactamente los mismos ids.
 */

export interface CorrectionItem {
  /** Estable: `field:<campo>` o `loc:chg|add|del:<id o posición>`. */
  id: string;
  /** change: cambia un dato · add: agrega algo que no estaba · remove: quita o vacía algo. */
  group: "change" | "add" | "remove";
  label: string;
  before: string | null;
  after: string | null;
  /** Quitar o vaciar nunca viene marcado de entrada. */
  defaultOn: boolean;
}

export interface CorrectionPlan {
  items: CorrectionItem[];
}

/** El contenido del aporte ya validado, igual que lo lee la aprobación completa. */
export function correctionIncoming(sub: Submission): FilmInput | OrgInput | null {
  const parsed = sub.kind === "film" ? filmSchema.safeParse(sub.payload) : orgSchema.safeParse(sub.payload);
  return parsed.success ? (parsed.data as unknown as FilmInput | OrgInput) : null;
}

type Loc = NonNullable<FilmInput["locations"]>[number];

const s = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();
const coord = (v: number | null | undefined) => (v == null ? null : Math.round(v * 1e5) / 1e5);
const locSig = (l: Loc) =>
  JSON.stringify([l.muni_ine ?? null, l.depto_ine ?? null, s(l.country), s(l.city), s(l.site), coord(l.lat), coord(l.lng), l.days ?? null, l.local_spend ?? null, l.jobs ?? null]);

const groupOf = (before: string | null, after: string | null): CorrectionItem["group"] => (after == null ? "remove" : before == null ? "add" : "change");

interface FieldSpec<I> {
  /** Parte del id y nombre de la fila en `diffSubmission`. */
  key: string;
  label: string;
  /** Si el aporte no trae el campo (aportes anteriores a que existiera), no se ofrece. */
  present?: (p: I) => boolean;
}

const FILM_FIELDS: FieldSpec<FilmInput>[] = [
  { key: "title", label: "Título" },
  { key: "year", label: "Año" },
  { key: "duration_min", label: "Duración", present: (p) => p.duration_min !== undefined },
  { key: "format", label: "Formato" },
  { key: "nature", label: "Naturaleza" },
  { key: "genres", label: "Géneros" },
  { key: "nationality", label: "Nacionalidad" },
  { key: "companies", label: "Casas productoras", present: (p) => p.companies !== undefined },
  { key: "director", label: "Director/a" },
  { key: "producer", label: "Productor/a" },
  { key: "cinematographer", label: "Director/a de fotografía" },
  { key: "screenwriter", label: "Guionista" },
  { key: "budget", label: "Presupuesto" },
  { key: "synopsis", label: "Sinopsis" },
  { key: "festivals", label: "Festivales y premios", present: (p) => p.festivals !== undefined },
];

const ORG_FIELDS: FieldSpec<OrgInput>[] = [
  { key: "name", label: "Nombre" },
  { key: "layer", label: "Capa" },
  { key: "categories", label: "Categorías" },
  { key: "initiative_type", label: "Iniciativa" },
  { key: "place", label: "Lugar" },
  { key: "city", label: "Ciudad o referencia" },
  { key: "web", label: "Sitio web" },
  { key: "instagram", label: "Instagram" },
  { key: "contact", label: "Contacto" },
  { key: "description", label: "Descripción" },
];

/** Qué cambia esta corrección, uno por uno, comparada con el registro de hoy. */
export function planCorrection(sub: Submission, current: Film | Org, gaz: Gazetteer): CorrectionPlan {
  const incoming = correctionIncoming(sub);
  if (!incoming) return { items: [] };
  const rows = diffSubmission({ ...sub, payload: incoming as never }, current, gaz);
  const items: CorrectionItem[] = [];

  const fromRows = <I,>(specs: FieldSpec<I>[], p: I) => {
    for (const f of specs) {
      if (f.present && !f.present(p)) continue;
      const r = rows.find((x) => x.label === f.label);
      if (!r || !r.changed) continue;
      const group = groupOf(r.before, r.after);
      items.push({ id: `field:${f.key}`, group, label: f.label, before: r.before, after: r.after, defaultOn: group !== "remove" });
    }
  };

  if (sub.kind === "film") {
    const p = incoming as FilmInput;
    const c = current as Film;
    fromRows(FILM_FIELDS, p);

    // locaciones: una por una, para poder aceptar la nueva y dejar el resto como estaba
    const byId = new Map(c.locations.map((l) => [l.id, l]));
    const seen = new Set<string>();
    (p.locations ?? []).forEach((l, i) => {
      const cur = l.id ? byId.get(l.id) : undefined;
      if (cur) {
        seen.add(cur.id);
        if (locSig(cur) !== locSig(l)) items.push({ id: `loc:chg:${cur.id}`, group: "change", label: "Locación", before: locText(cur, gaz), after: locText(l, gaz), defaultOn: true });
      } else items.push({ id: `loc:add:${i}`, group: "add", label: "Locación", before: null, after: locText(l, gaz), defaultOn: true });
    });
    for (const l of c.locations) if (!seen.has(l.id)) items.push({ id: `loc:del:${l.id}`, group: "remove", label: "Locación", before: locText(l, gaz), after: null, defaultOn: false });

    if (p.poster_url && p.poster_url !== c.poster_url)
      items.push({ id: "field:poster", group: c.poster_url ? "change" : "add", label: "Póster", before: c.poster_url ? "Póster actual" : null, after: "Póster nuevo (se ve arriba)", defaultOn: true });
  } else {
    const p = incoming as OrgInput;
    const c = current as Org;
    fromRows(ORG_FIELDS, p);
    if (p.logo_url && p.logo_url !== (c.logo_url ?? null))
      items.push({ id: "field:logo", group: c.logo_url ? "change" : "add", label: "Logo", before: c.logo_url ? "Logo actual" : null, after: "Logo nuevo (se ve arriba)", defaultOn: true });
  }
  return { items };
}

function draftFromFilm(f: Film): FilmInput {
  return {
    id: f.id,
    title: f.title,
    year: f.year,
    duration_min: f.duration_min,
    format: f.format,
    nature: f.nature,
    genres: [...f.genres],
    director: f.director,
    producer: f.producer,
    cinematographer: f.cinematographer,
    screenwriter: f.screenwriter,
    nationality: f.nationality,
    budget: f.budget,
    currency: f.currency,
    synopsis: f.synopsis,
    poster_url: f.poster_url,
    status: f.status,
    locations: f.locations.map((l) => ({ ...l })),
    festivals: f.festivals.map((x) => ({ ...x })),
    companies: f.companies.map((x) => ({ ...x })),
  };
}

function draftFromOrg(o: Org): OrgInput {
  return {
    id: o.id,
    name: o.name,
    layer: o.layer,
    category: o.category,
    categories: [...o.categories],
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
    source: o.source,
  };
}

export interface CorrectionResult<T> {
  /** El registro como quedaría: lo de hoy más solo lo aceptado. */
  input: T;
  applied: CorrectionItem[];
}

/**
 * Aplica al registro de hoy solo los ids aceptados. Los ids que ya no existan (el registro cambió desde el aporte)
 * se ignoran. Devuelve `null` si el aporte no es válido.
 */
export function applyCorrection(sub: Submission, current: Film | Org, gaz: Gazetteer, accepted: readonly string[]): CorrectionResult<FilmInput | OrgInput> | null {
  const incoming = correctionIncoming(sub);
  if (!incoming) return null;
  const ok = new Set(accepted);
  const applied = planCorrection(sub, current, gaz).items.filter((i) => ok.has(i.id));
  const on = new Set(applied.map((i) => i.id));

  if (sub.kind === "film") {
    const p = incoming as FilmInput;
    const d = draftFromFilm(current as Film);
    const set = <K extends keyof FilmInput>(k: K) => {
      if (on.has(`field:${k}`)) d[k] = p[k];
    };
    set("title");
    set("year");
    set("duration_min");
    set("format");
    set("nature");
    set("genres");
    set("nationality");
    set("companies");
    set("director");
    set("producer");
    set("cinematographer");
    set("screenwriter");
    set("synopsis");
    set("festivals");
    if (on.has("field:budget")) {
      d.budget = p.budget ?? null;
      d.currency = p.currency ?? d.currency;
    }
    if (on.has("field:poster")) d.poster_url = p.poster_url;

    const locs = d.locations;
    const incLocs = p.locations ?? [];
    let out = locs.filter((l) => !(l.id && on.has(`loc:del:${l.id}`)));
    out = out.map((l) => {
      if (!l.id || !on.has(`loc:chg:${l.id}`)) return l;
      const n = incLocs.find((x) => x.id === l.id);
      return n ? { ...n, id: l.id } : l;
    });
    incLocs.forEach((l, i) => {
      if (on.has(`loc:add:${i}`)) out.push({ ...l, id: undefined });
    });
    d.locations = out;
    return { input: d, applied };
  }

  const p = incoming as OrgInput;
  const d = draftFromOrg(current as Org);
  const set = <K extends keyof OrgInput>(k: K) => {
    if (on.has(`field:${k}`)) d[k] = p[k];
  };
  set("name");
  set("layer");
  set("initiative_type");
  set("city");
  set("web");
  set("instagram");
  set("contact");
  set("description");
  if (on.has("field:categories")) {
    d.categories = p.categories;
    d.category = p.categories?.[0] ?? p.category;
  }
  if (on.has("field:place")) {
    d.depto_ine = p.depto_ine ?? null;
    d.muni_ine = p.muni_ine ?? null;
    d.lat = p.lat ?? null;
    d.lng = p.lng ?? null;
  }
  if (on.has("field:logo")) d.logo_url = p.logo_url;
  return { input: d, applied };
}
