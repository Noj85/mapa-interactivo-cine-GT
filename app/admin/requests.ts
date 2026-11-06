"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { adminStore, requireSession } from "@/lib/auth";
import { openRequestCounts } from "@/lib/admin-rows";
import { directorKeys, groupByDirector, sameDirector } from "@/lib/directors";
import { addDays, buildRequestMessage, generatePassword, generateToken, REQUEST_DAYS } from "@/lib/info-requests";
import type { Film, InfoRequest, SubmissionKind } from "@/lib/types";

export interface CreatedRequest {
  /** La principal; en una solicitud consolidada hay más en `target_ids`. */
  target_id: string;
  target_ids: string[];
  /** Títulos de todo lo que incluye el enlace (para mostrarlo en el cuadro). */
  titles: string[];
  title: string;
  request: InfoRequest;
  link: string;
  password: string;
  subject: string;
  body: string;
}

/** Dirección del sitio tal como la ve quien está en el admin (para armar el enlace que se comparte). */
async function siteUrl() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Una producción tal como la ve el cuadro de solicitud. */
export interface RequestFilm {
  id: string;
  title: string;
  year: number | null;
  director: string | null;
  completeness: number;
  /** Lo que falta (nombres de los campos). */
  missing: string[];
  /** No se muestra en el mapa (borrador). */
  hidden: boolean;
  /** Solicitudes activas que ya la incluyen. */
  activeRequests: number;
}

const toRequestFilm = (f: Film, open: Record<string, number>): RequestFilm => ({
  id: f.id,
  title: f.title,
  year: f.year,
  director: f.director,
  completeness: f.completeness,
  missing: f.missing_fields,
  hidden: f.status !== "published",
  activeRequests: open[f.id] ?? 0,
});

/**
 * Prepara el cuadro de solicitud de producciones:
 * - `films`: las elegidas.
 * - `groups`: entre las elegidas, las que comparten director/a (2 o más), para ofrecer un solo enlace.
 * - `related`: con una sola elegida, las demás producciones de la misma persona.
 */
export async function loadRequestContextAction(
  ids: string[],
): Promise<{ ok: true; films: RequestFilm[]; groups: { director: string; ids: string[] }[]; related: RequestFilm[] } | { ok: false; error: string }> {
  await requireSession();
  const list = [...new Set(ids)].filter((x) => typeof x === "string" && x.length > 0 && x.length <= 80).slice(0, 60);
  if (!list.length) return { ok: false, error: "No hay registros seleccionados" };
  try {
    const store = await adminStore();
    const [all, requests] = await Promise.all([store.listFilms({ drafts: true }), store.listInfoRequests({ kind: "film" }).catch(() => [])]);
    const open = openRequestCounts(requests);
    const byId = new Map(all.map((f) => [f.id, f]));
    const chosen = list.map((id) => byId.get(id)).filter((f): f is Film => !!f);
    const films = chosen.map((f) => toRequestFilm(f, open));
    const groups = groupByDirector(chosen)
      .filter((g) => g.length > 1)
      .map((g) => ({ director: g[0].director ?? "", ids: g.map((f) => f.id) }));
    const related =
      chosen.length === 1 && directorKeys(chosen[0].director).length
        ? all
            .filter((f) => f.id !== chosen[0].id && sameDirector(chosen[0].director, f.director))
            .sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || a.title.localeCompare(b.title))
            .slice(0, 19)
            .map((f) => toRequestFilm(f, open))
        : [];
    return { ok: true, films, groups, related };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Hasta cuántos enlaces y cuántas producciones por enlace se crean de una vez. */
const MAX_LINKS = 20;
const MAX_PER_LINK = 20;

/**
 * Crea una solicitud (enlace + contraseña) por cada grupo de registros. En un grupo de producciones, todas
 * comparten el mismo enlace y la misma clave; las entidades van siempre de una en una. El enlace vale 30 días.
 * La contraseña solo se devuelve aquí: en la base queda únicamente su huella.
 */
export async function createInfoRequestsAction(
  kind: SubmissionKind,
  groups: string[][],
  opts: { recipient?: string | null; email?: string | null },
): Promise<{ ok: true; items: CreatedRequest[] } | { ok: false; error: string }> {
  await requireSession();
  const seen = new Set<string>();
  const list: string[][] = [];
  for (const g of Array.isArray(groups) ? groups : []) {
    const ids = [...new Set(Array.isArray(g) ? g : [])].filter((x) => typeof x === "string" && x.length > 0 && x.length <= 80 && !seen.has(x));
    // las entidades no se consolidan: cada una tiene su enlace
    const chunks = kind === "film" ? [ids.slice(0, MAX_PER_LINK)] : ids.map((x) => [x]);
    for (const c of chunks) {
      if (!c.length) continue;
      c.forEach((x) => seen.add(x));
      list.push(c);
    }
  }
  if (!list.length) return { ok: false, error: "No hay registros seleccionados" };
  const email = opts.email?.trim() || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "El correo del destinatario no parece válido." };
  const recipient = opts.recipient?.trim().slice(0, 200) || null;

  try {
    const store = await adminStore();
    const base = await siteUrl();
    const items: CreatedRequest[] = [];
    for (const group of list.slice(0, MAX_LINKS)) {
      const recs = (await Promise.all(group.map((id) => (kind === "film" ? store.getFilm(id) : store.getOrg(id))))).filter((r): r is NonNullable<typeof r> => !!r);
      if (!recs.length) continue;
      const nameOf = (r: (typeof recs)[number]) => ("title" in r ? r.title : r.name);
      const yearOf = (r: (typeof recs)[number]) => ("year" in r ? r.year : null);
      const token = generateToken();
      const password = generatePassword();
      const request = await store.createInfoRequest({
        kind,
        target_id: recs[0].id,
        extra_ids: recs.slice(1).map((r) => r.id),
        recipient,
        recipient_email: recs.length === 1 ? email : null,
        expires_at: addDays(REQUEST_DAYS),
        token,
        password,
      });
      const link = `${base}/completar/${token}`;
      const msg = buildRequestMessage({
        kind,
        title: nameOf(recs[0]),
        year: yearOf(recs[0]),
        link,
        password,
        recipient,
        films: recs.length > 1 ? recs.map((r) => ({ title: nameOf(r), year: yearOf(r) })) : undefined,
      });
      items.push({ target_id: recs[0].id, target_ids: recs.map((r) => r.id), titles: recs.map(nameOf), title: nameOf(recs[0]), request, link, password, ...msg });
    }
    if (!items.length) return { ok: false, error: "No se encontraron los registros" };
    revalidatePath("/admin/peliculas");
    revalidatePath("/admin/entidades");
    return { ok: true, items };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function revokeInfoRequestAction(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireSession();
  try {
    await (await adminStore()).revokeInfoRequest(id);
    revalidatePath("/admin/peliculas");
    revalidatePath("/admin/entidades");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
