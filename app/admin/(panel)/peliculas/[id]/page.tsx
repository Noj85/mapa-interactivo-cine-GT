import Link from "next/link";
import { notFound } from "next/navigation";
import { FilmEditor } from "@/components/admin/FilmEditor";
import { RequestsPanel } from "@/components/admin/RequestsPanel";
import { adminStore } from "@/lib/auth";

export default async function EditFilm({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const store = await adminStore();
  const film = await store.getFilm(id);
  if (!film) notFound();
  const requests = await store.listInfoRequests({ kind: "film", target_id: id }).catch(() => []);
  return (
    <div>
      <Link href="/admin/peliculas" className="text-sm text-muted hover:text-ink">← Producciones</Link>
      <h1 className="mb-8 mt-2 font-display text-4xl tracking-tight">{film.title}</h1>
      <FilmEditor key={film.id + film.completeness} film={film} />
      <RequestsPanel kind="film" id={film.id} title={film.title} requests={requests} />
    </div>
  );
}
