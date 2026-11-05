"use client";

import { AlertTriangle, ArrowRight, Copy, MapPin } from "lucide-react";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { PlaceSelect } from "@/components/records/PlaceSelect";
import { CompletenessBadge } from "@/components/ui/Badges";
import type { GeoBundle } from "@/lib/geo/load";
import { candidatesToDataset } from "@/lib/import/preview";
import { candidateStatus, setCandidateLocation } from "@/lib/import/questions";
import type { Candidate, DuplicateDecision, ResolveResponse } from "@/lib/import/types";
import { CIRC_CATEGORIES, IND_CATEGORIES, LAYERS, type LayerId } from "@/lib/types";
import type { ViewState } from "@/lib/view";
import { cn } from "@/lib/utils";

const MapCanvas = dynamic(() => import("@/components/map/MapCanvas"), { ssr: false });

const PAGE = 40;
type Filter = "all" | "doubts" | "dups";

/** Cambia la categoría principal sin perder las demás que ya traía la fila. */
const setPrimary = (cats: string[] | undefined, old: string, next: string) =>
  next ? [next, ...(cats ?? []).filter((c) => c !== old && c !== next)] : (cats ?? []).filter((c) => c !== old);

export function StepReview({
  geo,
  candidates,
  onCandidates,
  engine,
  onBack,
  onNext,
}: {
  geo: GeoBundle;
  candidates: Candidate[];
  onCandidates(c: Candidate[]): void;
  engine: ResolveResponse["engine"];
  onBack(): void;
  onNext(): void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<string | null>(null); // "key#idx"
  const [layer, setLayer] = useState<LayerId>("produccion");

  const patch = (key: string, fn: (c: Candidate) => Candidate) =>
    onCandidates(candidates.map((c) => (c.key === key ? fn(c) : c)));

  const stats = useMemo(() => {
    const live = candidates.filter((c) => c.include && c.decision !== "skip");
    return {
      total: candidates.length,
      live: live.length,
      doubts: candidates.filter((c) => c.issues.length > 0).length,
      dups: candidates.filter((c) => c.duplicate).length,
      incomplete: live.filter((c) => candidateStatus(c).completeness < 100).length,
    };
  }, [candidates]);

  const shown = useMemo(() => {
    if (filter === "doubts") return candidates.filter((c) => c.issues.length > 0);
    if (filter === "dups") return candidates.filter((c) => c.duplicate);
    return candidates;
  }, [candidates, filter]);
  const pages = Math.max(1, Math.ceil(shown.length / PAGE));
  const slice = shown.slice(page * PAGE, page * PAGE + PAGE);

  const preview = useMemo(() => candidatesToDataset(candidates), [candidates]);
  const layers = useMemo(() => {
    const out: LayerId[] = [];
    if (preview.films.length) out.push("produccion");
    if (preview.orgs.some((o) => o.layer === "circulacion")) out.push("circulacion");
    if (preview.orgs.some((o) => o.layer === "industria")) out.push("industria");
    return out;
  }, [preview]);
  const activeLayer = layers.includes(layer) ? layer : (layers[0] ?? "produccion");
  const view: ViewState = { layer: activeLayer, metric: activeLayer === "produccion" ? "films" : "orgs", place: null, film: null, org: null, cat: null, noloc: false };
  const theme = typeof document !== "undefined" && document.documentElement.dataset.theme === "light" ? "light" : "dark";

  const placeLabel = (c: Candidate, idx: number) => {
    const loc = c.type === "film" ? c.film!.locations[idx] : { muni_ine: c.org!.muni_ine, depto_ine: c.org!.depto_ine };
    const muni = geo.gaz.muni(loc?.muni_ine);
    const depto = geo.gaz.depto(loc?.depto_ine);
    return { muni, depto, ok: !!muni, text: c.placeTexts[idx] };
  };

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <span><b className="font-display text-xl">{stats.live}</b> <span className="text-muted">registros por cargar</span></span>
        <span className="text-muted"><b className="text-warn">{stats.doubts}</b> con dudas de lugar</span>
        <span className="text-muted"><b className="text-warn">{stats.incomplete}</b> incompletos</span>
        {stats.dups > 0 && <span className="text-muted"><b className="text-accent">{stats.dups}</b> posibles duplicados</span>}
        <span className="ml-auto text-xs text-muted">{engine === "claude" ? "Lugares ubicados con ayuda de Claude" : "Lugares ubicados con la lista oficial"}</span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0">
          <div className="mb-3 flex items-center gap-1.5">
            {([
              ["all", `Todos (${stats.total})`],
              ["doubts", `Con dudas (${stats.doubts})`],
              ["dups", `Duplicados (${stats.dups})`],
            ] as [Filter, string][]).map(([id, label]) => (
              <button
                key={id}
                onClick={() => {
                  setFilter(id);
                  setPage(0);
                }}
                className={cn("rounded-xl px-3 py-1.5 text-xs transition-colors", filter === id ? "bg-surface-2 text-ink" : "text-muted hover:text-ink")}
              >
                {label}
              </button>
            ))}
            <button
              className="ml-auto text-xs text-muted hover:text-ink"
              onClick={() => {
                const all = candidates.every((c) => c.include);
                onCandidates(candidates.map((c) => ({ ...c, include: !all })));
              }}
            >
              {candidates.every((c) => c.include) ? "Quitar todos" : "Marcar todos"}
            </button>
          </div>

          <ul className="space-y-2">
            {slice.map((c) => {
              const st = candidateStatus(c);
              const locCount = c.type === "film" ? c.film!.locations.length : 1;
              return (
                <li key={c.key} className={cn("rounded-2xl border bg-surface p-3.5 transition-opacity", c.include && c.decision !== "skip" ? "border-line" : "border-line/50 opacity-55")}>
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      aria-label="Incluir"
                      className="mt-2 accent-[rgb(var(--accent))]"
                      checked={c.include}
                      onChange={(e) => patch(c.key, (x) => ({ ...x, include: e.target.checked }))}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          className="field !w-auto min-w-0 flex-1 !py-1.5 font-display text-[15px]"
                          value={c.type === "film" ? c.film!.title : c.org!.name}
                          onChange={(e) =>
                            patch(c.key, (x) =>
                              x.type === "film" ? { ...x, film: { ...x.film!, title: e.target.value } } : { ...x, org: { ...x.org!, name: e.target.value } },
                            )
                          }
                        />
                        {c.type === "film" ? (
                          <input
                            className="field !w-20 !py-1.5 text-center"
                            inputMode="numeric"
                            placeholder="Año"
                            value={c.film!.year ?? ""}
                            onChange={(e) =>
                              patch(c.key, (x) => ({ ...x, film: { ...x.film!, year: e.target.value ? Number(e.target.value.replace(/\D/g, "").slice(0, 4)) : null } }))
                            }
                          />
                        ) : (
                          <select
                            className="field !w-auto max-w-[220px] !py-1.5 text-xs"
                            value={c.org!.category}
                            onChange={(e) => patch(c.key, (x) => ({ ...x, org: { ...x.org!, category: e.target.value, categories: setPrimary(x.org!.categories, x.org!.category, e.target.value) }, issues: x.issues.filter((i) => i.field !== "category") }))}
                          >
                            <option value="">Categoría…</option>
                            {(c.org!.layer === "circulacion" ? CIRC_CATEGORIES : IND_CATEGORIES).map((k) => (
                              <option key={k} value={k}>{k}</option>
                            ))}
                            {c.org!.category && !([...CIRC_CATEGORIES, ...IND_CATEGORIES] as string[]).includes(c.org!.category) && (
                              <option value={c.org!.category}>{c.org!.category}</option>
                            )}
                          </select>
                        )}
                        <CompletenessBadge pct={st.completeness} missing={st.missing} compact />
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {Array.from({ length: Math.max(locCount, c.type === "film" ? 0 : 1) }).slice(0, 6).map((_, i) => {
                          const p = placeLabel(c, i);
                          const k = `${c.key}#${i}`;
                          return (
                            <button
                              key={i}
                              onClick={() => setEditing(editing === k ? null : k)}
                              className={cn(
                                "chip transition hover:text-ink",
                                p.ok ? "text-ink/80" : "border-warn/50 text-warn",
                                editing === k && "border-accent",
                              )}
                            >
                              {p.ok ? <MapPin className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                              {p.muni ? `${p.muni.name}, ${p.muni.depto}` : p.depto ? `${p.depto.name} · municipio pendiente` : p.text ? `¿Dónde? “${p.text}”` : "Sin lugar"}
                            </button>
                          );
                        })}
                        {c.type === "film" && locCount > 6 && <span className="text-xs text-muted">+{locCount - 6} más</span>}
                        {c.type === "film" && locCount === 0 && (
                          <button className={cn("chip border-warn/50 text-warn")} onClick={() => setEditing(editing === `${c.key}#0` ? null : `${c.key}#0`)}>
                            <AlertTriangle className="h-3 w-3" /> Sin lugar — agregar
                          </button>
                        )}
                      </div>

                      {editing?.startsWith(`${c.key}#`) && (
                        <div className="mt-2 max-w-sm">
                          <PlaceSelect
                            idPrefix={`rev-${c.key}`}
                            geo={geo}
                            value={(() => {
                              const idx = Number(editing.split("#")[1]);
                              const l = c.type === "film" ? c.film!.locations[idx] : c.org;
                              return { muni_ine: l?.muni_ine ?? null, depto_ine: l?.depto_ine ?? null };
                            })()}
                            onChange={(v) => {
                              const idx = Number(editing.split("#")[1]);
                              patch(c.key, (x) => setCandidateLocation(x, idx, v));
                            }}
                          />
                          <button className="btn-ghost mt-1.5 !py-1 text-xs" onClick={() => setEditing(null)}>Listo</button>
                        </div>
                      )}

                      {c.duplicate && (
                        <div className="mt-2.5 flex flex-wrap items-center gap-2 rounded-xl bg-accent/8 px-3 py-2 text-xs">
                          <Copy className="h-3.5 w-3.5 text-accent" />
                          <span className="text-ink/90">
                            ¿Es la misma que <b>{c.duplicate.title}</b>
                            {c.duplicate.year ? ` (${c.duplicate.year})` : ""}?
                          </span>
                          <select
                            className="field !w-auto !py-1 text-xs"
                            value={c.decision ?? "update"}
                            onChange={(e) => patch(c.key, (x) => ({ ...x, decision: e.target.value as DuplicateDecision }))}
                          >
                            <option value="update">Sí, completar la existente</option>
                            <option value="create">No, crear nueva</option>
                            <option value="skip">Omitir</option>
                          </select>
                        </div>
                      )}
                      {c.issues
                        .filter((i) => i.level === "doubt" && !c.placeTexts.length)
                        .slice(0, 1)
                        .map((i) => (
                          <p key={i.field} className="mt-2 text-xs text-warn">{i.message}</p>
                        ))}
                    </div>
                  </div>
                  <div className="mt-1 pl-7 text-[11px] text-muted/70">Filas del archivo: {c.rows.slice(0, 4).join(", ")}{c.rows.length > 4 ? "…" : ""}</div>
                </li>
              );
            })}
            {slice.length === 0 && <li className="rounded-2xl border border-dashed border-line px-4 py-10 text-center text-sm text-muted">Nada que mostrar con este filtro.</li>}
          </ul>

          {pages > 1 && (
            <div className="mt-4 flex items-center justify-center gap-3 text-sm">
              <button className="btn-ghost !py-1" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Anterior</button>
              <span className="text-muted">{page + 1} / {pages}</span>
              <button className="btn-ghost !py-1" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>Siguiente</button>
            </div>
          )}
        </div>

        <aside className="hidden lg:block">
          <div className="sticky top-20">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Vista previa en el mapa</h3>
              <div className="flex gap-1">
                {layers.length > 1 &&
                  layers.map((l) => (
                    <button key={l} onClick={() => setLayer(l)} className={cn("rounded-lg px-2 py-1 text-[11px]", activeLayer === l ? "bg-surface-2 text-ink" : "text-muted hover:text-ink")}>
                      {LAYERS.find((x) => x.id === l)!.label}
                    </button>
                  ))}
              </div>
            </div>
            <div className="relative h-[560px] overflow-hidden rounded-xl border border-line">
              <MapCanvas
                data={preview}
                geo={geo}
                view={view}
                theme={theme}
                satellite={false}
                padding={{ top: 0, right: 0, bottom: 0, left: 0 }}
                onPlace={() => {}}
                onFilm={() => {}}
                onOrg={() => {}}
                onScale={() => {}}
              />
            </div>
            <p className="mt-2 text-xs text-muted">Así se verá lo que marcaste. Los puntos huecos son lugares aproximados al municipio.</p>
          </div>
        </aside>
      </div>

      <div className="mt-8 flex items-center justify-between">
        <button className="btn-ghost" onClick={onBack}>Volver</button>
        <button className="btn-primary" onClick={onNext} disabled={stats.live === 0}>
          Continuar <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
