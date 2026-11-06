import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const nf = new Intl.NumberFormat("es-GT");
export const fmtInt = (n: number | null | undefined) => (n == null ? "—" : nf.format(Math.round(n)));

export function fmtMoney(n: number | null | undefined, currency = "GTQ") {
  if (n == null) return "—";
  const sym = currency === "USD" ? "US$" : "Q";
  if (Math.abs(n) >= 1_000_000) return `${sym} ${(n / 1_000_000).toFixed(1).replace(".0", "")} M`;
  if (Math.abs(n) >= 1_000) return `${sym} ${(n / 1_000).toFixed(0)} mil`;
  return `${sym} ${nf.format(n)}`;
}

/** Los títulos de producciones se guardan y se muestran siempre en mayúsculas (con acentos: «ÚLTIMO»). */
export function upperTitle(s: string | null | undefined): string {
  return (s ?? "").replace(/\s+/g, " ").trim().toLocaleUpperCase("es");
}

/** Quita acentos, minúsculas y espacios extra: base de toda búsqueda. */
export function normalize(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function slugify(s: string) {
  return normalize(s).replace(/\s+/g, "-").slice(0, 80);
}
