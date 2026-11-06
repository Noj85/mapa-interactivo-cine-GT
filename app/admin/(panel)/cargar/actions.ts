"use server";

import { posterFromUrl } from "@/lib/posters";
import { revalidatePath } from "next/cache";
import { adminStore, requireSession } from "@/lib/auth";
import { newId } from "@/lib/data/records";
import { linkFestivals, syncOrgFestivalSafe } from "@/lib/festivals-server";
import { applyFilmUpdate, applyOrgUpdate, summarizeApplied } from "@/lib/import/diff";
import type { Candidate } from "@/lib/import/types";
import { filmSchema, orgSchema } from "@/lib/schemas";
import { isAbroad } from "@/lib/completeness";
import type { FilmInput, OrgInput } from "@/lib/types";

export async function createImportAction(filename: string, summary: Record<string, unknown>) {
  await requireSession();
  const store = await adminStore();
  const id = newId();
  await store.saveImport({ id, filename, status: "reviewing", summary, created_at: new Date().toISOString() });
  return id;
}

export interface BatchResult {
  key: string;
  ok: boolean;
  /** «unchanged»: ya existía y el archivo no traía nada nuevo (no se guardó). */
  action: "created" | "updated" | "unchanged" | "skipped" | "failed";
  slug?: string;
  /** Qué se completó o agregó en un registro existente («Director/a», «Locación (2)»…). */
  filled?: string[];
  completeness?: number;
  published?: boolean;
  error?: string;
}

/** Guarda un lote de candidatos ya revisados por una persona. */
export async function commitBatchAction(
  importId: string,
  filename: string,
  candidates: Candidate[],
  publishIncomplete: boolean,
): Promise<BatchResult[]> {
  await requireSession();
  const store = await adminStore();
  const results: BatchResult[] = [];

  // Pósters con enlace: se descargan en paralelo (de a 5) y se guardan como archivos propios.
  const posters = new Map<string, string | null>();
  // (en los registros que se actualizan, el póster se descarga solo si de verdad se va a poner)
  const withPoster = candidates.filter((c) => c.include && c.decision !== "skip" && c.type === "film" && c.film?.poster_url && !(c.duplicate && c.decision === "update"));
  for (let i = 0; i < withPoster.length; i += 5) {
    await Promise.all(
      withPoster.slice(i, i + 5).map(async (c) => {
        posters.set(c.key, await posterFromUrl(c.film!.poster_url!));
      }),
    );
  }

  for (const c of candidates) {
    if (!c.include || c.decision === "skip") {
      results.push({ key: c.key, ok: true, action: "skipped" });
      continue;
    }
    try {
      if (c.type === "film" && c.film) {
        // el servidor no confía en lo que calculó el navegador: busca el registro y vuelve a calcular qué cambia
        const existing = c.duplicate && c.decision === "update" ? await store.getFilm(c.duplicate.id) : null;
        if (existing) {
          const parsed = filmSchema.parse({ ...c.film, source: filename }) as unknown as FilmInput;
          const res = applyFilmUpdate(existing, parsed, c.accept);
          if (res.applied.some((i) => i.id === "fill:poster")) {
            const url = await posterFromUrl(parsed.poster_url ?? "");
            if (url) res.input.poster_url = url;
            else {
              res.input.poster_url = existing.poster_url;
              res.applied = res.applied.filter((i) => i.id !== "fill:poster");
              res.changed = res.applied.length > 0;
            }
          }
          if (!res.changed) {
            results.push({ key: c.key, ok: true, action: "unchanged", slug: existing.slug, completeness: existing.completeness, published: existing.status === "published" });
            continue;
          }
          const input = res.input;
          // los festivales nuevos entran al catálogo (o se unen a uno que ya existe)
          input.festivals = await linkFestivals(store, input.festivals);
          const saved = await store.saveFilm({ ...input, status: existing.status }, { import_id: importId });
          results.push({ key: c.key, ok: true, action: "updated", slug: saved.slug, completeness: saved.completeness, published: saved.status === "published", filled: summarizeApplied(res.applied) });
          continue;
        }
        const input = filmSchema.parse({ ...c.film, poster_url: posters.get(c.key) ?? null, source: filename }) as unknown as FilmInput;
        input.festivals = await linkFestivals(store, input.festivals);
        const saved = await store.saveFilm(
          { ...input, status: publishIncomplete || filmComplete(input) ? "published" : "draft" },
          { import_id: importId },
        );
        results.push({ key: c.key, ok: true, action: "created", slug: saved.slug, completeness: saved.completeness, published: saved.status === "published" });
      } else if (c.type === "org" && c.org) {
        const input = orgSchema.parse({ ...c.org, source: filename }) as unknown as OrgInput;
        const existing = c.duplicate && c.decision === "update" ? await store.getOrg(c.duplicate.id) : null;
        if (existing) {
          const res = applyOrgUpdate(existing, input, c.accept);
          if (!res.changed) {
            results.push({ key: c.key, ok: true, action: "unchanged", slug: existing.slug, completeness: existing.completeness, published: existing.status === "published" });
            continue;
          }
          const saved = await store.saveOrg({ ...res.input, status: existing.status }, { import_id: importId });
          await syncOrgFestivalSafe(store, saved);
          results.push({ key: c.key, ok: true, action: "updated", slug: saved.slug, completeness: saved.completeness, published: saved.status === "published", filled: summarizeApplied(res.applied) });
          continue;
        }
        const saved = await store.saveOrg({ ...input, status: publishIncomplete ? "published" : "draft" }, { import_id: importId });
        await syncOrgFestivalSafe(store, saved);
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

export interface DeferredQuestion {
  /** "film:<slug>" | "org:<slug>" */
  record_ref: string | null;
  field: string | null;
  question: string;
  options: string[] | null;
}

/** Cierra la carga: guarda las preguntas que quedaron pendientes y el resumen. */
export async function finalizeImportAction(
  importId: string,
  filename: string,
  summary: Record<string, unknown>,
  deferred: DeferredQuestion[],
) {
  await requireSession();
  const store = await adminStore();
  await store.saveImport({ id: importId, filename, status: "committed", summary, created_at: new Date().toISOString() });
  await store.saveQuestions(
    deferred.map((q) => ({
      import_id: importId,
      record_ref: q.record_ref,
      field: q.field,
      question: q.question,
      options: q.options,
      answer: null,
      status: "deferred" as const,
    })),
  );
  revalidatePath("/");
  revalidatePath("/admin");
}
