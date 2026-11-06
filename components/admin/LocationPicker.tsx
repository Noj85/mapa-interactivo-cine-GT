"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { Check, Globe2, Map as MapIcon, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { loadGeo, type GeoBundle } from "@/lib/geo/load";
import { LAYER_COLORS } from "@/lib/map/colors";
import { getMaplibre, type MapLibreMap } from "@/lib/map/maplibre";
import { buildStyle } from "@/lib/map/style";

/** Color de Producción (magenta) según el tema actual, para el marcador y el municipio elegido. */
const pickerColor = () => LAYER_COLORS.produccion[document.documentElement.dataset.theme === "light" ? "light" : "dark"];

export interface PickedPoint {
  lat: number;
  lng: number;
  muni_ine: number | null;
  depto_ine: number | null;
}

/** Modal con un mapa: clic para elegir el punto exacto; detecta el municipio solo. */
export function LocationPicker({
  initial,
  onPick,
  onClose,
}: {
  initial?: { lat: number | null; lng: number | null; muni_ine?: number | null; depto_ine?: number | null };
  onPick(p: PickedPoint): void;
  onClose(): void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<any>(null);
  const [geo, setGeo] = useState<GeoBundle | null>(null);
  const [point, setPoint] = useState<PickedPoint | null>(
    initial?.lat != null && initial?.lng != null
      ? { lat: initial.lat, lng: initial.lng, muni_ine: initial.muni_ine ?? null, depto_ine: initial.depto_ine ?? null }
      : null,
  );
  const [q, setQ] = useState("");
  const [satellite, setSatellite] = useState(false);
  const [hover, setHover] = useState<string | null>(null);

  useEffect(() => {
    loadGeo().then(setGeo);
  }, []);

  const results = useMemo(() => (geo && q ? geo.gaz.search(q, 5) : []), [geo, q]);
  const place = geo && point ? (geo.gaz.muni(point.muni_ine) ?? geo.gaz.depto(point.depto_ine)) : null;

  useEffect(() => {
    if (!geo || !el.current) return;
    let cancelled = false;
    let map: MapLibreMap | null = null;
    const theme = document.documentElement.dataset.theme === "light" ? "light" : "dark";
    (async () => {
      const style = await buildStyle(theme, { labels: true });
      if (cancelled || !el.current) return;
      const ml = getMaplibre();
      map = new ml.Map({
        container: el.current,
        style: style as any,
        center: point ? [point.lng, point.lat] : [-90.4, 15.5],
        zoom: point ? 12 : 6.5,
        minZoom: 5,
        dragRotate: false,
        attributionControl: {
          compact: true,
          customAttribution: "Datos © <a href='https://www.openstreetmap.org/copyright' target='_blank' rel='noreferrer'>colaboradores de OpenStreetMap</a>",
        },
      });
      mapRef.current = map;
      map.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");
      map.on("load", () => {
        const m = map!;
        const dark = theme === "dark";
        const halo = dark ? "rgba(11,15,25,0.92)" : "rgba(255,255,255,0.95)";
        // satélite (apagado): debajo de las etiquetas
        m.addSource("sat", {
          type: "raster",
          tiles: ["https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
          tileSize: 256,
          maxzoom: 18,
          attribution: "Imágenes © Esri, Maxar, Earthstar Geographics",
        });
        const firstSymbol = m.getStyle().layers.find((l) => l.type === "symbol")?.id;
        m.addLayer({ id: "sat", type: "raster", source: "sat", layout: { visibility: "none" } }, firstSymbol);
        m.addSource("muni", { type: "geojson", data: geo.muni as any });
        m.addSource("depto", { type: "geojson", data: geo.depto as any });
        // nombres propios: departamentos al alejar y municipios al acercar
        const names = (type: "depto" | "muni") => ({
          type: "FeatureCollection",
          features: geo.gaz.entries
            .filter((e) => e.type === type)
            .map((e) => ({ type: "Feature", properties: { name: type === "depto" ? e.name.toUpperCase() : e.name }, geometry: { type: "Point", coordinates: e.center } })),
        });
        m.addSource("lbl-depto", { type: "geojson", data: names("depto") as any });
        m.addSource("lbl-muni", { type: "geojson", data: names("muni") as any });
        const text = { "text-color": dark ? "#e6ecf5" : "#14203a", "text-halo-color": halo, "text-halo-width": 1.8 };
        m.addLayer({ id: "muni-fill", type: "fill", source: "muni", paint: { "fill-color": pickerColor(), "fill-opacity": 0.04 } });
        m.addLayer({
          id: "muni-line",
          type: "line",
          source: "muni",
          paint: { "line-color": theme === "dark" ? "rgba(196,212,240,0.25)" : "rgba(30,45,75,0.3)", "line-width": 0.7 },
        });
        m.addLayer({
          id: "depto-line",
          type: "line",
          source: "depto",
          paint: { "line-color": theme === "dark" ? "rgba(204,220,246,0.5)" : "rgba(25,40,70,0.55)", "line-width": 1.5 },
        });
        m.addLayer({
          id: "muni-hover",
          type: "fill",
          source: "muni",
          filter: ["==", ["get", "muni_ine"], -1],
          paint: { "fill-color": pickerColor(), "fill-opacity": 0.22 },
        });
        m.addLayer({
          id: "lbl-depto",
          type: "symbol",
          source: "lbl-depto",
          maxzoom: 8.5,
          layout: { "text-field": ["get", "name"], "text-font": ["Noto Sans Bold"], "text-size": ["interpolate", ["linear"], ["zoom"], 5, 10, 8, 14], "text-letter-spacing": 0.08, "text-max-width": 8 },
          paint: text,
        });
        m.addLayer({
          id: "lbl-muni",
          type: "symbol",
          source: "lbl-muni",
          minzoom: 7.4,
          layout: { "text-field": ["get", "name"], "text-font": ["Noto Sans Regular"], "text-size": ["interpolate", ["linear"], ["zoom"], 7.5, 10, 11, 13, 14, 16], "text-max-width": 7, "text-padding": 3 },
          paint: text,
        });
        if (point) markerRef.current = new ml.Marker({ color: pickerColor() }).setLngLat([point.lng, point.lat]).addTo(m);
        // sin punto pero con lugar ya elegido: abrir sobre ese departamento o municipio
        if (!point) {
          const e = geo.gaz.muni(initial?.muni_ine ?? null) ?? geo.gaz.depto(initial?.depto_ine ?? null);
          if (e) m.fitBounds([[e.bbox[0], e.bbox[1]], [e.bbox[2], e.bbox[3]]], { padding: 40, maxZoom: e.type === "muni" ? 12.5 : 9, duration: 0 });
        }
      });
      map.on("mousemove", (e) => {
        const m = map!;
        if (!m.getLayer("muni-fill")) return;
        const f = m.queryRenderedFeatures(e.point, { layers: ["muni-fill"] })[0];
        const code = f ? Number((f.properties as any).muni_ine) : -1;
        m.setFilter("muni-hover", ["==", ["get", "muni_ine"], code]);
        m.getCanvas().style.cursor = "crosshair";
        setHover(f ? String((f.properties as any).name ?? geo.gaz.muni(code)?.name ?? "") || null : null);
      });
      map.on("click", (e) => {
        const m = map!;
        const f = m.queryRenderedFeatures(e.point, { layers: ["muni-fill"] })[0];
        const next: PickedPoint = {
          lat: Number(e.lngLat.lat.toFixed(5)),
          lng: Number(e.lngLat.lng.toFixed(5)),
          muni_ine: f ? Number(f.id ?? (f.properties as any).muni_ine) : null,
          depto_ine: f ? Number((f.properties as any).depto_ine) : null,
        };
        setPoint(next);
        markerRef.current?.remove();
        markerRef.current = new ml.Marker({ color: pickerColor() }).setLngLat([next.lng, next.lat]).addTo(m);
      });
    })();
    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo]);

  useEffect(() => {
    const m = mapRef.current;
    if (m?.getLayer("sat")) m.setLayoutProperty("sat", "visibility", satellite ? "visible" : "none");
  }, [satellite]);

  const jump = (i: number) => {
    const e = results[i]?.entry;
    if (!e || !mapRef.current) return;
    mapRef.current.fitBounds(
      [
        [e.bbox[0], e.bbox[1]],
        [e.bbox[2], e.bbox[3]],
      ],
      { padding: 40, maxZoom: 12.5, duration: 700 },
    );
    setQ("");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-[2px]" onMouseDown={onClose}>
      <div
        className="flex h-[min(720px,90dvh)] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-float"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-line px-4 py-3">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              className="field !pl-9"
              placeholder="Ir a un municipio…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && jump(0)}
            />
            {results.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-2xl border border-line bg-surface p-1 shadow-float">
                {results.map((r, i) => (
                  <li key={`${r.entry.type}${r.entry.code}`}>
                    <button className="flex w-full justify-between rounded-xl px-3 py-2 text-left text-sm hover:bg-surface-2" onClick={() => jump(i)}>
                      <span>{r.entry.name}</span>
                      <span className="text-xs text-muted">{r.entry.type === "depto" ? "Departamento" : r.entry.depto}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button
            type="button"
            className="btn-outline h-9 shrink-0 gap-1.5 !px-3 text-xs"
            aria-pressed={satellite}
            onClick={() => setSatellite((s) => !s)}
            title={satellite ? "Ver mapa" : "Ver satélite"}
          >
            {satellite ? <MapIcon className="h-4 w-4" /> : <Globe2 className="h-4 w-4" />}
            <span className="hidden sm:inline">{satellite ? "Mapa" : "Satélite"}</span>
          </button>
          <button className="btn-ghost h-9 w-9 !p-0" onClick={onClose} aria-label="Cerrar">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div ref={el} className="min-h-0 flex-1" />
        <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3">
          <div className="min-w-0 text-sm text-muted">
            {point ? (
              <>
                <span className="text-ink">{place ? place.name : "Fuera de los límites"}</span>
                {place?.type === "muni" && ` · ${place.depto}`} · {point.lat}, {point.lng}
              </>
            ) : (
              <>
                Haz clic en el sitio exacto; el municipio se detecta solo.
                {hover && <span className="ml-1 text-ink">· {hover}</span>}
              </>
            )}
          </div>
          <button className="btn-primary shrink-0" disabled={!point} onClick={() => point && onPick(point)}>
            <Check className="h-4 w-4" /> Usar este punto
          </button>
        </div>
      </div>
    </div>
  );
}
