import { categoriesText } from "@/lib/categories";
import Link from "next/link";
import { RecordsTabs } from "@/components/admin/RecordsTabs";
import { OrgLogo } from "@/components/explorer/parts";
import { CompletenessBadge } from "@/components/ui/Badges";
import { adminStore } from "@/lib/auth";
import { serverGazetteer } from "@/lib/geo/server";
import { LAYERS } from "@/lib/types";

export default async function OrgsPage() {
  const store = await adminStore();
  const [orgs, films, gaz] = await Promise.all([store.listOrgs({ drafts: true }), store.listFilms({ drafts: true }), serverGazetteer()]);
  orgs.sort((a, b) => a.layer.localeCompare(b.layer) || a.name.localeCompare(b.name));
  return (
    <div>
      <h1 className="font-display text-4xl tracking-tight">Registros</h1>
      <p className="mb-5 mt-1 text-sm text-muted">Revisa, edita y publica lo que ya está en el mapa.</p>
      <RecordsTabs current="orgs" films={films.length} orgs={orgs.length} />
      {orgs.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-line px-4 py-12 text-center text-sm text-muted">
          Aún no hay entidades. <Link className="text-accent underline" href="/admin/agregar">Agrega datos</Link> con un archivo o a mano.
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-2xl border border-line bg-surface">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-xs uppercase tracking-wider text-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">Nombre</th>
                <th className="hidden px-4 py-2.5 font-medium sm:table-cell">Capa</th>
                <th className="hidden px-4 py-2.5 font-medium md:table-cell">Categoría</th>
                <th className="hidden px-4 py-2.5 font-medium md:table-cell">Lugar</th>
                <th className="px-4 py-2.5 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {orgs.map((o) => (
                <tr key={o.id} className="transition-colors hover:bg-surface-2/50">
                  <td className="px-4 py-2.5">
                    <Link href={`/admin/entidades/${o.id}`} className="flex items-center gap-3 font-display text-[15px] hover:text-accent">
                      <OrgLogo org={o} className="h-8 w-8 rounded-lg" />
                      {o.name}
                    </Link>
                  </td>
                  <td className="hidden px-4 py-2.5 text-muted sm:table-cell">{LAYERS.find((l) => l.id === o.layer)?.label}</td>
                  <td className="hidden px-4 py-2.5 text-muted md:table-cell">{categoriesText(o)}</td>
                  <td className="hidden px-4 py-2.5 text-muted md:table-cell">
                    {gaz.muni(o.muni_ine)?.name ?? gaz.depto(o.depto_ine)?.name ?? "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="flex flex-wrap items-center gap-1.5">
                      {o.status === "draft" && <span className="chip !py-0 text-[11px]">Borrador</span>}
                      <CompletenessBadge pct={o.completeness} missing={o.missing_fields} compact />
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
