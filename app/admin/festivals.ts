"use server";

import { revalidatePath } from "next/cache";
import { adminStore, requireSession } from "@/lib/auth";
import { festivalSchema } from "@/lib/schemas";
import { isFestivalOrg, syncOrgFestival } from "@/lib/festivals-server";
import type { Festival } from "@/lib/types";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const refresh = () => {
  revalidatePath("/admin/ajustes/festivales");
  revalidatePath("/admin/peliculas");
  revalidatePath("/");
  revalidatePath("/admin");
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
    const seed = (await import("@/data/festivals.seed.json")).default as unknown as Omit<Festival, "id" | "org_id">[];
    const store = await adminStore();
    const added = await store.seedFestivals(seed);
    refresh();
    return { ok: true, added, total: seed.length };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Vincula (o desvincula, con `null`) una entrada del catálogo con una entidad de Circulación de categoría «Festivales». */
export async function linkFestivalOrgAction(festivalId: string, orgId: string | null): Promise<Result> {
  await requireSession();
  try {
    const store = await adminStore();
    if (orgId) {
      const org = await store.getOrg(orgId);
      if (!org || !isFestivalOrg(org)) return { ok: false, error: "Solo se puede vincular con entidades de la categoría Festivales." };
    }
    await store.linkFestivalOrg(festivalId, orgId);
    refresh();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Crea la entrada del catálogo para una entidad de Circulación que no tiene (decisión manual tras revisar parecidos). */
export async function createFestivalForOrgAction(orgId: string): Promise<Result<{ id: string }>> {
  await requireSession();
  try {
    const store = await adminStore();
    const org = await store.getOrg(orgId);
    if (!org || !isFestivalOrg(org)) return { ok: false, error: "Entidad no encontrada o no es de la categoría Festivales." };
    const links = await store.festivalOrgMap();
    const had = Object.entries(links).find(([, o]) => o === org.id);
    if (had) return { ok: true, id: had[0] };
    const f = await store.saveFestival({ name: org.name.trim(), country: "Guatemala", city: org.city ?? null, source: "Circulación", org_id: org.id });
    refresh();
    return { ok: true, id: f.id };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export interface SyncReport {
  linked: number;
  created: number;
  already: number;
  /** Entidades que no se tocaron porque hay entradas parecidas: se resuelven a mano. */
  review: { orgId: string; orgName: string; candidates: { id: string; name: string }[] }[];
  /** Entidades cuyo nombre ya está vinculado a otra entidad. */
  conflicts: { orgId: string; orgName: string; festivalName: string }[];
}

/** Recorre todas las entidades de Circulación con categoría «Festivales» y las deja vinculadas con el catálogo. */
export async function syncCirculationAction(): Promise<Result<{ report: SyncReport }>> {
  await requireSession();
  try {
    const store = await adminStore();
    const orgs = (await store.listOrgs({ drafts: true })).filter(isFestivalOrg);
    const report: SyncReport = { linked: 0, created: 0, already: 0, review: [], conflicts: [] };
    for (const org of orgs) {
      const r = await syncOrgFestival(store, org);
      if (r.action === "linked") report.linked++;
      else if (r.action === "created") report.created++;
      else if (r.action === "already") report.already++;
      else if (r.action === "review") report.review.push({ orgId: org.id, orgName: org.name, candidates: r.candidates.map((c) => ({ id: c.id, name: c.name })) });
      else if (r.action === "conflict") {
        const fest = await store.getFestival(r.festivalId).catch(() => null);
        report.conflicts.push({ orgId: org.id, orgName: org.name, festivalName: fest?.name ?? "otra entrada" });
      }
    }
    refresh();
    return { ok: true, report };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
