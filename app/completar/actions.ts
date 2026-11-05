"use server";

import { headers } from "next/headers";
import { publicStore } from "@/lib/auth";
import { sanitizeFestivalIds } from "@/lib/festivals-server";
import { rateLimit } from "@/lib/rate-limit";
import { submissionMetaSchema, submissionSchema } from "@/lib/schemas";
import type { FilmInput, InfoRequest, OrgInput, Film, Org } from "@/lib/types";

type Reason = "not_found" | "bad_password" | "expired" | "revoked" | "locked";

const MESSAGES: Record<Reason, string> = {
  not_found: "Este enlace no es válido o ya no existe. Revisa que esté completo o pide uno nuevo al equipo de PROCINE.",
  bad_password: "La contraseña no es correcta. Revisa el mensaje que recibiste (no importa si usas mayúsculas).",
  expired: "Este enlace venció. Pide uno nuevo al equipo de PROCINE.",
  revoked: "Este enlace ya no está disponible. Pide uno nuevo al equipo de PROCINE.",
  locked: "Hubo demasiados intentos con contraseña incorrecta y el enlace se bloqueó por seguridad. Pide uno nuevo al equipo de PROCINE.",
};

const clientIp = async () => ((await headers()).get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";

export type OpenResult =
  | { ok: true; request: InfoRequest; film?: Film; org?: Org }
  | { ok: false; error: string };

/** Abre el enlace privado con su contraseña y devuelve el registro (aunque esté oculto del mapa). */
export async function openRequestAction(token: string, password: string): Promise<OpenResult> {
  if (typeof token !== "string" || token.length < 16 || token.length > 100 || typeof password !== "string" || !password.trim() || password.length > 100) {
    return { ok: false, error: MESSAGES.not_found };
  }
  if (!rateLimit(`completar:${await clientIp()}`, 30, 10 * 60 * 1000).ok) {
    return { ok: false, error: "Demasiados intentos seguidos. Espera unos minutos e inténtalo de nuevo." };
  }
  try {
    const res = await publicStore().openInfoRequest(token, password);
    if (!res.ok) return { ok: false, error: MESSAGES[res.reason] };
    return { ok: true, request: res.request, film: res.film, org: res.org };
  } catch (e) {
    console.error("[completar:open]", e);
    return { ok: false, error: "No pudimos abrir el enlace. Intenta de nuevo en un momento." };
  }
}

/** Recibe lo que completó el equipo de la producción o entidad. Queda pendiente de revisión. */
export async function submitCollectedAction(input: {
  token: string;
  password: string;
  data: unknown;
  note: string;
  contact: string;
  submitter: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!rateLimit(`completar-envio:${await clientIp()}`, 15, 60 * 60 * 1000).ok) {
    return { ok: false, error: "Has enviado varios aportes seguidos. Intenta de nuevo en un rato." };
  }
  const submitter = (input.submitter ?? "").replace(/[\u0000-\u001f\u007f<>]/g, "").trim().slice(0, 200);
  if (submitter.length < 3) return { ok: false, error: "Escribe tu nombre y tu rol en la producción." };
  const meta = submissionMetaSchema.safeParse({ note: input.note, contact: input.contact });
  if (!meta.success) return { ok: false, error: meta.error.issues[0]?.message ?? "Solicitud no válida." };

  try {
    const store = publicStore();
    const opened = await store.openInfoRequest(input.token, input.password);
    if (!opened.ok) return { ok: false, error: MESSAGES[opened.reason] };
    const kind = opened.film ? "film" : "org";
    const parsed = submissionSchema.safeParse({ kind, data: input.data });
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
    if (parsed.data.kind === "film") parsed.data.data.festivals = await sanitizeFestivalIds(store, parsed.data.data.festivals);
    const res = await store.submitInfoRequest(input.token, input.password, {
      payload: parsed.data.data as unknown as FilmInput | OrgInput,
      note: meta.data.note,
      contact: meta.data.contact,
      submitter,
    });
    if (!res.ok) return { ok: false, error: MESSAGES[res.reason] };
    return { ok: true };
  } catch (e) {
    console.error("[completar:submit]", e);
    return { ok: false, error: "No pudimos guardar tu aporte. Intenta de nuevo más tarde." };
  }
}
