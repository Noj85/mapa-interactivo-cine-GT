import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BrandFooter } from "@/components/site/Brand";
import { SiteHeader } from "@/components/site/SiteHeader";
import { publicStore } from "@/lib/auth";
import { serverGazetteer } from "@/lib/geo/server";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const org = await publicStore().listOrgs().then((rows) => rows.find((o) => o.slug === slug && o.layer === "industria")).catch(() => null);
  return { title: org ? `${org.name} · Directorio` : "Directorio" };
}

export default async function EmpresaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = publicStore();
  const [orgs, gaz] = await Promise.all([store.listOrgs().catch(() => []), serverGazetteer()]);
  const org = orgs.find((o) => o.slug === slug && o.layer === "industria");
  if (!org) notFound();
  const muni = gaz.muni(org.muni_ine);
  const depto = gaz.depto(org.depto_ine ?? muni?.depto_ine ?? null);
  const place = muni ? `${muni.name}, ${muni.depto}` : depto?.name ?? org.city;

  return (
    <div className="min-h-dvh bg-bg">
      <SiteHeader current="/directorio" />
      <main className="mx-auto max-w-3xl px-4 pb-20 pt-10">
        <Link href="/directorio" className="text-sm text-muted hover:text-ink">← Directorio</Link>
        <h1 className="mt-4 font-display text-4xl tracking-tight">{org.name}</h1>
        <p className="mt-1 text-sm text-muted">{org.categories.join(" · ")}</p>
        {place && <p className="mt-1 text-sm text-muted">{place}</p>}
        {org.description && <p className="mt-6 text-[15px] leading-relaxed">{org.description}</p>}
        {org.contact && <p className="mt-4 text-sm">{org.contact}</p>}
        <p className="mt-3 flex flex-wrap gap-3 text-sm">
          {org.web && <a className="underline decoration-line underline-offset-2" href={org.web.startsWith("http") ? org.web : `https://${org.web}`} target="_blank" rel="noreferrer">Sitio web</a>}
          {org.instagram && <a className="underline decoration-line underline-offset-2" href={org.instagram.startsWith("http") ? org.instagram : `https://instagram.com/${org.instagram.replace(/^@/, "")}`} target="_blank" rel="noreferrer">Instagram</a>}
        </p>
        <p className="mt-6 text-sm text-muted">También aparece en la capa Industria del mapa.</p>
      </main>
      <BrandFooter />
    </div>
  );
}
