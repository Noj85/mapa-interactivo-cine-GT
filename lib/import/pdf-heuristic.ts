import "server-only";
import { getDocumentProxy } from "unpdf";
import type { ParsedFile, ParsedSheet } from "./types";

/**
 * Lectura de PDF sin IA. Funciona con dos maquetaciones frecuentes:
 *  1. Fichas: cada registro es un bloque con un nombre en letra grande y datos con etiqueta
 *     que se repiten ("Representante", "Sitio web", "Ubicación"…), como el catálogo de servicios.
 *  2. Tablas: filas y columnas alineadas, con una fila de encabezados.
 * Si el PDF no es ninguna de las dos, devuelve null y se pide ayuda de Claude o un Excel.
 */

const MAX_ROWS = 5000;

interface Item {
  s: string;
  x: number;
  y: number;
  w: number;
  h: number;
  page: number;
}
interface Line {
  y: number;
  page: number;
  items: Item[];
  text: string;
}

const median = (xs: number[]) => {
  const a = [...xs].sort((p, q) => p - q);
  return a.length ? a[Math.floor(a.length / 2)] : 0;
};
const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
const hasLetters = (s: string) => /\p{L}{3,}/u.test(s);

export async function readPdfItems(data: Uint8Array): Promise<{ items: Item[]; pages: number }> {
  const pdf = await getDocumentProxy(data);
  const items: Item[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    for (const it of tc.items as Array<{ str?: string; transform?: number[]; width?: number; height?: number }>) {
      const s = (it.str ?? "").replace(/\s+/g, " ").trim();
      if (!s || !it.transform) continue;
      items.push({ s, x: it.transform[4], y: it.transform[5], w: it.width ?? 0, h: it.height ?? Math.abs(it.transform[3]) ?? 10, page: p });
    }
  }
  return { items, pages: pdf.numPages };
}

/** Agrupa fragmentos con la misma altura en líneas, de izquierda a derecha. */
function toLines(items: Item[], tol = 2.5): Line[] {
  const sorted = [...items].sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x);
  const lines: Line[] = [];
  for (const it of sorted) {
    const last = lines[lines.length - 1];
    if (last && last.page === it.page && Math.abs(last.y - it.y) <= tol) last.items.push(it);
    else lines.push({ y: it.y, page: it.page, items: [it], text: "" });
  }
  for (const l of lines) {
    l.items.sort((a, b) => a.x - b.x);
    l.text = l.items.map((i) => i.s).join(" ");
  }
  return lines;
}

// ───────────────────────── fichas ─────────────────────────

const LABEL_MAX_WORDS = 4;
const labelCandidate = (text: string): { label: string; inline?: string } | null => {
  const m = text.match(/^([^:]{2,32}):\s*(.*)$/);
  if (m && !/https?$/i.test(m[1]) && m[1].split(/\s+/).length <= LABEL_MAX_WORDS) return { label: m[1].trim(), inline: m[2].trim() };
  const t = text.trim();
  if (t.length <= 32 && t.split(/\s+/).length <= LABEL_MAX_WORDS && !/[.@\d]|https?|www/i.test(t) && hasLetters(t)) return { label: t };
  return null;
};

interface Card {
  name: string;
  page: number;
  y: number;
  lines: Line[];
}

function findCards(items: Item[]): { cards: Card[]; headings: { text: string; page: number; y: number }[] } | null {
  const bodyH = median(items.map((i) => i.h));
  const big = bodyH * 1.3;
  const cards: Card[] = [];
  const headings: { text: string; page: number; y: number }[] = [];
  const pages = [...new Set(items.map((i) => i.page))];

  for (const page of pages) {
    const its = items.filter((i) => i.page === page);
    const bigItems = its.filter((i) => i.h >= big && hasLetters(i.s)).sort((a, b) => b.y - a.y);
    // Un título puede ocupar varias líneas: se unen las contiguas con el mismo margen.
    const titles: Item[] = [];
    for (const it of bigItems) {
      const prev = titles.find((t) => Math.abs(t.x - it.x) <= 4 && t.y - it.y > 0 && t.y - it.y <= t.h * 1.7);
      if (prev) {
        prev.s += ` ${it.s}`;
        prev.y = it.y;
      } else titles.push({ ...it });
    }
    const body = its.filter((i) => i.h < big || !hasLetters(i.s));
    for (const t of titles) {
      const below = titles.filter((o) => o !== t && Math.abs(o.x - t.x) <= 12 && o.y < t.y - 1).sort((a, b) => b.y - a.y)[0];
      const floor = below ? below.y : -Infinity;
      const members = body.filter((i) => Math.abs(i.x - t.x) <= 12 && i.y < t.y + 1 && i.y > floor - 0.5);
      cards.push({ name: t.s, page, y: t.y, lines: toLines(members) });
    }
  }
  if (cards.length < 2) return null;

  // Etiquetas: textos cortos que se repiten en muchas fichas.
  const count = new Map<string, number>();
  for (const c of cards) {
    const seen = new Set<string>();
    for (const l of c.lines) {
      const cand = labelCandidate(l.text);
      if (cand) seen.add(norm(cand.label));
    }
    for (const k of seen) count.set(k, (count.get(k) ?? 0) + 1);
  }
  const minCount = Math.max(3, Math.ceil(cards.length * 0.25));
  const labels = new Set([...count].filter(([, n]) => n >= minCount).map(([k]) => k));
  if (labels.size < 2) return null;

  const real: Card[] = [];
  for (const c of cards) {
    const hit = c.lines.some((l) => {
      const cand = labelCandidate(l.text);
      return cand && labels.has(norm(cand.label));
    });
    if (hit) real.push(c);
    else if (hasLetters(c.name) && c.lines.length === 0) headings.push({ text: c.name, page: c.page, y: c.y });
  }
  if (real.length < 2) return null;
  return { cards: real, headings };
}

function cardsToSheet(items: Item[], found: NonNullable<ReturnType<typeof findCards>>): ParsedSheet {
  const { cards, headings } = found;
  // Se vuelve a calcular el conjunto de etiquetas con la misma regla.
  const count = new Map<string, { n: number; label: string }>();
  for (const c of cards) {
    const seen = new Set<string>();
    for (const l of c.lines) {
      const cand = labelCandidate(l.text);
      if (!cand) continue;
      const k = norm(cand.label);
      if (seen.has(k)) continue;
      seen.add(k);
      const cur = count.get(k);
      count.set(k, { n: (cur?.n ?? 0) + 1, label: cur?.label ?? cand.label });
    }
  }
  const minCount = Math.max(3, Math.ceil(cards.length * 0.25));
  const labelOrder = [...count].filter(([, v]) => v.n >= minCount).sort((a, b) => b[1].n - a[1].n);
  const labelKeys = new Set(labelOrder.map(([k]) => k));
  const headers = ["Nombre", "Descripción", ...labelOrder.map(([, v]) => v.label)];
  const hasSection = headings.length > 0;
  if (hasSection) headers.push("Categoría");
  headers.push("Página del PDF");

  const sectionFor = (page: number, y: number) => {
    const onPage = headings.filter((h) => h.page === page);
    if (onPage.length) {
      const above = onPage.filter((h) => h.y >= y).sort((a, b) => a.y - b.y)[0];
      return (above ?? onPage.sort((a, b) => b.y - a.y)[0]).text;
    }
    const before = headings.filter((h) => h.page < page).sort((a, b) => b.page - a.page || a.y - b.y)[0];
    return before?.text ?? "";
  };
  const labelName = new Map(labelOrder.map(([k, v]) => [k, v.label]));
  const sentence = (s: string) => (s === s.toUpperCase() ? s.charAt(0) + s.slice(1).toLowerCase() : s);

  const rows = cards
    .sort((a, b) => a.page - b.page || b.y - a.y)
    .map((c) => {
      const row: Record<string, string> = Object.fromEntries(headers.map((h) => [h, ""]));
      row["Nombre"] = c.name;
      const desc: string[] = [];
      let cur: string | null = null;
      for (const l of c.lines) {
        const cand = labelCandidate(l.text);
        const k = cand ? norm(cand.label) : null;
        if (cand && k && labelKeys.has(k)) {
          cur = labelName.get(k)!;
          if (cand.inline) row[cur] = [row[cur], cand.inline].filter(Boolean).join(" ");
          continue;
        }
        if (cur) row[cur] = [row[cur], l.text].filter(Boolean).join(" ");
        else desc.push(l.text);
      }
      row["Descripción"] = desc.join(" ");
      if (hasSection) row["Categoría"] = sentence(sectionFor(c.page, c.y));
      row["Página del PDF"] = String(c.page);
      return row;
    });
  void items;
  return { name: "Fichas", headers, rows: rows.slice(0, MAX_ROWS), totalRows: rows.length };
}

// ───────────────────────── tablas ─────────────────────────

interface Cell {
  x: number;
  text: string;
}
function cellsOf(line: Line): Cell[] {
  const cells: Cell[] = [];
  for (const it of line.items) {
    const last = cells[cells.length - 1];
    const prev = last ? line.items[line.items.indexOf(it) - 1] : null;
    if (last && prev && it.x - (prev.x + prev.w) < Math.max(4, it.h * 0.7)) last.text += ` ${it.s}`;
    else cells.push({ x: it.x, text: it.s });
  }
  return cells;
}

function findTables(items: Item[]): ParsedSheet[] {
  const lines = toLines(items);
  const sheets: ParsedSheet[] = [];
  let anchors: number[] | null = null;
  let headers: string[] = [];
  let rows: string[][] = [];
  let lastPage = -1;

  const flush = () => {
    if (anchors && rows.length >= 3 && headers.length >= 3) {
      const key = headers.map(norm).join("|");
      const existing = sheets.find((s) => s.headers.map(norm).join("|") === key);
      const objs = rows.map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? "").trim()])));
      if (existing) {
        existing.rows.push(...objs);
        existing.totalRows += objs.length;
      } else sheets.push({ name: `Tabla ${sheets.length + 1}`, headers, rows: objs, totalRows: objs.length });
    }
    anchors = null;
    headers = [];
    rows = [];
  };

  const nearest = (x: number) => {
    let best = 0;
    anchors!.forEach((a, i) => {
      if (Math.abs(a - x) < Math.abs(anchors![best] - x)) best = i;
    });
    return best;
  };

  for (const line of lines) {
    const cells = cellsOf(line);
    if (lastPage !== line.page) {
      lastPage = line.page;
    }
    if (!anchors) {
      // Una fila con 3+ celdas y texto de encabezado abre una tabla.
      if (cells.length >= 3 && cells.every((c) => hasLetters(c.text) || c.text.length <= 12)) {
        anchors = cells.map((c) => c.x);
        const used = new Map<string, number>();
        headers = cells.map((c, i) => {
          const base = c.text || `Columna ${i + 1}`;
          const n = (used.get(base) ?? 0) + 1;
          used.set(base, n);
          return n > 1 ? `${base} (${n})` : base;
        });
      }
      continue;
    }
    // Encabezado repetido en la página siguiente.
    if (cells.length === headers.length && cells.every((c, i) => norm(c.text) === norm(headers[i].replace(/ \(\d+\)$/, "")))) continue;
    // Fuera de la tabla: líneas sueltas de una sola celda lejos de las columnas, o salto de página sin tabla.
    const fits = cells.filter((c) => anchors!.some((a) => Math.abs(a - c.x) < 14)).length;
    if (cells.length >= 2 && fits >= Math.min(2, cells.length) && fits >= cells.length * 0.6) {
      const row: string[] = Array(headers.length).fill("");
      for (const c of cells) {
        const i = nearest(c.x);
        row[i] = row[i] ? `${row[i]} ${c.text}` : c.text;
      }
      rows.push(row);
    } else if (cells.length === 1 && rows.length && Math.abs(cells[0].x - anchors[nearest(cells[0].x)]) < 14 && line.page === lastPage) {
      // Continuación de una celda que ocupó varias líneas.
      const i = nearest(cells[0].x);
      const r = rows[rows.length - 1];
      r[i] = r[i] ? `${r[i]} ${cells[0].text}` : cells[0].text;
    } else {
      flush();
      // La línea puede ser el encabezado de otra tabla.
      if (cells.length >= 3) {
        anchors = cells.map((c) => c.x);
        headers = cells.map((c, i) => c.text || `Columna ${i + 1}`);
      }
    }
  }
  flush();
  return sheets;
}

// ───────────────────────── entrada ─────────────────────────

export interface PdfReadResult {
  file: ParsedFile;
  kind: "fichas" | "tablas";
  pages: number;
}

/** null si el PDF no tiene una estructura reconocible. */
export async function heuristicPdf(data: Uint8Array, filename: string): Promise<PdfReadResult | null> {
  const { items, pages } = await readPdfItems(data);
  if (items.length < 10) return null; // sin texto (escaneado)

  const cards = findCards(items);
  if (cards) {
    const sheet = cardsToSheet(items, cards);
    if (sheet.rows.length >= 2) return { file: { filename, sheets: [sheet] }, kind: "fichas", pages };
  }
  const tables = findTables(items);
  if (tables.length) return { file: { filename, sheets: tables }, kind: "tablas", pages };
  return null;
}
