import type { InfoRequest, InfoRequestState } from "@/lib/types";

/** Intentos de contraseña fallidos antes de bloquear el enlace. */
export const MAX_FAILED_ATTEMPTS = 10;

export function requestState(r: Pick<InfoRequest, "revoked_at" | "expires_at" | "failed_attempts">): InfoRequestState {
  if (r.revoked_at) return "revoked";
  if (new Date(r.expires_at).getTime() < Date.now()) return "expired";
  if (r.failed_attempts >= MAX_FAILED_ATTEMPTS) return "locked";
  return "active";
}

export const REQUEST_STATE_LABEL: Record<InfoRequestState, string> = {
  active: "Activa",
  expired: "Vencida",
  revoked: "Revocada",
  locked: "Bloqueada",
};
