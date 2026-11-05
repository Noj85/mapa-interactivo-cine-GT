"use server";

import { revalidatePath } from "next/cache";
import { adminStore, requireSession } from "@/lib/auth";
import { festivalSchema } from "@/lib/schemas";
import type { Festival } from "@/lib/types";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const refresh = () => {
  revalidatePath("/admin/festivales");
  revalidatePath("/admin/peliculas");
};

export async function saveFestivalAction(raw: unknown): Promise<Result<{ id: string }>> {
  await requireSession();
  const parsed = festivalSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  try {
    const store = await adminStore();
    const d = parsed.data;
    // no se repiten: mismo nombre (sin acentos ni mayúsculas) en el catálogo
    const { rows } = await store.searchFestivals(d.name, { limit: 25 });
    const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const dup = rows.find((r) => r.id !== d.id && norm(r.name) === norm(d.name));
    if (dup) return { ok: false, error: `Ya existe un festival llamado «${dup.name}». Edítalo o fusiónalos.` };
    const f = await store.saveFestival({ id: d.id, name: d.name, aliases: d.aliases, country: d.country, city: d.city, founded: d.founded, source: d.id ? undefined : "PROCINE" });
    refresh();
    return { ok: true, id: f.id };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function deleteFestivalAction(id: string): Promise<Result> {
  await requireSession();
  try {
    await (await adminStore()).deleteFestival(id);
    refresh();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Pasa todas las participaciones de un festival a otro y deja el nombre del primero como alias del segundo. */
export async function mergeFestivalsAction(fromId: string, intoId: string): Promise<Result> {
  await requireSession();
  if (!fromId || !intoId || fromId === intoId) return { ok: false, error: "Elige otro festival para fusionar." };
  try {
    await (await adminStore()).mergeFestivals(fromId, intoId);
    refresh();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Carga el catálogo base (data/festivals.seed.json). Es seguro repetirlo: solo agrega los que no existen. */
export async function seedFestivalsAction(): Promise<Result<{ added: number; total: number }>> {
  await requireSession();
  try {
    const seed = (await import("@/data/festivals.seed.json")).default as unknown as Omit<Festival, "id">[];
    const store = await adminStore();
    const added = await store.seedFestivals(seed);
    refresh();
    return { ok: true, added, total: seed.length };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
