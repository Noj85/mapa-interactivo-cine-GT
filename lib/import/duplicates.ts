import { normalize } from "@/lib/utils";
import type { DuplicateMatch, ResolveItem } from "./types";

function bigrams(s: string) {
  const t = ` ${s} `;
  const out = new Map<string, number>();
  for (let i = 0; i < t.length - 1; i++) {
    const g = t.slice(i, i + 2);
    out.set(g, (out.get(g) ?? 0) + 1);
  }
  return out;
}

/** Similitud de Dice entre dos textos normalizados (0 a 1). */
export function similarity(a: string, b: string) {
  const x = normalize(a);
  const y = normalize(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const A = bigrams(x);
  const B = bigrams(y);
  let inter = 0;
  for (const [g, n] of A) inter += Math.min(n, B.get(g) ?? 0);
  return (2 * inter) / (x.length + 1 + (y.length + 1));
}

export function findDuplicates(
  items: ResolveItem[],
  existing: { id: string; title: string; year: number | null; type: "film" | "org" }[],
): Record<string, DuplicateMatch> {
  const out: Record<string, DuplicateMatch> = {};
  for (const item of items) {
    let best: DuplicateMatch | null = null;
    for (const e of existing) {
      if (e.type !== item.type) continue;
      let score = similarity(item.title, e.title);
      if (score < 0.8) continue;
      if (item.year != null && e.year != null) {
        if (Math.abs(item.year - e.year) > 1) score *= 0.6;
        else if (item.year === e.year) score = Math.min(1, score + 0.05);
      }
      if (score >= 0.82 && (!best || score > best.score)) best = { id: e.id, title: e.title, year: e.year, score: Number(score.toFixed(2)) };
    }
    if (best) out[item.key] = best;
  }
  return out;
}
