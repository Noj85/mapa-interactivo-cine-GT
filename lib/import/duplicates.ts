import { sameDirector } from "@/lib/directors";
import { normalize } from "@/lib/utils";
import type { DuplicateMatch, ExistingRef, MatchLevel, ResolveItem } from "./types";

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

const ARTICLES = /^(?:la|el|los|las|un|una|unos|unas|the|a|an|le|les|l)\s+/;
const LEGAL_SUFFIX = /\s+(?:s\s*a|s\s*a\s*s|s\s*r\s*l|ltda|ltd|llc|inc|corp|gmbh|sociedad anonima|ong)$/;

/**
 * Núcleo de un título o nombre para compararlo: sin tildes, sin artículo inicial («La casa» = «Casa»)
 * y sin sufijos legales («Casa Uno S.A.» = «Casa Uno»).
 */
export function titleCore(s: string): string {
  let n = normalize(s);
  n = n.replace(ARTICLES, "").replace(LEGAL_SUFFIX, "").trim();
  return n || normalize(s);
}

/** Clave estable de un título para agrupar repetidos dentro de un mismo archivo. */
export const titleKey = (s: string) => titleCore(s);

/** Título comparado también sin subtítulo («Titulo: el regreso» ~ «Titulo»). */
function titleSimilarity(a: string, b: string) {
  const ca = titleCore(a);
  const cb = titleCore(b);
  let best = similarity(ca, cb);
  const head = (t: string) => t.split(/\s*[:–—-]\s+/)[0];
  const ha = titleCore(head(a));
  const hb = titleCore(head(b));
  if ((ha !== ca || hb !== cb) && ha.length >= 4 && hb.length >= 4) best = Math.max(best, similarity(ha, hb) - 0.04);
  return best;
}

type Rel = "same" | "near" | "far" | "unknown";
const yearRel = (a: number | null | undefined, b: number | null | undefined): Rel => {
  if (a == null || b == null) return "unknown";
  const d = Math.abs(a - b);
  return d === 0 ? "same" : d === 1 ? "near" : "far";
};

const deptoOf = (muni?: number | null, depto?: number | null) => depto ?? (muni != null ? Math.floor(muni / 100) : null);

const rank: Record<MatchLevel, number> = { seguro: 0, probable: 1, dudoso: 2 };

/** Compara un renglón del archivo con un registro existente. null si no se parecen lo bastante. */
function compare(item: ResolveItem, e: ExistingRef): DuplicateMatch | null {
  if (e.type !== item.type) return null;
  const t = titleSimilarity(item.title, e.title);
  if (t < 0.78) return null;

  let score = t;
  let contradiction = false;
  let confirmed = false;

  if (item.type === "film") {
    const y = yearRel(item.year, e.year);
    const hasDir = !!item.director?.trim() && !!e.director?.trim();
    const dirSame = hasDir && sameDirector(item.director, e.director);
    if (y === "same") (score += 0.05), (confirmed = true);
    else if (y === "near") score -= 0.03;
    else if (y === "far") (score -= 0.25), (contradiction = true);
    if (hasDir) {
      if (dirSame) (score += 0.05), (confirmed = true);
      else (score -= 0.15), (contradiction = true);
    }
  } else {
    // la misma entidad no cambia de capa; y en otro municipio es probablemente otra sede
    if (item.layer && e.layer && item.layer !== e.layer) return null;
    const im = item.muni_ine ?? null;
    const em = e.muni_ine ?? null;
    const id = deptoOf(item.muni_ine, item.depto_ine);
    const ed = deptoOf(e.muni_ine, e.depto_ine);
    if (im != null && em != null) {
      if (im === em) (score += 0.05), (confirmed = true);
      else (score -= 0.2), (contradiction = true);
    } else if (id != null && ed != null) {
      if (id === ed) score += 0.02;
      else (score -= 0.2), (contradiction = true);
    }
  }

  let level: MatchLevel;
  if (contradiction) level = "dudoso";
  else if (t >= 0.95 && confirmed) level = "seguro";
  else if (t >= 0.85) level = "probable";
  else level = "dudoso";

  return { id: e.id, title: e.title, year: e.year, score: Number(Math.max(0, Math.min(1, score)).toFixed(2)), level };
}

/**
 * Busca, para cada renglón del archivo, los registros que ya existen y se le parecen (hasta 3).
 * El primero es el mejor; si el nivel no es «seguro» ni «probable» la carga no decide sola.
 */
export function findDuplicates(items: ResolveItem[], existing: ExistingRef[]): Record<string, DuplicateMatch> {
  const out: Record<string, DuplicateMatch> = {};
  for (const item of items) {
    const found: DuplicateMatch[] = [];
    for (const e of existing) {
      const m = compare(item, e);
      if (m) found.push(m);
    }
    if (!found.length) continue;
    found.sort((a, b) => rank[a.level] - rank[b.level] || b.score - a.score);
    const [best, ...rest] = found;
    // Dos candidatos igual de buenos: no hay manera de saber cuál es, así que la decisión es de una persona.
    const tie = rest[0] && rest[0].level === best.level && best.score - rest[0].score < 0.03;
    out[item.key] = { ...best, level: tie && best.level !== "dudoso" ? "dudoso" : best.level, alternatives: rest.slice(0, 2) };
  }
  return out;
}

/** ¿Son el mismo nombre de empresa o de lugar? Mismo núcleo (sin tildes, artículos ni sufijos legales) o casi idénticos. */
export function sameName(a: string, b: string, min = 0.92) {
  const x = titleCore(a);
  const y = titleCore(b);
  return !!x && !!y && (x === y || similarity(x, y) >= min);
}

/** ¿El renglón del archivo coincide de forma segura con otro del mismo archivo? Para fusionar repetidos. */
export function sameRecordInFile(a: { title: string; year?: number | null; director?: string | null }, b: { title: string; year?: number | null; director?: string | null }) {
  if (titleCore(a.title) !== titleCore(b.title)) return false;
  const y = yearRel(a.year, b.year);
  if (y === "far") return false;
  const hasDir = !!a.director?.trim() && !!b.director?.trim();
  if (hasDir && !sameDirector(a.director, b.director)) return false;
  // un año de diferencia solo se acepta si además coincide el director/a
  if (y === "near" && !hasDir) return false;
  return true;
}
