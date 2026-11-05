/**
 * Contacto estandarizado de una entidad: un teléfono y/o un correo.
 * Se guarda en una sola columna con el formato `+502 5555 1234 · nombre@dominio.org`.
 */

const EMAIL = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9\-]+(?:\.[A-Za-z0-9\-]+)*\.[A-Za-z]{2,}/g;
const EMAIL_ONE = /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9\-]+(?:\.[A-Za-z0-9\-]+)*\.[A-Za-z]{2,}$/;
// secuencias que parecen teléfono: opcional +, dígitos con espacios, guiones, puntos o paréntesis
const PHONE_RUN = /(?:\+|00)?\s*\(?\d[\d\s().\-]{5,}\d/g;

export const CONTACT_SEP = " · ";

/** «5555-1234», «(502) 5555 1234», «+502 55551234» → «+502 5555 1234». Otro país: «+34 600123456». null si no es válido. */
export function normalizePhone(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const raw = v.trim();
  if (!raw) return null;
  const plus = raw.startsWith("+") || raw.startsWith("00");
  let d = raw.replace(/\D/g, "");
  if (raw.startsWith("00")) d = d.slice(2);
  if (!plus) {
    // sin código de país: número de Guatemala (8 dígitos), con o sin 502 delante
    if (d.length === 11 && d.startsWith("502")) d = d.slice(3);
    if (d.length !== 8) return null;
    return `+502 ${d.slice(0, 4)} ${d.slice(4)}`;
  }
  if (d.startsWith("502")) {
    const n = d.slice(3);
    return n.length === 8 ? `+502 ${n.slice(0, 4)} ${n.slice(4)}` : null;
  }
  // internacional: código de país de 1 a 3 dígitos y 6 a 12 dígitos de número
  if (d.length < 8 || d.length > 15) return null;
  const cc = d.startsWith("1") || d.startsWith("7") ? 1 : d.length > 11 ? 3 : 2;
  return `+${d.slice(0, cc)} ${d.slice(cc)}`;
}

export function normalizeEmail(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().toLowerCase();
  return t && t.length <= 200 && EMAIL_ONE.test(t) ? t : null;
}

export interface ParsedContact {
  phone: string | null;
  email: string | null;
  /** Texto que no se pudo estandarizar (nombres de personas, segundos teléfonos o correos…). */
  ignored: string[];
}

/** Saca el primer teléfono y el primer correo de un texto libre y dice qué quedó fuera. */
export function parseContact(text: unknown): ParsedContact {
  const out: ParsedContact = { phone: null, email: null, ignored: [] };
  if (typeof text !== "string" || !text.trim()) return out;
  let rest = text;

  for (const m of rest.match(EMAIL) ?? []) {
    const e = normalizeEmail(m);
    if (e && !out.email) out.email = e;
    else out.ignored.push(m);
  }
  rest = rest.replace(EMAIL, " ");

  for (const m of rest.match(PHONE_RUN) ?? []) {
    const p = normalizePhone(m);
    if (p && !out.phone) out.phone = p;
    else out.ignored.push(m.trim());
  }
  rest = rest.replace(PHONE_RUN, " ");

  const left = rest
    .split(/[·|;,\n/]+/)
    .map((x) => x.replace(/\b(tel(?:[eé]fono)?|cel(?:ular)?|m[oó]vil|whatsapp|correo|e-?mail|contacto)\b\.?:?/gi, "").trim())
    .filter((x) => /[\p{L}\d]/u.test(x));
  out.ignored.push(...left);
  return out;
}

export function formatContact(c: { phone?: string | null; email?: string | null }): string | null {
  const parts = [c.phone, c.email].filter((x): x is string => !!x);
  return parts.length ? parts.join(CONTACT_SEP) : null;
}

/** Contacto guardado (también el escrito a mano antes) → teléfono y correo para mostrar o editar. */
export const contactParts = (contact: string | null | undefined) => {
  const p = parseContact(contact);
  return { phone: p.phone, email: p.email };
};

/** Teléfono y correo escritos en el formulario → texto canónico, o el error a mostrar. */
export function contactFromFields(phone: string, email: string): { value: string | null; phoneError: string | null; emailError: string | null } {
  const p = phone.trim() ? normalizePhone(phone) : null;
  const e = email.trim() ? normalizeEmail(email) : null;
  return {
    value: formatContact({ phone: p, email: e }),
    phoneError: phone.trim() && !p ? "Escribe un teléfono válido, por ejemplo 5555 1234 o +502 5555 1234." : null,
    emailError: email.trim() && !e ? "Escribe un correo válido, por ejemplo nombre@dominio.org." : null,
  };
}
