import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "maplibre-gl/dist/maplibre-gl.css";
import { Providers } from "@/components/Providers";
import "./globals.css";

// Tipografía única: Biennale (carpeta /fonts/biennale), en todas sus variantes.
//  Hair 100 · Thin 200 · Ultra Light 250 · Light 300 · Book 350 · Regular 400 (texto) · Medium 500 (etiquetas, botones)
//  SemiBold 600 (títulos) · Bold 700 · Heavy 800 · Black 900, cada una con su cursiva.
// Los archivos se descargan solo cuando una página usa ese peso (preload apagado para no cargar los 22 a la vez).
const biennale = localFont({
  src: [
    { path: "../fonts/biennale/Biennale Hair.otf", weight: "100", style: "normal" },
    { path: "../fonts/biennale/Biennale Hair It.otf", weight: "100", style: "italic" },
    { path: "../fonts/biennale/Biennale Thin.otf", weight: "200", style: "normal" },
    { path: "../fonts/biennale/Biennale Thin It.otf", weight: "200", style: "italic" },
    { path: "../fonts/biennale/Biennale Ultra Light.otf", weight: "250", style: "normal" },
    { path: "../fonts/biennale/Biennale UltraLight It.otf", weight: "250", style: "italic" },
    { path: "../fonts/biennale/Biennale Light.otf", weight: "300", style: "normal" },
    { path: "../fonts/biennale/Biennale Light It.otf", weight: "300", style: "italic" },
    { path: "../fonts/biennale/Biennale Book.otf", weight: "350", style: "normal" },
    { path: "../fonts/biennale/Biennale Book It.otf", weight: "350", style: "italic" },
    { path: "../fonts/biennale/Biennale Regular.otf", weight: "400", style: "normal" },
    { path: "../fonts/biennale/Biennale Regular It.otf", weight: "400", style: "italic" },
    { path: "../fonts/biennale/Biennale Medium.otf", weight: "500", style: "normal" },
    { path: "../fonts/biennale/Biennale Medium It.otf", weight: "500", style: "italic" },
    { path: "../fonts/biennale/Biennale SemiBold.otf", weight: "600", style: "normal" },
    { path: "../fonts/biennale/Biennale SemiBold It.otf", weight: "600", style: "italic" },
    { path: "../fonts/biennale/Biennale Bold.otf", weight: "700", style: "normal" },
    { path: "../fonts/biennale/Biennale Bold It.otf", weight: "700", style: "italic" },
    { path: "../fonts/biennale/Biennale Heavy.otf", weight: "800", style: "normal" },
    { path: "../fonts/biennale/Biennale Heavy It.otf", weight: "800", style: "italic" },
    { path: "../fonts/biennale/Biennale Black.otf", weight: "900", style: "normal" },
    { path: "../fonts/biennale/Biennale Black It.otf", weight: "900", style: "italic" },
  ],
  variable: "--font-sans",
  display: "swap",
  preload: false,
  fallback: ["system-ui", "Segoe UI", "Helvetica Neue", "Arial", "sans-serif"],
});

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
    <html lang="es" data-theme="light" className={biennale.variable} suppressHydrationWarning>
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
          <div id="contenido">{children}</div>
        </Providers>
      </body>
    </html>
  );
}
