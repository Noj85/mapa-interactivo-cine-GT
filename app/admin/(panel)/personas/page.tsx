import Link from "next/link";
import { RecordsTabs } from "@/components/admin/RecordsTabs";
import { adminStore } from "@/lib/auth";
import { personRoleLabels } from "@/lib/people";

export default async function PeoplePage() {
  const store = await adminStore();
  const [people, films, orgs] = await Promise.all([
    store.listPeople({ drafts: true }).catch(() => []),
    store.listFilms({ drafts: true }),
    store.listOrgs({ drafts: true }),
  ]);
  people.sort((a, b) => a.name.localeCompare(b.name, "es"));
  return (
    <div>
      <h1 className="font-display text-4xl tracking-tight">Registros</h1>
      <p className="mb-5 mt-1 text-sm text-muted">Las personas del directorio no aparecen como puntos en el mapa.</p>
      <RecordsTabs current="people" films={films.length} orgs={orgs.length} people={people.length} />
      {people.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-line px-4 py-12 text-center text-sm text-muted">
          Aún no hay personas. <Link className="text-accent underline" href="/admin/personas/nueva">Registra una</Link> o espera un aporte del directorio.
        </div>
      ) : (
        <ul className="mt-2 divide-y divide-line rounded-2xl border border-line bg-surface">
          {people.map((p) => (
            <li key={p.id}>
              <Link href={`/admin/personas/${p.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-2">
                <span>
                  <span className="font-medium">{p.name}</span>
                  <span className="mt-0.5 block text-xs text-muted">{personRoleLabels(p).join(", ") || "Sin oficio"}</span>
                </span>
                <span className="shrink-0 text-xs text-muted">{p.status === "published" ? "En el directorio" : "Oculta"} · {p.completeness}%</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
