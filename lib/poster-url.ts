/** La miniatura de un póster o logo se guarda junto al archivo grande: `<id>.webp` → `<id>-thumb.webp`. */
export function posterThumb(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.replace(/\.webp(\?.*)?$/i, "-thumb.webp$1");
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * ¿La URL apunta a nuestro propio almacenamiento de imágenes?
 * Es la única forma de aceptar una imagen en un aporte público: nunca enlaces externos arbitrarios.
 * Acepta `/api/posters/<id>.webp` (modo local) o el bucket público del proyecto de Supabase.
 */
export function isOwnImageUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  if (/^\/api\/posters\/[A-Za-z0-9-]+\.webp$/.test(url)) return true;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
  if (!base) return false;
  return new RegExp(`^${escapeRe(base)}/storage/v1/object/public/(posters|aportes)/[A-Za-z0-9-]+\\.webp$`).test(url);
}
