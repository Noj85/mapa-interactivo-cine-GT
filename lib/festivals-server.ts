import "server-only";
import type { Store } from "@/lib/data/store";
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
