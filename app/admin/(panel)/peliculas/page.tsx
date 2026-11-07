import Link from "next/link";
import { Suspense } from "react";
import { BulkPosterUploader } from "@/components/admin/BulkPosterUploader";
import { RecordsTable } from "@/components/admin/RecordsTable";
import { RecordsTabs } from "@/components/admin/RecordsTabs";
import { openRequestCounts, filmRows } from "@/lib/admin-rows";
import { adminStore } from "@/lib/auth";
import { serverGazetteer } from "@/lib/geo/server";
import { FORMATS } from "@/lib/film-types";
import { likelyDuplicates } from "@/lib/merge-films";

export default async function FilmsPage() {
  const store = await adminStore();
  const [films, orgs, gaz, requests] = await Promise.all([
    store.listFilms({ drafts: true }),
    store.listOrgs({ drafts: true }),
    serverGazetteer(),
    // si todavía no se aplicó la migración de solicitudes, el listado sigue funcionando
    store.listInfoRequests({ kind: "film" }).catch(() => []),
  ]);
  films.sort((a, b) => a.title.localeCompare(b.title));
  const dupes = likelyDuplicates(films);
  const byId = new Map(films.map((f) => [f.id, f]));
  return (
    <div>
      <h1 className="font-display text-4xl tracking-tight">Registros</h1>
      <p className="mb-5 mt-1 text-sm text-muted">Decide qué se ve en el mapa, revisa lo que falta y pide la información pendiente.</p>
      <RecordsTabs current="films" films={films.length} orgs={orgs.length} />
      {films.length > 0 && (
        <div className="mb-4">
          <BulkPosterUploader films={films.map((f) => ({ id: f.id, title: f.title, slug: f.slug }))} />
        </div>
      )}
      {dupes.length > 0 && (
        <details className="mb-4 rounded-2xl border border-warn/30 bg-warn/5 px-4 py-3 text-sm">
          <summary className="cursor-pointer font-medium">
            {dupes.length === 1 ? "1 posible duplicado" : `${dupes.length} posibles duplicados`} (mismo título y año)
          </summary>
          <ul className="mt-2 space-y-1.5">
            {dupes.slice(0, 50).map(([x, y]) => {
              const fx = byId.get(x)!;
              const fy = byId.get(y)!;
              return (
                <li key={`${x}-${y}`} className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0">
                    {fx.title} {fx.year ? `(${fx.year})` : ""} <span className="text-muted">· {fx.locations.length} loc. · {fx.completeness}%</span>
                    <span className="mx-1.5 text-muted">y</span>
                    {fy.title} {fy.year ? `(${fy.year})` : ""} <span className="text-muted">· {fy.locations.length} loc. · {fy.completeness}%</span>
                  </span>
                  <Link className="text-accent underline underline-offset-2" href={`/admin/peliculas/fusionar?a=${x}&b=${y}`}>Fusionar</Link>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-xs text-muted">También puedes marcar dos filas en la tabla y usar «Fusionar».</p>
        </details>
      )}
      {films.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-line px-4 py-12 text-center text-sm text-muted">
          Aún no hay producciones. <Link className="text-accent underline" href="/admin/agregar">Agrega datos</Link> con un archivo o a mano.
        </div>
      ) : (
        <Suspense>
          <RecordsTable
            kind="film"
            rows={filmRows(films, gaz, openRequestCounts(requests))}
            typeLabel="Formato"
            typeOptions={[...FORMATS.map((k) => ({ value: k.id, label: k.label })), { value: "sin_formato", label: "Sin formato (por revisar)" }]}
          />
        </Suspense>
      )}
    </div>
  );
}
