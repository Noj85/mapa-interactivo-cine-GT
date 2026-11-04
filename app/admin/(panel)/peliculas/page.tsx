import Link from "next/link";
import { BulkPosterUploader } from "@/components/admin/BulkPosterUploader";
import { PublishDrafts } from "@/components/admin/PublishDrafts";
import { RecordsTabs } from "@/components/admin/RecordsTabs";
import { isUnlocated } from "@/lib/map/features";
import { CompletenessBadge } from "@/components/ui/Badges";
import { adminStore } from "@/lib/auth";
import { posterThumb } from "@/lib/poster-url";
import { FILM_KINDS } from "@/lib/types";

export default async function FilmsPage() {
  const store = await adminStore();
  const [allFilms, orgs] = await Promise.all([store.listFilms({ drafts: true }), store.listOrgs({ drafts: true })]);
  const films = [...allFilms].sort((a, b) => a.title.localeCompare(b.title));
  return (
    <div>
      <h1 className="font-display text-4xl tracking-tight">Registros</h1>
      <p className="mb-5 mt-1 text-sm text-muted">Revisa, edita y publica lo que ya está en el mapa.</p>
      <RecordsTabs current="films" films={films.length} orgs={orgs.length} />
      {films.some((f) => f.status === "draft") && (
        <div className="mt-4">
          <PublishDrafts
            drafts={films.filter((f) => f.status === "draft").length}
            withoutPlace={films.filter((f) => f.status === "draft" && isUnlocated(f)).length}
          />
        </div>
      )}
      {films.length > 0 && (
        <div className="mt-4">
          <BulkPosterUploader films={films.map((f) => ({ id: f.id, title: f.title, slug: f.slug }))} />
        </div>
      )}
      {films.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-line px-4 py-12 text-center text-sm text-muted">
          Aún no hay películas. <Link className="text-accent underline" href="/admin/agregar">Agrega datos</Link> con un archivo o a mano.
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-2xl border border-line bg-surface">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-xs uppercase tracking-wider text-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">Título</th>
                <th className="hidden px-4 py-2.5 font-medium sm:table-cell">Año</th>
                <th className="hidden px-4 py-2.5 font-medium md:table-cell">Tipo</th>
                <th className="px-4 py-2.5 font-medium">Locaciones</th>
                <th className="px-4 py-2.5 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {films.map((f) => (
                <tr key={f.id} className="transition-colors hover:bg-surface-2/50">
                  <td className="px-4 py-2.5">
                    <Link href={`/admin/peliculas/${f.id}`} className="flex items-center gap-3 hover:text-accent">
                      <span className="h-10 w-7 shrink-0 overflow-hidden rounded-[3px] bg-surface-2">
                        {f.poster_url && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={posterThumb(f.poster_url)!} alt="" loading="lazy" className="h-full w-full object-cover" />
                        )}
                      </span>
                      <span className="font-display text-[15px]">{f.title}</span>
                    </Link>
                  </td>
                  <td className="hidden px-4 py-2.5 text-muted sm:table-cell">{f.year ?? "—"}</td>
                  <td className="hidden px-4 py-2.5 text-muted md:table-cell">{FILM_KINDS.find((k) => k.id === f.kind)?.label ?? "—"}</td>
                  <td className="px-4 py-2.5 text-muted">{f.locations.length}</td>
                  <td className="px-4 py-2.5">
                    <span className="flex flex-wrap items-center gap-1.5">
                      {f.status === "draft" && <span className="chip !py-0 text-[11px]">Borrador</span>}
                      <CompletenessBadge pct={f.completeness} missing={f.missing_fields} compact />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
