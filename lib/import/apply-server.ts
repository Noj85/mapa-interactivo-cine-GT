import "server-only";
import type { Store } from "@/lib/data/store";
import { linkFestivals, syncOrgFestivalSafe } from "@/lib/festivals-server";
import { imageFromUrl } from "@/lib/posters";
import { ensureVideoThumbs } from "@/lib/video";
import type { Film, FilmInput, Org, OrgInput, RecordStatus } from "@/lib/types";
import { applyFilmUpdate, applyOrgUpdate, planFilmUpdate, planOrgUpdate, summarizeApplied, type UpdateItem, type UpdatePlan } from "./diff";

/**
 * Ids que sí se pueden aplicar de un plan: lo que completa o agrega. Lo que ya tiene otro valor (conflicto)
 * nunca se aplica desde la carga; solo lo aplica una persona al revisar el aporte «Carga de archivo».
 * `chosen` es la lista que eligió la persona; sin ella, lo que viene encendido de entrada.
 */
export function safeIds(plan: UpdatePlan, chosen?: readonly string[]): string[] {
  const group = new Map(plan.items.map((i) => [i.id, i.group]));
  const base = chosen ?? plan.items.filter((i) => i.defaultOn).map((i) => i.id);
  return base.filter((id) => group.has(id) && group.get(id) !== "conflict");
}

export const conflictsOf = (plan: UpdatePlan): UpdateItem[] => plan.items.filter((i) => i.group === "conflict");

export interface Applied {
  saved: Film | Org | null;
  applied: UpdateItem[];
  filled: string[];
}

/** Aplica a una producción existente solo los ids indicados. No guarda si no cambia nada. */
export async function applyFilmFields(store: Store, existing: Film, incoming: FilmInput, ids: readonly string[], importId?: string | null): Promise<Applied> {
  const res = applyFilmUpdate(existing, incoming, [...ids]);
  if (res.applied.some((i) => i.id === "fill:poster")) {
    const url = await imageFromUrl(incoming.poster_url ?? "", "poster");
    if (url) res.input.poster_url = url;
    else {
      res.input.poster_url = existing.poster_url;
      res.applied = res.applied.filter((i) => i.id !== "fill:poster");
      res.changed = res.applied.length > 0;
    }
  }
  if (!res.changed) return { saved: null, applied: [], filled: [] };
  // los festivales nuevos entran al catálogo (o se unen a uno que ya existe)
  res.input.festivals = await linkFestivals(store, res.input.festivals);
  const input = await ensureVideoThumbs(res.input, existing);
  const saved = await store.saveFilm({ ...input, status: existing.status }, importId ? { import_id: importId } : undefined);
  return { saved, applied: res.applied, filled: summarizeApplied(res.applied) };
}

/** Aplica a una entidad existente solo los ids indicados. No guarda si no cambia nada. */
export async function applyOrgFields(store: Store, existing: Org, incoming: OrgInput, ids: readonly string[], importId?: string | null): Promise<Applied> {
  const res = applyOrgUpdate(existing, incoming, [...ids]);
  if (res.applied.some((i) => i.id === "fill:logo")) {
    const url = await imageFromUrl(incoming.logo_url ?? "", "logo");
    if (url) res.input.logo_url = url;
    else {
      res.input.logo_url = existing.logo_url ?? null;
      res.applied = res.applied.filter((i) => i.id !== "fill:logo");
      res.changed = res.applied.length > 0;
    }
  }
  if (!res.changed) return { saved: null, applied: [], filled: [] };
  const saved = await store.saveOrg({ ...res.input, status: existing.status }, importId ? { import_id: importId } : undefined);
  await syncOrgFestivalSafe(store, saved);
  return { saved, applied: res.applied, filled: summarizeApplied(res.applied) };
}

/** Crea una producción nueva a partir de la carga (descarga el póster si trae enlace). */
export async function createFilmFromImport(store: Store, input: FilmInput, status: RecordStatus, importId?: string | null, image?: string | null): Promise<Film> {
  // `image`: póster ya descargado (undefined = descargarlo ahora)
  const poster = image !== undefined ? image : input.poster_url ? await imageFromUrl(input.poster_url, "poster") : null;
  const festivals = await linkFestivals(store, input.festivals);
  const withVideo = await ensureVideoThumbs(input);
  return store.saveFilm({ ...withVideo, id: undefined, poster_url: poster, festivals, status }, importId ? { import_id: importId } : undefined);
}

/** Crea una entidad nueva a partir de la carga (descarga el logo si trae enlace). */
export async function createOrgFromImport(store: Store, input: OrgInput, status: RecordStatus, importId?: string | null, image?: string | null): Promise<Org> {
  const logo = image !== undefined ? image : input.logo_url ? await imageFromUrl(input.logo_url, "logo") : null;
  const saved = await store.saveOrg({ ...input, id: undefined, logo_url: logo, status }, importId ? { import_id: importId } : undefined);
  await syncOrgFestivalSafe(store, saved);
  return saved;
}

export { planFilmUpdate, planOrgUpdate };
