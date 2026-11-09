import { ArrowRight, Clapperboard, FileUp, Landmark, UserRound } from "lucide-react";
import Link from "next/link";
import { adminStore } from "@/lib/auth";

const options = [
  {
    href: "/admin/cargar",
    icon: FileUp,
    title: "Cargar archivo",
    text: "Sube un Excel, CSV, Word o PDF con muchas producciones o entidades. Revisas lo que entendimos antes de publicar.",
    primary: true,
  },
  {
    href: "/admin/peliculas/nueva",
    icon: Clapperboard,
    title: "Producción a mano",
    text: "Registra una producción con sus locaciones, días de rodaje, inversión y empleos.",
  },
  {
    href: "/admin/entidades/nueva",
    icon: Landmark,
    title: "Entidad a mano",
    text: "Registra un festival, sala, productora, servicio o espacio de formación.",
  },
  {
    href: "/admin/personas/nueva",
    icon: UserRound,
    title: "Persona a mano",
    text: "Registra a una técnica, un técnico o un productor independiente del directorio.",
  },
];

export default async function AddDataPage() {
  const imports = await (await adminStore()).listImports();
  return (
    <div>
      <h1 className="font-display text-4xl tracking-tight">Agregar datos</h1>
      <p className="mt-1 text-sm text-muted">Sube un archivo o registra una producción o entidad a mano.</p>

      <div className="mt-8 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {options.map((o) => (
          <Link
            key={o.href}
            href={o.href}
            className="group flex flex-col rounded-2xl border border-line bg-surface p-5 transition-colors hover:border-accent"
          >
            <span
              className={
                o.primary
                  ? "flex h-11 w-11 items-center justify-center rounded-xl bg-brand-gradient text-white"
                  : "flex h-11 w-11 items-center justify-center rounded-xl bg-accent/12 text-accent"
              }
            >
              <o.icon className="h-5 w-5" />
            </span>
            <span className="mt-4 font-display text-xl">{o.title}</span>
            <span className="mt-1 flex-1 text-sm leading-relaxed text-muted">{o.text}</span>
            <span className="mt-4 flex items-center gap-1 text-sm text-accent">
              Empezar <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
        ))}
      </div>

      {imports.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Cargas recientes</h2>
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface text-sm">
            {imports.slice(0, 8).map((i) => (
              <li key={i.id} className="flex items-center justify-between px-4 py-2.5">
                <span className="truncate">{i.filename}</span>
                <span className="text-xs text-muted">{new Date(i.created_at).toLocaleDateString("es-GT")}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
