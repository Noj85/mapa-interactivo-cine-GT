import "server-only";
import { createHash, randomBytes, randomInt, scryptSync, timingSafeEqual } from "node:crypto";
import type { SubmissionKind } from "@/lib/types";

/** Días de vigencia que se ofrecen al crear una solicitud. */
export const REQUEST_DAYS = [15, 30, 60] as const;
export const DEFAULT_REQUEST_DAYS = 30;

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

const dateEs = (iso: string) =>
  new Intl.DateTimeFormat("es-GT", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Guatemala" }).format(new Date(iso));

export interface RequestMessageInput {
  kind: SubmissionKind;
  title: string;
  year?: number | null;
  link: string;
  /** La clave de acceso (5 caracteres). */
  password: string;
  expiresAt: string;
  missing: string[];
  recipient?: string | null;
}

/**
 * Mensaje listo para pegar en WhatsApp o en un correo. Texto plano, sin formato propio de WhatsApp,
 * para que se vea igual en los dos. Breve y cordial; deja claro quién escribe (PROCINE, proyecto que
 * ejecuta la Academia) y no incluye la dirección del mapa: solo el enlace privado.
 */
export function buildRequestMessage(i: RequestMessageInput): { subject: string; body: string } {
  const isFilm = i.kind === "film";
  const label = isFilm ? `«${i.title}»${i.year ? ` (${i.year})` : ""}` : `«${i.title}»`;
  const what = isFilm ? "la producción" : "la entidad";
  const greeting = i.recipient?.trim() ? `Hola, ${i.recipient.trim()}.` : "Hola.";
  const missing = i.missing.length
    ? `Nos falta o necesitamos confirmar: ${i.missing.join(", ")}.`
    : "Le pedimos revisar la información que tenemos y completar lo que haga falta.";
  const subject = `Solicitud de información: ${label} · PROCINE`;
  const body = [
    greeting,
    "",
    `Le escribimos desde PROCINE, proyecto de fortalecimiento del sector cinematográfico de Guatemala que ejecuta la Academia de Cine de Guatemala. Como parte de su eje de investigación estamos documentando el cine nacional en el Mapa del Cine de Guatemala, y queremos incluir correctamente ${what} ${label}.`,
    "",
    missing,
    "",
    "¿Nos ayuda a completarla? Es solo un formulario breve:",
    `Enlace privado: ${i.link}`,
    `Clave: ${i.password}`,
    "",
    `Es solo para ${what} ${label} y es válido hasta el ${dateEs(i.expiresAt)}. Revisamos toda la información antes de publicarla. Si tiene dudas, puede responder a este mensaje.`,
    "",
    "Muchas gracias.",
    "PROCINE · Academia de Cine de Guatemala",
  ].join("\n");
  return { subject, body };
}
