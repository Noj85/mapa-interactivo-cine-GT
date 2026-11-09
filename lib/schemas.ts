import { formatContact, parseContact } from "@/lib/contact";
import { parseLooseNumber } from "@/lib/numbers";
import { z } from "zod";
import { MAX_CATEGORIES, normalizeCategories } from "@/lib/categories";
import { isOwnImageUrl } from "@/lib/poster-url";
import { CIRC_CATEGORIES, IND_CATEGORIES } from "@/lib/types";
import { cleanGenres, FORMATS, NATURES } from "@/lib/film-types";
import { cleanCrew, cleanLanguages } from "@/lib/crew";
import { cleanCredits, cleanPersonRoles, MAX_BIO, MAX_PERSON_ROLES } from "@/lib/people";
import { upperTitle } from "@/lib/utils";

const FORMAT_VALUES = FORMATS.map((f) => f.id) as [string, ...string[]];
const NATURE_VALUES = NATURES.map((n) => n.id) as [string, ...string[]];
/** Géneros: estándar o propios; sin repetidos y con el máximo permitido. */
const genresSchema = z
  .array(z.string().max(120))
  .max(40)
  .transform((list) => cleanGenres(list.map((g) => clean(g))));

/** Idiomas: estándar o propios; sin repetidos y con el máximo permitido. */
const languagesSchema = z
  .array(z.string().max(120))
  .max(40)
  .transform((list) => cleanLanguages(list.map((g) => clean(g))));

/** Equipo extra y reparto: roles válidos, nombres limpios y máximos del catálogo. */
const crewSchema = z
  .array(z.object({ role: z.string().max(60).nullish(), name: z.string().max(600).nullish(), detail: z.string().max(300).nullish() }))
  .max(120)
  .transform((list) => cleanCrew(list.map((m) => ({ role: m.role, name: clean(m.name ?? ""), detail: clean(m.detail ?? "") }))));

const optStr = z
  .string()
  .trim()
  .max(2000)
  .nullish()
  .transform((v) => (v ? v : null));
/** Enlace de video (tráiler o película): http o https; sin esquema se asume https. */
const videoUrl = z
  .string()
  .trim()
  .max(500)
  .nullish()
  .transform((v, ctx) => {
    const t = (v ?? "").trim();
    if (!t) return null;
    const withScheme = /^https?:\/\//i.test(t) ? t : /^[a-z][a-z0-9+.-]*:/i.test(t) ? "" : `https://${t}`;
    try {
      const u = new URL(withScheme);
      if (!/^https?:$/.test(u.protocol) || !u.hostname.includes(".")) throw new Error();
      return u.toString();
    } catch {
      ctx.addIssue({ code: "custom", message: "El enlace del video no parece válido." });
      return z.NEVER;
    }
  });

const optNum = z
  .union([z.number(), z.string()])
  .nullish()
  .transform((v) => parseLooseNumber(v));

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
  country: optStr,
  city: optStr,
  site: optStr,
  lat: optNum,
  lng: optNum,
  days: optNum,
  local_spend: optNum,
  jobs: optNum,
  confidence: z.number().min(0).max(1).nullish(),
});

const festivalResult = z.enum(["seleccion", "nominacion", "premio", "mencion", "proyeccion"]);

export const festivalEntrySchema = z.object({
  id: z.string().optional(),
  festival_id: z.string().max(80).nullish(),
  name: z.string().trim().min(1, "Escribe el nombre del festival").max(300),
  year: optNum,
  country: optStr,
  city: optStr,
  result: festivalResult.default("seleccion"),
  section: optStr,
  award: optStr,
  url: optStr,
});

/** Un festival del catálogo (alta o edición en el admin). */
export const festivalSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "El nombre es obligatorio").max(300),
  aliases: z.array(z.string().trim().max(300)).max(30).default([]),
  country: optStr,
  city: optStr,
  founded: optNum,
});

export const companyEntrySchema = z.object({
  name: z.string().trim().min(1, "Escribe el nombre de la casa productora").max(300),
  country: optStr,
});

export const filmSchema = z.object({
  id: z.string().optional(),
  title: z.string().trim().min(1, "El título es obligatorio").max(300).transform(upperTitle),
  year: optNum,
  format: z.enum(FORMAT_VALUES).nullish(),
  nature: z.enum(NATURE_VALUES).nullish(),
  genres: genresSchema.optional(),
  duration_min: optNum,
  languages: languagesSchema.optional(),
  director: optStr,
  producer: optStr,
  cinematographer: optStr,
  screenwriter: optStr,
  /** Equipo extra y reparto. Sin este campo se conserva el actual. */
  crew: crewSchema.optional(),
  nationality: z.enum(["guatemalteca", "coproduccion", "extranjera"]).nullish(),
  budget: optNum,
  currency: z.enum(["GTQ", "USD"]).default("GTQ"),
  synopsis: optStr,
  poster_url: optStr,
  trailer_url: videoUrl,
  trailer_thumb: optStr,
  film_url: videoUrl,
  film_thumb: optStr,
  status: z.enum(["draft", "published"]).default("draft"),
  source: optStr,
  locations: z.array(locationSchema).max(60).default([]),
  /** Sin este campo se conservan los festivales actuales. */
  festivals: z.array(festivalEntrySchema).max(80).optional(),
  /** Sin este campo se conservan las casas productoras actuales. */
  companies: z.array(companyEntrySchema).max(40).optional(),
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

const personCreditSchema = z.object({
  title: z.string().trim().min(1).max(200),
  year: optNum,
  role: optStr,
});

const personFields = {
  id: z.string().optional(),
  name: z.string().trim().min(1, "El nombre es obligatorio").max(300),
  roles: z.array(z.string().max(80)).max(MAX_PERSON_ROLES * 2).optional().transform((list) => cleanPersonRoles(list ?? [])),
  other_role: optStr,
  depto_ine: optNum,
  muni_ine: optNum,
  languages: languagesSchema.optional(),
  bio: z.string().trim().max(MAX_BIO * 2).nullish().transform((v) => {
    const t = (v ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_BIO);
    return t || null;
  }),
  web: optStr,
  instagram: optStr,
  imdb: optStr,
  portfolio: optStr,
  public_email: optStr,
  public_phone: optStr,
  photo_url: optStr,
  credits: z.array(personCreditSchema).max(20).optional().transform((list) => cleanCredits(list ?? [])),
  status: z.enum(["draft", "published"]).default("draft"),
  source: optStr,
};

function withPersonRole(p: { roles?: string[]; other_role?: string | null }, ctx: z.RefinementCtx) {
  if (!(p.roles?.length) && !p.other_role?.trim()) {
    ctx.addIssue({ code: "custom", message: "Elige al menos un oficio.", path: ["roles"] });
  }
}

/** Alta o edición de una persona en el admin. */
export const personSchema = z.object(personFields).superRefine(withPersonRole);

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
  country: pubStr(100),
  city: pubStr(150),
  site: pubStr(200),
  lat: optNum,
  lng: optNum,
  days: optNum,
  local_spend: optNum,
  jobs: optNum,
});

const pubFestival = z.object({
  festival_id: z.string().max(80).nullish(),
  name: z.string().max(600).transform((v) => clean(v).trim().slice(0, 300)).refine((v) => v.length > 0, "Escribe el nombre del festival"),
  year: optNum,
  country: pubStr(100),
  city: pubStr(150),
  result: festivalResult.default("seleccion"),
  section: pubStr(200),
  award: pubStr(200),
  url: pubUrl,
});

const pubCompany = z.object({
  name: z.string().max(600).transform((v) => clean(v).trim().slice(0, 300)).refine((v) => v.length > 0, "Escribe el nombre de la casa productora"),
  country: pubStr(100),
});

/** Producción propuesta por el público: sin estado ni fuente (los fija el equipo); el póster solo si lo subió por nuestro endpoint. */
export const publicFilmSchema = z.object({
  title: z.string().trim().min(1, "El título es obligatorio").max(300).transform((v) => upperTitle(clean(v))),
  year: optNum,
  format: z.enum(FORMAT_VALUES).nullish(),
  nature: z.enum(NATURE_VALUES).nullish(),
  genres: genresSchema.optional(),
  duration_min: optNum,
  languages: languagesSchema.optional(),
  director: pubStr(300),
  producer: pubStr(300),
  cinematographer: pubStr(300),
  screenwriter: pubStr(300),
  crew: crewSchema.optional(),
  nationality: z.enum(["guatemalteca", "coproduccion", "extranjera"]).nullish(),
  budget: optNum,
  currency: z.enum(["GTQ", "USD"]).default("GTQ"),
  synopsis: pubStr(2000),
  poster_url: pubImage,
  trailer_url: videoUrl,
  trailer_thumb: pubImage,
  film_url: videoUrl,
  film_thumb: pubImage,
  locations: z.array(pubLocation).max(20).default([]),
  festivals: z.array(pubFestival).max(40).optional(),
  companies: z.array(pubCompany).max(20).optional(),
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

/** Registro de una persona desde el formulario público. El consentimiento no se guarda: sin él no se acepta el aporte. */
export const publicPersonSchema = z
  .object({
    name: z.string().trim().min(1, "El nombre es obligatorio").max(300).transform(clean),
    roles: z.array(z.string().max(80)).max(MAX_PERSON_ROLES * 2).default([]).transform((list) => cleanPersonRoles(list)),
    other_role: pubStr(120),
    depto_ine: optNum,
    muni_ine: optNum,
    languages: languagesSchema.optional(),
    bio: pubStr(MAX_BIO),
    web: pubUrl,
    instagram: pubStr(100),
    imdb: pubUrl,
    portfolio: pubUrl,
    public_email: z
      .string()
      .max(200)
      .nullish()
      .transform((v) => {
        const t = (v ?? "").trim().toLowerCase();
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t) ? t : null;
      }),
    public_phone: pubStr(40),
    photo_url: pubImage,
    credits: z
      .array(
        z.object({
          title: z.string().max(400).transform((v) => clean(v).trim().slice(0, 200)),
          year: optNum,
          role: pubStr(120),
        }),
      )
      .max(12)
      .optional()
      .transform((list) => cleanCredits((list ?? []).filter((c) => c.title))),
    consent: z.literal(true, { error: "Autoriza la publicación para continuar." }),
  })
  .superRefine((p, ctx) => {
    if (!p.roles.length && !p.other_role) ctx.addIssue({ code: "custom", message: "Elige al menos un oficio.", path: ["roles"] });
  });

export const submissionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("film"), data: publicFilmSchema }),
  z.object({ kind: z.literal("org"), data: publicOrgSchema }),
  z.object({ kind: z.literal("person"), data: publicPersonSchema }),
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
