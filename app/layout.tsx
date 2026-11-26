import type { Metadata, Viewport } from "next";
import "maplibre-gl/dist/maplibre-gl.css";
// Tipografía única: Montserrat (licencia SIL OFL 1.1, libre para uso y redistribución), servida desde el propio sitio
// con el paquete @fontsource/montserrat. Regular 400 (texto) · Medium 500 (etiquetas, botones) · SemiBold 600 (títulos)
// · Bold 700 (h1), y la cursiva Regular. Cada peso se descarga solo si una página lo usa; la variable --font-sans
// (que usan Tailwind y globals.css) se define en globals.css.
import "@fontsource/montserrat/400.css";
import "@fontsource/montserrat/400-italic.css";
import "@fontsource/montserrat/500.css";
import "@fontsource/montserrat/600.css";
import "@fontsource/montserrat/700.css";
import { PageViewTracker } from "@/components/PageViewTracker";
import { Providers } from "@/components/Providers";
import "./globals.css";

const SITE_NAME = "Mapa del Cine de Guatemala";
const DESCRIPTION = "Dónde se filma, dónde se ve y quién hace cine en Guatemala: departamentos, municipios y locaciones. Un proyecto de PROCINE y la Academia Guatemalteca de Artes y Ciencias Cinematográficas.";

/**
 * Dirección pública del sitio, para que las imágenes al compartir un enlace (WhatsApp, redes, correo) lleven dirección absoluta.
 * En producción se define con NEXT_PUBLIC_SITE_URL (por ejemplo https://mapa.academiadecinegt.org); en Vercel, si falta, se usa el dominio del proyecto.
 */
function siteUrl() {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.startsWith("http") ? explicit : `https://${explicit}`;
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  return vercel ? `https://${vercel}` : "http://localhost:3000";
}

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: SITE_NAME, template: "%s" },
  description: DESCRIPTION,
  applicationName: SITE_NAME,
  // la imagen (opengraph-image) y los iconos salen de los archivos de esta carpeta
  openGraph: { type: "website", siteName: SITE_NAME, locale: "es_GT", title: SITE_NAME, description: DESCRIPTION },
  twitter: { card: "summary_large_image", title: SITE_NAME, description: DESCRIPTION },
  appleWebApp: { title: "Mapa del Cine GT", capable: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f7fa" },
    { media: "(prefers-color-scheme: dark)", color: "#090d16" },
  ],
  width: "device-width",
  initialScale: 1,
};

// Respeta la elección guardada; si no hay, usa la preferencia del sistema.
const themeScript = `(function(){var d=document.documentElement,t=null;try{t=localStorage.getItem('theme')}catch(e){}if(t!=='dark'&&t!=='light'){t=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}d.setAttribute('data-theme',t)})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="font-sans antialiased">
        <a
          href="#contenido"
          className="sr-only z-50 rounded-lg bg-brand-gradient px-3 py-2 text-sm text-white focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
        >
          Saltar al contenido
        </a>
        <Providers>
          <PageViewTracker />
          <div id="contenido">{children}</div>
        </Providers>
      </body>
    </html>
  );
}
