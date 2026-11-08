import type { Gazetteer } from "@/lib/geo/gazetteer";
import { normalize } from "@/lib/utils";
import { FILM_FIELDS, type MultiGroup, type SheetPlan } from "./types";

/**
 * Motor general de campos de varios valores.
 * Un campo puede traer varias entradas en una celda («Petén; Izabal») o en columnas paralelas; aquí se decide
 * cómo partir cada celda y cómo alinear las columnas del mismo concepto. No sabe nada de un archivo en particular:
 * lo que cambia de un archivo a otro (separadores raros, comas) viene en `plan.lists`.
 */

/** Separadores que siempre parten una celda de un campo de lista. */
export const STRONG_SEPARATORS = [";", "\n", "|"];

/** Separadores que el plan puede pedir además: coma, barra y « y ». */
export const OPTIONAL_SEPARATORS = [",", "/", " y "];

/** Campo -> concepto repetible (null si el campo es de un solo valor). */
export const groupOf = (field: string): MultiGroup | null => {
  const base = field.replace(/__\d+$/, "");
  return FILM_FIELDS.find((f) => f.id === base)?.group ?? null;
};

/** Separadores efectivos de un campo: los fuertes, más lo que el plan pida para él. */
export function separatorsOf(plan: Pick<SheetPlan, "lists" | "multi_place">, field: string): string[] {
  const base = field.replace(/__\d+$/, "");
  const out = new Set(STRONG_SEPARATORS);
  for (const s of plan.lists?.[base]?.separators ?? []) out.add(s);
  // planes anteriores: «multi_place» también partía por « / » en lugar, municipio y departamento
  if (plan.multi_place && ["place", "muni", "depto"].includes(base)) out.add("/");
  return [...out];
}

/** Expresión que parte por los separadores dados. */
function splitter(seps: string[]): RegExp {
  const parts: string[] = [];
  if (seps.includes(";")) parts.push(";");
  if (seps.includes("\n")) parts.push("\\r?\\n");
  if (seps.includes("|")) parts.push("\\|");
  if (seps.includes(",")) parts.push(",");
  if (seps.includes("/")) parts.push("\\s+/\\s+|/");
  if (seps.includes(" y ")) parts.push("\\s+(?:y|e)\\s+");
  return new RegExp(parts.join("|") || "(?!)", "i");
}

/** Parte una celda en sus valores, sin vacíos. */
export function splitCell(value: string | null | undefined, seps: string[] = STRONG_SEPARATORS): string[] {
  const v = (value ?? "").trim();
  if (!v) return [];
  return v
    .split(splitter(seps))
    .map((x) => x.trim())
    .filter(Boolean);
}

/**
 * Partir un texto de lugar. Además de los separadores del plan, una coma separa lugares solo si el texto entero no
 * se reconoce como un lugar y cada parte sí (así «Panajachel, Sololá» sigue siendo un lugar y «Petén, Izabal» son dos).
 */
export function splitPlaceCell(value: string | null | undefined, seps: string[], gaz?: Gazetteer): string[] {
  const pieces = splitCell(value, seps.filter((s) => s !== ","));
  const commas = seps.includes(",");
  const out: string[] = [];
  for (const piece of pieces) {
    if (!piece.includes(",")) {
      out.push(piece);
      continue;
    }
    const parts = piece.split(",").map((x) => x.trim()).filter(Boolean);
    if (parts.length < 2) {
      out.push(piece);
      continue;
    }
    // sin la coma en el plan, solo se parte si cada parte es un lugar conocido por sí sola
    if (!commas && (!gaz || !parts.every((p) => (gaz.search(p, 1)[0]?.score ?? 0) >= 0.85))) {
      out.push(piece);
      continue;
    }
    // «Antigua, Sacatepéquez, Flores»: un municipio seguido de su propio departamento es un solo lugar
    const munisOf = (p: string) => (gaz ? gaz.search(p, 8).filter((m) => m.entry.type === "muni" && m.score >= 0.85) : []);
    const merged: { text: string; munis: ReturnType<typeof munisOf>; joined: boolean }[] = [];
    for (const p of parts) {
      const hit = gaz?.search(p, 1)[0];
      const prev = merged[merged.length - 1];
      if (hit && prev && !prev.joined && hit.score >= 0.85 && hit.entry.type === "depto" && prev.munis.some((m) => m.entry.depto_ine === hit.entry.code)) {
        prev.text = `${prev.text}, ${p}`;
        prev.joined = true;
      } else merged.push({ text: p, munis: munisOf(p), joined: false });
    }
    out.push(...merged.map((m) => m.text));
    continue;
  }
  return out;
}

export interface Aligned {
  /** Cuántas entradas hay en total (la lista más larga). */
  n: number;
  /** Campos con más de un valor cuya cantidad no coincide con n. */
  mismatched: string[];
}

/**
 * Alinea listas paralelas por posición. Con `spread` (los campos que califican a los demás, como el departamento o
 * el año del festival) un valor único se aplica a todas las entradas; el resto de los valores únicos quedan en la primera.
 */
export function alignLists(lists: Record<string, string[]>, spread: string[] = []): Aligned & { at(field: string, i: number): string | null } {
  const n = Math.max(0, ...Object.values(lists).map((l) => l.length));
  const mismatched = Object.entries(lists)
    .filter(([, l]) => l.length > 1 && l.length !== n)
    .map(([k]) => k);
  return {
    n,
    mismatched,
    at(field, i) {
      const l = lists[field] ?? [];
      if (!l.length) return null;
      if (l.length === 1) return i === 0 || spread.includes(field) ? l[0] : null;
      return l[i] ?? null;
    },
  };
}

/** Número declarado en una columna de cantidad («5», «5 locaciones»). null si no hay un número. */
export function declaredCount(raw: string | null | undefined): number | null {
  const m = String(raw ?? "").match(/\d+/);
  if (!m) return null;
  const n = Number(m[0]);
  return n >= 0 && n < 1000 ? n : null;
}

/** Misma entrada con distinto texto: sirve para no repetir lo que ya trae el registro. */
export const sameText = (a: string, b: string) => normalize(a) === normalize(b);

/** ¿La columna parece un conteo? (casi todas sus celdas son un entero chico). */
export function looksLikeCount(values: string[]): boolean {
  const filled = values.map((v) => v.trim()).filter(Boolean);
  if (filled.length < 3) return false;
  const ints = filled.filter((v) => /^\d{1,2}(\s*(locaci[oó]n(es)?|lugares?|sitios?|festivales?|casas?))?$/i.test(v));
  return ints.length / filled.length >= 0.9;
}
