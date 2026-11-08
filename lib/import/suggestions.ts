import { detectCountry } from "@/lib/countries";
import type { ExtractedEntry } from "@/lib/claude/extract";
import type { FilmInput } from "@/lib/types";
import { normalize } from "@/lib/utils";
import { sameName } from "./duplicates";
import type { Candidate, ImportPlan, ParsedFile, PlaceResolution, Suggestion, TextSource } from "./types";

/**
 * Lectura de texto libre con Claude (opt-in): arma los lotes de filas, los manda a /api/import/extract y deja lo que
 * encuentra como sugerencias de cada registro. Nada entra al registro hasta que alguien lo acepta.
 */

export const EXTRACT_BATCH = 25;
/** Tope de filas por corrida: más allá de esto, el costo y el tiempo ya no son razonables para una sola carga. */
export const MAX_EXTRACT_ROWS = 600;
const CONCURRENCY = 3;
const MIN_TEXT = 20;

interface ExtractRowPayload {
  id: string;
  title: string;
  year?: string | null;
  texts: { header: string; text: string }[];
  known?: { locations?: string[]; festivals?: string[]; companies?: string[] };
}

export interface ExtractJob {
  concepts: ("location" | "festival" | "company")[];
  rows: ExtractRowPayload[];
}

const enabledSources = (sp: { text_sources?: TextSource[] }) => (sp.text_sources ?? []).filter((t) => t.enabled && t.concepts.length);

/** Referencia de una fila del archivo, la misma que guardan los candidatos en `rows`. */
export const rowRef = (sheet: string, index: number) => `${sheet}!${index + 2}`;

/** Filas que se leerían con las fuentes de texto encendidas (para avisar cuántas son antes de empezar). */
export function countExtractionRows(file: ParsedFile, plan: ImportPlan): number {
  let n = 0;
  for (const sp of plan.sheets) {
    if (sp.entity !== "film") continue;
    const sources = enabledSources(sp);
    const sheet = file.sheets.find((s) => s.name === sp.sheet);
    if (!sources.length || !sheet) continue;
    n += sheet.rows.filter((r) => sources.some((t) => (r[t.header] ?? "").trim().length >= MIN_TEXT)).length;
  }
  return n;
}

/** Lotes de filas con sus textos, y lo que cada fila ya trae (para que Claude no lo repita). */
export function extractionJobs(file: ParsedFile, plan: ImportPlan, candidates: Candidate[]): ExtractJob[] {
  const jobs: ExtractJob[] = [];
  const byRef = new Map<string, Candidate>();
  for (const c of candidates) for (const r of c.rows) byRef.set(r, c);
  let total = 0;
  for (const sp of plan.sheets) {
    if (sp.entity !== "film") continue;
    const sources = enabledSources(sp);
    const sheet = file.sheets.find((s) => s.name === sp.sheet);
    if (!sources.length || !sheet) continue;
    const concepts = [...new Set(sources.flatMap((t) => t.concepts))];
    const titleCol = sp.columns.title;
    const yearCol = sp.columns.year;
    const rows: ExtractRowPayload[] = [];
    sheet.rows.forEach((r, i) => {
      if (total >= MAX_EXTRACT_ROWS) return;
      const texts = sources.map((t) => ({ header: t.header, text: (r[t.header] ?? "").trim() })).filter((t) => t.text.length >= MIN_TEXT);
      const title = titleCol ? (r[titleCol] ?? "").trim() : "";
      if (!texts.length || !title) return;
      const ref = rowRef(sheet.name, i);
      const c = byRef.get(ref);
      const f = c?.film;
      total++;
      rows.push({
        id: ref,
        title,
        year: yearCol ? (r[yearCol] ?? "").trim() || null : null,
        texts,
        known: f
          ? {
              locations: [...(c?.placeTexts ?? []), ...f.locations.map((l) => l.site ?? "").filter(Boolean)].slice(0, 30),
              festivals: (f.festivals ?? []).map((x) => x.name ?? "").filter(Boolean).slice(0, 30),
              companies: (f.companies ?? []).map((x) => x.name ?? "").filter(Boolean).slice(0, 30),
            }
          : undefined,
      });
    });
    for (let i = 0; i < rows.length; i += EXTRACT_BATCH) jobs.push({ concepts, rows: rows.slice(i, i + EXTRACT_BATCH) });
  }
  return jobs;
}

export interface ExtractionOutcome {
  /** Referencia de fila -> lo que se encontró. */
  byRow: Record<string, ExtractedEntry[]>;
  failedBatches: number;
  totalBatches: number;
}

/** Corre los lotes de a pocos a la vez y avisa el avance. */
export async function runExtraction(jobs: ExtractJob[], onProgress?: (done: number, total: number) => void): Promise<ExtractionOutcome> {
  const out: ExtractionOutcome = { byRow: {}, failedBatches: 0, totalBatches: jobs.length };
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      try {
        const res = await fetch("/api/import/extract", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(job) });
        if (!res.ok) throw new Error(String(res.status));
        const j = (await res.json()) as { results: { id: string; entries: ExtractedEntry[] }[] };
        for (const r of j.results) if (r.entries.length) out.byRow[r.id] = r.entries;
      } catch {
        out.failedBatches++;
      }
      onProgress?.(++done, jobs.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, worker));
  return out;
}

/** Textos de lugar sugeridos (sin los que ya son otro país): hay que resolverlos como los demás. */
export function suggestionPlaceTexts(outcome: ExtractionOutcome): string[] {
  const set = new Set<string>();
  for (const list of Object.values(outcome.byRow))
    for (const e of list) if (e.kind === "location" && e.text && !isAbroadEntry(e)) set.add(e.text);
  return [...set];
}

const isAbroadEntry = (e: { text?: string; country?: string | null }) => !!(e.country && normalize(e.country) !== "guatemala") || (!e.country && !!e.text && /[,;|]/.test(e.text) && !!detectCountry(e.text));

/** Deja las sugerencias en cada registro, sin repetir lo que ya trae. */
export function attachSuggestions(candidates: Candidate[], outcome: ExtractionOutcome): Candidate[] {
  return candidates.map((c) => {
    if (c.type !== "film" || !c.film) return c;
    const found: Suggestion[] = [];
    const seen = new Set<string>();
    c.rows.forEach((ref) => {
      for (const e of outcome.byRow[ref] ?? []) {
        const key = `${e.kind}|${normalize(e.text ?? e.name ?? "")}`;
        if (seen.has(key)) continue;
        const dup =
          e.kind === "location"
            ? c.placeTexts.some((t) => normalize(t).includes(normalize(e.text ?? "")) || normalize(e.text ?? "").includes(normalize(t)))
            : e.kind === "festival"
              ? (c.film!.festivals ?? []).some((f) => sameName(f.name ?? "", e.name ?? ""))
              : (c.film!.companies ?? []).some((x) => sameName(x.name ?? "", e.name ?? ""));
        if (dup) continue;
        seen.add(key);
        found.push({ id: `${c.key}#s${found.length}`, kind: e.kind, text: e.text, site: e.site, country: e.country, city: e.city, name: e.name, year: e.year, evidence: e.evidence, source: e.source, confidence: e.confidence });
      }
    });
    return found.length ? { ...c, suggestions: found } : c;
  });
}

type Loc = NonNullable<FilmInput["locations"]>[number];

/** Pasa una sugerencia al registro. Una locación sin resolver queda con su duda para la pantalla de preguntas. */
export function acceptSuggestion(c: Candidate, id: string, places: Record<string, PlaceResolution>): Candidate {
  const s = c.suggestions?.find((x) => x.id === id);
  if (!s || s.accepted || c.type !== "film" || !c.film) return c;
  const next: Candidate = structuredClone(c);
  const film = next.film!;
  if (s.kind === "location") {
    const abroad = isAbroadEntry(s) ? (s.country && normalize(s.country) !== "guatemala" ? { country: s.country, city: s.city ?? null } : detectCountry(s.text ?? "")) : null;
    if (abroad) {
      const a = abroad as { country: string; city?: string | null };
      film.locations.push({ site: s.site ?? null, country: a.country, city: a.city || null, confidence: Math.min(0.8, s.confidence) });
    } else {
      const res = s.text ? places[s.text] : undefined;
      const loc: Loc = { site: s.site ?? null };
      if (res?.status === "ok") {
        loc.muni_ine = res.muni_ine;
        loc.depto_ine = res.depto_ine;
        loc.confidence = Math.min(0.8, s.confidence);
      } else if (res?.depto_ine != null) {
        loc.depto_ine = res.depto_ine;
      }
      film.locations.push(loc);
      if (s.text) next.placeTexts.push(s.text);
      if (loc.muni_ine == null)
        next.issues.push({ field: `location:${film.locations.length - 1}`, level: "doubt", message: res?.status === "ambiguous" ? `“${s.text}” puede ser varios lugares` : `No pudimos ubicar “${s.text}”` });
    }
  } else if (s.kind === "festival") {
    film.festivals = [...(film.festivals ?? []), { name: s.name ?? "", year: s.year ?? null }];
  } else {
    film.companies = [...(film.companies ?? []), { name: s.name ?? "", country: s.country ?? (film.nationality === "guatemalteca" ? "Guatemala" : null) }];
  }
  next.suggestions = next.suggestions!.map((x) => (x.id === id ? { ...x, accepted: true } : x));
  return next;
}

export function acceptAllSuggestions(c: Candidate, places: Record<string, PlaceResolution>): Candidate {
  let next = c;
  for (const s of c.suggestions ?? []) if (!s.accepted) next = acceptSuggestion(next, s.id, places);
  return next;
}
