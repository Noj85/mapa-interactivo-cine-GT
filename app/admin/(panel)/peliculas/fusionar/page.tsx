import Link from "next/link";
import { notFound } from "next/navigation";
import { FilmMerge } from "@/components/admin/FilmMerge";
import { adminStore } from "@/lib/auth";
import { serverGazetteer } from "@/lib/geo/server";
import { planMerge } from "@/lib/merge-films";

export default async function MergeFilmsPage({ searchParams }: { searchParams: Promise<{ a?: string; b?: string }> }) {
  const { a: aId, b: bId } = await searchParams;
  if (!aId || !bId || aId === bId) notFound();
  const store = await adminStore();
  const [x, y, gaz] = await Promise.all([store.getFilm(aId), store.getFilm(bId), serverGazetteer()]);
  if (!x || !y) notFound();
  // A es la más completa: de entrada se queda ella
  const [a, b] = x.completeness >= y.completeness ? [x, y] : [y, x];
  const plan = planMerge(a, b, gaz);
  const card = (f: typeof a) => ({
    id: f.id,
    title: f.title,
    year: f.year,
    completeness: f.completeness,
    published: f.status === "published",
    poster: f.poster_url ?? null,
    locations: f.locations.length,
  });
  return (
    <div className="max-w-4xl">
      <Link href="/admin/peliculas" className="text-sm text-muted hover:text-ink">← Producciones</Link>
      <h1 className="mt-2 font-display text-4xl tracking-tight">Fusionar duplicados</h1>
      <p className="mb-6 mt-1 text-sm text-muted">
        Elige qué se queda de cada versión. Al fusionar, la producción que se queda guarda lo elegido y recibe los aportes y solicitudes de la otra; la otra se borra.
      </p>
      <FilmMerge a={card(a)} b={card(b)} plan={plan} />
    </div>
  );
}
