"use server";

import { revalidatePath } from "next/cache";
import { adminStore, requireSession } from "@/lib/auth";
import { PUBLIC_STATS_KEY, readPublicStats, STAT_KEYS, type PublicStats } from "@/lib/site-settings";

type Result = { ok: true } | { ok: false; error: string };

/** Guarda qué cifras muestra el mapa público. Solo el equipo, con sesión. */
export async function savePublicStatsAction(raw: unknown): Promise<Result> {
  await requireSession();
  if (!raw || typeof raw !== "object") return { ok: false, error: "Datos inválidos" };
  const value = Object.fromEntries(STAT_KEYS.map((k) => [k, (raw as Record<string, unknown>)[k] === true])) as PublicStats;
  try {
    const store = await adminStore();
    await store.saveSetting(PUBLIC_STATS_KEY, readPublicStats(value));
    revalidatePath("/");
    revalidatePath("/admin");
    revalidatePath("/admin/ajustes/cifras");
    return { ok: true };
  } catch (e) {
    const msg = (e as Error).message ?? "";
    return {
      ok: false,
      error: /site_settings/.test(msg) ? "Falta aplicar la migración 0015_site_settings.sql en Supabase." : "No se pudo guardar. Intenta de nuevo.",
    };
  }
}
