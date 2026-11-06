import { normalize } from "@/lib/utils";

/**
 * Nombres de las personas que dirigen una producción, normalizados (sin tildes ni mayúsculas).
 * El campo puede traer varias: «Ana López, Luis Paz», «Ana López y Luis Paz», «Ana López / Luis Paz».
 */
export function directorKeys(director: string | null | undefined): string[] {
  if (!director) return [];
  const keys = director
    .split(/\s*[,;/&]\s*|\s+(?:y|e|and)\s+/i)
    .map((n) => normalize(n))
    .filter((n) => n.length >= 3);
  return [...new Set(keys)];
}

/** Dos producciones son del mismo director/a si comparten al menos un nombre. Sin director no hay coincidencia. */
export function sameDirector(a: string | null | undefined, b: string | null | undefined): boolean {
  const ka = directorKeys(a);
  if (!ka.length) return false;
  const kb = new Set(directorKeys(b));
  return ka.some((k) => kb.has(k));
}

/**
 * Agrupa por director/a (si A comparte nombre con B y B con C, los tres van juntos). Conserva el orden de
 * entrada; las producciones sin director, o con un director único, salen en un grupo de uno.
 */
export function groupByDirector<T extends { director: string | null | undefined }>(items: T[]): T[][] {
  const parent = items.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const owner = new Map<string, number>();
  items.forEach((it, i) => {
    for (const k of directorKeys(it.director)) {
      const o = owner.get(k);
      if (o === undefined) owner.set(k, i);
      else parent[find(i)] = find(o);
    }
  });
  const groups = new Map<number, T[]>();
  items.forEach((it, i) => {
    const r = find(i);
    groups.set(r, [...(groups.get(r) ?? []), it]);
  });
  return [...groups.values()];
}
