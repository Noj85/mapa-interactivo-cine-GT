/** Cifras del mapa público que el equipo puede mostrar u ocultar desde Ajustes → Cifras públicas. */
export const STAT_KEYS = ["films", "days", "spend", "jobs"] as const;
export type StatKey = (typeof STAT_KEYS)[number];
export type PublicStats = Record<StatKey, boolean>;

export const PUBLIC_STATS_KEY = "public_stats";

/** Por defecto solo se muestra el conteo de producciones: las demás cifras se encienden cuando los datos las respaldan. */
export const DEFAULT_PUBLIC_STATS: PublicStats = { films: true, days: false, spend: false, jobs: false };
export const ALL_STATS: PublicStats = { films: true, days: true, spend: true, jobs: true };

export const STAT_INFO: Record<StatKey, { label: string; hint: string }> = {
  films: { label: "Producciones con locación", hint: "Cuántas producciones tienen al menos un lugar de rodaje en Guatemala." },
  days: { label: "Días de rodaje", hint: "Suma de los días de rodaje registrados en las locaciones." },
  spend: { label: "Inversión local", hint: "Suma de lo invertido localmente en las locaciones." },
  jobs: { label: "Empleos generados", hint: "Suma de los empleos registrados en las locaciones." },
};

/** Lee lo guardado; lo que falte o venga mal toma el valor por defecto. */
export function readPublicStats(raw: unknown): PublicStats {
  const out = { ...DEFAULT_PUBLIC_STATS };
  if (raw && typeof raw === "object") for (const k of STAT_KEYS) if (typeof (raw as Record<string, unknown>)[k] === "boolean") out[k] = (raw as Record<string, boolean>)[k];
  return out;
}
