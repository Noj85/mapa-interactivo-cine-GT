"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import type * as MapLibre from "maplibre-gl";
import { getMaplibre } from "@/lib/map/maplibre";
import { posterThumb } from "@/lib/poster-url";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { aggregate, type Stop } from "@/lib/aggregate";
import { metricText } from "@/lib/format";
import type { GeoBundle } from "@/lib/geo/load";
import { LAYER_COLORS, MAP_BG, ramp, type Theme } from "@/lib/map/colors";
import { buildFilmRoute, buildLabels, buildMask, buildNowhere, buildPins, levels, locationPoint, NOWHERE, NOWHERE_BBOX, isUnlocated, unlocatedFilms } from "@/lib/map/features";
import { buildStyle, firstSymbolId } from "@/lib/map/style";
import type { Dataset } from "@/lib/types";
import { deptoOf, type Place, type ViewState } from "@/lib/view";

/** A partir de este zoom el territorio activo pasa de departamentos a municipios. */
export const Z_MUNI = 7.8;
const COUNTRY_BBOX: [number, number, number, number] = [-92.3, 13.7, -88.2, 17.85];
const STORE_KEY = "mapcine:camera";

export interface MapHandle {
  zoomIn(): void;
  zoomOut(): void;
  reset(): void;
}

export interface ScaleInfo {
  scope: "depto" | "muni";
  stops: Stop[];
}

interface Props {
  data: Dataset;
  geo: GeoBundle;
  view: ViewState;
  theme: Theme;
  satellite: boolean;
  padding: { top: number; right: number; bottom: number; left: number };
  onPlace(p: Place | null): void;
  onFilm(slug: string): void;
  onOrg(slug: string): void;
  onUnlocated?(): void;
  onScale(s: ScaleInfo): void;
  onReady?(): void;
}

const PIN_LAYERS = ["pin-cluster", "pin-cluster-count", "pin-point", "pin-incomplete", "pin-label"];
const FILM_LAYERS = ["film-line", "film-halo", "film-dot", "film-n", "film-site"];

const MapCanvas = forwardRef<MapHandle, Props>(function MapCanvas(props, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const hoverRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibre.Map | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const ready = useRef(false);
  const scopeRef = useRef<"depto" | "muni">("depto");
  const themeApplied = useRef<Theme | null>(null);
  const prevSel = useRef<{ source: string; id: number } | null>(null);
  const prevHot = useRef<{ source: string; id: number }[]>([]);
  const prevHover = useRef<{ source: string; id: number } | null>(null);
  const logoMarker = useRef<MapLibre.Marker | null>(null);
  const lastCamera = useRef<string>("undefinedundefined|null|null");
  const [mapTick, setMapTick] = useState(0);

  // ---------- cámara ----------
  const camPadding = () => {
    const p = propsRef.current.padding;
    const pad = { top: p.top + 24, right: p.right + 24, bottom: p.bottom + 24, left: p.left + 24 };
    // En ventanas angostas los paneles se comerían todo el mapa y MapLibre ignora el encuadre:
    // se reduce el margen para dejar siempre un área libre mínima.
    const c = mapRef.current?.getContainer();
    if (c) {
      const free = (total: number, a: number, b: number, min: number) => {
        const over = a + b - (total - min);
        return over > 0 ? Math.max(0, 1 - over / Math.max(1, a + b)) : 1;
      };
      const fx = free(c.clientWidth, pad.left, pad.right, Math.max(260, c.clientWidth * 0.4));
      const fy = free(c.clientHeight, pad.top, pad.bottom, Math.max(220, c.clientHeight * 0.35));
      pad.left = Math.round(pad.left * fx);
      pad.right = Math.round(pad.right * fx);
      pad.top = Math.round(pad.top * fy);
      pad.bottom = Math.round(pad.bottom * fy);
    }
    return pad;
  };

  const fitCountry = useCallback((animate = true) => {
    const map = mapRef.current;
    if (!map) return;
    // si hay películas sin lugar, la vista incluye también la zona «Sin ubicación»
    const { data, view } = propsRef.current;
    const withZone = view.layer === "produccion" && unlocatedFilms(data.films).length > 0;
    const b = withZone ? [Math.min(COUNTRY_BBOX[0], NOWHERE_BBOX[0]), Math.min(COUNTRY_BBOX[1], NOWHERE_BBOX[1]), COUNTRY_BBOX[2], COUNTRY_BBOX[3]] : COUNTRY_BBOX;
    map.fitBounds(
      [
        [b[0], b[1]],
        [b[2], b[3]],
      ],
      { padding: camPadding(), duration: animate ? 900 : 0, maxZoom: 8 },
    );
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      zoomIn: () => mapRef.current?.zoomIn({ duration: 300 }),
      zoomOut: () => mapRef.current?.zoomOut({ duration: 300 }),
      reset: () => fitCountry(true),
    }),
    [fitCountry],
  );

  // ---------- instalación de fuentes y capas ----------
  const install = useCallback((map: MapLibre.Map) => {
    const { geo, theme } = propsRef.current;
    const style = map.getStyle();
    const before = firstSymbolId(style as any);
    const bg = MAP_BG[theme];
    const dark = theme === "dark";
    const lineSoft = dark ? "rgba(196,212,240,0.22)" : "rgba(30,45,75,0.26)";
    const lineStrong = dark ? "rgba(204,220,246,0.42)" : "rgba(25,40,70,0.5)";
    const accent = LAYER_COLORS[propsRef.current.view.layer][theme];
    const ink = dark ? "#e6ecf5" : "#14203a";
    const rampColors = ramp(propsRef.current.view.layer, theme);
    const empty = { type: "FeatureCollection", features: [] } as any;

    const add = (layer: any) => map.addLayer(layer, layer.type === "symbol" || layer.type === "circle" ? undefined : before);
    const stepColor = (colors: string[]) => [
      "step",
      ["coalesce", ["feature-state", "t"], 0],
      "rgba(0,0,0,0)",
      1, colors[0], 2, colors[1], 3, colors[2], 4, colors[3], 5, colors[4],
    ];

    // fuentes
    map.addSource("sat", {
      type: "raster",
      tiles: ["https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
      maxzoom: 18,
      attribution: "Imágenes © Esri, Maxar, Earthstar Geographics",
    });
    map.addSource("mask", { type: "geojson", data: buildMask(geo.pais) as any });
    map.addSource("depto", { type: "geojson", data: geo.depto as any });
    map.addSource("muni", { type: "geojson", data: geo.muni as any });
    map.addSource("dim", { type: "geojson", data: empty });
    map.addSource("nowhere", { type: "geojson", data: empty });
    map.addSource("lbl-depto", { type: "geojson", data: empty });
    map.addSource("lbl-muni", { type: "geojson", data: empty });
    map.addSource("pins", {
      type: "geojson",
      data: empty,
      cluster: true,
      clusterRadius: 46,
      clusterMaxZoom: 11,
    });
    map.addSource("film", { type: "geojson", data: empty });
    map.addSource("film-line", { type: "geojson", data: empty });

    // base
    add({
      id: "sat",
      type: "raster",
      source: "sat",
      layout: { visibility: propsRef.current.satellite ? "visible" : "none" },
      paint: { "raster-saturation": dark ? -0.35 : 0, "raster-brightness-max": dark ? 0.75 : 1 },
    });
    add({
      id: "mask",
      type: "fill",
      source: "mask",
      paint: {
        "fill-color": bg,
        "fill-opacity": ["interpolate", ["linear"], ["zoom"], 5, dark ? 0.72 : 0.62, 10, 0.5, 13, 0.25],
      },
    });

    // coropletas
    add({
      id: "depto-fill",
      type: "fill",
      source: "depto",
      paint: {
        "fill-color": stepColor(rampColors),
        "fill-opacity": ["interpolate", ["linear"], ["zoom"], 5, 0.95, 7, 0.95, 8.6, 0],
      },
    });
    add({
      id: "muni-fill",
      type: "fill",
      source: "muni",
      paint: {
        "fill-color": stepColor(rampColors),
        "fill-opacity": ["interpolate", ["linear"], ["zoom"], 6.6, 0, 8, 0.92, 10.5, 0.85, 12.5, 0.4],
      },
    });
    // territorios de la película seleccionada
    for (const s of ["depto", "muni"] as const) {
      add({
        id: `${s}-hot`,
        type: "fill",
        source: s,
        paint: {
          "fill-color": accent,
          "fill-opacity": ["case", ["boolean", ["feature-state", "hot"], false], 0.34, 0],
        },
      });
      add({
        id: `${s}-selfill`,
        type: "fill",
        source: s,
        paint: {
          "fill-color": accent,
          "fill-opacity": ["case", ["boolean", ["feature-state", "sel"], false], 0.1, 0],
        },
      });
    }

    // filtro por departamento: el resto del país se atenúa
    add({
      id: "dim",
      type: "fill",
      source: "dim",
      paint: { "fill-color": bg, "fill-opacity": dark ? 0.78 : 0.7 },
    });

    // películas sin lugar de rodaje: zona punteada fuera del territorio
    const neutral = dark ? "#9aa7bd" : "#5b6b85";
    add({
      id: "nowhere-fill",
      type: "fill",
      source: "nowhere",
      filter: ["==", ["get", "kind"], "zone"],
      paint: { "fill-color": neutral, "fill-opacity": ["case", ["==", ["get", "sel"], true], 0.26, 0.12] },
    });
    add({
      id: "nowhere-line",
      type: "line",
      source: "nowhere",
      filter: ["==", ["get", "kind"], "zone"],
      paint: { "line-color": neutral, "line-width": ["case", ["==", ["get", "sel"], true], 2.4, 1.6], "line-dasharray": [2, 2.2] },
    });

    // líneas
    add({
      id: "muni-line",
      type: "line",
      source: "muni",
      paint: {
        "line-color": lineSoft,
        "line-width": ["interpolate", ["linear"], ["zoom"], 6, 0.4, 10, 0.9, 13, 1.4],
        "line-opacity": ["interpolate", ["linear"], ["zoom"], 6.8, 0, 8, 1],
      },
    });
    add({
      id: "depto-line",
      type: "line",
      source: "depto",
      paint: {
        "line-color": lineStrong,
        "line-width": ["interpolate", ["linear"], ["zoom"], 5, 0.9, 9, 1.8, 12, 2.4],
        "line-opacity": ["interpolate", ["linear"], ["zoom"], 5, 0.8, 10, 0.55],
      },
    });

    // hover y selección
    for (const s of ["depto", "muni"] as const) {
      add({
        id: `${s}-hover`,
        type: "line",
        source: s,
        ...(s === "depto" ? { maxzoom: Z_MUNI } : { minzoom: Z_MUNI }),
        paint: {
          "line-color": accent,
          "line-width": 2,
          "line-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 1, 0],
        },
      });
      add({
        id: `${s}-sel`,
        type: "line",
        source: s,
        paint: {
          "line-color": accent,
          "line-width": 3,
          "line-opacity": ["case", ["boolean", ["feature-state", "sel"], false], 1, 0],
        },
      });
    }

    // etiquetas
    const fonts = { bold: ["Noto Sans Bold"], reg: ["Noto Sans Regular"] };
    const textPaint = {
      "text-color": ink,
      "text-halo-color": dark ? "rgba(11,15,25,0.9)" : "rgba(238,241,245,0.95)",
      "text-halo-width": 1.6,
      "text-halo-blur": 0.4,
    };
    const withValue = (size: number) => [
      "case",
      ["==", ["get", "val"], ""],
      ["get", "name"],
      [
        "format",
        ["get", "name"],
        {},
        "\n",
        {},
        ["get", "val"],
        { "font-scale": size, "text-color": accent, "text-font": ["literal", fonts.reg] },
      ],
    ];
    add({
      id: "lbl-depto",
      type: "symbol",
      source: "lbl-depto",
      maxzoom: 8.8,
      layout: {
        "text-field": withValue(0.82),
        "text-font": fonts.bold,
        "text-size": ["interpolate", ["linear"], ["zoom"], 5, 10, 8, 14],
        "text-letter-spacing": 0.08,
        "text-max-width": 8,
        "symbol-sort-key": ["get", "sk"],
      },
      paint: {
        ...textPaint,
        "text-opacity": ["interpolate", ["linear"], ["zoom"], 7.6, 1, 8.6, 0],
      },
    });
    for (const [id, filter, minzoom] of [
      ["lbl-muni-v", [">", ["get", "v"], 0], 7.2],
      ["lbl-muni-0", ["==", ["get", "v"], 0], 9.2],
    ] as const) {
      add({
        id,
        type: "symbol",
        source: "lbl-muni",
        minzoom,
        filter,
        layout: {
          "text-field": withValue(0.82),
          "text-font": fonts.reg,
          "text-size": ["interpolate", ["linear"], ["zoom"], 7.5, 10, 11, 13, 14, 16],
          "text-max-width": 7,
          "symbol-sort-key": ["get", "sk"],
          "text-padding": 4,
        },
        paint: {
          ...textPaint,
          "text-opacity": ["interpolate", ["linear"], ["zoom"], minzoom, 0, minzoom + 0.7, 1],
        },
      });
    }

    // pines
    const pinFade = ["interpolate", ["linear"], ["zoom"], 6.2, 0, 7.6, 1];
    add({
      id: "pin-cluster",
      type: "circle",
      source: "pins",
      filter: ["has", "point_count"],
      paint: {
        "circle-color": accent,
        "circle-opacity": 0.92,
        "circle-radius": ["step", ["get", "point_count"], 14, 5, 18, 15, 23],
        "circle-stroke-width": 2.5,
        "circle-stroke-color": bg,
        "circle-stroke-opacity": 0.9,
      },
    });
    add({
      id: "pin-cluster-count",
      type: "symbol",
      source: "pins",
      filter: ["has", "point_count"],
      layout: {
        "text-field": ["get", "point_count_abbreviated"],
        "text-font": fonts.bold,
        "text-size": 12,
        "text-allow-overlap": true,
      },
      paint: { "text-color": "#16120a" },
    });
    add({
      id: "pin-incomplete",
      type: "circle",
      source: "pins",
      filter: ["all", ["!", ["has", "point_count"]], ["==", ["get", "incomplete"], true]],
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 8, 12, 12, 15, 15],
        "circle-color": "rgba(0,0,0,0)",
        "circle-stroke-color": dark ? "#f2a65a" : "#c2570c",
        "circle-stroke-width": 1.5,
        "circle-opacity": pinFade,
        "circle-stroke-opacity": pinFade,
      },
    });
    add({
      id: "pin-point",
      type: "circle",
      source: "pins",
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 5, 12, 8, 15, 11],
        "circle-color": ["case", ["==", ["get", "approx"], true], bg, accent],
        "circle-stroke-color": ["case", ["==", ["get", "approx"], true], accent, bg],
        "circle-stroke-width": 2,
        "circle-opacity": pinFade,
        "circle-stroke-opacity": pinFade,
      },
    });
    add({
      id: "nowhere-label",
      type: "symbol",
      source: "nowhere",
      filter: ["==", ["get", "kind"], "label"],
      layout: {
        "text-field": ["format", "Sin ubicación", { "font-scale": 1 }, "\n", {}, ["get", "text"], { "font-scale": 0.8, "text-font": ["literal", fonts.reg] }],
        "text-font": fonts.bold,
        "text-size": ["interpolate", ["linear"], ["zoom"], 5, 11, 8, 15],
        "text-max-width": 9,
        "text-allow-overlap": true,
        "text-ignore-placement": true,
      },
      paint: { ...textPaint, "text-color": ink },
    });
    add({
      id: "pin-label",
      type: "symbol",
      source: "pins",
      minzoom: 11,
      filter: ["!", ["has", "point_count"]],
      layout: {
        "text-field": ["get", "title"],
        "text-font": fonts.bold,
        "text-size": 12.5,
        "text-anchor": "top",
        "text-offset": [0, 1.1],
        "text-max-width": 9,
        "text-optional": true,
      },
      paint: { ...textPaint, "text-opacity": ["interpolate", ["linear"], ["zoom"], 11, 0, 11.8, 1] },
    });

    // película / entidad seleccionada
    add({
      id: "film-line",
      type: "line",
      source: "film-line",
      layout: { "line-cap": "round", "line-join": "round", visibility: "none" },
      paint: { "line-color": accent, "line-width": 2.2, "line-dasharray": [1.5, 2], "line-opacity": 0.9 },
    });
    add({
      id: "film-halo",
      type: "circle",
      source: "film",
      layout: { visibility: "none" },
      paint: { "circle-radius": 17, "circle-color": accent, "circle-opacity": 0.22 },
    });
    add({
      id: "film-dot",
      type: "circle",
      source: "film",
      layout: { visibility: "none" },
      paint: {
        "circle-radius": 10.5,
        "circle-color": ["case", ["==", ["get", "approx"], true], bg, accent],
        "circle-stroke-color": ["case", ["==", ["get", "approx"], true], accent, bg],
        "circle-stroke-width": 2.5,
      },
    });
    add({
      id: "film-n",
      type: "symbol",
      source: "film",
      layout: {
        "text-field": ["get", "n"],
        "text-font": fonts.bold,
        "text-size": 12,
        "text-allow-overlap": true,
        "text-ignore-placement": true,
        visibility: "none",
      },
      paint: { "text-color": ["case", ["==", ["get", "approx"], true], accent, "#16120a"] },
    });
    add({
      id: "film-site",
      type: "symbol",
      source: "film",
      layout: {
        "text-field": ["get", "site"],
        "text-font": fonts.bold,
        "text-size": 12.5,
        "text-anchor": "top",
        "text-offset": [0, 1.5],
        "text-max-width": 9,
        visibility: "none",
      },
      paint: textPaint,
    });
  }, []);

  // ---------- aplicar datos / estados ----------
  const clearStates = (list: { source: string; id: number }[], key: string) => {
    const map = mapRef.current!;
    for (const s of list) map.setFeatureState({ source: s.source, id: s.id }, { [key]: false });
  };

  const applyData = useCallback(() => {
    const map = mapRef.current;
    if (!map || !ready.current || !map.getSource("depto")) return;
    const { data, geo, view, theme } = propsRef.current;
    const aggs = aggregate(data, view.layer);
    const filmMode = !!view.film || !!view.org;

    // coropleta
    const deptoCodes = geo.gaz.entries.filter((e) => e.type === "depto").map((e) => e.code);
    const muniCodes = geo.gaz.entries.filter((e) => e.type === "muni").map((e) => e.code);
    const d = levels(aggs.depto, view.metric, deptoCodes);
    const m = levels(aggs.muni, view.metric, muniCodes);
    for (const c of deptoCodes) map.setFeatureState({ source: "depto", id: c }, { t: filmMode ? 0 : d.levels.get(c) ?? 0 });
    for (const c of muniCodes) map.setFeatureState({ source: "muni", id: c }, { t: filmMode ? 0 : m.levels.get(c) ?? 0 });
    const scope = map.getZoom() >= Z_MUNI ? "muni" : "depto";
    scopeRef.current = scope;
    propsRef.current.onScale({ scope, stops: scope === "muni" ? m.stops : d.stops });
    (map as any).__stops = { depto: d.stops, muni: m.stops };

    // colores según capa
    const colors = ramp(view.layer, theme);
    const accent = LAYER_COLORS[view.layer][theme];
    const step = [
      "step",
      ["coalesce", ["feature-state", "t"], 0],
      "rgba(0,0,0,0)",
      1, colors[0], 2, colors[1], 3, colors[2], 4, colors[3], 5, colors[4],
    ];
    for (const id of ["depto-fill", "muni-fill"]) map.setPaintProperty(id, "fill-color", step as any);
    for (const id of ["depto-hot", "muni-hot", "depto-selfill", "muni-selfill"]) map.setPaintProperty(id, "fill-color", accent);
    for (const id of ["depto-hover", "muni-hover", "depto-sel", "muni-sel"]) map.setPaintProperty(id, "line-color", accent);
    map.setPaintProperty("pin-cluster", "circle-color", accent);
    map.setPaintProperty("pin-point", "circle-color", ["case", ["==", ["get", "approx"], true], MAP_BG[theme], accent] as any);
    map.setPaintProperty("pin-point", "circle-stroke-color", ["case", ["==", ["get", "approx"], true], accent, MAP_BG[theme]] as any);
    for (const id of ["lbl-depto", "lbl-muni-v", "lbl-muni-0"]) {
      map.setLayoutProperty(
        id,
        "text-field",
        [
          "case",
          ["==", ["get", "val"], ""],
          ["get", "name"],
          ["format", ["get", "name"], {}, "\n", {}, ["get", "val"], { "font-scale": 0.82, "text-color": accent, "text-font": ["literal", ["Noto Sans Regular"]] }],
        ] as any,
      );
    }
    for (const id of ["film-line"]) map.setPaintProperty(id, "line-color", accent);
    map.setPaintProperty("film-halo", "circle-color", accent);

    // etiquetas
    const labels = buildLabels(geo.gaz, aggs, view.metric, view.layer);
    (map.getSource("lbl-depto") as MapLibre.GeoJSONSource).setData(labels.depto as any);
    (map.getSource("lbl-muni") as MapLibre.GeoJSONSource).setData(labels.muni as any);

    // pines
    (map.getSource("pins") as MapLibre.GeoJSONSource).setData(buildPins(data, view.layer, geo.gaz, deptoOf(view.place)) as any);
    for (const id of PIN_LAYERS) map.setLayoutProperty(id, "visibility", filmMode ? "none" : "visible");

    // zona «Sin ubicación»: solo en Producción, sin filtro de departamento y sin entidad abierta
    const selFilm = view.film ? data.films.find((f) => f.slug === view.film) : undefined;
    const showZone = view.layer === "produccion" && !view.place && !view.org && (!view.film || (!!selFilm && isUnlocated(selFilm)));
    const unlocatedCount = showZone ? (view.film ? 1 : unlocatedFilms(data.films).length) : 0;
    const zoneTotal = showZone ? unlocatedFilms(data.films).length : 0;
    (map.getSource("nowhere") as MapLibre.GeoJSONSource | undefined)?.setData(buildNowhere(zoneTotal, view.noloc || (!!view.film && unlocatedCount > 0)) as any);

    // película / entidad
    const empty = { type: "FeatureCollection", features: [] } as any;
    // el logo de la entidad abierta es el único marcador HTML: se quita al cambiar o cerrar
    logoMarker.current?.remove();
    logoMarker.current = null;
    clearStates(prevHot.current, "hot");
    prevHot.current = [];
    const filmSrc = map.getSource("film") as MapLibre.GeoJSONSource;
    const lineSrc = map.getSource("film-line") as MapLibre.GeoJSONSource;
    if (view.film) {
      const film = data.films.find((f) => f.slug === view.film);
      if (film) {
        const route = buildFilmRoute(film, geo.gaz);
        if (!route.coords.length) {
          // sin lugar de rodaje: la película queda dentro de la zona «Sin ubicación»
          filmSrc.setData({
            type: "FeatureCollection",
            features: [{ type: "Feature", properties: { n: "", site: "Sin ubicación", approx: true }, geometry: { type: "Point", coordinates: [NOWHERE.lng, NOWHERE.lat - 0.46] } }],
          } as any);
          lineSrc.setData(empty);
        } else {
          filmSrc.setData(route.points as any);
          lineSrc.setData(route.lines as any);
        }
        for (const l of film.locations) {
          if (l.muni_ine != null) prevHot.current.push({ source: "muni", id: l.muni_ine });
          else if (l.depto_ine != null) prevHot.current.push({ source: "depto", id: l.depto_ine });
        }
        for (const h of prevHot.current) map.setFeatureState(h, { hot: true });
      } else {
        filmSrc.setData(empty);
        lineSrc.setData(empty);
      }
    } else if (view.org) {
      const org = data.orgs.find((o) => o.slug === view.org);
      const p = org && locationPoint(org, geo.gaz);
      filmSrc.setData(
        p
          ? ({
              type: "FeatureCollection",
              features: [
                {
                  type: "Feature",
                  properties: { n: "", site: org!.name, approx: p.approx },
                  geometry: { type: "Point", coordinates: [p.lng, p.lat] },
                },
              ],
            } as any)
          : empty,
      );
      lineSrc.setData(empty);
      if (org?.logo_url && p) {
        const el = document.createElement("div");
        el.className = "org-logo-marker";
        el.style.cssText = [
          "width:44px;height:44px;border-radius:12px;background:#fff;overflow:hidden;pointer-events:none",
          `border:2px solid ${accent};box-shadow:0 4px 14px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center`,
        ].join(";");
        const img = document.createElement("img");
        img.src = posterThumb(org.logo_url) ?? org.logo_url;
        img.alt = `Logo de ${org.name}`;
        img.style.cssText = "width:100%;height:100%;object-fit:contain;padding:3px";
        const full = org.logo_url;
        img.onerror = () => {
          if (img.src !== full) img.src = full;
        };
        el.appendChild(img);
        logoMarker.current = new (getMaplibre().Marker)({ element: el, anchor: "bottom", offset: [0, -16] }).setLngLat([p.lng, p.lat]).addTo(map);
      }
      if (org?.muni_ine != null) prevHot.current.push({ source: "muni", id: org.muni_ine });
      for (const h of prevHot.current) map.setFeatureState(h, { hot: true });
    } else {
      filmSrc.setData(empty);
      lineSrc.setData(empty);
    }
    for (const id of FILM_LAYERS) map.setLayoutProperty(id, "visibility", filmMode ? "visible" : "none");
  }, []);

  const applySelection = useCallback(() => {
    const map = mapRef.current;
    if (!map || !ready.current || !map.getSource("depto")) return;
    const { view } = propsRef.current;
    if (prevSel.current) map.setFeatureState(prevSel.current, { sel: false });
    prevSel.current = null;
    if (view.place) {
      const s = { source: view.place.type, id: view.place.code };
      map.setFeatureState(s, { sel: true });
      prevSel.current = s;
    }
    // el resto de los departamentos se atenúa
    const dept = deptoOf(view.place);
    const geo = propsRef.current.geo;
    (map.getSource("dim") as MapLibre.GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection",
      features: dept == null ? [] : geo.depto.features.filter((f) => f.properties?.depto_ine !== dept),
    } as any);
  }, []);

  // ---------- creación del mapa ----------
  useEffect(() => {
    let cancelled = false;
    let map: MapLibre.Map | null = null;
    (async () => {
      const { theme, view } = propsRef.current;
      const style = await buildStyle(theme);
      if (cancelled || !containerRef.current) return;
      themeApplied.current = theme;

      let initial: { center: [number, number]; zoom: number } | null = null;
      if (!view.place && !view.film && !view.org) {
        try {
          const s = JSON.parse(localStorage.getItem(STORE_KEY) ?? "null");
          if (s && Array.isArray(s.center) && typeof s.zoom === "number") initial = s;
        } catch {}
      }

      const maplibregl = getMaplibre();
      map = new maplibregl.Map({
        container: containerRef.current,
        style: style as any,
        center: initial?.center ?? [-90.35, 15.75],
        zoom: initial?.zoom ?? 6.3,
        minZoom: 5,
        maxZoom: 17.5,
        // margen amplio: incluye la zona «Sin ubicación» (Pacífico) y deja alejar el mapa en pantallas altas
        maxBounds: [
          [-101, 8],
          [-80, 23],
        ],
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false,
        fadeDuration: 150,
      });
      mapRef.current = map;
      map.touchZoomRotate.disableRotation();
      map.addControl(
        new maplibregl.AttributionControl({
          compact: true,
          customAttribution:
            "Límites: MINFIN / INE · Mapa base © <a href='https://openfreemap.org' target='_blank'>OpenFreeMap</a> © OpenMapTiles, datos OpenStreetMap",
        }),
        "bottom-left",
      );

      map.on("error", (e) => {
        const w = window as any;
        w.__mapErrors = [...(w.__mapErrors ?? []), String((e as any).error?.message ?? e)].slice(-20);
        console.warn("[map]", (e as any).error?.message ?? e);
      });

      map.on("style.load", () => {
        install(map!);
        ready.current = true;
        applyData();
        applySelection();
      });

      map.once("load", () => {
        if (!initial && !view.place && !view.film && !view.org) fitCountry(false);
        propsRef.current.onReady?.();
        setMapTick((t) => t + 1);
      });

      map.on("moveend", () => {
        const c = map!.getCenter();
        try {
          localStorage.setItem(STORE_KEY, JSON.stringify({ center: [c.lng, c.lat], zoom: map!.getZoom() }));
        } catch {}
      });

      map.on("zoom", () => {
        const scope = map!.getZoom() >= Z_MUNI ? "muni" : "depto";
        if (scope !== scopeRef.current) {
          scopeRef.current = scope;
          const st = (map as any).__stops;
          if (st) propsRef.current.onScale({ scope, stops: st[scope] });
        }
      });

      // ----- interacción -----
      const live = (ids: string[]) => ids.filter((i) => map!.getLayer(i));
      const topFeature = (point: MapLibre.PointLike) => {
        const pinHit = map!.queryRenderedFeatures(point, {
          layers: live(["pin-point", "pin-cluster", "film-dot"]),
        })[0];
        if (pinHit) return { kind: "pin" as const, f: pinHit };
        const zoneHit = map!.queryRenderedFeatures(point, { layers: live(["nowhere-fill"]) })[0];
        if (zoneHit) return { kind: "nowhere" as const, f: zoneHit };
        const muniZoom = map!.getZoom() >= Z_MUNI;
        const t = map!.queryRenderedFeatures(point, { layers: live([muniZoom ? "muni-fill" : "depto-fill"]) })[0];
        if (t) return { kind: muniZoom ? ("muni" as const) : ("depto" as const), f: t };
        return null;
      };

      const hoverEl = hoverRef.current!;
      const setHover = (s: { source: string; id: number } | null) => {
        const p = prevHover.current;
        if (p && (!s || p.source !== s.source || p.id !== s.id)) map!.setFeatureState(p, { hover: false });
        if (s) map!.setFeatureState(s, { hover: true });
        prevHover.current = s;
      };

      let raf = 0;
      map.on("mousemove", (e) => {
        if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = 0;
          if (!ready.current) return;
          const hit = topFeature(e.point);
          const { geo, data, view } = propsRef.current;
          const canvas = map!.getCanvas();
          if (!hit) {
            canvas.style.cursor = "";
            hoverEl.style.display = "none";
            setHover(null);
            return;
          }
          canvas.style.cursor = "pointer";
          let title = "";
          let sub = "";
          let note = "";
          if (hit.kind === "pin") {
            const p = hit.f.properties as any;
            if (p.point_count) {
              title = `${p.point_count} registros`;
              sub = "Clic para acercar";
            } else {
              title = p.title ?? p.site ?? "";
              sub = p.sub ?? "";
              if (p.incomplete === true || p.incomplete === "true") note = "Información incompleta";
            }
            setHover(null);
          } else if (hit.kind === "nowhere") {
            const n = unlocatedFilms(data.films).length;
            title = "Sin ubicación";
            sub = `${n === 1 ? "1 película" : `${n.toLocaleString("es-GT")} películas`} sin lugar de rodaje registrado`;
            note = "Clic para ver la lista";
            setHover(null);
          } else {
            const code = Number(hit.f.id);
            const entry = hit.kind === "muni" ? geo.gaz.muni(code) : geo.gaz.depto(code);
            title = entry?.name ?? "";
            sub = hit.kind === "muni" ? entry?.depto ?? "" : "Departamento";
            const aggs = aggregate(data, view.layer);
            const a = (hit.kind === "muni" ? aggs.muni : aggs.depto).get(code);
            note = metricText(a, view.metric, view.layer);
            setHover({ source: hit.kind, id: code });
          }
          hoverEl.querySelector("[data-t]")!.textContent = title;
          hoverEl.querySelector("[data-s]")!.textContent = sub;
          const n = hoverEl.querySelector("[data-n]") as HTMLElement;
          n.textContent = note;
          n.style.display = note ? "block" : "none";
          hoverEl.style.display = "block";
          const w = containerRef.current!.clientWidth;
          const x = Math.min(e.point.x + 16, w - hoverEl.offsetWidth - 8);
          hoverEl.style.transform = `translate(${Math.max(8, x)}px, ${e.point.y + 18}px)`;
        });
      });
      map.on("mouseout", () => {
        hoverEl.style.display = "none";
        setHover(null);
      });

      map.on("click", async (e) => {
        const hit = topFeature(e.point);
        const cb = propsRef.current;
        if (!hit) {
          cb.onPlace(null);
          return;
        }
        if (hit.kind === "pin") {
          const p = hit.f.properties as any;
          if (p.point_count) {
            const src = map!.getSource("pins") as MapLibre.GeoJSONSource;
            const z = await src.getClusterExpansionZoom(p.cluster_id);
            map!.easeTo({ center: (hit.f.geometry as any).coordinates, zoom: Math.min(z + 0.2, 15), duration: 600 });
          } else if (p.kind === "film") cb.onFilm(p.slug);
          else if (p.kind === "org") cb.onOrg(p.slug);
          return;
        }
        if (hit.kind === "nowhere") {
          cb.onUnlocated?.();
          return;
        }
        cb.onPlace({ type: hit.kind, code: Number(hit.f.id) });
      });
    })();

    return () => {
      cancelled = true;
      ready.current = false;
      logoMarker.current?.remove();
      logoMarker.current = null;
      map?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // tema: reconstruir el estilo base
  useEffect(() => {
    const map = mapRef.current;
    if (!map || themeApplied.current === props.theme) return;
    themeApplied.current = props.theme;
    ready.current = false;
    buildStyle(props.theme).then((style) => {
      map.setStyle(style as any, { diff: false });
    });
  }, [props.theme]);

  // datos y vista
  useEffect(() => {
    applyData();
  }, [props.data, props.view.layer, props.view.metric, props.view.film, props.view.org, props.view.place, props.view.noloc, props.geo, applyData]);

  useEffect(() => {
    applySelection();
  }, [props.view.place, applySelection]);

  // satélite
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready.current || !map.getLayer("sat")) return;
    map.setLayoutProperty("sat", "visibility", props.satellite ? "visible" : "none");
  }, [props.satellite]);

  // cámara
  const { view, padding, geo, data } = props;
  const zoneOn = view.layer === "produccion" && data.films.some(isUnlocated);
  const camKey = `${view.place?.type}${view.place?.code}|${view.film}|${view.org}|${view.noloc}|${zoneOn}`;
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (lastCamera.current === camKey) return;
    const apply = () => {
      lastCamera.current = camKey;
      const pad = camPadding();
      if (view.film) {
        const film = data.films.find((f) => f.slug === view.film);
        if (!film) return;
        const route = buildFilmRoute(film, geo.gaz);
        if (!route.coords.length) {
          map.fitBounds([[NOWHERE_BBOX[0], NOWHERE_BBOX[1]], [NOWHERE_BBOX[2], NOWHERE_BBOX[3]]], { padding: pad, maxZoom: 8, duration: 1000 });
          return;
        }
        if (route.coords.length === 1) {
          map.flyTo({ center: route.coords[0], zoom: 11, padding: pad, duration: 1000 });
          return;
        }
        const b = new (getMaplibre().LngLatBounds)();
        route.coords.forEach((c) => b.extend(c));
        map.fitBounds(b, { padding: pad, maxZoom: 11, duration: 1100 });
      } else if (view.noloc) {
        map.fitBounds([[NOWHERE_BBOX[0], NOWHERE_BBOX[1]], [NOWHERE_BBOX[2], NOWHERE_BBOX[3]]], { padding: pad, maxZoom: 8, duration: 1000 });
      } else if (view.org) {
        const org = data.orgs.find((o) => o.slug === view.org);
        const p = org && locationPoint(org, geo.gaz);
        if (p) map.flyTo({ center: [p.lng, p.lat], zoom: Math.max(map.getZoom(), 12), padding: pad, duration: 1000 });
      } else if (view.place) {
        const e = view.place.type === "muni" ? geo.gaz.muni(view.place.code) : geo.gaz.depto(view.place.code);
        if (!e) return;
        map.fitBounds(
          [
            [e.bbox[0], e.bbox[1]],
            [e.bbox[2], e.bbox[3]],
          ],
          { padding: pad, maxZoom: view.place.type === "muni" ? 12.5 : 9.2, duration: 1000 },
        );
      } else {
        fitCountry(true);
      }
    };
    if (map.loaded() || map.isStyleLoaded()) apply();
    else map.once("load", apply);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camKey, padding.right, padding.bottom, mapTick]);

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="absolute inset-0" />
      <div
        ref={hoverRef}
        style={{ display: "none" }}
        className="glass pointer-events-none absolute left-0 top-0 z-10 max-w-[260px] rounded-xl px-3 py-2"
      >
        <div data-t className="font-display text-[15px] leading-tight text-ink" />
        <div data-s className="text-xs text-muted" />
        <div data-n className="mt-1 text-xs font-medium text-accent" />
      </div>
    </div>
  );
});

export default MapCanvas;
