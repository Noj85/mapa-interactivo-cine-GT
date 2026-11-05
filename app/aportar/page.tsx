import { ClipboardCheck, FileSpreadsheet } from "lucide-react";
import type { Metadata } from "next";
import { ContributeForm } from "@/components/aportar/ContributeForm";
import { BrandFooter } from "@/components/site/Brand";
import { SiteHeader } from "@/components/site/SiteHeader";
import { loadDataset } from "@/lib/data/load";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Aportar · Mapa del Cine de Guatemala",
  description: "Sugiere una producción o una entidad que falta en el mapa, o corrige un dato. El equipo de la Academia lo verifica antes de publicarlo.",
};

export default async function AportarPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const data = await loadDataset();
  const film = one("pelicula") ? data.films.find((f) => f.slug === one("pelicula")) : undefined;
  const org = !film && one("entidad") ? data.orgs.find((o) => o.slug === one("entidad")) : undefined;
  const initialKind = one("tipo") === "entidad" ? "org" : "film";

  return (
    <div className="min-h-dvh bg-bg">
      <SiteHeader current="/aportar" />
      <main className="mx-auto max-w-6xl px-4 pb-20 pt-10">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">Mapa colaborativo</p>
        <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight sm:text-[44px]">
          {film || org ? "Sugerir una corrección" : "Aportar al mapa"}
        </h1>
        <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-muted">
          ¿Falta una producción o una entidad, o hay un dato equivocado? Cuéntanos lo que sabes. Nada se publica de inmediato: el equipo de la Academia verifica cada aporte antes de sumarlo al mapa.
        </p>
        <div className="mt-6 grid gap-3 md:grid-cols-2">
          <aside className="flex items-start gap-3 rounded-2xl border border-accent/40 bg-accent/5 px-4 py-3 text-sm leading-relaxed">
            <ClipboardCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
            <div className="text-muted">
              <p className="font-medium text-ink">Cómo se revisa tu aporte</p>
              <p className="mt-1">
                Cada entrada pasa por un proceso de curaduría: el equipo de la Academia corrobora la fuente que indiques y, si hace falta, completa los datos o te escribe para aclararlos; por eso la fuente y tu correo son obligatorios. Revisarla y aprobarla puede tomar hasta <strong className="font-semibold text-ink">tres días hábiles</strong>. Cuando se aprueba, aparece en el mapa.
              </p>
            </div>
          </aside>
          <aside className="flex items-start gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-sm leading-relaxed">
            <FileSpreadsheet className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
            <p className="text-muted">
              Aquí se aporta un registro a la vez. Si quieres aportar una base de datos o un archivo (Excel, CSV, PDF), escribe a{" "}
              <a className="text-ink underline decoration-line underline-offset-2 hover:decoration-accent" href="mailto:contacto@academiadecinegt.org">
                contacto@academiadecinegt.org
              </a>
              : el equipo de la Academia lo carga y verifica.
            </p>
          </aside>
        </div>
        <div className="mt-8">
          <ContributeForm key={film?.id ?? org?.id ?? "nuevo"} film={film} org={org} initialKind={initialKind} />
        </div>
      </main>
      <BrandFooter />
    </div>
  );
}
