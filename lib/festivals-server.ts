import "server-only";
import type { Store } from "@/lib/data/store";
import { orgCategories } from "@/lib/categories";
import type { Festival, Org } from "@/lib/types";
import { normalize } from "@/lib/utils";

interface FestivalRef {
  festival_id?: string | null;
  name?: string | null;
  country?: string | null;
  city?: string | null;
}

/**
 * Para aportes del público: un `festival_id` solo vale si existe en el catálogo; si no, el festival
 * se conserva solo como texto. No crea nada en el catálogo.
 */
export async function sanitizeFestivalIds<T extends FestivalRef>(store: Store, list: T[] | undefined): Promise<T[] | undefined> {
  if (!list) return list;
  const ids = [...new Set(list.map((f) => f.festival_id).filter((x): x is string => !!x))];
  if (!ids.length) return list;
  const known = new Set<string>();
  for (const id of ids) {
    try {
      if (await store.getFestival(id)) known.add(id);
    } catch {
      // id con formato inválido o catálogo sin crear: se trata como texto
    }
  }
  return list.map((f) => (f.festival_id && !known.has(f.festival_id) ? { ...f, festival_id: null } : f));
}

/**
 * Para registros que guarda o aprueba el equipo: a cada festival escrito a mano se le busca un igual
 * en el catálogo (mismo nombre o alias, sin acentos ni mayúsculas) y, si no existe, se agrega.
 * Así el catálogo crece solo con lo que el equipo ya validó.
 */
export async function linkFestivals<T extends FestivalRef>(store: Store, list: T[] | undefined): Promise<T[] | undefined> {
  const clean = await sanitizeFestivalIds(store, list);
  if (!clean) return clean;
  const out: T[] = [];
  const created = new Map<string, string>();
  for (const f of clean) {
    const name = f.name?.trim();
    if (f.festival_id || !name) {
      out.push(f);
      continue;
    }
    const key = normalize(name);
    let id = created.get(key) ?? null;
    let country = f.country ?? null;
    let city = f.city ?? null;
    if (!id) {
      const { rows } = await store.searchFestivals(name, { limit: 25 });
      const hit = rows.find((r) => normalize(r.name) === key || r.aliases.some((a) => normalize(a) === key));
      if (hit) {
        id = hit.id;
        country = country ?? hit.country;
        city = city ?? hit.city;
      } else {
        const fest = await store.saveFestival({ name, country, city, source: "PROCINE" });
        id = fest.id;
      }
      created.set(key, id);
    }
    out.push({ ...f, festival_id: id, country, city });
  }
  return out;
}

// ───────── vínculo con las entidades de Circulación (categoría «Festivales») ─────────

/** Palabras que no distinguen a un festival de otro al comparar nombres. */
const STOP = new Set(["festival", "festivales", "internacional", "international", "cine", "film", "films", "de", "del", "la", "el", "las", "los", "y", "the", "of", "and", "en", "guatemala", "gt"]);
const tokens = (s: string) => normalize(s).split(" ").filter((t) => t.length > 1 && !STOP.has(t));

/** ¿Es una entidad de Circulación de categoría «Festivales»? */
export const isFestivalOrg = (o: Pick<Org, "layer" | "category" | "categories">) => o.layer === "circulacion" && orgCategories(o as Org).includes("Festivales");

/** Entradas del catálogo sin vincular que se parecen al nombre de la entidad (para revisar a mano, nunca se vinculan solas). */
export async function similarFestivals(store: Store, name: string, exceptOrgId?: string): Promise<Festival[]> {
  const mine = tokens(name);
  if (!mine.length) return [];
  const probe = [...mine].sort((a, b) => b.length - a.length)[0];
  const { rows } = await store.searchFestivals(probe, { limit: 40 });
  return rows
    .filter((r) => !r.org_id || r.org_id === exceptOrgId)
    .filter((r) => {
      const theirs = [r.name, ...r.aliases].map(tokens).filter((t) => t.length);
      return theirs.some((t) => mine.every((m) => t.includes(m)) || t.every((x) => mine.includes(x)));
    })
    .slice(0, 5);
}

export type OrgSyncResult =
  | { action: "already" | "linked" | "created"; festivalId: string }
  | { action: "review"; candidates: Festival[] }
  | { action: "conflict"; festivalId: string }
  | { action: "skipped" };

/**
 * Deja a la entidad vinculada con el catálogo:
 *  - si ya lo está, no hace nada;
 *  - si el catálogo tiene una entrada con su mismo nombre o alias, la vincula;
 *  - si solo hay entradas parecidas, no decide: queda «por revisar» (evita duplicados);
 *  - si no hay nada parecido, crea la entrada (Guatemala, ciudad de la entidad) ya vinculada.
 */
export async function syncOrgFestival(store: Store, org: Org): Promise<OrgSyncResult> {
  if (!isFestivalOrg(org) || !org.name.trim()) return { action: "skipped" };
  const links = await store.festivalOrgMap();
  const mine = Object.entries(links).find(([, orgId]) => orgId === org.id);
  if (mine) return { action: "already", festivalId: mine[0] };

  const key = normalize(org.name);
  const { rows } = await store.searchFestivals(org.name, { limit: 25 });
  const exact = rows.find((r) => normalize(r.name) === key || r.aliases.some((a) => normalize(a) === key));
  if (exact) {
    if (exact.org_id && exact.org_id !== org.id) return { action: "conflict", festivalId: exact.id };
    await store.linkFestivalOrg(exact.id, org.id);
    return { action: "linked", festivalId: exact.id };
  }
  const candidates = await similarFestivals(store, org.name, org.id);
  if (candidates.length) return { action: "review", candidates };
  const fest = await store.saveFestival({ name: org.name.trim(), country: "Guatemala", city: org.city ?? null, source: "Circulación", org_id: org.id });
  return { action: "created", festivalId: fest.id };
}

/** Igual que `syncOrgFestival`, pero nunca falla: guardar una entidad no debe depender del catálogo. */
export async function syncOrgFestivalSafe(store: Store, org: Org) {
  try {
    return await syncOrgFestival(store, org);
  } catch {
    return { action: "skipped" } as OrgSyncResult;
  }
}
