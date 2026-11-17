import { isCrewRole, OTHER_ROLE, roleLabel } from "@/lib/crew";
import { parseWholeNumber } from "@/lib/numbers";
import type { Film, MapPerson, Person, PersonCredit } from "@/lib/types";
import { normalize } from "@/lib/utils";

/** Oficios que se pueden marcar en el directorio (los mismos roles del equipo de una producción). */
export const MAX_PERSON_ROLES = 5;
export const MAX_CREDITS = 10;
export const MAX_BIO = 600;

const text = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/** Ids de oficio válidos, sin repetir, hasta el máximo. */
export function cleanPersonRoles(list: unknown): string[] {
  const items = Array.isArray(list) ? list : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of items) {
    if (!isCrewRole(raw) || seen.has(raw)) continue;
    seen.add(raw);
    out.push(raw);
    if (out.length >= MAX_PERSON_ROLES) break;
  }
  return out;
}

/** Créditos destacados: título obligatorio, año entero y rol libre. Hasta 10, sin repetir el mismo renglón. */
export function cleanCredits(list: unknown): PersonCredit[] {
  const items = Array.isArray(list) ? list : [];
  const out: PersonCredit[] = [];
  const seen = new Set<string>();
  for (const raw of items) {
    const r = (raw ?? {}) as Record<string, unknown>;
    const title = text(r.title, 200);
    if (!title) continue;
    const year = parseWholeNumber(r.year);
    const role = text(r.role, 120) || null;
    const key = `${normalize(title)}|${year ?? ""}|${normalize(role ?? "")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ title, year: year != null && year >= 1900 && year <= 2100 ? year : null, role });
    if (out.length >= MAX_CREDITS) break;
  }
  return out;
}

/** Cómo se muestran los oficios: el catálogo, y el texto libre en lugar de «Otro rol». */
export function personRoleLabels(p: { roles?: string[] | null; other_role?: string | null }): string[] {
  const roles = p.roles ?? [];
  const labels = roles.filter((r) => r !== OTHER_ROLE).map((r) => roleLabel(r));
  const other = text(p.other_role, 120);
  if (other) labels.push(other);
  else if (roles.includes(OTHER_ROLE)) labels.push("Otro oficio");
  return labels;
}

/** Lo que el mapa recibe de una persona: sin correo, teléfono, enlaces ni créditos (eso queda en el directorio). */
export const toMapPerson = (p: Person): MapPerson => ({
  id: p.id,
  slug: p.slug,
  name: p.name,
  roles: p.roles,
  other_role: p.other_role,
  depto_ine: p.depto_ine,
  muni_ine: p.muni_ine,
  languages: p.languages,
  bio: p.bio,
  photo_url: p.photo_url,
  status: p.status,
  completeness: p.completeness,
  missing_fields: p.missing_fields,
});

/** Departamento de una persona: el guardado o el que sale del código del municipio. */
export const personDepto = (p: { depto_ine: number | null; muni_ine: number | null }) => p.depto_ine ?? (p.muni_ine != null ? Math.floor(p.muni_ine / 100) : null);

/** Producciones publicadas donde este nombre aparece en el equipo. */
export function filmsCrediting(name: string, films: Film[]): { film: Film; roles: string[] }[] {
  const pn = normalize(name);
  if (pn.length < 3) return [];
  const out: { film: Film; roles: string[] }[] = [];
  for (const film of films) {
    const roles: string[] = [];
    const seen = new Set<string>();
    for (const m of film.crew ?? []) {
      const mn = normalize(m.name);
      const hit = mn === pn || (pn.includes(" ") && (mn.includes(pn) || pn.includes(mn)));
      if (!hit) continue;
      const label = m.role === OTHER_ROLE ? m.detail || "Otro rol" : roleLabel(m.role);
      if (seen.has(label)) continue;
      seen.add(label);
      roles.push(label);
    }
    if (roles.length) out.push({ film, roles });
  }
  return out.sort((a, b) => (b.film.year ?? 0) - (a.film.year ?? 0) || a.film.title.localeCompare(b.film.title, "es"));
}
