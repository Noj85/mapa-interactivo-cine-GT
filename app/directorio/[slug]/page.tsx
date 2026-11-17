import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BrandFooter } from "@/components/site/Brand";
import { SiteHeader } from "@/components/site/SiteHeader";
import { publicStore } from "@/lib/auth";
import { serverGazetteer } from "@/lib/geo/server";
import { filmsCrediting, personRoleLabels } from "@/lib/people";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const person = await publicStore().listPeople().then((rows) => rows.find((p) => p.slug === slug)).catch(() => null);
  return { title: person ? `${person.name} · Directorio` : "Directorio" };
}

export default async function PersonPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = publicStore();
  const [people, films, gaz] = await Promise.all([
    store.listPeople().catch(() => []),
    store.listFilms().catch(() => []),
    serverGazetteer(),
  ]);
  const person = people.find((p) => p.slug === slug);
  if (!person) notFound();
  const muni = gaz.muni(person.muni_ine);
  const depto = gaz.depto(person.depto_ine ?? muni?.depto_ine ?? null);
  const place = muni ? `${muni.name}, ${muni.depto}` : depto?.name ?? null;
  const credits = filmsCrediting(person.name, films);
  const links = [
    person.web ? { href: person.web.startsWith("http") ? person.web : `https://${person.web}`, label: "Sitio web" } : null,
    person.instagram ? { href: person.instagram.startsWith("http") ? person.instagram : `https://instagram.com/${person.instagram.replace(/^@/, "")}`, label: "Instagram" } : null,
    person.imdb ? { href: person.imdb.startsWith("http") ? person.imdb : `https://${person.imdb}`, label: "IMDb" } : null,
    person.portfolio ? { href: person.portfolio.startsWith("http") ? person.portfolio : `https://${person.portfolio}`, label: "Portafolio" } : null,
  ].filter((x): x is { href: string; label: string } => !!x);

  return (
    <div className="min-h-dvh bg-bg">
      <SiteHeader current="/directorio" />
      <main className="mx-auto max-w-3xl px-4 pb-20 pt-10">
        <Link href="/directorio" className="text-sm text-muted hover:text-ink">← Directorio</Link>
        <div className="mt-4 flex gap-4">
          {person.photo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={person.photo_url} alt="" className="h-24 w-24 rounded-2xl object-cover" />
          )}
          <div>
            <h1 className="font-display text-4xl tracking-tight">{person.name}</h1>
            <p className="mt-1 text-sm text-muted">{personRoleLabels(person).join(" · ")}</p>
            {place && <p className="mt-1 text-sm text-muted">{place}</p>}
            {(person.depto_ine != null || person.muni_ine != null) && (
              <p className="mt-2">
                <Link
                  href={`/?capa=industria&tipo=personas&persona=${encodeURIComponent(person.slug)}`}
                  className="text-sm text-accent underline-offset-2 hover:underline"
                >
                  Ver en el mapa
                </Link>
              </p>
            )}
          </div>
        </div>
        {person.bio && <p className="mt-6 text-[15px] leading-relaxed">{person.bio}</p>}
        {person.languages.length > 0 && <p className="mt-4 text-sm text-muted">Idiomas: {person.languages.join(", ")}</p>}
        {(person.public_email || person.public_phone) && (
          <p className="mt-2 text-sm">
            {person.public_email && <a className="underline decoration-line underline-offset-2" href={`mailto:${person.public_email}`}>{person.public_email}</a>}
            {person.public_email && person.public_phone && " · "}
            {person.public_phone}
          </p>
        )}
        {links.length > 0 && (
          <p className="mt-3 flex flex-wrap gap-3 text-sm">
            {links.map((l) => (
              <a key={l.label} className="underline decoration-line underline-offset-2" href={l.href} target="_blank" rel="noreferrer">{l.label}</a>
            ))}
          </p>
        )}
        {person.credits.length > 0 && (
          <section className="mt-8">
            <h2 className="font-display text-2xl tracking-tight">Créditos que declara</h2>
            <ul className="mt-3 space-y-1 text-sm">
              {person.credits.map((c, i) => (
                <li key={i}>{[c.title, c.year, c.role].filter(Boolean).join(" · ")}</li>
              ))}
            </ul>
          </section>
        )}
        {credits.length > 0 && (
          <section className="mt-8">
            <h2 className="font-display text-2xl tracking-tight">En el mapa</h2>
            <p className="mt-1 text-sm text-muted">Producciones publicadas donde aparece este nombre en el equipo.</p>
            <ul className="mt-3 space-y-2 text-sm">
              {credits.map(({ film, roles }) => (
                <li key={film.id}>
                  <span className="font-medium">{film.title}</span>
                  {film.year ? ` (${film.year})` : ""}
                  <span className="text-muted"> · {roles.join(", ")}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
      <BrandFooter />
    </div>
  );
}
