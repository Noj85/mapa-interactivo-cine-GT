import type * as MapLibre from "maplibre-gl";

/**
 * Íconos de los marcadores «Sin locación» (un pin punteado con signo de pregunta) y «Fuera de Guatemala»
 * (un globo con una flecha hacia afuera). Cada uno en dos versiones: normal y elegida (con el color de la capa).
 */
const SIZE = 80;

const nowhereSvg = (fg: string, bg: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 24 24">
<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" fill="${bg}" stroke="${fg}" stroke-width="1.5" stroke-dasharray="2.1 1.5" stroke-linejoin="round"/>
<path d="M10.1 8.3a1.95 1.95 0 1 1 2.75 1.8c-.55.24-.85.62-.85 1.15v.45" fill="none" stroke="${fg}" stroke-width="1.6" stroke-linecap="round"/>
<circle cx="12" cy="13.9" r=".95" fill="${fg}"/>
</svg>`;

const abroadSvg = (fg: string, bg: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 24 24">
<circle cx="11" cy="13" r="9" fill="${bg}" stroke="${fg}" stroke-width="1.5"/>
<path d="M11 4a13 13 0 0 0 0 18 13 13 0 0 0 0-18M2 13h18" fill="none" stroke="${fg}" stroke-width="1.3"/>
<circle cx="19" cy="5" r="4.3" fill="${fg}" stroke="${bg}" stroke-width="1"/>
<path d="M17.3 6.7l3.3-3.3M18.1 3.4h2.5v2.5" fill="none" stroke="${bg}" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

function put(map: MapLibre.Map, id: string, svg: string) {
  const img = new Image(SIZE, SIZE);
  img.onload = () => {
    // el estilo pudo cambiar (tema) mientras cargaba: se pone o se reemplaza
    if (map.hasImage(id)) map.updateImage(id, img);
    else map.addImage(id, img, { pixelRatio: 2 });
  };
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function loadZoneIcons(map: MapLibre.Map, c: { fg: string; sel: string; bg: string }) {
  put(map, "zone-nowhere", nowhereSvg(c.fg, c.bg));
  put(map, "zone-nowhere-sel", nowhereSvg(c.sel, c.bg));
  put(map, "zone-abroad", abroadSvg(c.fg, c.bg));
  put(map, "zone-abroad-sel", abroadSvg(c.sel, c.bg));
}
