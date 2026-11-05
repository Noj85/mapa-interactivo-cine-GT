import { AdminNav } from "@/components/admin/AdminNav";
import ExplorerLoader from "@/components/explorer/ExplorerLoader";
import { adminStore, requireSession } from "@/lib/auth";

/** /admin: el mismo mapa del público, con la barra del equipo y también los borradores. */
export default async function AdminMapPage() {
  const session = await requireSession();
  const store = await adminStore();
  const [films, orgs, pending, links] = await Promise.all([
    store.listFilms({ drafts: true }),
    store.listOrgs({ drafts: true }),
    store.listSubmissions({ status: "pending" }).then((l) => l.length).catch(() => 0),
    store.festivalOrgMap().catch(() => ({}) as Record<string, string>),
  ]);
  const orgIds = new Set(orgs.map((o) => o.id));
  const festivalOrgs = Object.fromEntries(Object.entries(links).filter(([, id]) => orgIds.has(id)));
  return (
    <div className="flex h-dvh flex-col bg-bg">
      <AdminNav email={session.email} pendingSubmissions={pending} />
      <div className="relative min-h-0 flex-1">
        <ExplorerLoader data={{ films, orgs, festivalOrgs, mode: store.mode }} mode="admin" />
      </div>
    </div>
  );
}
