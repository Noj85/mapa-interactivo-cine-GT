import * as maplibregl from "maplibre-gl";

let configured = false;

/** MapLibre 6 sirve el worker como archivo aparte (se copia a /public/vendor). */
export function getMaplibre() {
  if (!configured && typeof window !== "undefined") {
    maplibregl.setWorkerUrl(`${window.location.origin}/vendor/maplibre/maplibre-gl-worker.mjs`);
    configured = true;
  }
  return maplibregl;
}

export type { Map as MapLibreMap } from "maplibre-gl";
