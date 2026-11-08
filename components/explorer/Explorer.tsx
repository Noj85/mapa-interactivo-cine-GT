"use client";

import { customGenres } from "@/lib/film-types";
import { CIRC_CATEGORIES, IND_CATEGORIES } from "@/lib/types";
import { filmFilterActive, filterFilms, locationsMatching, orgFilterActive, orgMatches, type FilmFilter } from "@/lib/filters";
import { AnimatePresence, motion } from "framer-motion";
import { Download, HandHeart, Moon, Search, Sun } from "lucide-react";
import { DepartmentFilter } from "./DepartmentFilter";
import AbroadPanel from "./AbroadPanel";
import UnlocatedPanel from "./UnlocatedPanel";
import { AcademiaLogo, MapLogo, ProcineLogo } from "@/components/site/Brand";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MapCanvas, { type MapHandle } from "@/components/map/MapCanvas";
import { aggregate } from "@/lib/aggregate";
import { loadGeo, type GeoBundle } from "@/lib/geo/load";
import { useTheme } from "@/lib/use-theme";
import { LAYER_METRICS, type Dataset, type LayerId } from "@/lib/types";
import { DEFAULT_VIEW, downloadHref, parseView, selectedDeptos, serializeView, type Place, type ViewState } from "@/lib/view";
import FilmPanel from "./FilmPanel";
import { FilterPanel } from "./FilterPanel";
import { LayerSwitcher } from "./LayerSwitcher";
import { MapControls } from "./MapControls";
import { MobilePeek } from "./MobilePeek";
import { MobileTopBar } from "./MobileTopBar";
import OrgPanel from "./OrgPanel";
import OverviewPanel from "./OverviewPanel";
import { SearchPalette } from "./SearchPalette";
import TerritoryPanel from "./TerritoryPanel";
import type { PanelCtx } from "./parts";

const PANEL_W = 400;

/**
 * `public`: lo que ve cualquier persona. `admin`: el mismo mapa dentro de /admin, con las herramientas del equipo.
 * El modo lo fija la página (nunca la sesión del navegador), para que «/» sea siempre la vista pública.
 */
export default function Explorer({ data, mode = "public" }: { data: Dataset; mode?: "public" | "admin" }) {
  const canEdit = mode === "admin";
  const [view, setView] = useState<ViewState>(() =>
    typeof window === "undefined" ? DEFAULT_VIEW : parseView(window.location.search),
  );
  const [geo, setGeo] = useState<GeoBundle | null>(null);
  const [geoError, setGeoError] = useState(false);
  const [theme, toggleTheme] = useTheme();
  const [satellite, setSatellite] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  // altura de la hoja inferior del teléfono: mínima (solo resumen), media o completa
  const [sheetRaw, setSheet] = useState<"peek" | "half" | "full">("peek");
  const dragY = useRef<number | null>(null);
  const [vw, setVw] = useState({ w: 1280, h: 800 });
  const mapRef = useRef<MapHandle>(null);

  useEffect(() => {
    loadGeo().then(setGeo).catch(() => setGeoError(true));
  }, []);

  useEffect(() => {
    const on = () => setVw({ w: window.innerWidth, h: window.innerHeight });
    on();
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);

  // ---------- navegación con historial ----------
  const commit = useCallback((next: ViewState) => {
    setView(next);
    const url = `${window.location.pathname}${serializeView(next)}`;
    if (url !== `${window.location.pathname}${window.location.search}`) window.history.pushState(null, "", url);
  }, []);

  useEffect(() => {
    const onPop = () => setView(parseView(window.location.search));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const go = useMemo<PanelCtx["go"]>(() => {
    // «Sin locación» solo se ve como lista aparte: al salir de ahí, o al elegir un lugar, se vuelve a lo normal («con locación»)
    const backToCon = (f: FilmFilter): FilmFilter => (f.locacion === "sin" ? { ...f, locacion: "con" } : f);
    return {
      place: (p: Place | null) => commit({ ...view, place: p, deptos: [], film: null, org: null, noloc: false, abroad: false, filmFilter: backToCon(view.filmFilter) }),
      film: (slug: string) => commit({ ...view, layer: "produccion", metric: LAYER_METRICS.produccion.includes(view.metric) ? view.metric : "films", film: slug, org: null, noloc: false, abroad: false }),
      org: (slug: string) => {
        const o = data.orgs.find((x) => x.slug === slug);
        const layer: LayerId = o?.layer ?? view.layer;
        commit({ ...view, layer, metric: layer === view.layer ? view.metric : LAYER_METRICS[layer][0], org: slug, film: null, noloc: false, abroad: false });
      },
      layer: (l: LayerId) =>
        commit({ ...view, layer: l, metric: LAYER_METRICS[l][0], film: null, org: null, noloc: false, abroad: false }),
      deptos: (codes: number[]) =>
        codes.length >= 2
          ? commit({ ...view, place: null, deptos: [...codes].sort((a, b) => a - b), film: null, org: null, noloc: false, abroad: false, filmFilter: backToCon(view.filmFilter) })
          : codes.length === 1
            ? commit({ ...view, place: { type: "depto", code: codes[0] }, deptos: [], film: null, org: null, noloc: false, abroad: false, filmFilter: backToCon(view.filmFilter) })
            : commit({ ...view, place: null, deptos: [], film: null, org: null, noloc: false, abroad: false, filmFilter: view.noloc ? backToCon(view.filmFilter) : view.filmFilter }),
      unlocated: () =>
        commit({ ...view, layer: "produccion", metric: LAYER_METRICS.produccion.includes(view.metric) ? view.metric : "films", place: null, deptos: [], film: null, org: null, noloc: true, abroad: false, filmFilter: { ...view.filmFilter, locacion: "sin" } }),
      abroad: () =>
        commit({ ...view, layer: "produccion", metric: LAYER_METRICS.produccion.includes(view.metric) ? view.metric : "films", place: null, deptos: [], film: null, org: null, noloc: false, abroad: true, filmFilter: backToCon(view.filmFilter) }),
      up: () => {
        if (view.film || view.org) return commit({ ...view, film: null, org: null });
        if (view.noloc || view.abroad) return commit({ ...view, noloc: false, abroad: false, filmFilter: view.noloc ? backToCon(view.filmFilter) : view.filmFilter });
        if (view.place?.type === "muni") {
          const e = geo?.gaz.muni(view.place.code);
          return commit({ ...view, place: e ? { type: "depto", code: e.depto_ine } : null });
        }
        commit({ ...view, place: null, deptos: [] });
      },
      clear: () => commit({ ...view, place: null, deptos: [], film: null, org: null, noloc: false, abroad: false, filmFilter: view.noloc ? backToCon(view.filmFilter) : view.filmFilter }),
      locacion: (locacion: "con" | "sin" | null) =>
        // en «Sin locación» no hay territorio que ver: se sale del lugar o de la producción abiertos
        commit({ ...view, filmFilter: { ...view.filmFilter, locacion }, film: null, ...(locacion === "sin" ? { place: null, deptos: [] } : {}), noloc: false, abroad: false }),
    };
  }, [view, commit, data.orgs, geo]);

  // el logo lleva al inicio: vista por defecto y país completo (clic normal; con Cmd/Ctrl se abre en otra pestaña)
  const homeHref = canEdit ? "/admin" : "/";
  const goHome = useCallback(
    (e: React.MouseEvent) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault();
      setSearchOpen(false);
      commit(DEFAULT_VIEW);
      mapRef.current?.reset();
    },
    [commit],
  );

  // atajos de teclado
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((o) => !o);
      } else if (e.key === "/" && !searchOpen && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        setSearchOpen(true);
      } else if (e.key === "Escape" && !searchOpen && (view.place || view.deptos.length || view.film || view.org || view.noloc || view.abroad)) {
        go.up();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [searchOpen, view, go]);


  // Los filtros recortan solo la capa activa (las demás se ven completas). El lugar lo maneja `view.place`, no el filtro.
  // Con varios departamentos marcados, las producciones se recortan a lo rodado en ellos (así las cifras y el mapa cuadran).
  const filteredFilms = useMemo(() => {
    if (view.layer !== "produccion") return data.films;
    const multi = view.deptos.length >= 2;
    if (!multi && !filmFilterActive(view.filmFilter)) return data.films;
    const out = filterFilms(data.films, { ...view.filmFilter, depto: view.deptos, muni: [] });
    return multi && !view.film ? out.map((f) => ({ ...f, locations: locationsMatching(f.locations, { depto: view.deptos, muni: [] }) })) : out;
  }, [data.films, view.layer, view.filmFilter, view.deptos, view.film]);
  const filteredOrgs = useMemo(() => {
    if (view.layer === "produccion" || (!orgFilterActive(view.orgFilter) && view.deptos.length < 2)) return data.orgs;
    const f = { ...view.orgFilter, capa: null, depto: view.deptos };
    return data.orgs.filter((o) => o.layer !== view.layer || orgMatches(o, f));
  }, [data.orgs, view.layer, view.orgFilter, view.deptos]);
  // lo que está seleccionado nunca desaparece del mapa, aunque no cumpla los filtros
  const shown = useMemo<Dataset>(() => {
    const films = filteredFilms === data.films || !view.film ? filteredFilms : filteredFilms.some((f) => f.slug === view.film) ? filteredFilms : [...filteredFilms, ...data.films.filter((f) => f.slug === view.film)];
    const orgs = filteredOrgs === data.orgs || !view.org ? filteredOrgs : filteredOrgs.some((o) => o.slug === view.org) ? filteredOrgs : [...filteredOrgs, ...data.orgs.filter((o) => o.slug === view.org)];
    return films === data.films && orgs === data.orgs ? data : { ...data, films, orgs };
  }, [data, filteredFilms, filteredOrgs, view.film, view.org]);
  const layerCount = view.layer === "produccion" ? filteredFilms.length : filteredOrgs.filter((o) => o.layer === view.layer).length;
  const layerTotal = view.layer === "produccion" ? data.films.length : data.orgs.filter((o) => o.layer === view.layer).length;
  const extraCategories = useMemo(() => {
    if (view.layer === "produccion") return [];
    const known: readonly string[] = view.layer === "circulacion" ? CIRC_CATEGORIES : IND_CATEGORIES;
    const out = new Set<string>();
    for (const o of data.orgs) if (o.layer === view.layer) for (const c of o.categories ?? []) if (!known.includes(c)) out.add(c);
    return [...out];
  }, [data.orgs, view.layer]);
  const extraGenres = useMemo(() => customGenres(data.films), [data.films]);
  const aggs = useMemo(() => aggregate(shown, view.layer), [shown, view.layer]);
  const hasSelection = !!(view.place || view.deptos.length || view.film || view.org || view.noloc || view.abroad);
  const desktop = vw.w >= 900;
  // teléfono del público: barra superior compacta; el equipo conserva la distribución de siempre
  const compactTop = !desktop && !canEdit;
  // con algo elegido, la hoja nunca queda en su altura mínima
  const sheet = hasSelection && sheetRaw === "peek" ? "half" : sheetRaw;
  const PEEK_H = 112;
  const padding = desktop
    ? { top: 20, right: PANEL_W + 16, bottom: 20, left: 460 }
    : { top: compactTop ? 168 : 190, right: 0, bottom: sheet === "peek" ? PEEK_H : Math.round(vw.h * 0.5), left: 0 };

  // el público no ve los filtros de las cifras de rodaje que el equipo dejó ocultas
  const hiddenFilters = canEdit ? [] : [!data.publicStats.days && "dias", !data.publicStats.spend && "inversion", !data.publicStats.jobs && "empleos"].filter((x): x is string => !!x);
  const filterPanel = (compact: boolean) => (
    <FilterPanel
      compact={compact}
      hiddenFields={hiddenFilters}
      layer={view.layer}
      filmFilter={view.filmFilter}
      orgFilter={view.orgFilter}
      count={layerCount}
      total={layerTotal}
      extraCategories={extraCategories}
      extraGenres={extraGenres}
      onFilm={(filmFilter) => commit({ ...view, filmFilter, film: null, org: null, noloc: false, abroad: false })}
      onOrg={(orgFilter) => commit({ ...view, orgFilter, film: null, org: null, noloc: false, abroad: false })}
      downloadHref={downloadHref(view)}
    />
  );

  const ctx: PanelCtx | null = geo ? { data: shown, allFilms: data.films, gaz: geo.gaz, aggs, view, go, canEdit, mobile: !desktop, sheet } : null;

  // al elegir otra cosa, la hoja vuelve a su tamaño medio (o a la mínima si no hay nada elegido)
  const selectionKey = `${view.deptos.join(",")}|${view.film ?? ""}|${view.org ?? ""}|${view.place?.type ?? ""}${view.place?.code ?? ""}|${view.noloc}|${view.abroad}`;
  useEffect(() => setSheet(hasSelection ? "half" : "peek"), [selectionKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const levels: ("peek" | "half" | "full")[] = hasSelection ? ["half", "full"] : ["peek", "half", "full"];
  const stepSheet = (dir: 1 | -1) => setSheet(levels[Math.max(0, Math.min(levels.length - 1, levels.indexOf(sheet) + dir))]);

  const liveText = view.film
    ? `Producción: ${data.films.find((f) => f.slug === view.film)?.title ?? ""}`
    : view.org
      ? `Entidad: ${data.orgs.find((o) => o.slug === view.org)?.name ?? ""}`
      : view.noloc
        ? "Producciones sin locación"
        : view.abroad
          ? "Producciones rodadas fuera de Guatemala"
      : view.deptos.length
        ? `Departamentos: ${view.deptos.map((d) => geo?.gaz.depto(d)?.name ?? "").join(", ")}`
        : view.place
        ? `Territorio: ${(view.place.type === "depto" ? geo?.gaz.depto(view.place.code) : geo?.gaz.muni(view.place.code))?.name ?? ""}`
        : `Capa ${view.layer}`;

  const panelKey = view.film ? `f-${view.film}` : view.org ? `o-${view.org}` : view.noloc ? "noloc" : view.abroad ? "abroad" : view.place ? `p-${view.place.type}${view.place.code}` : view.deptos.length ? `d-${view.deptos.join("-")}` : `home-${view.layer}`;

  return (
    <main aria-label="Mapa del cine de Guatemala" className="relative h-full w-full overflow-hidden bg-bg">
      <div className="sr-only" aria-live="polite" role="status">
        {liveText}
      </div>
      {geo && (
        <MapCanvas
          ref={mapRef}
          data={shown}
          geo={geo}
          view={view}
          theme={theme}
          satellite={satellite}
          padding={padding}
          onPlace={(p) => (p ? go.place(p) : go.clear())}
          onFilm={go.film}
          onOrg={go.org}
          onUnlocated={go.unlocated}
          onAbroad={go.abroad}
          onReady={() => setMapReady(true)}
        />
      )}

      {/* carga */}
      <AnimatePresence>
        {(!geo || !mapReady) && (
          <motion.div
            key="loader"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="pointer-events-none absolute inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-bg"
          >
            {geoError ? (
              <p className="text-sm text-muted">No pudimos cargar los límites del mapa. Recarga la página.</p>
            ) : (
              <>
                <MapLogo className="h-20 max-w-[85vw] animate-pulse object-contain sm:h-24" />
                <div className="flex items-center gap-5 opacity-80">
                  <AcademiaLogo className="h-9" />
                  <ProcineLogo className="h-6" />
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* columna superior izquierda */}
      <div className="pointer-events-none absolute left-3 right-3 top-3 z-20 flex flex-col gap-2.5 sm:left-4 sm:right-auto sm:top-4 sm:w-[440px]">
        {compactTop ? (
          <>
            <MobileTopBar homeHref={homeHref} onHome={goHome} aportarHref={`/aportar?capa=${view.layer}`} onSearch={() => setSearchOpen(true)} theme={theme} onTheme={toggleTheme} filters={filterPanel(true)} />
            <div className="pointer-events-none flex items-center gap-2">
              <div className="pointer-events-auto min-w-0 flex-1">
                <LayerSwitcher layer={view.layer} onChange={go.layer} />
              </div>
              {geo && <DepartmentFilter compact gaz={geo.gaz} selected={selectedDeptos(view)} onChange={go.deptos} />}
            </div>
          </>
        ) : (
          <>
            <div className="pointer-events-auto glass flex items-center gap-2 rounded-2xl border border-line p-2 shadow-soft">
              <h1 className="m-0 flex min-w-0 flex-1 items-center pl-1.5">
                <a href={homeHref} onClick={goHome} className="flex min-w-0 items-center" aria-label="Mapa del Cine de Guatemala, inicio" title="Ir al inicio">
                  <MapLogo className="h-10 max-w-full object-contain object-left sm:h-12" />
                </a>
              </h1>
              <button className="btn-ghost h-9 w-9 !p-0" onClick={() => setSearchOpen(true)} aria-label="Buscar (⌘K)" title="Buscar (⌘K)">
                <Search className="h-4 w-4" />
              </button>
              <Link href="/descargas" className="btn-ghost h-9 w-9 !p-0" aria-label="Descargas de datos" title="Descargas de datos">
                <Download className="h-4 w-4" />
              </Link>
              <button
                className="btn-ghost h-9 w-9 !p-0"
                onClick={toggleTheme}
                aria-label={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
                title={theme === "dark" ? "Modo claro" : "Modo oscuro"}
              >
                {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
            </div>
            {!canEdit && (
              <Link
                href={`/aportar?capa=${view.layer}`}
                className="btn-primary pointer-events-auto h-11 w-full justify-center gap-2 rounded-2xl text-[15px] shadow-soft"
                title="Aporta una producción o entidad que falta en el mapa"
              >
                <HandHeart className="h-5 w-5" aria-hidden />
                Aportar al mapa
              </Link>
            )}
            <div className="pointer-events-auto flex flex-col items-start gap-2 sm:flex-row sm:flex-wrap">
              <LayerSwitcher layer={view.layer} onChange={go.layer} />
            </div>
            <div className="pointer-events-none relative flex flex-wrap items-start gap-2">
              {geo && <DepartmentFilter gaz={geo.gaz} selected={selectedDeptos(view)} onChange={go.deptos} />}
              {filterPanel(false)}
            </div>
          </>
        )}
      </div>

      {/* leyenda y controles */}
      <div
        className="pointer-events-none absolute z-20 flex items-end justify-between gap-3"
        style={{
          left: desktop ? 16 : 12,
          right: desktop ? PANEL_W + 32 : 12,
          bottom: desktop ? 28 : sheet === "peek" ? PEEK_H + 14 : Math.round(vw.h * 0.5) + 14,
          // con la hoja completa los controles quedarían debajo de ella
          visibility: !desktop && sheet === "full" ? "hidden" : undefined,
        }}
      >
        <div className="pointer-events-auto ml-auto">
          <MapControls
            onZoomIn={() => mapRef.current?.zoomIn()}
            onZoomOut={() => mapRef.current?.zoomOut()}
            onReset={() => {
              go.clear();
              mapRef.current?.reset();
            }}
            satellite={satellite}
            onSatellite={() => setSatellite((s) => !s)}
            hideZoom={!desktop}
          />
        </div>
      </div>

      {/* panel lateral / hoja inferior */}
      {ctx && (
        <aside
          aria-label="Información del mapa"
          className={
            desktop
              ? "glass absolute bottom-4 right-4 top-4 z-30 flex flex-col overflow-hidden rounded-xl border border-line shadow-float"
              : "glass absolute inset-x-0 bottom-0 z-30 flex flex-col overflow-hidden rounded-t-3xl border-t border-line shadow-float"
          }
          style={
            desktop
              ? { width: PANEL_W }
              : {
                  height: sheet === "full" ? "88dvh" : sheet === "half" ? "50dvh" : `calc(${PEEK_H}px + env(safe-area-inset-bottom))`,
                  transition: "height .3s ease",
                }
          }
        >
          {!desktop && (
            <button
              aria-label={sheet === "full" ? "Reducir panel" : "Ampliar panel"}
              aria-expanded={sheet !== "peek"}
              className="flex h-7 w-full shrink-0 touch-none items-center justify-center"
              onClick={() => (sheet === "full" ? stepSheet(-1) : stepSheet(1))}
              onPointerDown={(e) => {
                dragY.current = e.clientY;
              }}
              onPointerUp={(e) => {
                const start = dragY.current;
                dragY.current = null;
                if (start == null) return;
                const dy = e.clientY - start;
                if (dy < -30) stepSheet(1);
                else if (dy > 30) stepSheet(-1);
              }}
            >
              <span className="h-1 w-10 rounded-full bg-line" />
            </button>
          )}
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={panelKey}
              className="min-h-0 flex-1"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              {view.film ? (
                <FilmPanel ctx={ctx} />
              ) : view.org ? (
                <OrgPanel ctx={ctx} />
              ) : view.noloc ? (
                <UnlocatedPanel ctx={ctx} />
              ) : view.abroad ? (
                <AbroadPanel ctx={ctx} />
              ) : view.place ? (
                <TerritoryPanel ctx={ctx} />
              ) : desktop || sheet !== "peek" ? (
                <OverviewPanel ctx={ctx} />
              ) : (
                <MobilePeek ctx={ctx} onOpen={() => setSheet("half")} />
              )}
            </motion.div>
          </AnimatePresence>
        </aside>
      )}

      {geo && (
        <SearchPalette
          open={searchOpen}
          onClose={() => setSearchOpen(false)}
          gaz={geo.gaz}
          data={data}
          onPlace={go.place}
          onFilm={go.film}
          onOrg={go.org}
        />
      )}
    </main>
  );
}
