import Link from "next/link";
import { FilmEditor } from "@/components/admin/FilmEditor";

export default function NewFilm() {
  return (
    <div>
      <Link href="/admin/agregar" className="text-sm text-muted hover:text-ink">← Agregar datos</Link>
      <h1 className="mb-8 mt-2 font-display text-4xl tracking-tight">Nueva producción</h1>
      <FilmEditor />
    </div>
  );
}
