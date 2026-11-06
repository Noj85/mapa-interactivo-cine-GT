import { strFromU8, unzipSync } from "fflate";
import { gridToSheet } from "./parse";
import type { ParsedSheet } from "./types";

/**
 * Lectura de Word (.docx) sin IA. Un .docx es un zip con `word/document.xml`; aquí se recorre ese XML y se
 * obtienen dos cosas: párrafos (con su estilo) y tablas (con celdas combinadas resueltas).
 */

export type DocBlock =
  | { kind: "p"; text: string; heading: boolean; bullet: boolean }
  | { kind: "t"; rows: string[][] };

const MAX_XML = 120 * 1024 * 1024;

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : "";
    }
    return { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }[e.toLowerCase() as "amp"] ?? "";
  });
}

interface ParaFrame {
  t: "p";
  text: string;
  style: string;
  bullet: boolean;
}
interface CellFrame {
  t: "tc";
  paras: string[];
  span: number;
  vcont: boolean;
}
interface RowFrame {
  t: "tr";
  cells: CellFrame[];
}
interface TableFrame {
  t: "tbl";
  rows: string[][];
  cur?: RowFrame;
}
type Frame = ParaFrame | CellFrame | TableFrame;

const HEADING_STYLE = /^(heading|t[ií]?tulo|ttulo|title|subtitle|subt[ií]?tulo|subttulo)/i;

const TOKEN = new RegExp(
  [
    String.raw`<w:t(?:\s[^>]*)?>([^<]*)</w:t>`, // 1 texto
    String.raw`<w:(p|tbl|tr|tc)(?:\s[^>]*?)?(\/?)>`, // 2 abre, 3 autocierre
    String.raw`<\/w:(p|tbl|tr|tc)>`, // 4 cierra
    String.raw`<w:(tab|br|cr|noBreakHyphen)\b[^>]*?\/>`, // 5 tab, salto
    String.raw`<w:pStyle\s+w:val="([^"]*)"\s*\/>`, // 6 estilo
    String.raw`<w:(numPr)>`, // 7 viñeta
    String.raw`<w:gridSpan\s+w:val="(\d+)"\s*\/>`, // 8 columnas combinadas
    String.raw`<w:vMerge(?:\s+w:val="(\w+)")?\s*\/>`, // 9 filas combinadas
  ].join("|"),
  "g",
);

/** Recorre el XML del cuerpo y devuelve párrafos y tablas en orden. */
function walk(xml: string): DocBlock[] {
  // El contenido alterno (cuadros de texto duplicados) y las eliminaciones con control de cambios no cuentan.
  xml = xml.replace(/<mc:Fallback>[\s\S]*?<\/mc:Fallback>/g, "").replace(/<w:del\b[^>]*>[\s\S]*?<\/w:del>/g, "");
  const blocks: DocBlock[] = [];
  const stack: Frame[] = [];

  // Al terminar un párrafo, va a la celda o al cuerpo más cercano (un cuadro de texto dentro de un párrafo sale antes que él).
  const emitPara = (p: ParaFrame) => {
    const text = p.text
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    if (!text) return;
    for (let i = stack.length - 1; i >= 0; i--) {
      const f = stack[i];
      if (f.t === "tc") {
        f.paras.push(text);
        return;
      }
      if (f.t === "tbl") return; // texto suelto dentro de una tabla, fuera de una celda
    }
    blocks.push({ kind: "p", text, heading: HEADING_STYLE.test(p.style), bullet: p.bullet });
  };

  const topPara = (): ParaFrame | undefined => {
    for (let i = stack.length - 1; i >= 0; i--) if (stack[i].t === "p") return stack[i] as ParaFrame;
    return undefined;
  };
  const topCell = (): CellFrame | undefined => {
    for (let i = stack.length - 1; i >= 0; i--) {
      const f = stack[i];
      if (f.t === "tc") return f;
      if (f.t === "tbl") return undefined;
    }
    return undefined;
  };

  TOKEN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN.exec(xml))) {
    if (m[1] !== undefined) {
      const p = topPara();
      if (p) p.text += decodeEntities(m[1]);
    } else if (m[2]) {
      const tag = m[2];
      if (tag === "p") {
        const frame: ParaFrame = { t: "p", text: "", style: "", bullet: false };
        if (m[3]) emitPara(frame);
        else stack.push(frame);
      } else if (tag === "tbl") {
        stack.push({ t: "tbl", rows: [] });
      } else if (tag === "tr") {
        for (let i = stack.length - 1; i >= 0; i--) {
          const f = stack[i];
          if (f.t === "tbl") {
            f.cur = { t: "tr", cells: [] };
            break;
          }
        }
      } else if (tag === "tc") {
        stack.push({ t: "tc", paras: [], span: 1, vcont: false });
      }
    } else if (m[4]) {
      const tag = m[4];
      if (tag === "p") {
        // Se cierra el párrafo más reciente (los de adentro ya se cerraron antes).
        const i = stack.map((f) => f.t).lastIndexOf("p");
        if (i >= 0) {
          const [p] = stack.splice(i, 1) as ParaFrame[];
          emitPara(p);
        }
      } else if (tag === "tc") {
        const i = stack.map((f) => f.t).lastIndexOf("tc");
        if (i >= 0) {
          const [cell] = stack.splice(i, 1) as CellFrame[];
          // Párrafos que quedaron abiertos dentro de la celda (XML mal formado) se descartan con ella.
          for (let k = stack.length - 1; k >= 0; k--) {
            const f = stack[k];
            if (f.t === "tbl") {
              f.cur?.cells.push(cell);
              break;
            }
          }
        }
      } else if (tag === "tr") {
        for (let k = stack.length - 1; k >= 0; k--) {
          const f = stack[k];
          if (f.t === "tbl") {
            if (f.cur) {
              const row: string[] = [];
              const vflags: boolean[] = [];
              for (const c of f.cur.cells) {
                row.push(c.paras.join("\n"));
                vflags.push(c.vcont);
                for (let s = 1; s < c.span; s++) {
                  row.push("");
                  vflags.push(false);
                }
              }
              // Celda combinada hacia abajo: continúa con el valor de la fila anterior, en la misma columna.
              const prev = f.rows[f.rows.length - 1];
              if (prev) vflags.forEach((v, c) => v && !row[c] && (row[c] = prev[c] ?? ""));
              f.rows.push(row);
              f.cur = undefined;
            }
            break;
          }
        }
      } else if (tag === "tbl") {
        const i = stack.map((f) => f.t).lastIndexOf("tbl");
        if (i >= 0) {
          const [tbl] = stack.splice(i, 1) as TableFrame[];
          const rows = tbl.rows.filter((r) => r.some((c) => c.trim() !== ""));
          if (!rows.length) continue;
          const cell = topCell();
          if (cell) {
            // Tabla dentro de una celda: se aplana como texto de esa celda.
            cell.paras.push(rows.map((r) => r.filter((c) => c.trim()).join(" · ")).join("\n"));
          } else {
            blocks.push({ kind: "t", rows });
          }
        }
      }
    } else if (m[5]) {
      const p = topPara();
      if (p) p.text += m[5] === "tab" ? "\t" : m[5] === "noBreakHyphen" ? "-" : "\n";
    } else if (m[6] !== undefined) {
      const p = topPara();
      if (p) p.style = m[6];
    } else if (m[7]) {
      const p = topPara();
      if (p) p.bullet = true;
    } else if (m[8]) {
      const c = topCell();
      if (c) c.span = Math.min(30, Math.max(1, parseInt(m[8], 10)));
    } else if (m[0].startsWith("<w:vMerge")) {
      const c = topCell();
      if (c) c.vcont = m[9] !== "restart";
    }
  }
  return blocks;
}

/** Abre el .docx y devuelve su contenido en orden. Lanza con un mensaje claro si no es un Word válido. */
export function readDocx(data: Uint8Array): DocBlock[] {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(data, { filter: (f) => f.name === "word/document.xml" && f.originalSize <= MAX_XML });
  } catch {
    throw new Error("Ese archivo no parece un documento de Word (.docx) válido.");
  }
  const xml = files["word/document.xml"];
  if (!xml) throw new Error("Ese archivo no parece un documento de Word (.docx) válido.");
  return walk(strFromU8(xml));
}

// ───────────────────────── tablas → hojas ─────────────────────────

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

function squareRows(rows: string[][]): string[][] {
  const w = Math.max(0, ...rows.map((r) => r.length));
  return rows.map((r) => Array.from({ length: w }, (_, i) => (r[i] ?? "").trim()));
}

const TITLE_LABEL = /^(titulo|nombre|obra|pelicula|produccion|proyecto|cortometraje|largometraje|serie)\b/;

export interface DocTables {
  sheets: ParsedSheet[];
  /** Filas de datos en todas las tablas. */
  rows: number;
}

/**
 * Convierte las tablas de Word en hojas:
 * - tablas que repiten los mismos encabezados (porque el documento las partió) se juntan en una;
 * - varias tablas de dos columnas «etiqueta | valor» con etiquetas parecidas son fichas: cada una pasa a ser una fila.
 */
export function docTables(blocks: DocBlock[]): DocTables {
  interface T {
    rows: string[][];
    heading: string;
  }
  const tables: T[] = [];
  let heading = "";
  for (const b of blocks) {
    if (b.kind === "p") {
      if (b.heading) heading = clean(b.text).slice(0, 60);
    } else {
      const rows = squareRows(b.rows);
      tables.push({ rows, heading });
      heading = "";
    }
  }

  const sheets: ParsedSheet[] = [];
  const usedNames = new Set<string>();
  const nameFor = (base: string, fallback: string) => {
    let n = (base || fallback).replace(/[\\/?*[\]:]/g, " ").trim().slice(0, 31) || fallback;
    let i = 2;
    while (usedNames.has(n.toLowerCase())) n = `${(base || fallback).slice(0, 27)} ${i++}`;
    usedNames.add(n.toLowerCase());
    return n;
  };

  // Fichas: tablas de dos columnas con etiquetas que se repiten de una tabla a otra.
  const two = tables.filter((t) => t.rows[0]?.length === 2 && t.rows.length >= 2);
  const labelsOf = (t: T) => new Set(t.rows.map((r) => norm(r[0])).filter(Boolean));
  const fichaGroups: T[][] = [];
  for (const t of two) {
    const ls = labelsOf(t);
    const g = fichaGroups.find((grp) => {
      const base = labelsOf(grp[0]);
      let shared = 0;
      for (const l of ls) if (base.has(l)) shared++;
      return shared / Math.max(1, Math.min(ls.size, base.size)) >= 0.5 && shared >= 2;
    });
    if (g) g.push(t);
    else fichaGroups.push([t]);
  }
  const asFichas = new Set<T>();
  for (const g of fichaGroups) {
    if (g.length < 2) continue;
    const headers: string[] = [];
    const seen = new Set<string>();
    const records = g.map((t) => {
      const rec: Record<string, string> = {};
      for (const r of t.rows) {
        const label = clean(r[0]);
        if (!label) continue;
        const k = norm(label);
        if (!seen.has(k)) {
          seen.add(k);
          headers.push(label);
        }
        const h = headers.find((x) => norm(x) === k) as string;
        rec[h] = rec[h] ? `${rec[h]}; ${r[1]}` : r[1];
      }
      return rec;
    });
    // Si las fichas no traen el nombre como etiqueta, sirve el título que antecede a cada una.
    if (!headers.some((h) => TITLE_LABEL.test(norm(h))) && g.filter((t) => t.heading).length >= g.length / 2) {
      headers.unshift("Título de la ficha");
      g.forEach((t, i) => (records[i]["Título de la ficha"] = t.heading));
    }
    const rows = records.map((rec) => Object.fromEntries(headers.map((h) => [h, rec[h] ?? ""])));
    sheets.push({ name: nameFor("Fichas", "Fichas"), headers, rows, totalRows: rows.length });
    g.forEach((t) => asFichas.add(t));
  }

  // Tablas comunes: las que repiten encabezados se juntan.
  const byHeader = new Map<string, { name: string; grid: string[][]; headerRow: string[] }>();
  let order = 0;
  for (const t of tables) {
    if (asFichas.has(t)) continue;
    if (t.rows.length < 2 || (t.rows[0]?.length ?? 0) < 2) continue;
    const headerKey = norm(t.rows[0].join(" ")) || `t${order}`;
    const prev = byHeader.get(headerKey);
    if (prev && prev.headerRow.length === t.rows[0].length) prev.grid.push(...t.rows.slice(1));
    else byHeader.set(headerKey, { name: t.heading || `Tabla ${++order}`, grid: [...t.rows], headerRow: t.rows[0] });
  }
  for (const { name, grid } of byHeader.values()) {
    const s = gridToSheet(nameFor(name, "Tabla"), grid);
    if (s) sheets.push(s);
  }

  return { sheets, rows: sheets.reduce((n, s) => n + s.totalRows, 0) };
}

// ───────────────────────── texto para Claude ─────────────────────────

/** Cantidad de caracteres de texto que no está dentro de tablas. */
export function proseLength(blocks: DocBlock[]): number {
  return blocks.reduce((n, b) => n + (b.kind === "p" ? b.text.length : 0), 0);
}

export const MAX_DOC_CHARS = 700_000;

/**
 * El documento como texto: títulos con «#», viñetas con «-» y tablas como filas de celdas separadas por « | ».
 * Se parte en fragmentos de tamaño parecido, siempre en límites de párrafo o de fila.
 */
export function docToText(blocks: DocBlock[], maxChars = 30_000): string[] {
  interface Unit {
    text: string;
    /** Primera fila de la tabla a la que pertenece (se repite si la tabla se parte). */
    header?: string;
  }
  const units: Unit[] = [];
  for (const b of blocks) {
    if (b.kind === "p") {
      const t = b.text.replace(/\s*\n\s*/g, " ");
      units.push({ text: b.heading ? `# ${t}` : b.bullet ? `- ${t}` : t });
    } else {
      const lines = b.rows.map((r) => r.map((c) => c.replace(/\s*\n\s*/g, " / ").trim()).join(" | "));
      // En fichas de dos columnas no tiene sentido repetir la primera fila.
      const header = (b.rows[0]?.length ?? 0) >= 3 ? lines[0] : undefined;
      lines.forEach((l) => units.push({ text: l, header }));
    }
    units.push({ text: "" });
  }
  const parts: string[] = [];
  let cur: string[] = [];
  let len = 0;
  const flush = () => {
    const t = cur.join("\n").trim();
    if (t) parts.push(t);
    cur = [];
    len = 0;
  };
  for (const u of units) {
    // Se corta en el límite de un bloque; solo un bloque enorme (tabla larga) se corta por filas.
    const over = len + u.text.length + 1 > maxChars;
    if (len > 0 && ((over && u.text === "") || len > maxChars * 1.5)) {
      flush();
      if (u.header && u.text !== u.header) {
        cur.push(u.header);
        len += u.header.length + 1;
      }
    }
    cur.push(u.text);
    len += u.text.length + 1;
  }
  flush();
  return parts;
}
