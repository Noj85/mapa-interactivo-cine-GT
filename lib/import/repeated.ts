import { normalize } from "@/lib/utils";
import type { ImportPlan, ParsedFile } from "./types";

/**
 * Una hoja que solo repite filas de otra (por ejemplo «Largometrajes de ficción» dentro del libro
 * de las 500 producciones) se deja sin usar, para no crear cada producción dos veces.
 * Solo compara hojas de producciones leídas completas.
 */
export function ignoreRepeatedSheets(file: ParsedFile, plan: ImportPlan): ImportPlan {
  const keyOf = (row: Record<string, string>, titleCol: string, yearCol?: string) =>
    `${normalize(row[titleCol] ?? "")}|${yearCol ? (row[yearCol] ?? "").trim() : ""}`;
  const seen: { name: string; keys: Set<string> }[] = [];
  const sheets = plan.sheets.map((sp) => {
    const sheet = file.sheets.find((s) => s.name === sp.sheet);
    const title = sp.columns.title;
    if (sp.entity !== "film" || !sheet || !title || sheet.rows.length !== sheet.totalRows) return sp;
    const keys = new Set(sheet.rows.map((r) => keyOf(r, title, sp.columns.year)).filter((k) => !k.startsWith("|")));
    const earlier = seen.find((s) => keys.size > 0 && [...keys].every((k) => s.keys.has(k)));
    if (earlier) return { ...sp, entity: "ignore" as const, note: `Repite producciones que ya están en la hoja «${earlier.name}»; no se carga dos veces.` };
    seen.push({ name: sp.sheet, keys });
    return sp;
  });
  if (sheets.every((s, i) => s === plan.sheets[i])) return plan;
  const films = sheets.filter((s) => s.entity === "film").length;
  const orgs = sheets.filter((s) => s.entity === "org").length;
  const summary = plan.engine === "heuristic" ? `Reconocimos ${films} hoja(s) de producciones y ${orgs} de entidades por los nombres de las columnas. Revisa que cada columna esté bien asignada.` : plan.summary;
  return { ...plan, sheets, summary };
}
