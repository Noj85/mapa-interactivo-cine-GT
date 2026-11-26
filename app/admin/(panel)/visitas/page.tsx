import { AlertTriangle, ArrowDownRight, ArrowUpRight, Download, Eye, Film, Users } from "lucide-react";
import { RangeTabs } from "@/components/admin/RangeTabs";
import { RankedList } from "@/components/admin/RankedList";
import { VisitsChart } from "@/components/admin/VisitsChart";
import { emptyOverview, fillDays, parseRange, pctChange, rangeBounds, type AnalyticsOverview } from "@/lib/analytics";
import { adminStore, requireSession } from "@/lib/auth";
import { LAYER_COLORS } from "@/lib/map/colors";

export const dynamic = "force-dynamic";
export const metadata = { title: "Visitas · Consola" };

const DEVICE: Record<string, string> = { desktop: "Computadora", mobile: "Celular", tablet: "Tableta" };
const PATH_NAMES: Record<string, string> = { "/": "Mapa (inicio)", "/descargas": "Descargas", "/aportar": "Aportar", "/directorio": "Directorio", "/creditos": "Créditos" };
const regionNames = new Intl.DisplayNames(["es"], { type: "region" });
const countryName = (c: string) => {
  try {
    return regionNames.of(c) ?? c;
  } catch {
    return c;
  }
};
const pathName = (p: string) => PATH_NAMES[p] ?? (p.startsWith("/directorio/empresa/") ? `Empresa: ${p.split("/").pop()}` : p.startsWith("/directorio/") ? `Persona: ${p.split("/").pop()}` : p);

function Kpi({ icon: Icon, label, value, prev, hint }: { icon: typeof Eye; label: string; value: number; prev: number | null; hint?: string }) {
  const d = pctChange(value, prev);
  return (
    <div className="rounded-2xl border border-line bg-surface px-4 py-3.5">
      <div className="flex items-center justify-between text-muted">
        <span className="text-xs">{label}</span>
        <Icon className="h-4 w-4" aria-hidden />
      </div>
      <div className="mt-1 font-display text-3xl tracking-tight">{value.toLocaleString("es")}</div>
      <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted">
        {d == null ? (
          <span>{prev == null ? "Sin comparación" : "Sin datos antes"}</span>
        ) : (
          <span className={d >= 0 ? "inline-flex items-center gap-0.5 text-ok" : "inline-flex items-center gap-0.5 text-danger"}>
            {d >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" aria-hidden /> : <ArrowDownRight className="h-3.5 w-3.5" aria-hidden />}
            {Math.abs(d)}%
          </span>
        )}
        {d != null && <span>frente al periodo anterior</span>}
      </div>
      {hint && <div className="text-[11px] text-muted/70">{hint}</div>}
    </div>
  );
}

export default async function VisitsPage({ searchParams }: { searchParams: Promise<{ r?: string }> }) {
  await requireSession();
  const range = parseRange((await searchParams).r);
  const b = rangeBounds(range);

  let cur: AnalyticsOverview = emptyOverview();
  let prev: AnalyticsOverview | null = null;
  let error: string | null = null;
  try {
    const store = await adminStore();
    [cur, prev] = await Promise.all([store.analyticsOverview(b.from, b.to), b.prev ? store.analyticsOverview(b.prev.from, b.prev.to) : Promise.resolve(null)]);
  } catch (e) {
    error = e instanceof Error ? e.message : "No se pudieron leer las estadísticas.";
  }

  const daily = fillDays(cur.daily, b.days);
  const empty = !error && cur.totals.views + cur.totals.films + cur.totals.downloads + cur.totals.searches === 0;
  const t = cur.totals;
  const pt = prev?.totals ?? null;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl tracking-tight">Visitas</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">Cómo se usa el sitio público. La medición es anónima y sin cookies: no se guarda la IP ni nada que identifique a una persona.</p>
        </div>
        <RangeTabs current={range} />
      </div>

      {error && (
        <div role="alert" className="mt-6 flex items-start gap-3 rounded-2xl border border-warn/40 bg-warn/5 px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-hidden />
          <div>
            <b className="font-medium">Todavía no se pueden leer las estadísticas.</b>
            <p className="mt-0.5 text-muted">
              Falta aplicar la migración <code>supabase/migrations/0023_analytics.sql</code> en Supabase (SQL Editor). Mientras tanto el sitio funciona igual; solo no se mide. Detalle: {error}
            </p>
          </div>
        </div>
      )}

      {empty && (
        <div className="mt-6 rounded-2xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
          Aún no hay visitas registradas en este periodo. Aparecerán aquí a medida que se use el sitio público (no se cuentan las del equipo con sesión iniciada, ni los robots).
        </div>
      )}

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={Eye} label="Páginas vistas" value={t.views} prev={pt ? pt.views : null} />
        <Kpi icon={Users} label="Visitantes únicos" value={t.visitors} prev={pt ? pt.visitors : null} hint="Personas distintas por día" />
        <Kpi icon={Film} label="Producciones abiertas" value={t.films} prev={pt ? pt.films : null} hint="Fichas vistas en el mapa" />
        <Kpi icon={Download} label="Descargas" value={t.downloads} prev={pt ? pt.downloads : null} hint={`${t.searches.toLocaleString("es")} búsquedas · ${t.contributions.toLocaleString("es")} aportes`} />
      </div>

      <div className="mt-4">
        <VisitsChart data={daily} />
      </div>

      <h2 className="mb-3 mt-10 text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Qué se mira</h2>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <RankedList title="Páginas más vistas" items={cur.topPaths} label={pathName} unit="vista|vistas" />
        <RankedList title="Producciones más abiertas" items={cur.topFilms} unit="vez|veces" color={LAYER_COLORS.produccion.light} />
        <RankedList title="Departamentos y municipios consultados" items={cur.topPlaces} unit="vez|veces" />
        <RankedList title="Búsquedas más frecuentes" hint="Se cuentan cuando se elige un resultado." items={cur.topSearches} unit="vez|veces" />
        <RankedList title="Capas del mapa" items={cur.layers} unit="cambio|cambios" color={LAYER_COLORS.circulacion.light} />
        <RankedList title="Descargas" items={cur.downloads} unit="descarga|descargas" color={LAYER_COLORS.industria.light} />
      </div>

      <h2 className="mb-3 mt-10 text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Quién visita</h2>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <RankedList title="Países" hint="Visitantes únicos por día." items={cur.countries} label={countryName} />
        <RankedList title="Dispositivo" items={cur.devices} label={(n) => DEVICE[n] ?? n} />
        <RankedList title="Navegador" items={cur.browsers} />
        <RankedList title="De dónde llegan" hint="Sitios desde los que enlazan al mapa." items={cur.referrers} />
      </div>
      {cur.contributions.length > 0 && (
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <RankedList title="Aportes" hint="Iniciados (alguien empezó a escribir) y enviados." items={cur.contributions} />
        </div>
      )}

      <p className="mt-10 text-xs text-muted">
        No se cuentan: visitas del equipo con sesión iniciada, robots y vistas previas de enlaces, ni quienes activan «No rastrear». Los visitantes únicos se cuentan por día (la misma persona en dos días suma dos).
      </p>
    </div>
  );
}
