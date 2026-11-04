import type { ParsedFile, ParsedSheet } from "./types";

const MAX_ROWS = 5000;

function decodeText(buf: ArrayBuffer): string {
  let text = new TextDecoder("utf-8").decode(buf);
  if (text.includes("\uFFFD")) text = new TextDecoder("windows-1252").decode(buf);
  return text.replace(/^\uFEFF/, "");
}

/** Elige la fila de encabezados: la primera, entre las 10 primeras, con casi tantas celdas como la que más. */
function headerRowIndex(grid: string[][]): number {
  const limit = Math.min(grid.length, 10);
  const counts = grid.slice(0, limit).map((r) => r.filter((c) => c.trim() !== "").length);
  const max = Math.max(0, ...counts);
  if (max < 2) return 0;
  const idx = counts.findIndex((c) => c >= Math.ceil(max * 0.7));
  return idx < 0 ? 0 : idx;
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
    const grid = (XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "", blankrows: false }) as unknown[][]).map(
      (r) => r.map((c) => String(c ?? "").trim()),
    );
    if (grid.length < 2) continue;
    const h = headerRowIndex(grid);
    const used = new Map<string, number>();
    const headers = grid[h].map((raw, i) => {
      const base = raw || `Columna ${i + 1}`;
      const n = (used.get(base) ?? 0) + 1;
      used.set(base, n);
      return n > 1 ? `${base} (${n})` : base;
    });
    const body = grid.slice(h + 1).filter((r) => r.some((c) => c !== ""));
    const rows = body.slice(0, MAX_ROWS).map((r) => {
      const o: Record<string, string> = {};
      headers.forEach((hd, i) => (o[hd] = r[i] ?? ""));
      return o;
    });
    if (!rows.length) continue;
    sheets.push({ name, headers, rows, totalRows: body.length });
  }
  return { filename: file.name, sheets };
}
