import Link from "next/link";
import { Suspense } from "react";
import { RecordsTable } from "@/components/admin/RecordsTable";
import { RecordsTabs } from "@/components/admin/RecordsTabs";
import { openRequestCounts, orgRows } from "@/lib/admin-rows";
import { adminStore } from "@/lib/auth";
import { CIRC_CATEGORIES, IND_CATEGORIES } from "@/lib/types";
import { serverGazetteer } from "@/lib/geo/server";

export default async function OrgsPage() {
  const store = await adminStore();
  const [orgs, films, people, gaz, requests] = await Promise.all([
    store.listOrgs({ drafts: true }),
    store.listFilms({ drafts: true }),
    store.listPeople({ drafts: true }).catch(() => []),
    serverGazetteer(),
    store.listInfoRequests({ kind: "org" }).catch(() => []),
  ]);
  orgs.sort((a, b) => a.layer.localeCompare(b.layer) || a.name.localeCompare(b.name));
  return (
    <div>
      <h1 className="font-display text-4xl tracking-tight">Registros</h1>
      <p className="mb-5 mt-1 text-sm text-muted">Decide qué se ve en el mapa, revisa lo que falta y pide la información pendiente.</p>
      <RecordsTabs current="orgs" films={films.length} orgs={orgs.length} people={people.length} />
      {orgs.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-line px-4 py-12 text-center text-sm text-muted">
          Aún no hay entidades. <Link className="text-accent underline" href="/admin/agregar">Agrega datos</Link> con un archivo o a mano.
        </div>
      ) : (
        <Suspense>
          <RecordsTable
            kind="org"
            rows={orgRows(orgs, gaz, openRequestCounts(requests))}
            typeLabel="Categoría"
            typeOptions={[...CIRC_CATEGORIES, ...IND_CATEGORIES].map((c) => ({ value: c, label: c }))}
          />
        </Suspense>
      )}
    </div>
  );
}
