import type { ParsedSheet } from "./types";

export interface DistinctValue {
  v: string;
  n: number;
}

/** Hoja -> encabezado -> valores distintos con su frecuencia. */
export type DistinctMap = Record<string, Record<string, DistinctValue[]>>;

const MAX_VALUES = 30;
const MAX_COLUMNS = 40;

/**
 * Valores distintos de las columnas que parecen de lista (pocas variantes que se repiten), contados sobre TODAS las filas.
 * Claude solo ve una muestra; con esto puede normalizar también lo que aparece más abajo en el archivo.
 */
export function distinctValues(sheet: ParsedSheet): Record<string, DistinctValue[]> {
  const out: Record<string, DistinctValue[]> = {};
  const listLike = (counts: Map<string, number>, filled: number) => {
    if (!filled || counts.size > MAX_VALUES) return false;
    // una columna de títulos o de nombres no es una lista: casi cada valor es único
    if (counts.size > 12 && counts.size > filled * 0.5) return false;
    if (counts.size === filled && filled > 8) return false;
    return true;
  };
  const sorted = (counts: Map<string, number>) => [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([v, n]) => ({ v, n }));
  for (const h of sheet.headers) {
    if (Object.keys(out).length >= MAX_COLUMNS) break;
    const counts = new Map<string, number>();
    let filled = 0;
    for (const r of sheet.rows) {
      const v = (r[h] ?? "").trim();
      if (!v || v.length > 80) continue;
      filled++;
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    if (listLike(counts, filled)) {
      out[h] = sorted(counts);
      continue;
    }
    // Celdas con varios valores («Drama; Comedia, Terror»): cada una combinación es casi única, pero cada valor suelto se repite.
    const tokens = new Map<string, number>();
    let tokenTotal = 0;
    let multi = 0;
    for (const r of sheet.rows) {
      const cell = (r[h] ?? "").trim();
      if (!cell || cell.length > 160) continue;
      const parts = cell.split(/[;,/|\n]+/).map((x) => x.trim()).filter(Boolean);
      if (parts.length > 1) multi++;
      for (const t of parts) {
        if (t.length > 60) continue;
        tokenTotal++;
        tokens.set(t, (tokens.get(t) ?? 0) + 1);
      }
    }
    if (multi >= 2 && tokens.size >= 2 && listLike(tokens, tokenTotal)) out[h] = sorted(tokens);
  }
  return out;
}

export function distinctFor(sheets: ParsedSheet[]): DistinctMap {
  return Object.fromEntries(sheets.map((s) => [s.name, distinctValues(s)]));
}
