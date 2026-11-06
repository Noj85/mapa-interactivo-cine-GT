"use server";

import { revalidatePath } from "next/cache";
import { adminStore, requireSession } from "@/lib/auth";
import { newId } from "@/lib/data/records";
import { commitBatch, type BatchResult } from "@/lib/import/commit-server";
import type { Candidate } from "@/lib/import/types";

export type { BatchResult };

export async function createImportAction(filename: string, summary: Record<string, unknown>) {
  await requireSession();
  const store = await adminStore();
  const id = newId();
  await store.saveImport({ id, filename, status: "reviewing", summary, created_at: new Date().toISOString() });
  return id;
}

/** Guarda un lote de candidatos ya revisados por una persona (las reglas están en `commitBatch`). */
export async function commitBatchAction(
  importId: string,
  filename: string,
  candidates: Candidate[],
  publishIncomplete: boolean,
): Promise<BatchResult[]> {
  await requireSession();
  return commitBatch(await adminStore(), importId, filename, candidates, publishIncomplete);
}

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
  revalidatePath("/admin/aportes");
}
