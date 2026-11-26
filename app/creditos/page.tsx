import type { Metadata } from "next";
import Link from "next/link";
import { Award } from "lucide-react";
import { BrandFooter } from "@/components/site/Brand";
import { SiteHeader } from "@/components/site/SiteHeader";

export const metadata: Metadata = {
  title: "Créditos y licencias · Mapa del Cine de Guatemala",
  description: "Quién hizo el Mapa del Cine de Guatemala, quiénes aportaron datos a su base de datos y qué mapas, librerías y fuentes de código abierto lo hacen posible.",
};

const LIBS: { name: string; license: string; href: string }[] = [
  { name: "Next.js", license: "MIT", href: "https://nextjs.org" },
  { name: "React", license: "MIT", href: "https://react.dev" },
  { name: "MapLibre GL JS", license: "BSD-3-Clause", href: "https://maplibre.org" },
  { name: "Supabase", license: "MIT", href: "https://supabase.com" },
  { name: "Framer Motion", license: "MIT", href: "https://www.framer.com/motion/" },
  { name: "Lucide", license: "ISC", href: "https://lucide.dev" },
  { name: "Zod", license: "MIT", href: "https://zod.dev" },
  { name: "sharp", license: "Apache-2.0", href: "https://sharp.pixelplumbing.com" },
  { name: "SheetJS (xlsx)", license: "Apache-2.0", href: "https://sheetjs.com" },
  { name: "pdf-lib y unpdf", license: "MIT", href: "https://pdf-lib.js.org" },
  { name: "Anthropic SDK", license: "Apache-2.0", href: "https://www.anthropic.com" },
];

const SOURCES: { name: string; text: string; href: string }[] = [
  {
    name: "Mapa base",
    text: "© colaboradores de OpenStreetMap (licencia ODbL), teselas de OpenFreeMap y esquema OpenMapTiles.",
    href: "https://www.openstreetmap.org/copyright",
  },
  { name: "Vista satelital", text: "Imágenes © Esri, Maxar, Earthstar Geographics y la comunidad de usuarios de GIS.", href: "https://www.esri.com" },
  {
    name: "Límites de departamentos y municipios",
    text: "Datos abiertos del Ministerio de Finanzas Públicas (MINFIN) y códigos del Instituto Nacional de Estadística (INE).",
    href: "https://github.com/minfin-bi/mapas",
  },
  {
    name: "Catálogo de festivales",
    text: "Nombres, países y ciudades de festivales a partir de la «Festival library» del proyecto Film Circulation (Zenodo), licencia CC BY 4.0. Se limpió y tradujo para este mapa.",
    href: "https://creativecommons.org/licenses/by/4.0/",
  },
];

const A = "text-ink underline decoration-line underline-offset-2 hover:decoration-accent";

export default function CreditosPage() {
  return (
    <div className="min-h-dvh bg-bg">
      <SiteHeader current="/creditos" />
      <main className="mx-auto max-w-6xl px-4 pb-20 pt-10">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">Reconocimientos</p>
        <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight sm:text-[44px]">Créditos y licencias</h1>
        <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-muted">
          El Mapa del Cine de Guatemala es posible gracias a las personas, instituciones y proyectos de código abierto que se reconocen aquí.
        </p>

        <section className="mt-10" aria-labelledby="aportes">
          <article className="relative overflow-hidden rounded-3xl border border-accent/40 bg-accent/5 p-6 sm:p-8">
            <Award className="pointer-events-none absolute -right-4 -top-4 h-36 w-36 text-accent/10" aria-hidden />
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-accent">
              <Award className="h-4 w-4" aria-hidden /> Agradecimiento especial
            </p>
            <h2 id="aportes" className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              Alberto Jiménez
            </h2>
            <p className="mt-1 text-sm font-medium text-ink">
              Director ejecutivo de la Redccapfa, Red Centroamericana y del Caribe del Patrimonio Fílmico y Audiovisual
            </p>
            <p className="mt-4 max-w-3xl text-[15px] leading-relaxed text-ink/85">
              Una contribución muy valiosa a este mapa: los datos que aportó son resultado de una investigación exhaustiva del patrimonio fílmico y audiovisual. Su trabajo, minucioso y generoso, enriqueció de manera notable la información que hoy se consulta aquí.
            </p>
          </article>

          <article className="mt-4 rounded-2xl border border-line bg-surface p-5">
            <h2 className="font-display text-xl font-semibold">Aportes a la base de datos</h2>
            <dl className="mt-3 text-sm leading-relaxed">
              <dt className="font-medium text-ink">Comisión de Investigación y Preservación de PROCINE 2025</dt>
              <dd className="text-muted">
                Levantamiento, investigación y sistematización de información sobre obras y entidades del cine guatemalteco.
              </dd>
            </dl>
            <p className="mt-4 text-xs leading-relaxed text-muted">
              La información del mapa no se reclama como propiedad de nadie: se reconoce a quienes la investigaron y se puede descargar en cualquier momento, con filtros, desde la página de{" "}
              <Link href="/descargas" className={A}>
                descargas
              </Link>
              .
            </p>
          </article>
        </section>

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <section className="rounded-2xl border border-line bg-surface p-5">
            <h2 className="font-display text-xl font-semibold">Autoría</h2>
            <dl className="mt-3 text-sm leading-relaxed">
              <div>
                <dt className="font-medium text-ink">Arquitectura, diseño del sistema, desarrollo, diseño gráfico y UI/UX</dt>
                <dd className="text-muted">Javier Borrayo </dd>
              </div>
            </dl>
            <p className="mt-4 text-xs leading-relaxed text-muted">Los logotipos son marcas de sus titulares.</p>
          </section>

          <section className="rounded-2xl border border-line bg-surface p-5">
            <h2 className="font-display text-xl font-semibold">Mapas y fuentes de datos</h2>
            <ul className="mt-3 space-y-3 text-sm leading-relaxed">
              {SOURCES.map((s) => (
                <li key={s.name}>
                  <a className={`font-medium ${A}`} href={s.href} target="_blank" rel="noreferrer">
                    {s.name}
                  </a>
                  <p className="text-muted">{s.text}</p>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <section className="mt-6 rounded-2xl border border-line bg-surface p-5">
          <h2 className="font-display text-xl font-semibold">Privacidad</h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">
            Para saber cuánta gente usa el mapa medimos las visitas de forma anónima: sin cookies, sin guardar tu dirección IP y sin compartir nada con terceros. Si prefieres que no se cuente tu visita, activa «No rastrear» en tu navegador.
          </p>
        </section>

        <section className="mt-6 rounded-2xl border border-line bg-surface p-5">
          <h2 className="font-display text-xl font-semibold">Código abierto que usamos</h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">
            Estas librerías conservan sus propias licencias. Aquí se resumen las principales; el texto completo de cada licencia y su aviso de copyright están en el{" "}
            <a className={A} href="/licencias.txt" target="_blank" rel="noreferrer">
              archivo de licencias
            </a>
            .
          </p>
          <ul className="mt-4 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {LIBS.map((l) => (
              <li key={l.name} className="flex items-baseline justify-between gap-3 border-b border-line/60 py-1.5">
                <a className={A} href={l.href} target="_blank" rel="noreferrer">
                  {l.name}
                </a>
                <span className="shrink-0 text-xs text-muted">{l.license}</span>
              </li>
            ))}
          </ul>
        </section>
      </main>
      <BrandFooter />
    </div>
  );
}
