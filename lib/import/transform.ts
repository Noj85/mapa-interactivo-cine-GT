import { detectCountry } from "@/lib/countries";
import { formatContact, parseContact } from "@/lib/contact";
import { cleanGenres } from "@/lib/film-types";
import type { Gazetteer } from "@/lib/geo/gazetteer";
import type { PolyCollection } from "@/lib/geo/load";
import { municipalityAt } from "@/lib/geo/pip";
import type { FilmInput, OrgInput } from "@/lib/types";
import { normalizeCategories } from "@/lib/categories";
import { normalize, upperTitle } from "@/lib/utils";
import { alignLists, declaredCount, separatorsOf, splitCell, splitPlaceCell } from "./multi";
import { sameName, sameRecordInFile, titleCore } from "./duplicates";
import {
  cleanText,
  detectCurrency,
  normalizeCategoryList,
  normalizeFestivalResult,
  normalizeInitiative,
  normalizeFormat,
  normalizeGenres,
  normalizeInstagram,
  normalizeNature,
  normalizeNationality,
  guessLayer,
  normalizeWeb,
  parseCoord,
  parseNumber,
  parseYear,
  parseDuration,
} from "./normalize";
import type { Candidate, ImportPlan, Issue, ParsedFile, ParsedSheet, PlaceResolution, SheetPlan } from "./types";

type Row = Record<string, string>;

const val = (row: Row, plan: SheetPlan, field: string, group = 1) => {
  const col = group <= 1 ? plan.columns[field] : plan.columns[`${field}__${group}`];
  return col ? (row[col] ?? "") : "";
};

/** Grupos de locación que trae cada fila: 1, y los que el mapeo marcó con `__2`, `__3`… */
export function locationGroupsOf(plan: SheetPlan): number[] {
  const set = new Set<number>([1]);
  for (const k of Object.keys(plan.columns)) {
    const m = k.match(/__(\d+)$/);
    if (m) set.add(Number(m[1]));
  }
  return [...set].sort((a, b) => a - b);
}

/** Una locación de una fila, ya partida y alineada con sus columnas paralelas. */
export interface LocItem {
  q: { query: string; site: string | null } | null;
  lat: string;
  lng: string;
  days: number | null;
  spend: number | null;
  jobs: number | null;
}

const LOC_LISTS = ["place", "muni", "depto", "site", "lat", "lng", "days", "local_spend", "jobs"] as const;

/**
 * Locaciones de una fila para un grupo de columnas. Cada campo de lugar puede traer varias entradas
 * («Petén; Izabal»); las columnas del grupo se alinean por posición y un departamento único califica a todas.
 */
export function locationItems(row: Row, plan: SheetPlan, group = 1, gaz?: Gazetteer): { items: LocItem[]; mismatched: string[] } {
  const lists: Record<string, string[]> = {};
  for (const f of LOC_LISTS) {
    const raw = cleanText(val(row, plan, f, group)) ?? "";
    const seps = separatorsOf(plan, f);
    lists[f] = f === "place" || f === "muni" || f === "depto" ? splitPlaceCell(raw, seps, gaz) : splitCell(raw, seps.filter((x) => x !== ","));
  }
  const place = lists.place;
  const muni = lists.muni;
  const depto = lists.depto;
  const site = lists.site;
  const queryBase = place.length ? place : muni.length ? muni : depto.length ? depto : site.length ? site : [];
  const qualifies = place.length > 0 || muni.length > 0;
  const aligned = alignLists({ ...lists, __q: queryBase }, ["depto"]);
  const n = Math.max(queryBase.length, lists.lat.length, lists.lng.length, lists.days.length, lists.local_spend.length, lists.jobs.length, 0);
  const items: LocItem[] = [];
  for (let i = 0; i < n; i++) {
    const base = queryBase.length === 1 ? (i === 0 ? queryBase[0] : null) : (queryBase[i] ?? null);
    let q: LocItem["q"] = null;
    if (base) {
      const d = qualifies ? aligned.at("depto", i) : null;
      const query = d && !normalize(base).includes(normalize(d)) ? `${base}, ${d}` : base;
      const siteOf = queryBase === site ? base : aligned.at("site", i);
      q = { query, site: siteOf };
    }
    items.push({
      q,
      lat: aligned.at("lat", i) ?? "",
      lng: aligned.at("lng", i) ?? "",
      days: parseNumber(aligned.at("days", i) ?? ""),
      spend: parseNumber(aligned.at("local_spend", i) ?? ""),
      jobs: parseNumber(aligned.at("jobs", i) ?? ""),
    });
  }
  return { items, mismatched: aligned.mismatched.filter((k) => k !== "__q") };
}

/** Consultas de lugar de una fila: "Panajachel, Sololá", "Antigua"… */
export function placeQueries(row: Row, plan: SheetPlan, group = 1, gaz?: Gazetteer): { query: string; site: string | null }[] {
  return locationItems(row, plan, group, gaz)
    .items.map((it) => it.q)
    .filter((q): q is { query: string; site: string | null } => !!q);
}

/** Textos de lugar únicos del archivo, para resolverlos de una vez. */
export function collectPlaceTexts(file: ParsedFile, plan: ImportPlan, gaz?: Gazetteer): string[] {
  const set = new Set<string>();
  for (const sp of plan.sheets) {
    if (sp.entity === "ignore") continue;
    const sheet = file.sheets.find((s) => s.name === sp.sheet);
    if (!sheet) continue;
    const groups = sp.entity === "film" ? locationGroupsOf(sp) : [1];
    for (const row of sheet.rows)
      for (const g of groups)
        for (const q of placeQueries(row, sp, g, gaz)) {
          // «Oaxaca, México» ya se sabe que es fuera de Guatemala: no hay nada que buscar en el catálogo de municipios
          if (sp.entity === "film" && /[,;|]/.test(q.query) && detectCountry(q.query)) continue;
          set.add(q.query);
        }
  }
  return [...set];
}

interface Geo {
  gaz: Gazetteer;
  muni?: PolyCollection;
}

function resolveLocation(
  q: { query: string; site: string | null } | null,
  row: Row,
  plan: SheetPlan,
  places: Record<string, PlaceResolution>,
  geo: Geo,
  coords: { lat: string; lng: string } | null,
) {
  const loc: NonNullable<FilmInput["locations"]>[number] = { site: q?.site ?? null };
  let issue: Issue | null = null;
  // «Oaxaca, México»: el lugar nombra otro país, así que es una locación fuera de Guatemala y no un lugar sin resolver
  // (un texto de una sola palabra que el catálogo ya resolvió, como «El Salvador», se queda como lugar de Guatemala)
  const resolved = q ? places[q.query] : undefined;
  const abroad = q && plan.entity === "film" && !(resolved?.status === "ok" && !/[,;|]/.test(q.query)) ? detectCountry(q.query) : null;
  if (abroad) {
    loc.country = abroad.country;
    loc.city = abroad.city || null;
    loc.confidence = 0.9;
    return { loc, issue };
  }
  const lat = coords ? parseCoord(coords.lat, "lat") : null;
  const lng = coords ? parseCoord(coords.lng, "lng") : null;
  if (lat != null && lng != null) {
    loc.lat = lat;
    loc.lng = lng;
  }
  const res = q ? places[q.query] : undefined;
  if (res?.status === "ok") {
    loc.muni_ine = res.muni_ine;
    loc.depto_ine = res.depto_ine;
    loc.confidence = res.via === "gazetteer" ? 0.95 : 0.8;
  } else if (res?.depto_ine != null) {
    loc.depto_ine = res.depto_ine;
  }
  if (loc.muni_ine == null && loc.lat != null && loc.lng != null && geo.muni) {
    const m = municipalityAt(loc.lng!, loc.lat!, geo.muni, geo.gaz);
    if (m != null) {
      loc.muni_ine = m;
      loc.depto_ine = Math.floor(m / 100);
      loc.confidence = 0.9;
    }
  }
  if (q && loc.muni_ine == null && !(res?.status === "ok")) {
    issue = {
      field: "location",
      level: "doubt",
      message: res?.status === "ambiguous" ? `“${q.query}” puede ser varios lugares` : `No pudimos ubicar “${q.query}”`,
    };
  }
  return { loc, issue };
}

/** Solo se acepta un enlace http(s); se descargará al confirmar la carga. */
const posterLink = (v: string | null | undefined) => {
  const s = (v ?? "").trim();
  return /^https?:\/\/\S+$/i.test(s) ? s : null;
};

type Fest = NonNullable<FilmInput["festivals"]>[number];

/**
 * Las participaciones en festivales que describe la fila. Una celda puede traer varios («Sundance; Berlinale») y las
 * columnas de año, resultado, sección y premio se alinean por posición; un año o resultado único vale para todos.
 */
function festivalsOf(row: Row, plan: SheetPlan): { items: Fest[]; mismatched: string[] } {
  const L = (f: string) => splitCell(cleanText(val(row, plan, f)) ?? "", separatorsOf(plan, f));
  const lists = {
    festival: L("festival"),
    festival_year: L("festival_year"),
    festival_result: L("festival_result"),
    festival_section: L("festival_section"),
    festival_award: L("festival_award"),
    festival_url: L("festival_url"),
  };
  const a = alignLists(lists, ["festival_year", "festival_result"]);
  const items: Fest[] = [];
  for (let i = 0; i < lists.festival.length; i++) {
    const award = cleanText(a.at("festival_award", i));
    const url = cleanText(a.at("festival_url", i));
    items.push({
      name: lists.festival[i],
      year: parseYear(a.at("festival_year", i) ?? ""),
      result: normalizeFestivalResult(a.at("festival_result", i) ?? "", award, plan.value_maps?.festival_result),
      section: cleanText(a.at("festival_section", i)),
      award,
      url: url && /^https?:\/\/\S+$/i.test(url) ? url : null,
    });
  }
  return { items, mismatched: a.mismatched.filter((k) => k !== "festival") };
}

const festKey = (f: Fest) => `${normalize(f.name ?? "")}|${f.year ?? ""}|${normalize(f.award ?? "")}|${normalize(f.section ?? "")}`;

type Company = NonNullable<FilmInput["companies"]>[number];

const splitList = (v: string, seps?: string[]) => splitCell(v, seps);

/**
 * Casas productoras de la fila: «Casa Uno (México); Casa Dos» o una columna de nombres y otra de países.
 * Si la producción es guatemalteca y no se dice el país, es Guatemala.
 */
function companiesOf(row: Row, plan: SheetPlan, nationality: string | null | undefined): Company[] {
  const names = splitList(cleanText(val(row, plan, "company")) ?? "", separatorsOf(plan, "company"));
  if (!names.length) return [];
  const countries = splitList(cleanText(val(row, plan, "company_country")) ?? "", separatorsOf(plan, "company_country"));
  return names.map((raw, i) => {
    const m = raw.match(/^(.*?)\s*\(([^()]{2,60})\)\s*$/);
    const name = (m ? m[1] : raw).trim();
    const country = m ? m[2].trim() : (countries.length === names.length ? countries[i] : countries.length === 1 ? countries[0] : "") || null;
    return { name, country: country || (nationality === "guatemalteca" ? "Guatemala" : null) };
  });
}

const addCompanies = (list: Company[], add: Company[]) => {
  for (const c of add) {
    const prev = list.find((x) => sameName(x.name ?? "", c.name ?? ""));
    if (!prev) list.push(c);
    else if (!prev.country && c.country) prev.country = c.country;
  }
};

function filmFields(row: Row, plan: SheetPlan): Omit<FilmInput, "locations" | "festivals" | "companies"> {
  const vm = plan.value_maps ?? {};
  const budgetRaw = val(row, plan, "budget");
  // una misma columna puede traer formato y naturaleza («Largometraje documental»), y la de géneros puede traer la naturaleza
  const fmtCell = val(row, plan, "format");
  const natCell = val(row, plan, "nature");
  const gen = normalizeGenres(val(row, plan, "genres"), vm.genres);
  return {
    title: upperTitle(cleanText(val(row, plan, "title"))),
    year: parseYear(val(row, plan, "year")),
    duration_min: parseDuration(val(row, plan, "duration_min")),
    format: normalizeFormat(fmtCell, vm.format) ?? normalizeFormat(natCell, vm.format) ?? gen.format,
    nature: normalizeNature(natCell, vm.nature) ?? normalizeNature(fmtCell, vm.nature) ?? gen.nature,
    genres: gen.genres,
    director: cleanText(val(row, plan, "director")),
    producer: cleanText(val(row, plan, "producer")),
    cinematographer: cleanText(val(row, plan, "cinematographer")),
    screenwriter: cleanText(val(row, plan, "screenwriter")),
    nationality: normalizeNationality(val(row, plan, "nationality"), vm.nationality),
    budget: parseNumber(budgetRaw),
    currency: detectCurrency(val(row, plan, "currency")) ?? detectCurrency(budgetRaw) ?? "GTQ",
    synopsis: cleanText(val(row, plan, "synopsis")),
    poster_url: posterLink(val(row, plan, "poster")),
    trailer_url: posterLink(val(row, plan, "trailer")),
    film_url: posterLink(val(row, plan, "film_link")),
  };
}

const merge = <T extends object>(a: T, b: T): T => {
  const out = { ...a } as Record<string, unknown>;
  for (const [k, v] of Object.entries(b)) {
    if (k === "genres") out[k] = cleanGenres([...((out[k] as string[]) ?? []), ...((v as string[]) ?? [])]);
    else if ((out[k] === null || out[k] === undefined || out[k] === "") && v != null && v !== "") out[k] = v;
  }
  return out as T;
};

function filmCandidates(sheet: ParsedSheet, plan: SheetPlan, places: Record<string, PlaceResolution>, geo: Geo): Candidate[] {
  const map = new Map<string, Candidate>();
  const order: string[] = [];
  const seenLocs = new Map<Candidate, Set<string>>();

  sheet.rows.forEach((row, i) => {
    const base = filmFields(row, plan);
    if (!base.title) return;
    const key =
      plan.grain === "row_per_location"
        ? `film:${normalize(base.title)}|${base.year ?? ""}`
        : `film:${sheet.name}!${i}`;
    let cand = map.get(key);
    if (!cand) {
      cand = {
        key,
        type: "film",
        film: { ...base, locations: [], festivals: [], companies: [], status: "published", source: undefined },
        placeTexts: [],
        rows: [],
        issues: [],
        include: true,
      };
      map.set(key, cand);
      order.push(key);
    } else {
      cand.film = { ...merge(cand.film!, base as FilmInput), locations: cand.film!.locations, festivals: cand.film!.festivals, companies: cand.film!.companies };
    }
    cand.rows.push(`${sheet.name}!${i + 2}`);

    addCompanies(cand.film!.companies!, companiesOf(row, plan, cand.film!.nationality));

    const fests = festivalsOf(row, plan);
    for (const fest of fests.items) if (!cand.film!.festivals!.some((x) => festKey(x) === festKey(fest))) cand.film!.festivals!.push(fest);
    const warn = (field: string, message: string) => {
      if (!cand!.issues.some((x) => x.field === field && x.message === message)) cand!.issues.push({ field, level: "doubt", message });
    };
    if (fests.mismatched.length)
      warn("columns:festival", `Las columnas ${fests.mismatched.map((m) => `«${plan.columns[m]}»`).join(", ")} traen distinta cantidad de valores que los festivales (${fests.items.length}); se asignaron en orden, revísalos.`);

    let found = 0;
    for (const g of locationGroupsOf(plan)) {
      const { items, mismatched } = locationItems(row, plan, g, geo.gaz);
      if (mismatched.length)
        warn("columns:location", `Las columnas ${mismatched.map((m) => `«${plan.columns[g > 1 ? `${m}__${g}` : m]}»`).join(", ")} traen distinta cantidad de valores que los lugares (${items.length}); se asignaron en orden, revísalos.`);
      const slots: (LocItem | null)[] = items.length ? items : [null];
      slots.forEach((it) => {
        const q = it?.q ?? null;
        const hasCoords = !!it && parseCoord(it.lat, "lat") != null;
        if (!q && !hasCoords && !it?.days && !it?.spend && !it?.jobs && cand!.film!.locations.length) return;
        const { loc, issue } = resolveLocation(q, row, plan, places, geo, it ? { lat: it.lat, lng: it.lng } : null);
        loc.days = it?.days ?? null;
        loc.local_spend = it?.spend ?? null;
        loc.jobs = it?.jobs ?? null;
        if (!q && loc.muni_ine == null && loc.depto_ine == null && loc.lat == null) return; // fila sin lugar
        found++;
        // si la producción se repite una fila por festival, el mismo lugar no se duplica
        if (plan.grain === "row_per_location") {
          const sig = `${q?.query ?? ""}|${q?.site ?? ""}|${loc.days ?? ""}|${loc.local_spend ?? ""}|${loc.jobs ?? ""}`;
          const seen = (seenLocs.get(cand!) ?? seenLocs.set(cand!, new Set()).get(cand!))!;
          if (seen.has(sig)) return;
          seen.add(sig);
        }
        if (q) cand!.placeTexts.push(q.query);
        cand!.film!.locations.push(loc);
        if (issue) cand!.issues.push({ ...issue, field: `location:${cand!.film!.locations.length - 1}` });
      });
    }

    // la columna de cantidad solo avisa: si dice una cosa y se encontró otra, se muestra en la revisión
    if (plan.grain !== "row_per_location") {
      const dl = declaredCount(val(row, plan, "n_locations"));
      if (dl != null && dl !== found)
        warn("count:location", `El archivo dice ${dl} ${dl === 1 ? "locación" : "locaciones"} y encontramos ${found}.${found < dl ? " Puede que el resto esté en un texto o falte en el archivo." : ""}`);
      const df = declaredCount(val(row, plan, "n_festivals"));
      if (df != null && df !== fests.items.length) warn("count:festival", `El archivo dice ${df} ${df === 1 ? "festival" : "festivales"} y encontramos ${fests.items.length}.`);
      const dc = declaredCount(val(row, plan, "n_companies"));
      const cc = companiesOf(row, plan, null).length;
      if (dc != null && dc !== cc) warn("count:company", `El archivo dice ${dc} ${dc === 1 ? "casa productora" : "casas productoras"} y encontramos ${cc}.`);
    }
  });
  return order.map((k) => map.get(k)!);
}

function orgCandidates(sheet: ParsedSheet, plan: SheetPlan, places: Record<string, PlaceResolution>, geo: Geo): Candidate[] {
  const baseLayer = plan.layer ?? "circulacion";
  const vm = plan.value_maps ?? {};
  const out: Candidate[] = [];
  sheet.rows.forEach((row, i) => {
    const name = cleanText(val(row, plan, "name"));
    if (!name) return;
    // hojas que mezclan Circulación e Industria: la capa sale de la categoría de cada fila
    const layer = plan.layer_by_row ? (guessLayer(splitList(val(row, plan, "category"))) ?? baseLayer) : baseLayer;
    const qs = placeQueries(row, plan, 1, geo.gaz);
    const { loc, issue } = resolveLocation(qs[0] ?? null, row, plan, places, geo, { lat: val(row, plan, "lat"), lng: val(row, plan, "lng") });
    const contactRaw = cleanText(val(row, plan, "contact"));
    const contactParsed = contactRaw ? parseContact(contactRaw) : null;
    const cats = normalizeCategoryList(val(row, plan, "category"), layer, vm.category);
    const org: OrgInput = {
      name,
      layer,
      category: cats[0] ?? "",
      categories: cats,
      initiative_type: normalizeInitiative(val(row, plan, "initiative_type"), vm.initiative_type),
      depto_ine: loc.depto_ine ?? null,
      muni_ine: loc.muni_ine ?? null,
      city: cleanText(val(row, plan, "city")),
      lat: loc.lat ?? null,
      lng: loc.lng ?? null,
      web: normalizeWeb(val(row, plan, "web")),
      instagram: normalizeInstagram(val(row, plan, "instagram")),
      contact: contactParsed ? formatContact(contactParsed) : null,
      description: cleanText(val(row, plan, "description")),
      logo_url: posterLink(val(row, plan, "logo")),
      status: "published",
    };
    const issues: Issue[] = [];
    if (issue) issues.push({ ...issue, field: "location:0" });
    if (contactParsed?.ignored.length)
      issues.push({ field: "contact", level: "doubt", message: `Contacto estandarizado; no se guardó: ${contactParsed.ignored.map((t) => `«${t}»`).join(", ")}` });
    if (!org.category) issues.push({ field: "category", level: "missing", message: "Falta la categoría" });
    out.push({
      key: `org:${sheet.name}!${i}`,
      type: "org",
      org,
      placeTexts: qs[0] ? [qs[0].query] : [],
      rows: [`${sheet.name}!${i + 2}`],
      issues,
      include: true,
    });
  });
  return out;
}

// ───────────────────────── fusión dentro del archivo ─────────────────────────

type Loc = NonNullable<FilmInput["locations"]>[number];
const locSig = (l: Loc) => [l.site, l.muni_ine, l.depto_ine, l.country, l.city, l.lat, l.lng].map((x) => normalize(String(x ?? ""))).join("|");

/** Campos de una producción que, si el archivo los trae con dos valores distintos, merecen un aviso. */
const FILM_CONFLICT_FIELDS: [keyof FilmInput, string][] = [
  ["duration_min", "la duración"],
  ["format", "el formato"],
  ["nationality", "la nacionalidad"],
  ["budget", "el presupuesto"],
  ["producer", "el productor/a"],
  ["cinematographer", "el director/a de fotografía"],
  ["screenwriter", "el guionista"],
];

function mergeFilmInto(a: Candidate, b: Candidate) {
  const fa = a.film!;
  const fb = b.film!;
  // si el archivo trae dos valores distintos para lo mismo, se usa el primero y se avisa
  for (const [k, label] of FILM_CONFLICT_FIELDS) {
    const x = fa[k];
    const y = fb[k];
    if (x != null && x !== "" && y != null && y !== "" && normalize(String(x)) !== normalize(String(y)))
      a.issues.push({ field: String(k), level: "doubt", message: `El archivo trae ${label} con dos valores (${x} y ${y}); se usó ${x}.` });
  }
  const merged = { ...merge(fa, fb as FilmInput), locations: [...fa.locations], festivals: [...(fa.festivals ?? [])], companies: [...(fa.companies ?? [])] };
  const seen = new Set(merged.locations.map(locSig));
  const map = new Map<number, number>(); // índice de b -> índice nuevo
  fb.locations.forEach((l, i) => {
    const sig = locSig(l);
    if (seen.has(sig)) return;
    seen.add(sig);
    map.set(i, merged.locations.length);
    merged.locations.push(l);
  });
  for (const f of fb.festivals ?? []) if (!merged.festivals.some((x) => festKey(x) === festKey(f))) merged.festivals.push(f);
  addCompanies(merged.companies, fb.companies ?? []);
  a.film = merged;
  a.placeTexts.push(...b.placeTexts);
  a.rows.push(...b.rows);
  for (const is of b.issues) {
    const m = is.field.match(/^location:(\d+)$/);
    if (!m) a.issues.push(is);
    else if (map.has(Number(m[1]))) a.issues.push({ ...is, field: `location:${map.get(Number(m[1]))}` });
  }
}

const deptoOfOrg = (o: OrgInput) => o.depto_ine ?? (o.muni_ine != null ? Math.floor(o.muni_ine / 100) : null);

function sameOrgInFile(a: OrgInput, b: OrgInput) {
  if (a.layer !== b.layer || titleCore(a.name) !== titleCore(b.name)) return false;
  if (a.muni_ine != null && b.muni_ine != null) return a.muni_ine === b.muni_ine;
  const da = deptoOfOrg(a);
  const db = deptoOfOrg(b);
  return da == null || db == null || da === db;
}

/**
 * Une dentro del archivo lo que es la misma producción o entidad aunque venga en filas u hojas distintas
 * (por ejemplo, una hoja de producciones y otra de festivales): así nunca se crea dos veces.
 */
export function mergeInFile(cands: Candidate[]): Candidate[] {
  const out: Candidate[] = [];
  for (const c of cands) {
    const twin = out.find((x) => {
      if (x.type !== c.type) return false;
      if (c.type === "film") return !!x.film && !!c.film && sameRecordInFile(x.film, c.film);
      return !!x.org && !!c.org && sameOrgInFile(x.org, c.org);
    });
    if (!twin) {
      out.push(c);
      continue;
    }
    if (c.type === "film") mergeFilmInto(twin, c);
    else {
      const a = twin.org!;
      const b = c.org!;
      twin.org = {
        ...merge(a, b),
        categories: normalizeCategories([...(a.categories ?? []), ...(b.categories ?? [])]),
      };
      twin.org.category = twin.org.categories?.[0] ?? twin.org.category;
      twin.placeTexts.push(...c.placeTexts);
      twin.rows.push(...c.rows);
      for (const is of c.issues) if (is.field !== "location:0" && !twin.issues.some((x) => x.field === is.field)) twin.issues.push(is);
    }
  }
  return out;
}

/** Convierte el archivo + plan + lugares resueltos en candidatos listos para revisar. */
export function buildCandidates(
  file: ParsedFile,
  plan: ImportPlan,
  places: Record<string, PlaceResolution>,
  geo: Geo,
): Candidate[] {
  const out: Candidate[] = [];
  for (const sp of plan.sheets) {
    if (sp.entity === "ignore") continue;
    const sheet = file.sheets.find((s) => s.name === sp.sheet);
    if (!sheet) continue;
    out.push(...(sp.entity === "film" ? filmCandidates(sheet, sp, places, geo) : orgCandidates(sheet, sp, places, geo)));
  }
  return mergeInFile(out);
}
