import { recognizedField } from "./heuristic";
import type { ParsedFile, ParsedSheet } from "./types";

const MAX_ROWS = 5000;

function decodeText(buf: ArrayBuffer): string {
  let text = new TextDecoder("utf-8").decode(buf);
  if (text.includes("\uFFFD")) text = new TextDecoder("windows-1252").decode(buf);
  return text.replace(/^\uFEFF/, "");
}

/** Elige la fila de encabezados: la primera, entre las 10 primeras, con casi tantas celdas como la que más. */
export function headerRowIndex(grid: string[][]): number {
  const limit = Math.min(grid.length, 10);
  const counts = grid.slice(0, limit).map((r) => r.filter((c) => c.trim() !== "").length);
  const max = Math.max(0, ...counts);
  if (max < 2) return 0;
  const idx = counts.findIndex((c) => c >= Math.ceil(max * 0.7));
  return idx < 0 ? 0 : idx;
}

const filled = (r: string[]) => r.filter((c) => c.trim() !== "").length;
const looksNumeric = (c: string) => /^-?[\d.,\s]+%?$/.test(c.trim()) || /^\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}$/.test(c.trim());

/**
 * Encabezados en dos filas: arriba el grupo («Locación», «Festival»), abajo cada columna («Lugar», «Días»).
 * Devuelve la fila de grupos si la fila de encabezados `h` tiene una encima que lo parece: varios textos,
 * bastante más vacía que la de abajo, y sin números.
 */
function groupRowAbove(grid: string[][], h: number): string[] | null {
  if (h < 1) return null;
  const g = grid[h - 1];
  const gn = filled(g);
  const hn = filled(grid[h]);
  if (gn < 2 || gn > hn * 0.7) return null;
  if (g.some((c) => c.trim() && looksNumeric(c))) return null;
  return g;
}

/**
 * Hoja en forma de ficha: una columna de etiquetas («Título», «Director/a», «Municipio») y otra de valores.
 * Si hay varias fichas una debajo de la otra (la etiqueta del título se repite), cada una es una fila.
 * null si la cuadrícula no parece una ficha.
 */
function keyValueSheet(name: string, grid: string[][]): ParsedSheet | null {
  const cols = Math.max(0, ...grid.map((r) => r.length));
  if (cols < 2 || grid.length < 4) return null;
  // columna de etiquetas: la primera con texto en la mayoría de las filas
  const labelCol = [0, 1].find((c) => grid.filter((r) => (r[c] ?? "").trim()).length >= grid.length * 0.5);
  if (labelCol === undefined) return null;
  const pairs: { label: string; value: string }[] = [];
  let recognized = 0;
  for (const r of grid) {
    const label = (r[labelCol] ?? "").trim();
    if (!label || label.length > 60) continue;
    const value = r.slice(labelCol + 1).find((c) => c.trim() !== "") ?? "";
    pairs.push({ label, value: value.trim() });
    if (recognizedField(label) && value.trim()) recognized++;
  }
  // una tabla común tiene a lo sumo un par de etiquetas reconocibles en la primera columna; una ficha tiene varias
  const withValue = pairs.filter((p) => p.value).length;
  if (recognized < 4 || recognized < withValue * 0.5) return null;
  // ¿cuántas columnas de datos por fila? una tabla ancha no es una ficha
  const widths = grid.map((r) => filled(r)).filter((n) => n > 0).sort((a, b) => a - b);
  if (widths[Math.floor(widths.length / 2)] > 3) return null;

  const titleField = (l: string) => ["title", "name"].includes(recognizedField(l) ?? "");
  const records: Record<string, string>[] = [];
  let cur: Record<string, string> = {};
  const headers: string[] = [];
  const head = new Map<string, string>(); // etiqueta normalizada -> encabezado
  for (const { label, value } of pairs) {
    if (!value) continue;
    const k = label.toLowerCase().replace(/\s+/g, " ").trim();
    if (!head.has(k)) {
      head.set(k, label);
      headers.push(label);
    }
    const h = head.get(k)!;
    if (titleField(label) && cur[h]) {
      records.push(cur);
      cur = {};
    }
    // una etiqueta repetida en la misma ficha (dos locaciones, dos festivales) junta los valores con «; »
    cur[h] = cur[h] ? `${cur[h]}; ${value}` : value;
  }
  if (Object.keys(cur).length) records.push(cur);
  if (!records.length) return null;
  const rows = records.map((rec) => Object.fromEntries(headers.map((h) => [h, rec[h] ?? ""])));
  return { name, headers, rows, totalRows: rows.length, layout: "ficha" };
}

/** Convierte una cuadrícula de texto (primera fila de datos = encabezados) en una hoja. null si no tiene datos. */
export function gridToSheet(name: string, grid: string[][]): ParsedSheet | null {
  if (grid.length < 2) return null;
  const kv = keyValueSheet(name, grid);
  if (kv) return kv;
  const h = headerRowIndex(grid);
  const group = groupRowAbove(grid, h);
  const used = new Map<string, number>();
  const subHeaders: Record<string, string> = {};
  const headers = grid[h].map((raw, i) => {
    const g = (group?.[i] ?? "").trim();
    const sub = raw.trim();
    const joined = g && sub && g.toLowerCase() !== sub.toLowerCase() ? `${g} ${sub}` : sub || g;
    const base = joined || `Columna ${i + 1}`;
    const n = (used.get(base) ?? 0) + 1;
    used.set(base, n);
    const out = n > 1 ? `${base} (${n})` : base;
    if (g && sub && joined !== sub) subHeaders[out] = sub;
    return out;
  });
  const body = grid.slice(h + 1).filter((r) => r.some((c) => c !== ""));
  const rows = body.slice(0, MAX_ROWS).map((r) => {
    const o: Record<string, string> = {};
    headers.forEach((hd, i) => (o[hd] = r[i] ?? ""));
    return o;
  });
  if (!rows.length) return null;
  return { name, headers, rows, totalRows: body.length, ...(group ? { layout: "dos filas" as const, subHeaders } : {}) };
}

/** Las celdas combinadas en horizontal («Locación» sobre tres columnas) repiten su texto en cada columna que cubren. */
function expandMerges(ws: { [k: string]: any }) {
  const merges = (ws["!merges"] ?? []) as { s: { r: number; c: number }; e: { r: number; c: number } }[];
  const addr = (r: number, c: number) => {
    let col = "";
    for (let n = c + 1; n > 0; n = Math.floor((n - 1) / 26)) col = String.fromCharCode(65 + ((n - 1) % 26)) + col;
    return `${col}${r + 1}`;
  };
  for (const m of merges) {
    if (m.s.r !== m.e.r || m.e.c - m.s.c > 40) continue;
    const src = ws[addr(m.s.r, m.s.c)];
    if (!src) continue;
    for (let c = m.s.c + 1; c <= m.e.c; c++) ws[addr(m.s.r, c)] = { ...src };
  }
}

/** Lee CSV / XLS / XLSX en el navegador. Cada hoja queda como filas con encabezados. */
export async function parseFile(file: File): Promise<ParsedFile> {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const isCsv = /\.(csv|tsv|txt)$/i.test(file.name) || file.type.includes("csv");
  const wb = isCsv
    ? XLSX.read(decodeText(buf), { type: "string", FS: /\.tsv$/i.test(file.name) ? "\t" : undefined })
    : XLSX.read(buf, { type: "array", cellDates: true });

  const sheets: ParsedSheet[] = [];
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    expandMerges(ws);
    const grid = (XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "", blankrows: false }) as unknown[][]).map(
      (r) => r.map((c) => String(c ?? "").trim()),
    );
    const sheet = gridToSheet(name, grid);
    if (sheet) sheets.push(sheet);
  }
  return { filename: file.name, sheets };
}
