/**
 * Enlaces de video (tráiler y película completa). Código puro, sin acceso a la red: lo usan el navegador
 * (para el reproductor de la ficha) y el servidor (para buscar la miniatura).
 */

export type VideoProvider = "youtube" | "vimeo" | "other";

export interface ParsedVideo {
  provider: VideoProvider;
  /** Identificador del video en YouTube o Vimeo. */
  id?: string;
  /** Dirección para incrustar el reproductor (solo YouTube y Vimeo). */
  embed?: string;
  /** Nombre de la plataforma, para mostrar («YouTube», «Netflix»…). */
  label: string;
}

const YT_ID = /^[A-Za-z0-9_-]{11}$/;

const KNOWN: [RegExp, string][] = [
  [/(^|\.)netflix\.com$/, "Netflix"],
  [/(^|\.)primevideo\.com$|(^|\.)amazon\.[a-z.]+$/, "Prime Video"],
  [/(^|\.)disneyplus\.com$/, "Disney+"],
  [/(^|\.)(max|hbomax)\.com$/, "Max"],
  [/(^|\.)filmin\.[a-z]+$/, "Filmin"],
  [/(^|\.)mubi\.com$/, "MUBI"],
  [/(^|\.)tv\.apple\.com$|(^|\.)apple\.com$/, "Apple TV"],
  [/(^|\.)cinepolisklic\.com$/, "Cinépolis Klic"],
  [/(^|\.)retinalatina\.org$/, "Retina Latina"],
  [/(^|\.)dailymotion\.com$/, "Dailymotion"],
  [/(^|\.)facebook\.com$|(^|\.)fb\.watch$/, "Facebook"],
  [/(^|\.)instagram\.com$/, "Instagram"],
  [/(^|\.)tiktok\.com$/, "TikTok"],
];

/** Convierte lo que escribe la persona en una URL válida (sin esquema se asume https); null si no lo es. */
export function normalizeVideoUrl(raw: string | null | undefined): URL | null {
  const t = (raw ?? "").trim();
  if (!t) return null;
  const withScheme = /^https?:\/\//i.test(t) ? t : /^[a-z][a-z0-9+.-]*:/i.test(t) ? "" : `https://${t}`;
  try {
    const u = new URL(withScheme);
    return /^https?:$/.test(u.protocol) && u.hostname.includes(".") ? u : null;
  } catch {
    return null;
  }
}

export function platformLabel(host: string): string {
  const h = host.toLowerCase().replace(/^www\./, "");
  for (const [re, name] of KNOWN) if (re.test(h)) return name;
  return h;
}

export function parseVideo(raw: string | null | undefined): ParsedVideo | null {
  const u = normalizeVideoUrl(raw);
  if (!u) return null;
  const host = u.hostname.toLowerCase().replace(/^(www|m|music)\./, "");
  const parts = u.pathname.split("/").filter(Boolean);

  if (host === "youtube.com" || host === "youtube-nocookie.com" || host === "youtu.be") {
    let id: string | undefined;
    if (host === "youtu.be") id = parts[0];
    else if (parts[0] === "watch") id = u.searchParams.get("v") ?? undefined;
    else if (["shorts", "embed", "live", "v"].includes(parts[0])) id = parts[1];
    if (id && YT_ID.test(id)) return { provider: "youtube", id, embed: `https://www.youtube-nocookie.com/embed/${id}`, label: "YouTube" };
    return { provider: "other", label: "YouTube" };
  }

  if (host === "vimeo.com" || host === "player.vimeo.com") {
    // vimeo.com/123, vimeo.com/channels/x/123, vimeo.com/groups/x/videos/123, player.vimeo.com/video/123, vimeo.com/123/hash
    const i = parts.findIndex((p) => /^\d{5,}$/.test(p));
    if (i >= 0) {
      const id = parts[i];
      const hash = u.searchParams.get("h") ?? (/^[a-f0-9]{8,}$/i.test(parts[i + 1] ?? "") ? parts[i + 1] : null);
      return { provider: "vimeo", id, embed: `https://player.vimeo.com/video/${id}${hash ? `?h=${hash}` : ""}`, label: "Vimeo" };
    }
    return { provider: "other", label: "Vimeo" };
  }

  return { provider: "other", label: platformLabel(u.hostname) };
}

/** Dirección del reproductor con reproducción automática (se usa al tocar la miniatura). */
export function embedAutoplay(v: ParsedVideo): string | null {
  if (!v.embed) return null;
  return `${v.embed}${v.embed.includes("?") ? "&" : "?"}autoplay=1`;
}
