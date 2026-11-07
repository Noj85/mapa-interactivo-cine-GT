import "server-only";
import { fetchPublic, imageFromUrl, readLimited } from "@/lib/posters";
import { normalizeVideoUrl, parseVideo, type ParsedVideo } from "@/lib/video-url";

const HTML_MAX_BYTES = 512 * 1024;

const decode = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

/** La imagen que una página declara para compartirse: og:image (o twitter:image). */
export function metaImage(html: string, base: URL): string | null {
  const wanted = ["og:image:secure_url", "og:image:url", "og:image", "twitter:image", "twitter:image:src"];
  const found = new Map<string, string>();
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = (tag.match(/\b(?:property|name)\s*=\s*["']([^"']+)["']/i)?.[1] ?? "").toLowerCase();
    const content = tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i)?.[1];
    if (key && content && wanted.includes(key) && !found.has(key)) found.set(key, decode(content.trim()));
  }
  for (const k of wanted) {
    const v = found.get(k);
    if (!v) continue;
    try {
      return new URL(v, base).toString();
    } catch {
      /* siguiente */
    }
  }
  return null;
}

async function vimeoThumb(v: ParsedVideo): Promise<string | null> {
  const canonical = `https://vimeo.com/${v.id}`;
  const got = await fetchPublic(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(canonical)}&width=1280`, { accept: "application/json", timeoutMs: 8_000 });
  if (!got) return null;
  try {
    const data = JSON.parse((await readLimited(got.res, 64 * 1024)).toString("utf8")) as { thumbnail_url?: string };
    return data.thumbnail_url ?? null;
  } catch {
    return null;
  }
}

async function pageThumb(url: string): Promise<string | null> {
  const got = await fetchPublic(url, { accept: "text/html,application/xhtml+xml", timeoutMs: 10_000 });
  if (!got) return null;
  const type = got.res.headers.get("content-type") ?? "";
  // el enlace puede ser directamente una imagen
  if (/^image\//i.test(type)) return got.url.toString();
  if (type && !/html|xml/i.test(type)) return null;
  const html = (await readLimited(got.res, HTML_MAX_BYTES)).toString("utf8");
  return metaImage(html, got.url);
}

/**
 * Busca la miniatura de un video y la guarda en nuestro almacenamiento (16:9, 1280 px).
 *  - YouTube: la imagen del propio video (máxima resolución; si no existe, la alta).
 *  - Vimeo: oEmbed.
 *  - Otras plataformas (Netflix, Prime, Filmin…): la imagen que la página declara para compartirse (og:image).
 * Devuelve la dirección de la imagen guardada, o null si la plataforma no publica ninguna (el enlace se guarda igual).
 * `origin: "public"` guarda en el espacio de los aportes del público (archivos con prefijo `ap-`).
 */
export async function videoThumbFromUrl(raw: string, origin: "team" | "public" = "team"): Promise<string | null> {
  const u = normalizeVideoUrl(raw);
  const v = parseVideo(raw);
  if (!u || !v) return null;
  const save = (src: string | null) => (src ? imageFromUrl(src, "still", { origin }) : Promise.resolve(null));
  try {
    if (v.provider === "youtube" && v.id) {
      return (await save(`https://i.ytimg.com/vi/${v.id}/maxresdefault.jpg`)) ?? (await save(`https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`));
    }
    if (v.provider === "vimeo" && v.id) return await save(await vimeoThumb(v));
    return await save(await pageThumb(u.toString()));
  } catch {
    return null;
  }
}

type VideoFields = {
  trailer_url?: string | null;
  trailer_thumb?: string | null;
  film_url?: string | null;
  film_thumb?: string | null;
};

/**
 * Deja cada enlace de video con su miniatura al guardar una producción: si el enlace es nuevo (o cambió) y no trae
 * miniatura propia, la busca en la plataforma; si no hay enlace, no hay miniatura. `previous` es el registro de hoy.
 */
export async function ensureVideoThumbs<T extends VideoFields>(input: T, previous?: VideoFields | null, origin: "team" | "public" = "team"): Promise<T> {
  const out = { ...input };
  for (const [url, thumb] of [["trailer_url", "trailer_thumb"], ["film_url", "film_thumb"]] as const) {
    const link = out[url]?.trim() || null;
    out[url] = link as T[typeof url];
    if (!link) {
      out[thumb] = null as T[typeof thumb];
      continue;
    }
    const prevUrl = previous?.[url] ?? null;
    const prevThumb = previous?.[thumb] ?? null;
    const changed = link !== prevUrl;
    let t = out[thumb] ?? null;
    // una miniatura heredada de otro enlace ya no sirve
    if (changed && t && t === prevThumb) t = null;
    if (!t && !changed && prevThumb) t = prevThumb;
    if (!t) t = await videoThumbFromUrl(link, origin);
    out[thumb] = t as T[typeof thumb];
  }
  return out;
}

/** Miniaturas que tenía el registro y ya no usa (para borrarlas). */
export function droppedVideoThumbs(before: VideoFields | null | undefined, after: VideoFields): string[] {
  return [before?.trailer_thumb, before?.film_thumb].filter((u): u is string => !!u && u !== after.trailer_thumb && u !== after.film_thumb);
}
