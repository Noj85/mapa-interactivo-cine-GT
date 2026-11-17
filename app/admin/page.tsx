import { AdminNav } from "@/components/admin/AdminNav";
import ExplorerLoader from "@/components/explorer/ExplorerLoader";
import { adminStore, requireSession } from "@/lib/auth";
import { toMapPerson } from "@/lib/people";
import { PUBLIC_STATS_KEY, readPublicStats } from "@/lib/site-settings";

/** /admin: el mismo mapa del público, con la barra del equipo y también los borradores. */
export default async function AdminMapPage() {
  const session = await requireSession();
  const store = await adminStore();
  const [films, orgs, people, pending, links, stats] = await Promise.all([
    store.listFilms({ drafts: true }),
    store.listOrgs({ drafts: true }),
    store.listPeople({ drafts: true }).catch(() => []),
    store.listSubmissions({ status: "pending" }).then((l) => l.length).catch(() => 0),
    store.festivalOrgMap().catch(() => ({}) as Record<string, string>),
    store.getSetting(PUBLIC_STATS_KEY).catch(() => null),
  ]);
  const orgIds = new Set(orgs.map((o) => o.id));
  const festivalOrgs = Object.fromEntries(Object.entries(links).filter(([, id]) => orgIds.has(id)));
  return (
    <div className="flex h-dvh flex-col bg-bg">
      <AdminNav email={session.email} pendingSubmissions={pending} />
      <div className="relative min-h-0 flex-1">
        <ExplorerLoader data={{ films, orgs, people: people.map(toMapPerson), festivalOrgs, mode: store.mode, publicStats: readPublicStats(stats) }} mode="admin" />
      </div>
    </div>
  );
}
