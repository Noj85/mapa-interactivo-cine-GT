import type { Metadata } from "next";
import { BrandFooter } from "@/components/site/Brand";
import { SiteHeader } from "@/components/site/SiteHeader";

export const metadata: Metadata = {
  title: "Créditos y licencias · Mapa del Cine de Guatemala",
  description: "Quién hizo el Mapa del Cine de Guatemala, de quién son los datos y qué mapas, librerías y fuentes de código abierto lo hacen posible.",
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

        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <section className="rounded-2xl border border-line bg-surface p-5">
            <h2 className="font-display text-xl font-semibold">Autoría</h2>
            <dl className="mt-3 space-y-3 text-sm leading-relaxed">
              <div>
                <dt className="font-medium text-ink">Arquitectura, diseño del sistema y desarrollo</dt>
                <dd className="text-muted">Javier Oswaldo Borrayo Mazariegos</dd>
              </div>
              <div>
                <dt className="font-medium text-ink">Diseño gráfico y UI/UX</dt>
                <dd className="text-muted">Por definir.</dd>
              </div>
              <div>
                <dt className="font-medium text-ink">Datos, marcas e institución</dt>
                <dd className="text-muted">Academia de Cine de Guatemala y PROCINE.</dd>
              </div>
            </dl>
            <p className="mt-4 text-xs leading-relaxed text-muted">
              El software es © {new Date().getFullYear()} Javier Oswaldo Borrayo Mazariegos, todos los derechos reservados. Los datos y contenidos del mapa pertenecen a la Academia de Cine de Guatemala y a PROCINE, o a quienes los aportaron. Los logotipos son marcas de sus titulares.
            </p>
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
