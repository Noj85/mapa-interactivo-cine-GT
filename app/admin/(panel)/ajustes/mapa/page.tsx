import { MapScopeForm } from "@/components/admin/MapScopeForm";
import { adminStore } from "@/lib/auth";
import { DEFAULT_MAP_SCOPE, MAP_SCOPE_KEY, readMapScope } from "@/lib/site-settings";

export default async function MapaAjustesPage() {
  const store = await adminStore();
  const stored = await store.getSetting(MAP_SCOPE_KEY).catch(() => undefined);
  const ready = stored !== undefined;
  const current = ready ? readMapScope(stored) : DEFAULT_MAP_SCOPE;

  return (
    <div>
      <h2 className="font-display text-2xl tracking-tight">Zona del mapa</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        Elige si el mapa muestra solo Guatemala o también lo que la rodea. Aplica al mapa público y al de /admin; los marcadores «Sin locación» y «Fuera de Guatemala» se quedan en la esquina superior derecha en ambos casos.
      </p>
      <div className="mt-5" />
      {!ready && (
        <div className="mb-4 rounded-2xl border border-warn/40 bg-warn/5 px-4 py-3 text-sm text-warn">
          La tabla de ajustes todavía no existe en la base de datos. Aplica la migración <code>0015_site_settings.sql</code> en Supabase para poder guardar este cambio; mientras tanto el mapa muestra solo Guatemala.
        </div>
      )}
      <MapScopeForm initial={current} />
    </div>
  );
}
