import "server-only";
import { lookup } from "node:dns/promises";
import { promises as fs } from "node:fs";
import { isIP } from "node:net";
import path from "node:path";
import sharp from "sharp";
import { newId } from "@/lib/data/records";
import { supabaseConfigured } from "@/lib/supabase/env";
import { createPublicClient, createSessionClient } from "@/lib/supabase/server";

export const POSTER_MAX_BYTES = 5 * 1024 * 1024;
/** Tope de las imágenes que envía el público (más estricto que el del equipo). */
export const PUBLIC_IMAGE_MAX_BYTES = 3 * 1024 * 1024;
export const UPLOAD_DIR = path.join(process.cwd(), ".data", "uploads");

export class PosterError extends Error {}

export type ImageKind = "poster" | "logo";

/**
 * Valida que sea una imagen real y la deja en dos tamaños WebP.
 * Póster: 900 px y miniatura de 400 px sobre fondo blanco.
 * Logo: cabe en 512 px (miniatura 128 px) y conserva la transparencia.
 * Al re-codificar con sharp se descartan metadatos y cualquier contenido oculto en el archivo.
 */
export async function processImage(input: Buffer, kind: ImageKind = "poster", maxBytes = POSTER_MAX_BYTES): Promise<{ full: Buffer; thumb: Buffer }> {
  if (input.length > maxBytes) throw new PosterError(`La imagen pesa más de ${Math.round(maxBytes / 1024 / 1024)} MB.`);
  let meta;
  try {
    meta = await sharp(input, { failOn: "error" }).metadata();
  } catch {
    throw new PosterError("El archivo no es una imagen válida (usa JPG, PNG o WebP).");
  }
  if (!meta.format || !["jpeg", "png", "webp"].includes(meta.format)) {
    throw new PosterError("Formato no permitido. Usa JPG, PNG o WebP.");
  }
  const min = kind === "logo" ? 48 : 120;
  if ((meta.width ?? 0) < min || (meta.height ?? 0) < min) throw new PosterError(`La imagen es demasiado pequeña (mínimo ${min} px).`);

  if (kind === "logo") {
    const base = () => sharp(input).rotate();
    const fit = (n: number) => ({ width: n, height: n, fit: "inside" as const, withoutEnlargement: true });
    const [full, thumb] = await Promise.all([
      base().resize(fit(512)).webp({ quality: 88 }).toBuffer(),
      base().resize(fit(128)).webp({ quality: 85 }).toBuffer(),
    ]);
    return { full, thumb };
  }
  const base = () => sharp(input).rotate().flatten({ background: "#ffffff" });
  const [full, thumb] = await Promise.all([
    base().resize({ width: 900, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer(),
    base().resize({ width: 400, withoutEnlargement: true }).webp({ quality: 78 }).toBuffer(),
  ]);
  return { full, thumb };
}

export const processPoster = (input: Buffer) => processImage(input, "poster");

/**
 * Procesa y guarda una imagen. Devuelve la URL del tamaño grande.
 * - Equipo (por defecto): bucket `posters`, con la sesión del equipo.
 * - Público (`origin: "public"`): bucket `aportes` con el cliente anónimo; los archivos llevan el prefijo `ap-`
 *   para distinguirlos y poder borrarlos si el aporte se rechaza.
 */
export async function storeImage(
  input: Buffer,
  kind: ImageKind = "poster",
  opts: { origin?: "team" | "public"; maxBytes?: number } = {},
): Promise<string> {
  const origin = opts.origin ?? "team";
  const { full, thumb } = await processImage(input, kind, opts.maxBytes);
  const id = `${origin === "public" ? "ap-" : ""}${kind === "logo" ? "logo-" : ""}${newId()}`;
  const names = { full: `${id}.webp`, thumb: `${id}-thumb.webp` };

  if (supabaseConfigured()) {
    const bucket = origin === "public" ? "aportes" : "posters";
    const sb = origin === "public" ? createPublicClient() : await createSessionClient();
    for (const [key, buf] of [["full", full], ["thumb", thumb]] as const) {
      const { error } = await sb.storage.from(bucket).upload(names[key], buf, { contentType: "image/webp", cacheControl: "31536000" });
      if (error) throw new PosterError(`No se pudo guardar la imagen: ${error.message}`);
    }
    return sb.storage.from(bucket).getPublicUrl(names.full).data.publicUrl;
  }

  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  await Promise.all([fs.writeFile(path.join(UPLOAD_DIR, names.full), full), fs.writeFile(path.join(UPLOAD_DIR, names.thumb), thumb)]);
  return `/api/posters/${names.full}`;
}

/** Guarda un póster del equipo (compatibilidad con la carga por URL y la carga masiva). */
export const storePoster = (input: Buffer) => storeImage(input, "poster");

/**
 * Borra imágenes enviadas por el público (las que empiezan con `ap-`) y sus miniaturas.
 * Ignora cualquier otra URL, así que nunca toca pósters o logos del equipo. Es de mejor esfuerzo: no lanza errores.
 */
export async function deletePublicImages(urls: (string | null | undefined)[]) {
  const names = new Set<string>();
  for (const u of urls) {
    const m = (u ?? "").match(/\/(ap-[A-Za-z0-9-]+)\.webp(?:\?.*)?$/);
    if (m && !m[1].endsWith("-thumb")) names.add(m[1]);
  }
  if (!names.size) return;
  const files = [...names].flatMap((n) => [`${n}.webp`, `${n}-thumb.webp`]);
  try {
    if (supabaseConfigured()) {
      const sb = await createSessionClient();
      await sb.storage.from("aportes").remove(files);
    } else {
      await Promise.all(files.map((f) => fs.unlink(path.join(UPLOAD_DIR, f)).catch(() => {})));
    }
  } catch (e) {
    console.error("[imagenes] no se pudieron borrar:", (e as Error).message);
  }
}

// ───────────────────────── descarga desde una URL (asistente de carga) ─────────────────────────

const isPrivateIp = (ip: string) => {
  if (isIP(ip) === 6) {
    const l = ip.toLowerCase();
    return l === "::1" || l.startsWith("fc") || l.startsWith("fd") || l.startsWith("fe80") || l.startsWith("::ffff:");
  }
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
};

async function assertPublicHost(u: URL) {
  if (!/^https?:$/.test(u.protocol)) throw new PosterError("Solo se aceptan enlaces http o https.");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (/^localhost$|\.local$|\.internal$/i.test(host)) throw new PosterError("Enlace no permitido.");
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new PosterError("Enlace no permitido.");
}

/** Descarga una imagen por URL y la guarda como póster. */
export const posterFromUrl = (raw: string) => imageFromUrl(raw, "poster");

/**
 * Descarga una imagen por URL y la guarda (póster o logo).
 * Devuelve null si la descarga falla; nunca interrumpe una carga.
 */
export async function imageFromUrl(raw: string, kind: ImageKind): Promise<string | null> {
  const url = raw.trim();
  if (!url) return null;
  try {
    let current = new URL(url);
    for (let hop = 0; hop < 4; hop++) {
      await assertPublicHost(current);
      const res = await fetch(current, {
        redirect: "manual",
        signal: AbortSignal.timeout(12_000),
        headers: { "User-Agent": "MapaCineGT/1.0 (importador de pósters)", Accept: "image/*" },
      });
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        current = new URL(res.headers.get("location")!, current);
        continue;
      }
      if (!res.ok) return null;
      const len = Number(res.headers.get("content-length") ?? 0);
      if (len > POSTER_MAX_BYTES) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      return await storeImage(buf, kind);
    }
    return null;
  } catch {
    return null;
  }
}
