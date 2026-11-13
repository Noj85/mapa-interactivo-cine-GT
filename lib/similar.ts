import { similarity, titleCore } from "@/lib/import/duplicates";

/** Qué se está aportando: cada categoría se compara solo con su campo principal (título o nombre). */
export type SimilarKind = "film" | "org" | "person";

export const SIMILAR_MIN_CHARS = 3;
export const SIMILAR_MAX = 5;
const MIN_SIMILARITY = 0.85;
const MIN_PREFIX = 5;

export type SimilarMatch<T> = { item: T; score: number; exact: boolean };

/**
 * Puntaje de parecido entre lo que se escribe y un título o nombre existente (0 si no se parecen).
 * - Igual en su núcleo (sin tildes, mayúsculas, artículo inicial ni sufijo legal): 1.
 * - Lo escrito es el comienzo del nombre (se está escribiendo): 0.9. Pide un mínimo de letras para no
 *   ofrecer medio directorio con «ana»; en personas pide además nombre y apellido.
 * - Casi idénticos (Dice ≥ 0.85), también contra el título sin subtítulo: ese puntaje.
 */
export function nameScore(typed: string, existing: string, kind: SimilarKind): number {
  const q = titleCore(typed);
  const c = titleCore(existing);
  if (q.length < SIMILAR_MIN_CHARS || !c) return 0;
  if (q === c) return 1;
  const words = q.split(" ").length;
  if (c.startsWith(q) && q.length >= MIN_PREFIX && (kind !== "person" || words >= 2)) return 0.9;
  let best = similarity(q, c);
  const head = titleCore(existing.split(/\s*[:–—-]\s+/)[0]);
  if (head && head !== c && head.length >= 4) best = Math.max(best, similarity(q, head) - 0.04);
  return best >= MIN_SIMILARITY ? best : 0;
}

/** Los registros que se parecen a lo escrito, del más exacto al menos (hasta `SIMILAR_MAX`). */
export function rankSimilar<T>(typed: string, items: T[], nameOf: (x: T) => string, kind: SimilarKind): SimilarMatch<T>[] {
  const out: SimilarMatch<T>[] = [];
  for (const item of items) {
    const score = nameScore(typed, nameOf(item), kind);
    if (score > 0) out.push({ item, score, exact: score === 1 });
  }
  out.sort((a, b) => b.score - a.score || nameOf(a.item).localeCompare(nameOf(b.item), "es"));
  return out.slice(0, SIMILAR_MAX);
}

/** Lo que el público recibe de cada coincidencia: solo datos que ya son públicos. */
export interface SimilarRecord {
  kind: SimilarKind;
  id: string;
  slug: string;
  label: string;
  /** Línea para distinguir fichas con el mismo nombre (año y director, categoría y lugar, oficios y lugar). */
  detail: string;
  exact: boolean;
}

/** Enlace de «Sugerir una corrección» de cada tipo de ficha. */
export function correctionHref(kind: SimilarKind, slug: string, from = true): string {
  const key = kind === "film" ? "pelicula" : kind === "org" ? "entidad" : "persona";
  return `/aportar?${key}=${encodeURIComponent(slug)}${from ? "&desde=sugerencia" : ""}`;
}
