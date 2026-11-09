import type { Metadata } from "next";
import { DirectoryBrowser } from "@/components/directory/DirectoryBrowser";
import { BrandFooter } from "@/components/site/Brand";
import { SiteHeader } from "@/components/site/SiteHeader";
import { CREW_ROLES, OTHER_ROLE } from "@/lib/crew";
import { publicStore } from "@/lib/auth";
import { serverGazetteer } from "@/lib/geo/server";
import { IND_CATEGORIES } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Directorio · Mapa del Cine de Guatemala",
  description: "Directorio de técnicas y técnicos del sector cinematográfico y de empresas productoras del audiovisual.",
};

export default async function DirectorioPage() {
  const store = publicStore();
  const gaz = await serverGazetteer();
  const [people, orgs] = await Promise.all([
    store.listPeople().catch(() => []),
    store.listOrgs().catch(() => []),
  ]);
  const deptoName = (code: number | null) => (code != null ? gaz.depto(code)?.name ?? null : null);
  const industry = orgs.filter((o) => o.layer === "industria" && o.status === "published");

  return (
    <div className="min-h-dvh bg-bg">
      <SiteHeader current="/directorio" />
      <main className="mx-auto max-w-6xl px-4 pb-20 pt-10">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">Academia de Cine de Guatemala</p>
        <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight sm:text-[44px]">Directorio</h1>
        <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-muted">
          Técnicas, técnicos y empresas del audiovisual. Los datos los verifica el equipo de la Academia antes de publicarlos.{" "}
          <a className="text-ink underline decoration-line underline-offset-2" href="/registro/persona">Regístrate como persona</a>
          {" o "}
          <a className="text-ink underline decoration-line underline-offset-2" href="/registro/empresa">registra una empresa</a>.
        </p>
        <div className="mt-8">
          <DirectoryBrowser
            people={people.map((p) => ({
              slug: p.slug,
              name: p.name,
              roles: p.roles,
              other_role: p.other_role,
              depto: deptoName(p.depto_ine),
              depto_ine: p.depto_ine,
              photo_url: p.photo_url,
            }))}
            orgs={industry.map((o) => ({
              slug: o.slug,
              name: o.name,
              categories: o.categories,
              depto: deptoName(o.depto_ine),
              depto_ine: o.depto_ine,
            }))}
            deptos={gaz.entries.filter((e) => e.type === "depto").map((e) => ({ code: e.code, name: e.name })).sort((a, b) => a.name.localeCompare(b.name, "es"))}
            roleOptions={CREW_ROLES.map((r) => ({ id: r.id, label: r.id === OTHER_ROLE ? "Otro oficio" : r.label }))}
            categoryOptions={[...IND_CATEGORIES]}
          />
        </div>
      </main>
      <BrandFooter />
    </div>
  );
}
