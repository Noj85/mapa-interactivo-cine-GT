"use server";

import { posterFromUrl } from "@/lib/posters";
import { revalidatePath } from "next/cache";
import { adminStore, requireSession } from "@/lib/auth";
import { newId } from "@/lib/data/records";
import type { Candidate } from "@/lib/import/types";
import { filmSchema, orgSchema } from "@/lib/schemas";
import type { Film, FilmInput, Org, OrgInput } from "@/lib/types";
import { normalize } from "@/lib/utils";

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
  action: "created" | "updated" | "skipped" | "failed";
  slug?: string;
  completeness?: number;
  published?: boolean;
  error?: string;
}

/** Completa lo que falta en un registro existente sin pisar lo que ya tiene. */
function mergeFilm(existing: Film, incoming: FilmInput): FilmInput {
  const keep = <T,>(a: T | null | undefined, b: T | null | undefined) => (a === null || a === undefined || a === "" ? (b ?? null) : a);
  const locs = existing.locations.map((l) => ({ ...l }));
  for (const nl of incoming.locations) {
    const dup = locs.some(
      (l) => l.muni_ine != null && l.muni_ine === nl.muni_ine && normalize(l.site ?? "") === normalize(nl.site ?? ""),
    );
    if (!dup) locs.push({ ...nl } as (typeof locs)[number]);
  }
  return {
    id: existing.id,
    title: existing.title,
    year: keep(existing.year, incoming.year),
    kind: keep(existing.kind, incoming.kind),
    director: keep(existing.director, incoming.director),
    producer: keep(existing.producer, incoming.producer),
    nationality: keep(existing.nationality, incoming.nationality),
    budget: keep(existing.budget, incoming.budget),
    currency: existing.currency,
    synopsis: keep(existing.synopsis, incoming.synopsis),
    poster_url: keep(existing.poster_url, incoming.poster_url),
    status: existing.status,
    locations: locs,
  };
}

function mergeOrg(existing: Org, incoming: OrgInput): OrgInput {
  const keep = <T,>(a: T | null | undefined, b: T | null | undefined) => (a === null || a === undefined || a === "" ? (b ?? null) : a);
  return {
    id: existing.id,
    name: existing.name,
    layer: existing.layer,
    category: existing.category || incoming.category,
    initiative_type: keep(existing.initiative_type, incoming.initiative_type),
    depto_ine: keep(existing.depto_ine, incoming.depto_ine),
    muni_ine: keep(existing.muni_ine, incoming.muni_ine),
    city: keep(existing.city, incoming.city),
    lat: keep(existing.lat, incoming.lat),
    lng: keep(existing.lng, incoming.lng),
    web: keep(existing.web, incoming.web),
    instagram: keep(existing.instagram, incoming.instagram),
    contact: keep(existing.contact, incoming.contact),
    description: keep(existing.description, incoming.description),
    logo_url: existing.logo_url ?? null,
    status: existing.status,
  };
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
  const withPoster = candidates.filter((c) => c.include && c.decision !== "skip" && c.type === "film" && c.film?.poster_url);
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
        const parsed = filmSchema.parse({ ...c.film, poster_url: posters.get(c.key) ?? null, source: filename });
        let input = parsed as unknown as FilmInput;
        let action: BatchResult["action"] = "created";
        if (c.duplicate && c.decision === "update") {
          const existing = await store.getFilm(c.duplicate.id);
          if (existing) {
            input = mergeFilm(existing, input);
            action = "updated";
          }
        }
        const saved = await store.saveFilm(
          { ...input, status: action === "updated" ? input.status : publishIncomplete || filmComplete(input) ? "published" : "draft" },
          { import_id: importId },
        );
        results.push({ key: c.key, ok: true, action, slug: saved.slug, completeness: saved.completeness, published: saved.status === "published" });
      } else if (c.type === "org" && c.org) {
        const parsed = orgSchema.parse({ ...c.org, source: filename });
        let input = parsed as unknown as OrgInput;
        let action: BatchResult["action"] = "created";
        if (c.duplicate && c.decision === "update") {
          const existing = await store.getOrg(c.duplicate.id);
          if (existing) {
            input = mergeOrg(existing, input);
            action = "updated";
          }
        }
        const saved = await store.saveOrg(
          { ...input, status: action === "updated" ? input.status : publishIncomplete ? "published" : "draft" },
          { import_id: importId },
        );
        results.push({ key: c.key, ok: true, action, slug: saved.slug, completeness: saved.completeness, published: saved.status === "published" });
      }
    } catch (e) {
      results.push({ key: c.key, ok: false, action: "failed", error: (e as Error).message.slice(0, 160) });
    }
  }
  return results;
}

const filmComplete = (f: FilmInput) =>
  !!f.year && !!f.kind && !!f.producer && !!f.nationality && f.locations.length > 0 && f.locations.every((l) => l.muni_ine != null);

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
