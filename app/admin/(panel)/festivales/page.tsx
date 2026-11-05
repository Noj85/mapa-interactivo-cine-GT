import { FestivalsAdmin } from "@/components/admin/FestivalsAdmin";
import { adminStore } from "@/lib/auth";

const PAGE = 40;

export default async function FestivalesPage({ searchParams }: { searchParams: Promise<{ q?: string; p?: string }> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").slice(0, 80);
  const page = Math.max(0, Number(sp.p) || 0);
  const store = await adminStore();
  let rows: Awaited<ReturnType<typeof store.searchFestivals>>["rows"] = [];
  let total = 0;
  let catalogReady = true;
  try {
    ({ rows, total } = await store.searchFestivals(q, { limit: PAGE, offset: page * PAGE }));
  } catch {
    catalogReady = false;
  }
  const usage = catalogReady ? await store.festivalUsage(rows.map((r) => r.id)).catch(() => ({})) : {};
  const all = catalogReady && !q ? total : catalogReady ? (await store.searchFestivals("", { limit: 1 })).total : 0;

  return (
    <div>
      <h1 className="font-display text-4xl tracking-tight">Festivales</h1>
      <p className="mb-6 mt-1 max-w-2xl text-sm text-muted">
        Catálogo de festivales para el autocompletado del formulario. Las producciones se enlazan a estos festivales, pero también pueden llevar festivales escritos a mano; los nuevos entran aquí cuando apruebas un aporte.
      </p>
      {catalogReady ? (
        <FestivalsAdmin rows={rows} usage={usage} total={total} all={all} q={q} page={page} pageSize={PAGE} />
      ) : (
        <div className="rounded-2xl border border-warn/40 bg-warn/5 px-4 py-4 text-sm text-warn">
          El catálogo todavía no existe en la base de datos. Aplica la migración <code>0008_festivals.sql</code> en Supabase y recarga esta página.
        </div>
      )}
    </div>
  );
}
