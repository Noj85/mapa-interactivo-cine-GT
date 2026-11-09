import Link from "next/link";
import { LocationsUnify, type UnifyCard } from "@/components/admin/LocationsUnify";
import { adminStore } from "@/lib/auth";
import { serverGazetteer } from "@/lib/geo/server";
import { unifyLocations } from "@/lib/locations";
import { locText } from "@/lib/submissions";

export default async function UnifyLocationsPage() {
  const store = await adminStore();
  const [films, gaz] = await Promise.all([store.listFilms({ drafts: true }), serverGazetteer()]);
  films.sort((a, b) => a.title.localeCompare(b.title));

  const cards: UnifyCard[] = [];
  for (const f of films) {
    const res = unifyLocations(f.locations);
    if (!res.merged.length && !res.manual.length) continue;
    cards.push({
      id: f.id,
      title: f.title,
      year: f.year,
      before: f.locations.map((l) => locText(l, gaz)),
      after: res.locations.map((l) => locText(l, gaz)),
      groups: res.merged.map((g) => ({ reason: g.reason, rows: g.from.map((l) => locText(l, gaz)), result: locText(g.result, gaz), changes: g.changes })),
      manual: res.manual.map((m) => ({
        depto: gaz.depto(m.depto)?.name ?? `Departamento ${m.depto}`,
        munis: m.munis.map((code) => gaz.muni(code)?.name ?? String(code)),
        rows: m.rows.map((l) => locText(l, gaz)),
      })),
    });
  }

  return (
    <div className="max-w-4xl">
      <Link href="/admin/peliculas" className="text-sm text-muted hover:text-ink">← Producciones</Link>
      <h1 className="mt-2 font-display text-4xl tracking-tight">Locaciones repetidas por departamento</h1>
      <p className="mb-6 mt-1 text-sm text-muted">
        En un departamento solo cuenta como locación aparte la que tiene un municipio distinto: una fila sin municipio es la misma locación, y las filas del mismo municipio también. Al unir nunca se suman cifras: se conserva la mayor, y el sitio y las coordenadas se completan si faltan.
      </p>
      <LocationsUnify cards={cards} />
    </div>
  );
}
