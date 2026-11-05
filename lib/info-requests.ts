import "server-only";
import { createHash, randomBytes, randomInt, scryptSync, timingSafeEqual } from "node:crypto";
import type { SubmissionKind } from "@/lib/types";

/** Días de vigencia que se ofrecen al crear una solicitud. */
export const REQUEST_DAYS = [15, 30, 60] as const;
export const DEFAULT_REQUEST_DAYS = 30;
const WORDS = [
  "cine", "luz", "lente", "guion", "toma", "escena", "corte", "plano", "foco", "volcan", "lago", "selva", "maiz",
  "jade", "quetzal", "ceiba", "cacao", "tinta", "marimba", "luna", "rio", "monte", "nube", "brisa", "fuego",
  "tierra", "pino", "roble", "cobre", "plata", "alba", "ocaso", "trigo", "colibri", "tucan", "jaguar", "venado",
  "iguana", "tortuga", "lirio", "orquidea", "girasol", "bambu", "coral", "perla", "onda", "faro", "ancla",
  "velero", "puente", "torre", "arco", "camino", "sendero", "aurora", "bruma", "cumbre", "valle", "llano", "cielo",
];

/** Enlace secreto: 24 bytes aleatorios en base64url (imposible de adivinar). */
export const generateToken = () => randomBytes(24).toString("base64url");

/** Contraseña fácil de dictar: «cine-selva-4821». */
export function generatePassword() {
  const w = () => WORDS[randomInt(WORDS.length)];
  return `${w()}-${w()}-${randomInt(1000, 10000)}`;
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
  siteUrl: string;
  link: string;
  password: string;
  expiresAt: string;
  missing: string[];
  recipient?: string | null;
}

/**
 * Mensaje listo para pegar en WhatsApp o en un correo. Texto plano, sin formato propio de WhatsApp,
 * para que se vea igual en los dos. Deja claro quién escribe y que no es un mensaje al azar.
 */
export function buildRequestMessage(i: RequestMessageInput): { subject: string; body: string } {
  const isFilm = i.kind === "film";
  const label = isFilm ? `«${i.title}»${i.year ? ` (${i.year})` : ""}` : `«${i.title}»`;
  const what = isFilm ? "la producción" : "la entidad";
  const greeting = i.recipient?.trim() ? `Hola, ${i.recipient.trim()}.` : "Hola.";
  const missing = i.missing.length
    ? `Nos falta o necesitamos confirmar: ${i.missing.join(", ")}.`
    : "Le pedimos revisar la información que tenemos y completar lo que haga falta.";
  const subject = `Solicitud de información: ${label} · Mapa del Cine de Guatemala`;
  const body = [
    greeting,
    "",
    `Le escribimos del Eje de Investigación de PROCINE y la Academia de Cine de Guatemala. Estamos documentando la producción audiovisual del país en el Mapa del Cine de Guatemala (${i.siteUrl}), una herramienta pública de consulta, y queremos incluir correctamente ${what} ${label}.`,
    "",
    `Este mensaje es un contacto directo para un trabajo de investigación: le pedimos su ayuda para completar o corregir la información. ${missing}`,
    "",
    `Enlace privado: ${i.link}`,
    `Contraseña: ${i.password}`,
    "",
    `Es solo para ${what} ${label} y es válido hasta el ${dateEs(i.expiresAt)}. El equipo de PROCINE revisa toda la información antes de publicarla. Si tiene dudas, puede responder a este mensaje.`,
    "",
    "Muchas gracias por su apoyo.",
    "Eje de Investigación · PROCINE / Academia de Cine de Guatemala",
  ].join("\n");
  return { subject, body };
}
