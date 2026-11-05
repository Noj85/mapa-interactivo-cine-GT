"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { adminStore, requireSession } from "@/lib/auth";
import { addDays, buildRequestMessage, DEFAULT_REQUEST_DAYS, generatePassword, generateToken, REQUEST_DAYS } from "@/lib/info-requests";
import type { InfoRequest, SubmissionKind } from "@/lib/types";

export interface CreatedRequest {
  target_id: string;
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

/**
 * Crea una solicitud (enlace + contraseña) por cada registro. La contraseña solo se devuelve aquí:
 * en la base queda únicamente su huella.
 */
export async function createInfoRequestsAction(
  kind: SubmissionKind,
  ids: string[],
  opts: { recipient?: string | null; email?: string | null; days?: number },
): Promise<{ ok: true; items: CreatedRequest[] } | { ok: false; error: string }> {
  await requireSession();
  const list = [...new Set(ids)].slice(0, 20);
  if (!list.length) return { ok: false, error: "No hay registros seleccionados" };
  const days = (REQUEST_DAYS as readonly number[]).includes(opts.days ?? 0) ? (opts.days as number) : DEFAULT_REQUEST_DAYS;
  const email = opts.email?.trim() || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "El correo del destinatario no parece válido." };
  const recipient = opts.recipient?.trim().slice(0, 200) || null;

  try {
    const store = await adminStore();
    const base = await siteUrl();
    const items: CreatedRequest[] = [];
    for (const id of list) {
      const rec = kind === "film" ? await store.getFilm(id) : await store.getOrg(id);
      if (!rec) continue;
      const title = "title" in rec ? rec.title : rec.name;
      const token = generateToken();
      const password = generatePassword();
      const expires_at = addDays(days);
      const request = await store.createInfoRequest({ kind, target_id: id, recipient, recipient_email: email, expires_at, token, password });
      const link = `${base}/completar/${token}`;
      const msg = buildRequestMessage({
        kind,
        title,
        year: "year" in rec ? rec.year : null,
        link,
        password,
        expiresAt: expires_at,
        missing: rec.missing_fields,
        recipient,
      });
      items.push({ target_id: id, title, request, link, password, ...msg });
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
