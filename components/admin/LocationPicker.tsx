"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { Check, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { loadGeo, type GeoBundle } from "@/lib/geo/load";
import { getMaplibre, type MapLibreMap } from "@/lib/map/maplibre";
import { buildStyle } from "@/lib/map/style";

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
      const style = await buildStyle(theme);
      if (cancelled || !el.current) return;
      const ml = getMaplibre();
      map = new ml.Map({
        container: el.current,
        style: style as any,
        center: point ? [point.lng, point.lat] : [-90.4, 15.5],
        zoom: point ? 12 : 6.5,
        minZoom: 5,
        dragRotate: false,
        attributionControl: { compact: true },
      });
      mapRef.current = map;
      map.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");
      map.on("load", () => {
        const m = map!;
        m.addSource("muni", { type: "geojson", data: geo.muni as any });
        m.addSource("depto", { type: "geojson", data: geo.depto as any });
        m.addLayer({ id: "muni-fill", type: "fill", source: "muni", paint: { "fill-color": "#e8b04a", "fill-opacity": 0.04 } });
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
        if (point) markerRef.current = new ml.Marker({ color: "#e8b04a" }).setLngLat([point.lng, point.lat]).addTo(m);
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
        markerRef.current = new ml.Marker({ color: "#e8b04a" }).setLngLat([next.lng, next.lat]).addTo(m);
      });
    })();
    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo]);

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
              "Haz clic en el mapa para marcar el sitio exacto."
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
