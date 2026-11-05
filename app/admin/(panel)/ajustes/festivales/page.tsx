import { FestivalsAdmin } from "@/components/admin/FestivalsAdmin";
import { adminStore } from "@/lib/auth";
import { isFestivalOrg, similarFestivals } from "@/lib/festivals-server";

const PAGE = 40;

export default async function FestivalesPage({ searchParams }: { searchParams: Promise<{ q?: string; p?: string; v?: string }> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").slice(0, 80);
  const page = Math.max(0, Number(sp.p) || 0);
  const link = sp.v === "vinculados" ? "linked" : sp.v === "sin-vincular" ? "unlinked" : undefined;
  const store = await adminStore();
  // el vínculo con Circulación existe solo si se aplicó la migración 0010
  const links = await store.festivalOrgMap().then((m) => ({ ready: true, map: m })).catch(() => ({ ready: false, map: {} as Record<string, string> }));
  const circ = links.ready ? (await store.listOrgs({ drafts: true }).catch(() => [])).filter(isFestivalOrg) : [];
  const linkedOrgs = new Set(Object.values(links.map));
  let rows: Awaited<ReturnType<typeof store.searchFestivals>>["rows"] = [];
  let total = 0;
  let catalogReady = true;
  try {
    ({ rows, total } = await store.searchFestivals(q, { limit: PAGE, offset: page * PAGE, link: links.ready ? link : undefined }));
  } catch {
    catalogReady = false;
  }
  const usage = catalogReady ? await store.festivalUsage(rows.map((r) => r.id)).catch(() => ({})) : {};
  // entidades de Circulación (Festivales) que aún no tienen entrada vinculada, con las entradas parecidas
  const pendingOrgs = await Promise.all(
    circ
      .filter((o) => !linkedOrgs.has(o.id))
      .slice(0, 30)
      .map(async (o) => ({
        id: o.id,
        name: o.name,
        candidates: (await similarFestivals(store, o.name, o.id).catch(() => [])).map((c) => ({ id: c.id, name: c.name })),
      })),
  );
  const all = catalogReady && !q ? total : catalogReady ? (await store.searchFestivals("", { limit: 1 })).total : 0;

  return (
    <div>
      <h2 className="font-display text-2xl tracking-tight">Festivales</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        Lista de referencia para sugerir festivales al registrar producciones. No es la capa Circulación del mapa, aunque un festival puede vincularse a su entidad. Las producciones se enlazan a estos festivales, pero también pueden llevar festivales escritos a mano; los nuevos entran aquí cuando apruebas un aporte.
      </p>
      <div className="mt-5" />
      {catalogReady ? (
        <FestivalsAdmin
          rows={rows}
          usage={usage}
          total={total}
          all={all}
          q={q}
          page={page}
          pageSize={PAGE}
          linkReady={links.ready}
          links={links.map}
          orgs={circ.map((o) => ({ id: o.id, name: o.name, status: o.status }))}
          pendingOrgs={pendingOrgs}
          view={link === "linked" ? "vinculados" : link === "unlinked" ? "sin-vincular" : ""}
        />
      ) : (
        <div className="rounded-2xl border border-warn/40 bg-warn/5 px-4 py-4 text-sm text-warn">
          El catálogo todavía no existe en la base de datos. Aplica la migración <code>0008_festivals.sql</code> en Supabase y recarga esta página.
        </div>
      )}
    </div>
  );
}
