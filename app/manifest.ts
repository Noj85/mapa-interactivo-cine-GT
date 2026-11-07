import type { MetadataRoute } from "next";

/** Datos para «Agregar a la pantalla de inicio» en el celular. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Mapa del Cine de Guatemala",
    short_name: "Mapa del Cine GT",
    description: "Dónde se filma, dónde se ve y quién hace cine en Guatemala.",
    start_url: "/",
    display: "standalone",
    background_color: "#12274d",
    theme_color: "#12274d",
    lang: "es",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
