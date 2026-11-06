import { PublicStatsForm, type StatRow } from "@/components/admin/PublicStatsForm";
import { aggregate } from "@/lib/aggregate";
import { adminStore } from "@/lib/auth";
import { hasAnchor, isAbroad } from "@/lib/completeness";
import { fmtInt, fmtMoney } from "@/lib/utils";
import { DEFAULT_PUBLIC_STATS, PUBLIC_STATS_KEY, readPublicStats, STAT_INFO, STAT_KEYS, type StatKey } from "@/lib/site-settings";

export default async function CifrasPage() {
  const store = await adminStore();
  const films = await store.listFilms();
  const stored = await store.getSetting(PUBLIC_STATS_KEY).catch(() => undefined);
  const ready = stored !== undefined;
  const current = ready ? readPublicStats(stored) : DEFAULT_PUBLIC_STATS;

  const total = aggregate({ films, orgs: [], festivalOrgs: {}, mode: store.mode, publicStats: current }, "produccion").total;
  const value: Record<StatKey, string> = { films: fmtInt(total.films), days: fmtInt(total.days), spend: fmtMoney(total.spend), jobs: fmtInt(total.jobs) };

  // cobertura: en cuántas producciones publicadas hay dato de cada cifra (fuera de Guatemala no cuenta para el territorio)
  const inGt = (f: (typeof films)[number]) => f.locations.filter((l) => !isAbroad(l));
  const covered: Record<StatKey, number> = {
    films: films.filter((f) => inGt(f).some(hasAnchor)).length,
    days: films.filter((f) => inGt(f).some((l) => l.days != null)).length,
    spend: films.filter((f) => inGt(f).some((l) => l.local_spend != null)).length,
    jobs: films.filter((f) => inGt(f).some((l) => l.jobs != null)).length,
  };

  const rows: StatRow[] = STAT_KEYS.map((k) => ({
    key: k,
    label: STAT_INFO[k].label,
    hint: STAT_INFO[k].hint,
    value: value[k],
    covered: covered[k],
    total: films.length,
  }));

  return (
    <div>
      <h2 className="font-display text-2xl tracking-tight">Cifras públicas</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        Las cifras de la tarjeta del mapa público ayudan cuando los datos son sólidos y restan cuando están a medias. Elige cuáles se muestran; las demás siguen
        registrándose y las ve el equipo en el mapa de /admin, marcadas como «oculta al público». Cámbialas cuando la cobertura lo justifique.
      </p>
      <div className="mt-5" />
      {!ready && (
        <div className="mb-4 rounded-2xl border border-warn/40 bg-warn/5 px-4 py-3 text-sm text-warn">
          La tabla de ajustes todavía no existe en la base de datos. Aplica la migración <code>0015_site_settings.sql</code> en Supabase para poder guardar estos cambios; mientras tanto el mapa usa los valores por defecto.
        </div>
      )}
      <PublicStatsForm rows={rows} initial={current} />
    </div>
  );
}
