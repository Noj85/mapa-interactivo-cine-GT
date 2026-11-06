import "server-only";
import { createHash, randomBytes, randomInt, scryptSync, timingSafeEqual } from "node:crypto";
import type { SubmissionKind } from "@/lib/types";

/** Los enlaces duran siempre 30 días; después hay que pedir uno nuevo. */
export const REQUEST_DAYS = 30;

/** Enlace secreto: 24 bytes aleatorios en base64url (imposible de adivinar). */
export const generateToken = () => randomBytes(24).toString("base64url");

/** Letras y números sin caracteres que se confunden al dictar o copiar (sin 0/o ni 1/l/i). */
const KEY_CHARS = "abcdefghjkmnpqrstuvwxyz23456789";

/** Clave corta de 5 caracteres alfanuméricos, fácil de dictar: «k7m3x». Se compara sin distinguir mayúsculas. */
export function generatePassword() {
  let key = "";
  for (let n = 0; n < 5; n++) key += KEY_CHARS[randomInt(KEY_CHARS.length)];
  return key;
}

/** El enlace nunca se guarda: solo su huella. */
export const hashToken = (token: string) => createHash("sha256").update(token.trim()).digest("hex");

/** Las contraseñas se comparan sin distinguir mayúsculas ni espacios sobrantes. */
export const normPassword = (p: string) => p.trim().toLowerCase();

/** Solo para el almacén local (en Supabase la contraseña se guarda con bcrypt dentro de la base). */
export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}$${scryptSync(normPassword(password), salt, 32).toString("hex")}`;
}

export function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split("$");
  if (!salt || !hash) return false;
  const a = Buffer.from(scryptSync(normPassword(password), salt, 32).toString("hex"));
  const b = Buffer.from(hash);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const addDays = (days: number, from = new Date()) => new Date(from.getTime() + days * 86_400_000).toISOString();

export interface RequestMessageInput {
  kind: SubmissionKind;
  title: string;
  year?: number | null;
  link: string;
  /** La clave de acceso (5 caracteres). */
  password: string;
  recipient?: string | null;
  /** Varias producciones en un mismo enlace (incluye la principal). Con una sola, se usa `title` y `year`. */
  films?: { title: string; year?: number | null }[];
}

/** Hasta cuántos títulos se listan en un mensaje consolidado. */
const MAX_LISTED = 6;

/**
 * Mensaje listo para pegar en WhatsApp o en un correo. Texto plano, de tú y corto. Deja claro quién
 * escribe (PROCINE, proyecto que ejecuta la Academia) y no incluye la dirección del mapa: solo el
 * enlace privado, solo en su línea (para que WhatsApp lo reconozca), y la clave aparte. No menciona la
 * vigencia: si el enlace venció, la página lo explica.
 */
export function buildRequestMessage(i: RequestMessageInput): { subject: string; body: string } {
  const isFilm = i.kind === "film";
  const films = i.films && i.films.length > 1 ? i.films : null;
  const label = (t: string, y?: number | null) => `«${t}»${isFilm && y ? ` (${y})` : ""}`;
  const greeting = i.recipient?.trim() ? `Hola, ${i.recipient.trim()}.` : "Hola.";

  let ask: string;
  let subject: string;
  if (films) {
    const shown = films.slice(0, MAX_LISTED).map((f) => `• ${label(f.title, f.year)}`);
    if (films.length > MAX_LISTED) shown.push(`• y ${films.length - MAX_LISTED} más`);
    ask = `¿Nos ayudas a completar la información de tus ${films.length} producciones?\n${shown.join("\n")}`;
    subject = "Información de tus producciones · PROCINE";
  } else {
    ask = `¿Nos ayudas a completar la información de ${isFilm ? "" : "la entidad "}${label(i.title, i.year)}?`;
    subject = `Información de ${label(i.title, i.year)} · PROCINE`;
  }

  const body = [
    greeting,
    "",
    `Desde PROCINE, proyecto que ejecuta la Academia de Cine de Guatemala, estamos documentando el cine nacional. ${ask}`,
    "",
    i.link,
    "",
    `Clave: ${i.password}`,
    "",
    "Revisamos todo antes de publicar. ¡Gracias!",
  ].join("\n");
  return { subject, body };
}
