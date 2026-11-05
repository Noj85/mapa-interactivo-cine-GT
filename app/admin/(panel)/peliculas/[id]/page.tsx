import Link from "next/link";
import { notFound } from "next/navigation";
import { FilmEditor } from "@/components/admin/FilmEditor";
import { adminStore } from "@/lib/auth";

export default async function EditFilm({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const film = await (await adminStore()).getFilm(id);
  if (!film) notFound();
  return (
    <div>
      <Link href="/admin/peliculas" className="text-sm text-muted hover:text-ink">← Producciones</Link>
      <h1 className="mb-8 mt-2 font-display text-4xl tracking-tight">{film.title}</h1>
      <FilmEditor key={film.id + film.completeness} film={film} />
    </div>
  );
}
