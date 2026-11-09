/**
 * Números que llegan como texto («3 d», «2,5», «2.5») o como número.
 * Sin ningún dígito no vale: no se convierte en 0.
 */

/** Número (la coma decimal cuenta) o null. */
export function parseLooseNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let t = String(v).trim().replace(/[^\d.,\-]/g, "");
  if (!/\d/.test(t)) return null;
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d+,\d+$/.test(t)) t = t.replace(",", ".");
  else t = t.replace(/,/g, "");
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Entero no negativo, redondeado. «2.5» y «3 d» quedan en 3; un negativo o un texto sin número, en null. */
export function parseWholeNumber(v: unknown): number | null {
  const n = parseLooseNumber(v);
  if (n === null || n < 0) return null;
  return Math.round(n);
}
