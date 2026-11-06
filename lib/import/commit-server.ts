import "server-only";
import type { Store } from "@/lib/data/store";
import { isAbroad } from "@/lib/completeness";
import { planFilmUpdate, planOrgUpdate } from "./diff";
import { findDuplicates } from "./duplicates";
import { existingRefs, resolveItemOf } from "./existing";
import { applyFilmFields, applyOrgFields, conflictsOf, createFilmFromImport, createOrgFromImport, safeIds } from "./apply-server";
import type { Candidate, DuplicateMatch } from "./types";
import { imageFromUrl } from "@/lib/posters";
import { filmSchema, orgSchema } from "@/lib/schemas";
import type { Film, FilmInput, Org, OrgInput, Submission, SubmissionCandidate } from "@/lib/types";

export interface BatchResult {
  key: string;
  ok: boolean;
  /**
   * «unchanged»: ya existía y el archivo no traía nada nuevo (no se guardó).
   * «queued»: no se pudo decidir solo (coincidencia dudosa): quedó como aporte «Carga de archivo» y no se tocó nada.
   */
  action: "created" | "updated" | "unchanged" | "queued" | "skipped" | "failed";
  slug?: string;
  /** Qué se completó o agregó en un registro existente («Director/a», «Locación (2)»…). */
  filled?: string[];
  /** Cuántos campos traían otro valor distinto al del sistema: no se cambiaron y quedaron en un aporte. */
  conflicts?: number;
  /** Se creó un aporte «Carga de archivo» para este registro. */
  queuedAportes?: boolean;
  completeness?: number;
  published?: boolean;
  error?: string;
}

const levelOf = (m: DuplicateMatch): SubmissionCandidate => ({ id: m.id, title: m.title, year: m.year, score: m.score, level: m.level });
/** JSON con las llaves ordenadas: Postgres (jsonb) no conserva el orden en que se guardaron. */
const canon = (v: unknown): string =>
  JSON.stringify(v, (_, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x as Record<string, unknown>).filter(([, y]) => y !== undefined).sort(([a], [b]) => a.localeCompare(b))) : x));
const sameJson = (a: unknown, b: unknown) => canon(a) === canon(b);

/**
 * Guarda un lote de candidatos ya revisados por una persona.
 *
 * Reglas que el servidor aplica sin confiar en lo que calculó el navegador:
 *  - vuelve a buscar coincidencias contra lo que hay guardado ahora (así reintentar una carga no duplica nada);
 *  - en un registro existente solo se llena lo vacío y se agregan elementos: nunca se cambia un valor existente;
 *  - las diferencias y las coincidencias dudosas no se aplican: quedan como aportes «Carga de archivo» para revisar.
 */
export async function commitBatch(
  store: Store,
  importId: string,
  filename: string,
  candidates: Candidate[],
  publishIncomplete: boolean,
): Promise<BatchResult[]> {
  const results: BatchResult[] = [];

  // lo guardado hoy (con borradores), para volver a cotejar
  const [films, orgs, pending] = await Promise.all([store.listFilms({ drafts: true }), store.listOrgs({ drafts: true }), store.listSubmissions({ status: "pending" })]);
  const filmById = new Map<string, Film>(films.map((f) => [f.id, f]));
  const orgById = new Map<string, Org>(orgs.map((o) => [o.id, o]));
  const refs = existingRefs(films, orgs);
  const queued = pending.filter((x) => x.origin === "carga");

  const live = candidates.filter((c) => c.include && c.decision !== "skip");

  // Imágenes con enlace de lo que se va a crear: se descargan en paralelo (de a 5) y se guardan como archivos propios.
  const images = new Map<string, string | null>();
  const needsImage = (c: Candidate) => c.decision !== "update" && c.decision !== "review" && (c.type === "film" ? !!c.film?.poster_url : !!c.org?.logo_url);
  const withImage = live.filter(needsImage);
  for (let i = 0; i < withImage.length; i += 5) {
    await Promise.all(
      withImage.slice(i, i + 5).map(async (c) => {
        images.set(c.key, await imageFromUrl((c.type === "film" ? c.film!.poster_url : c.org!.logo_url) ?? "", c.type === "film" ? "poster" : "logo"));
      }),
    );
  }

  /** Crea el aporte «Carga de archivo» si no hay uno pendiente igual (reintentar la carga no lo repite). */
  const queue = async (c: Candidate, kind: "film" | "org", targetId: string | null, label: string, payload: FilmInput | OrgInput, note: string, cands: SubmissionCandidate[] | null) => {
    const dup = queued.find((x: Submission) => x.kind === kind && x.target_id === targetId && x.label === label && sameJson(x.payload, payload));
    if (dup) return;
    const id = await store.createImportSubmission({ kind, target_id: targetId, label, payload, note: note.slice(0, 1400), contact: null, import_id: importId, submitter: filename, candidates: cands });
    queued.push({ id, kind, target_id: targetId, label, payload } as Submission);
  };
  const rowsNote = (c: Candidate) => `Filas del archivo: ${c.rows.slice(0, 6).join(", ")}${c.rows.length > 6 ? "…" : ""}.`;

  for (const c of candidates) {
    if (!c.include || c.decision === "skip") {
      results.push({ key: c.key, ok: true, action: "skipped" });
      continue;
    }
    try {
      const item = resolveItemOf(c);
      if (!item) {
        results.push({ key: c.key, ok: true, action: "skipped" });
        continue;
      }
      const isFilm = c.type === "film";
      const label = item.title;

      // ── 1. ¿Con qué registro existente se corresponde? ──
      const fresh = findDuplicates([item], refs)[c.key];
      const exists = (id: string) => (isFilm ? filmById.has(id) : orgById.has(id));
      let targetId: string | null = null;
      let doubt = false;
      let doubtCands: SubmissionCandidate[] = [];
      if (c.decision === "create" && c.duplicate) {
        targetId = null; // la persona decidió que es nueva
      } else if (c.decision === "update" && c.duplicate && exists(c.duplicate.id)) {
        targetId = c.duplicate.id;
      } else if (c.decision === "review") {
        doubt = true;
        doubtCands = [c.duplicate, ...(c.duplicate?.alternatives ?? [])].filter((m): m is DuplicateMatch => !!m && exists(m.id)).slice(0, 3).map(levelOf);
      } else if (fresh) {
        if (fresh.level === "dudoso") {
          doubt = true;
          doubtCands = [fresh, ...(fresh.alternatives ?? [])].slice(0, 3).map(levelOf);
        } else targetId = fresh.id;
      }

      // ── 2. Coincidencia dudosa: nada se crea ni se cambia, queda para revisar ──
      if (doubt) {
        const payload = isFilm ? (filmSchema.parse({ ...c.film, source: filename, status: "draft" }) as unknown as FilmInput) : (orgSchema.parse({ ...c.org, source: filename, status: "draft" }) as unknown as OrgInput);
        const names = doubtCands.map((d) => `«${d.title}${d.year ? ` (${d.year})` : ""}»`).join(", ");
        await queue(c, c.type, null, label, payload, `Carga de «${filename}». No se pudo saber si ya existe${names ? `: se parece a ${names}` : ""}. ${rowsNote(c)}`, doubtCands.length ? doubtCands : null);
        results.push({ key: c.key, ok: true, action: "queued", queuedAportes: true });
        continue;
      }

      // ── 3. Existe: solo se llena lo vacío; las diferencias van a un aporte ──
      if (targetId) {
        if (isFilm && c.film) {
          const existing = filmById.get(targetId)!;
          const parsed = filmSchema.parse({ ...c.film, source: filename }) as unknown as FilmInput;
          const plan = planFilmUpdate(existing, parsed);
          const ids = safeIds(plan, c.accept);
          const conflicts = conflictsOf(plan);
          const res = await applyFilmFields(store, existing, parsed, ids, importId);
          if (conflicts.length) {
            await queue(c, "film", existing.id, existing.title, { ...parsed, status: "draft" }, `Carga de «${filename}»: el archivo trae ${conflicts.length} ${conflicts.length === 1 ? "dato distinto" : "datos distintos"} al del registro (${conflicts.map((x) => x.label).join(", ")}). ${rowsNote(c)}`, null);
          }
          if (res.saved) filmById.set(existing.id, res.saved as Film);
          const cur = (res.saved as Film | null) ?? existing;
          results.push({
            key: c.key,
            ok: true,
            action: res.saved ? "updated" : "unchanged",
            slug: cur.slug,
            completeness: cur.completeness,
            published: cur.status === "published",
            filled: res.filled,
            conflicts: conflicts.length || undefined,
            queuedAportes: conflicts.length > 0 || undefined,
          });
          continue;
        }
        if (!isFilm && c.org) {
          const existing = orgById.get(targetId)!;
          const parsed = orgSchema.parse({ ...c.org, source: filename }) as unknown as OrgInput;
          const plan = planOrgUpdate(existing, parsed);
          const ids = safeIds(plan, c.accept);
          const conflicts = conflictsOf(plan);
          const res = await applyOrgFields(store, existing, parsed, ids, importId);
          if (conflicts.length) {
            await queue(c, "org", existing.id, existing.name, { ...parsed, status: "draft" }, `Carga de «${filename}»: el archivo trae ${conflicts.length} ${conflicts.length === 1 ? "dato distinto" : "datos distintos"} al del registro (${conflicts.map((x) => x.label).join(", ")}). ${rowsNote(c)}`, null);
          }
          if (res.saved) orgById.set(existing.id, res.saved as Org);
          const cur = (res.saved as Org | null) ?? existing;
          results.push({
            key: c.key,
            ok: true,
            action: res.saved ? "updated" : "unchanged",
            slug: cur.slug,
            completeness: cur.completeness,
            published: cur.status === "published",
            filled: res.filled,
            conflicts: conflicts.length || undefined,
            queuedAportes: conflicts.length > 0 || undefined,
          });
          continue;
        }
      }

      // ── 4. No existe: se crea ──
      if (isFilm && c.film) {
        const input = filmSchema.parse({ ...c.film, source: filename }) as unknown as FilmInput;
        const saved = await createFilmFromImport(store, input, publishIncomplete || filmComplete(input) ? "published" : "draft", importId, images.get(c.key) ?? null);
        filmById.set(saved.id, saved);
        refs.push(...existingRefs([saved], []));
        results.push({ key: c.key, ok: true, action: "created", slug: saved.slug, completeness: saved.completeness, published: saved.status === "published" });
      } else if (c.org) {
        const input = orgSchema.parse({ ...c.org, source: filename }) as unknown as OrgInput;
        const saved = await createOrgFromImport(store, input, publishIncomplete ? "published" : "draft", importId, images.get(c.key) ?? null);
        orgById.set(saved.id, saved);
        refs.push(...existingRefs([], [saved]));
        results.push({ key: c.key, ok: true, action: "created", slug: saved.slug, completeness: saved.completeness, published: saved.status === "published" });
      }
    } catch (e) {
      results.push({ key: c.key, ok: false, action: "failed", error: (e as Error).message.slice(0, 160) });
    }
  }
  return results;
}


const filmComplete = (f: FilmInput) =>
  !!f.year && !!f.format && !!f.producer && !!f.nationality && f.locations.length > 0 && f.locations.every((l) => isAbroad(l) || l.muni_ine != null);

