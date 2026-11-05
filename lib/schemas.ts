import { formatContact, parseContact } from "@/lib/contact";
import { z } from "zod";
import { MAX_CATEGORIES, normalizeCategories } from "@/lib/categories";
import { isOwnImageUrl } from "@/lib/poster-url";
import { CIRC_CATEGORIES, IND_CATEGORIES } from "@/lib/types";

const optStr = z
  .string()
  .trim()
  .max(2000)
  .nullish()
  .transform((v) => (v ? v : null));
const optNum = z
  .union([z.number(), z.string()])
  .nullish()
  .transform((v) => {
    if (v === null || v === undefined || v === "") return null;
    const n = typeof v === "number" ? v : Number(String(v).replace(/[^0-9.\-]/g, ""));
    return Number.isFinite(n) ? n : null;
  });

/** Contacto de una entidad: teléfono y/o correo, guardado en formato estándar. Cualquier otra cosa se rechaza. */
function contactField(strip = false) {
  return z
    .string()
    .max(600)
    .nullish()
    .transform((v, ctx) => {
      const t = (strip ? clean(v ?? "") : (v ?? "")).trim();
      if (!t) return null;
      const p = parseContact(t);
      const value = formatContact(p);
      if (!value) {
        ctx.addIssue({ code: "custom", message: "El contacto debe ser un teléfono (por ejemplo +502 5555 1234) o un correo válido." });
        return z.NEVER;
      }
      return value;
    });
}

export const locationSchema = z.object({
  id: z.string().optional(),
  depto_ine: optNum,
  muni_ine: optNum,
  site: optStr,
  lat: optNum,
  lng: optNum,
  days: optNum,
  local_spend: optNum,
  jobs: optNum,
  confidence: z.number().min(0).max(1).nullish(),
});

export const filmSchema = z.object({
  id: z.string().optional(),
  title: z.string().trim().min(1, "El título es obligatorio").max(300),
  year: optNum,
  kind: z.enum(["ficcion", "documental", "serie", "comercial", "corto", "otro"]).nullish(),
  director: optStr,
  producer: optStr,
  nationality: z.enum(["guatemalteca", "coproduccion", "extranjera"]).nullish(),
  budget: optNum,
  currency: z.enum(["GTQ", "USD"]).default("GTQ"),
  synopsis: optStr,
  poster_url: optStr,
  status: z.enum(["draft", "published"]).default("draft"),
  source: optStr,
  locations: z.array(locationSchema).max(60).default([]),
});

export const ALL_ORG_CATEGORIES = [...CIRC_CATEGORIES, ...IND_CATEGORIES] as const;

/** Una o varias categorías: `categories` manda; `category` queda como la principal. Al menos una. */
function withCategories<T extends { category?: string | null; categories?: string[] | null }>(o: T, ctx: z.RefinementCtx) {
  const categories = normalizeCategories(o.categories, o.category);
  if (!categories.length) ctx.addIssue({ code: "custom", message: "Elige al menos una categoría.", path: ["categories"] });
  return { ...o, category: categories[0] ?? "", categories };
}

export const orgSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "El nombre es obligatorio").max(300),
  layer: z.enum(["circulacion", "industria"]),
  category: z.string().trim().max(120).nullish(),
  categories: z.array(z.string().trim().max(120)).max(MAX_CATEGORIES * 2).nullish(),
  initiative_type: z.enum(["publica", "privada", "comunitaria", "transnacional"]).nullish(),
  depto_ine: optNum,
  muni_ine: optNum,
  city: optStr,
  lat: optNum,
  lng: optNum,
  web: optStr,
  instagram: optStr,
  contact: contactField(),
  description: optStr,
  logo_url: optStr,
  status: z.enum(["draft", "published"]).default("draft"),
  source: optStr,
}).transform(withCategories);

// ───────────────────────── aportes del público ─────────────────────────

const clean = (v: string) =>
  // quita caracteres de control y marcas HTML sueltas
  v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").replace(/<[^>]*>/g, "");

const pubStr = (max: number) =>
  z
    .string()
    .max(max * 2)
    .nullish()
    .transform((v) => {
      const t = v ? clean(v).trim().slice(0, max) : "";
      return t ? t : null;
    });

const pubUrl = z
  .string()
  .max(300)
  .nullish()
  .transform((v) => {
    const t = (v ?? "").trim();
    return t ? t : null;
  })
  .refine(
    (v) =>
      v === null ||
      (/^(https?:\/\/)?[^\s<>"']+\.[^\s<>"']+$/i.test(v) && (/^https?:\/\//i.test(v) || !/^[a-z][a-z0-9+.-]*:/i.test(v))),
    "El enlace no parece válido",
  );

/**
 * Imagen de un aporte: solo se acepta si ya está en nuestro almacenamiento (la subió el endpoint público,
 * que la valida y re-codifica, y nombra sus archivos con el prefijo `ap-`). Cualquier otro enlace se descarta en
 * silencio, incluida la imagen que ya tiene el registro al corregirlo (null = «no cambiar»): así nadie puede hacer que el
 * mapa cargue imágenes de sitios ajenos ni reutilizar archivos del equipo.
 */
const pubImage = z
  .string()
  .max(400)
  .nullish()
  .transform((v) => {
    const t = (v ?? "").trim();
    return t && isOwnImageUrl(t) && /\/ap-[A-Za-z0-9-]+\.webp$/.test(t) && !/-thumb\.webp$/.test(t) ? t : null;
  });

const pubLocation = z.object({
  depto_ine: optNum,
  muni_ine: optNum,
  site: pubStr(200),
  lat: optNum,
  lng: optNum,
  days: optNum,
  local_spend: optNum,
  jobs: optNum,
});

/** Producción propuesta por el público: sin estado ni fuente (los fija el equipo); el póster solo si lo subió por nuestro endpoint. */
export const publicFilmSchema = z.object({
  title: z.string().trim().min(1, "El título es obligatorio").max(300).transform(clean),
  year: optNum,
  kind: z.enum(["ficcion", "documental", "serie", "comercial", "corto", "otro"]).nullish(),
  director: pubStr(300),
  producer: pubStr(300),
  nationality: z.enum(["guatemalteca", "coproduccion", "extranjera"]).nullish(),
  budget: optNum,
  currency: z.enum(["GTQ", "USD"]).default("GTQ"),
  synopsis: pubStr(2000),
  poster_url: pubImage,
  locations: z.array(pubLocation).max(20).default([]),
});

export const publicOrgSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio").max(300).transform(clean),
  layer: z.enum(["circulacion", "industria"]),
  category: z.string().trim().max(120).nullish(),
  categories: z.array(z.string().trim().max(120)).max(MAX_CATEGORIES * 2).nullish(),
  initiative_type: z.enum(["publica", "privada", "comunitaria", "transnacional"]).nullish(),
  depto_ine: optNum,
  muni_ine: optNum,
  city: pubStr(200),
  lat: optNum,
  lng: optNum,
  web: pubUrl,
  instagram: pubStr(100),
  contact: contactField(true),
  description: pubStr(2000),
  logo_url: pubImage,
}).transform(withCategories);

export const submissionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("film"), data: publicFilmSchema }),
  z.object({ kind: z.literal("org"), data: publicOrgSchema }),
]);

export const submissionMetaSchema = z.object({
  target_id: z.string().max(80).nullish(),
  /** Fuente de la información: obligatoria, para que la curaduría pueda corroborar. */
  note: z
    .string({ error: "Indica la fuente de la información." })
    .max(3000)
    .transform((v) => clean(v).trim().slice(0, 1500))
    .refine((v) => v.length >= 8, "Indica la fuente de la información (un enlace, un catálogo o cómo lo sabes)."),
  /** Correo de quien aporta: obligatorio, para aclarar dudas. No se publica. */
  contact: z
    .string({ error: "Escribe tu correo." })
    .max(200)
    .transform((v) => v.trim().toLowerCase())
    .refine((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "El correo no parece válido."),
  // anti-spam: campo trampa (debe venir vacío) y momento en que se abrió el formulario
  website_url_hp: z.string().max(200).nullish(),
  opened_at: z.number().nullish(),
});
