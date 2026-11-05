/** Una entidad puede tener varias categorías; la primera es la principal (`category`). */
export const MAX_CATEGORIES = 6;

/** Lista limpia: textos únicos, sin vacíos, en el orden dado y con tope. */
export function normalizeCategories(list: unknown, fallback?: string | null): string[] {
  const out: string[] = [];
  const add = (v: unknown) => {
    const t = typeof v === "string" ? v.trim().slice(0, 120) : "";
    if (t && !out.some((x) => x.toLowerCase() === t.toLowerCase())) out.push(t);
  };
  if (Array.isArray(list)) list.forEach(add);
  if (!out.length) add(fallback);
  return out.slice(0, MAX_CATEGORIES);
}

/** Categorías de un registro, también de los guardados antes de que hubiera varias. */
export const orgCategories = (o: { category?: string | null; categories?: string[] | null }): string[] =>
  normalizeCategories(o.categories, o.category);

/** «Productoras, Postproducción»: para mostrar. */
export const categoriesText = (o: { category?: string | null; categories?: string[] | null }, sep = ", ") => orgCategories(o).join(sep);
