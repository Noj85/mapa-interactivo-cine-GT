import { detectCountry } from "@/lib/countries";
import { formatContact, parseContact } from "@/lib/contact";
import { cleanGenres } from "@/lib/film-types";
import type { Gazetteer } from "@/lib/geo/gazetteer";
import type { PolyCollection } from "@/lib/geo/load";
import { municipalityAt } from "@/lib/geo/pip";
import type { FilmInput, OrgInput } from "@/lib/types";
import { normalize } from "@/lib/utils";
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
  normalizeWeb,
  parseCoord,
  parseNumber,
  parseYear,
  parseDuration,
} from "./normalize";
import type { Candidate, ImportPlan, Issue, ParsedFile, ParsedSheet, PlaceResolution, SheetPlan } from "./types";

type Row = Record<string, string>;

const val = (row: Row, plan: SheetPlan, field: string) => {
  const col = plan.columns[field];
  return col ? (row[col] ?? "") : "";
};

/** Consultas de lugar de una fila: "Panajachel, Sololá", "Antigua"… */
export function placeQueries(row: Row, plan: SheetPlan): { query: string; site: string | null }[] {
  const place = cleanText(val(row, plan, "place"));
  const muni = cleanText(val(row, plan, "muni"));
  const depto = cleanText(val(row, plan, "depto"));
  const site = cleanText(val(row, plan, "site"));
  const out: { query: string; site: string | null }[] = [];

  if (place) {
    const parts = plan.multi_place ? place.split(/[;\n|]| \/ /).map((p) => p.trim()).filter(Boolean) : [place];
    parts.forEach((p, i) => out.push({ query: depto && !normalize(p).includes(normalize(depto)) ? `${p}, ${depto}` : p, site: i === 0 ? site : null }));
  } else if (muni) {
    const parts = plan.multi_place ? muni.split(/[;\n|]| \/ /).map((p) => p.trim()).filter(Boolean) : [muni];
    parts.forEach((p, i) => out.push({ query: depto ? `${p}, ${depto}` : p, site: i === 0 ? site : null }));
  } else if (depto) {
    out.push({ query: depto, site });
  } else if (site) {
    out.push({ query: site, site });
  }
  return out;
}

/** Textos de lugar únicos del archivo, para resolverlos de una vez. */
export function collectPlaceTexts(file: ParsedFile, plan: ImportPlan): string[] {
  const set = new Set<string>();
  for (const sp of plan.sheets) {
    if (sp.entity === "ignore") continue;
    const sheet = file.sheets.find((s) => s.name === sp.sheet);
    if (!sheet) continue;
    for (const row of sheet.rows)
      for (const q of placeQueries(row, sp)) {
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
  withCoords: boolean,
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
  const lat = withCoords ? parseCoord(val(row, plan, "lat"), "lat") : null;
  const lng = withCoords ? parseCoord(val(row, plan, "lng"), "lng") : null;
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

/** La participación en un festival que describe la fila, si la fila trae un festival. */
function festivalOf(row: Row, plan: SheetPlan): Fest | null {
  const name = cleanText(val(row, plan, "festival"));
  if (!name) return null;
  const award = cleanText(val(row, plan, "festival_award"));
  const url = cleanText(val(row, plan, "festival_url"));
  return {
    name,
    year: parseYear(val(row, plan, "festival_year")),
    result: normalizeFestivalResult(val(row, plan, "festival_result"), award, plan.value_maps?.festival_result),
    section: cleanText(val(row, plan, "festival_section")),
    award,
    url: url && /^https?:\/\/\S+$/i.test(url) ? url : null,
  };
}

const festKey = (f: Fest) => `${normalize(f.name ?? "")}|${f.year ?? ""}|${normalize(f.award ?? "")}|${normalize(f.section ?? "")}`;

type Company = NonNullable<FilmInput["companies"]>[number];

const splitList = (v: string) => v.split(/[;\n|]/).map((x) => x.trim()).filter(Boolean);

/**
 * Casas productoras de la fila: «Casa Uno (México); Casa Dos» o una columna de nombres y otra de países.
 * Si la producción es guatemalteca y no se dice el país, es Guatemala.
 */
function companiesOf(row: Row, plan: SheetPlan, nationality: string | null | undefined): Company[] {
  const names = splitList(cleanText(val(row, plan, "company")) ?? "");
  if (!names.length) return [];
  const countries = splitList(cleanText(val(row, plan, "company_country")) ?? "");
  return names.map((raw, i) => {
    const m = raw.match(/^(.*?)\s*\(([^()]{2,60})\)\s*$/);
    const name = (m ? m[1] : raw).trim();
    const country = m ? m[2].trim() : (countries.length === names.length ? countries[i] : countries.length === 1 ? countries[0] : "") || null;
    return { name, country: country || (nationality === "guatemalteca" ? "Guatemala" : null) };
  });
}

const addCompanies = (list: Company[], add: Company[]) => {
  for (const c of add) if (!list.some((x) => normalize(x.name ?? "") === normalize(c.name ?? ""))) list.push(c);
};

function filmFields(row: Row, plan: SheetPlan): Omit<FilmInput, "locations" | "festivals" | "companies"> {
  const vm = plan.value_maps ?? {};
  const budgetRaw = val(row, plan, "budget");
  // una misma columna puede traer formato y naturaleza («Largometraje documental»), y la de géneros puede traer la naturaleza
  const fmtCell = val(row, plan, "format");
  const natCell = val(row, plan, "nature");
  const gen = normalizeGenres(val(row, plan, "genres"), vm.genres);
  return {
    title: cleanText(val(row, plan, "title")) ?? "",
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

    const fest = festivalOf(row, plan);
    if (fest && !cand.film!.festivals!.some((x) => festKey(x) === festKey(fest))) cand.film!.festivals!.push(fest);

    const qs = placeQueries(row, plan);
    const days = parseNumber(val(row, plan, "days"));
    const spend = parseNumber(val(row, plan, "local_spend"));
    const jobs = parseNumber(val(row, plan, "jobs"));
    const slots = qs.length ? qs : [null];
    slots.forEach((q, qi) => {
      const hasCoords = parseCoord(val(row, plan, "lat"), "lat") != null;
      if (!q && !hasCoords && !days && !spend && !jobs && cand!.film!.locations.length) return;
      const { loc, issue } = resolveLocation(q, row, plan, places, geo, qi === 0);
      // las cifras de la fila se asignan a la primera locación de la fila
      if (qi === 0) {
        loc.days = days;
        loc.local_spend = spend;
        loc.jobs = jobs;
      }
      if (!q && loc.muni_ine == null && loc.depto_ine == null && loc.lat == null) return; // fila sin lugar
      // si la producción se repite una fila por festival, el mismo lugar no se duplica
      if (plan.columns.festival && plan.grain === "row_per_location") {
        const sig = `${q?.query ?? ""}|${q?.site ?? ""}|${loc.days ?? ""}|${loc.local_spend ?? ""}|${loc.jobs ?? ""}`;
        const seen = (seenLocs.get(cand!) ?? seenLocs.set(cand!, new Set()).get(cand!))!;
        if (seen.has(sig)) return;
        seen.add(sig);
      }
      if (q) cand!.placeTexts.push(q.query);
      cand!.film!.locations.push(loc);
      if (issue) cand!.issues.push({ ...issue, field: `location:${cand!.film!.locations.length - 1}` });
    });
  });
  return order.map((k) => map.get(k)!);
}

function orgCandidates(sheet: ParsedSheet, plan: SheetPlan, places: Record<string, PlaceResolution>, geo: Geo): Candidate[] {
  const layer = plan.layer ?? "circulacion";
  const vm = plan.value_maps ?? {};
  const out: Candidate[] = [];
  sheet.rows.forEach((row, i) => {
    const name = cleanText(val(row, plan, "name"));
    if (!name) return;
    const qs = placeQueries(row, plan);
    const { loc, issue } = resolveLocation(qs[0] ?? null, row, plan, places, geo, true);
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
  return out;
}
