import type { Metadata } from "next";
import { DownloadsBuilder } from "@/components/downloads/DownloadsBuilder";
import { BrandFooter } from "@/components/site/Brand";
import { SiteHeader } from "@/components/site/SiteHeader";
import { loadDataset } from "@/lib/data/load";
import { serverGazetteer } from "@/lib/geo/server";

export const revalidate = 60;
export const metadata: Metadata = {
  title: "Descargas · Mapa del Cine de Guatemala",
  description: "Descarga en CSV o Excel las producciones, la circulación y las entidades del mapa, filtradas por departamento, tipo, año, presupuesto y más.",
};

export default async function DescargasPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [data, gaz, sp] = await Promise.all([loadDataset(), serverGazetteer(), searchParams]);
  const initial = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (typeof v === "string") initial.set(k, v);

  const deptos = gaz.entries
    .filter((e) => e.type === "depto")
    .map((e) => ({ code: e.code, name: e.name }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
  const names = Object.fromEntries(gaz.entries.map((e) => [`${e.type}:${e.code}`, e.name]));

  return (
    <div className="min-h-dvh bg-bg">
      <SiteHeader current="/descargas" />
      <main className="mx-auto max-w-6xl px-4 pb-20 pt-10">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">Datos abiertos</p>
        <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight sm:text-[44px]">Descargas</h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted">
          Elige entre producciones, circulación o entidades y filtra por lugar, tipo de obra, año o presupuesto. Te llevas un archivo CSV o Excel con lo que coincide, listo para tu informe, tesis o proyecto.
        </p>
        <DownloadsBuilder
          films={data.films}
          orgs={data.orgs}
          deptos={deptos}
          names={names}
          initialQuery={initial.toString()}
        />
      </main>
      <BrandFooter />
    </div>
  );
}
