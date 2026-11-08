"use client";

import { isAbroad } from "@/lib/completeness";
import { EMPTY_FILM_FILTER, EMPTY_ORG_FILTER } from "@/lib/filters";
import { AlertTriangle, ArrowRight, Copy, Download, MapPin, Plus, Sparkles } from "lucide-react";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { PlaceSelect } from "@/components/records/PlaceSelect";
import { CompletenessBadge } from "@/components/ui/Badges";
import type { GeoBundle } from "@/lib/geo/load";
import { planFilmUpdate, planOrgUpdate, type PlaceNames, type UpdateGroup, type UpdateItem, type UpdatePlan } from "@/lib/import/diff";
import { downloadNormalized, normalizedTables, type NormalizedTable } from "@/lib/import/normalized";
import { candidatesToDataset } from "@/lib/import/preview";
import { candidateStatus, setCandidateLocation } from "@/lib/import/questions";
import { acceptAllSuggestions, acceptSuggestion } from "@/lib/import/suggestions";
import type { Candidate, DuplicateMatch, MatchLevel, PlaceResolution, ResolveResponse } from "@/lib/import/types";
import { CIRC_CATEGORIES, IND_CATEGORIES, LAYERS, type Film, type LayerId, type Org } from "@/lib/types";
import type { ViewState } from "@/lib/view";
import { cn } from "@/lib/utils";

const MapCanvas = dynamic(() => import("@/components/map/MapCanvas"), { ssr: false });

const PAGE = 40;

const GROUP_TITLE: Record<UpdateGroup, string> = {
  fill: "Completa (estaba vacío)",
  add: "Agrega",
  conflict: "Ya tiene otro valor",
};

/** Qué traería el archivo para un registro que ya existe; null si no hay con qué comparar. */
function updatePlan(c: Candidate, names: PlaceNames): UpdatePlan | null {
  const rec = c.duplicate?.record;
  if (!rec) return null;
  if (c.type === "film" && c.film) return planFilmUpdate(rec as Film, c.film, names);
  if (c.type === "org" && c.org) return planOrgUpdate(rec as Org, c.org, names);
  return null;
}

/**
 * Lo que se acepta de un plan: lo que completa o agrega, salvo lo que la persona apagó. Lo que ya tiene otro valor
 * nunca se cambia desde la carga: va a Aportes para que lo revise el equipo.
 */
const accepted = (c: Candidate, plan: UpdatePlan) => new Set((c.accept ?? plan.items.filter((i) => i.defaultOn).map((i) => i.id)).filter((id) => plan.items.find((i) => i.id === id)?.group !== "conflict"));

const LEVEL: Record<MatchLevel, { text: string; cls: string }> = {
  seguro: { text: "Coincidencia segura", cls: "text-ok" },
  probable: { text: "Coincidencia probable", cls: "text-accent" },
  dudoso: { text: "Coincidencia dudosa", cls: "text-warn" },
};
const everyMatch = (d: DuplicateMatch): DuplicateMatch[] => [{ ...d, alternatives: undefined }, ...(d.alternatives ?? [])];
const matchText = (m: DuplicateMatch) => `${m.title}${m.year ? ` (${m.year})` : ""}`;
type Filter = "all" | "doubts" | "dups";
type Mode = "records" | "normalized";

/** Cambia la categoría principal sin perder las demás que ya traía la fila. */
const setPrimary = (cats: string[] | undefined, old: string, next: string) =>
  next ? [next, ...(cats ?? []).filter((c) => c !== old && c !== next)] : (cats ?? []).filter((c) => c !== old);

export function StepReview({
  geo,
  candidates,
  onCandidates,
  engine,
  places,
  note,
  filename,
  onBack,
  onNext,
}: {
  geo: GeoBundle;
  candidates: Candidate[];
  onCandidates(c: Candidate[]): void;
  engine: ResolveResponse["engine"];
  places: Record<string, PlaceResolution>;
  /** Aviso de la lectura de texto libre (lotes que fallaron). */
  note?: string | null;
  filename: string;
  onBack(): void;
  onNext(): void;
}) {
  const [allLocs, setAllLocs] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<string | null>(null); // "key#idx"
  const [layer, setLayer] = useState<LayerId>("produccion");
  const [mode, setMode] = useState<Mode>("records");
  const [tableId, setTableId] = useState<NormalizedTable["id"] | null>(null);

  const patch = (key: string, fn: (c: Candidate) => Candidate) =>
    onCandidates(candidates.map((c) => (c.key === key ? fn(c) : c)));

  const names = useMemo<PlaceNames>(() => ({ muni: (code) => geo.gaz.muni(code)?.name ?? "", depto: (code) => geo.gaz.depto(code)?.name ?? "" }), [geo]);

  const tables = useMemo(() => normalizedTables(candidates, names), [candidates, names]);

  const stats = useMemo(() => {
    const live = candidates.filter((c) => c.include && c.decision !== "skip");
    return {
      toAportes: live.filter((c) => c.decision === "review" || (c.duplicate && c.decision !== "create" && (updatePlan(c, names)?.items.some((i) => i.group === "conflict") ?? false))).length,
      withNew: live.filter((c) => c.duplicate && c.decision === "update" && (updatePlan(c, names)?.news ?? 0) > 0).length,
      total: candidates.length,
      live: live.length,
      doubts: candidates.filter((c) => c.issues.length > 0).length,
      suggestions: candidates.reduce((n, c) => n + (c.suggestions ?? []).filter((s) => !s.accepted).length, 0),
      dups: candidates.filter((c) => c.duplicate).length,
      incomplete: live.filter((c) => candidateStatus(c).completeness < 100).length,
    };
  }, [candidates, names]);

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
  const view: ViewState = { layer: activeLayer, metric: activeLayer === "produccion" ? "films" : "orgs", place: null, deptos: [], film: null, org: null, filmFilter: EMPTY_FILM_FILTER, orgFilter: EMPTY_ORG_FILTER, noloc: false, abroad: false };
  const theme = typeof document !== "undefined" && document.documentElement.dataset.theme === "light" ? "light" : "dark";

  const placeLabel = (c: Candidate, idx: number) => {
    const loc = c.type === "film" ? c.film!.locations[idx] : { muni_ine: c.org!.muni_ine, depto_ine: c.org!.depto_ine };
    const muni = geo.gaz.muni(loc?.muni_ine);
    const depto = geo.gaz.depto(loc?.depto_ine);
    const fl = c.type === "film" ? c.film!.locations[idx] : undefined;
    const abroad = fl && isAbroad(fl) ? [fl.city, fl.country].filter(Boolean).join(", ") : null;
    return { muni, depto, abroad, ok: !!muni || !!abroad, text: c.placeTexts[idx] };
  };

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <span><b className="font-display text-xl">{stats.live}</b> <span className="text-muted">registros por cargar</span></span>
        <span className="text-muted"><b className="text-warn">{stats.doubts}</b> con dudas</span>
        {stats.suggestions > 0 && <span className="text-muted"><b className="text-accent">{stats.suggestions}</b> sugerencias del texto</span>}
        <span className="text-muted"><b className="text-warn">{stats.incomplete}</b> incompletos</span>
        {stats.dups > 0 && <span className="text-muted"><b className="text-accent">{stats.dups}</b> posibles duplicados</span>}
        {stats.dups > 0 && <span className="text-muted"><b className="text-accent">{stats.withNew}</b> existentes con datos nuevos</span>}
        {stats.toAportes > 0 && <span className="text-muted"><b className="text-warn">{stats.toAportes}</b> irán a Aportes para revisión</span>}
        {note && <span className="w-full text-xs text-warn">{note}</span>}
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
            <span className="mx-1 h-4 w-px bg-line" />
            <button
              onClick={() => setMode(mode === "records" ? "normalized" : "records")}
              className={cn("rounded-xl px-3 py-1.5 text-xs transition-colors", mode === "normalized" ? "bg-surface-2 text-ink" : "text-muted hover:text-ink")}
              aria-pressed={mode === "normalized"}
            >
              Vista normalizada
            </button>
            <button className="ml-auto text-xs text-muted hover:text-ink" onClick={() => void downloadNormalized(tables, filename)} disabled={tables.length === 0} title="Excel con lo que entendimos, listo para volver a cargarlo">
              <Download className="mr-1 inline h-3.5 w-3.5" />Descargar Excel normalizado
            </button>
            {mode === "records" && (
              <button
                className="text-xs text-muted hover:text-ink"
                onClick={() => {
                  const all = candidates.every((c) => c.include);
                  onCandidates(candidates.map((c) => ({ ...c, include: !all })));
                }}
              >
                {candidates.every((c) => c.include) ? "Quitar todos" : "Marcar todos"}
              </button>
            )}
          </div>

          {mode === "normalized" && <NormalizedView tables={tables} tableId={tableId} onTable={setTableId} />}
          {mode === "records" && (<>

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
                        {Array.from({ length: Math.max(locCount, c.type === "film" ? 0 : 1) }).slice(0, allLocs.has(c.key) ? 60 : 6).map((_, i) => {
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
                              {p.abroad ? `${p.abroad} · fuera de Guatemala` : p.muni ? `${p.muni.name}, ${p.muni.depto}` : p.depto ? `${p.depto.name} · municipio pendiente` : p.text ? `¿Dónde? “${p.text}”` : "Sin lugar"}
                            </button>
                          );
                        })}
                        {c.type === "film" && locCount > 6 && (
                          <button
                            className="text-xs text-muted hover:text-ink"
                            onClick={() => setAllLocs((s) => { const n = new Set(s); if (n.has(c.key)) n.delete(c.key); else n.add(c.key); return n; })}
                          >
                            {allLocs.has(c.key) ? "Ver menos" : `Ver las ${locCount} locaciones (+${locCount - 6})`}
                          </button>
                        )}
                        {c.type === "film" && locCount === 0 && (
                          <button className={cn("chip border-warn/50 text-warn")} onClick={() => setEditing(editing === `${c.key}#0` ? null : `${c.key}#0`)}>
                            <AlertTriangle className="h-3 w-3" /> Sin lugar — agregar
                          </button>
                        )}
                      </div>

                      {c.issues.filter((i) => i.field.startsWith("count:") || i.field.startsWith("columns:")).map((i) => (
                        <p key={i.field} className="mt-2 flex items-start gap-1.5 text-xs text-warn">
                          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {i.message}
                        </p>
                      ))}

                      {(c.suggestions?.length ?? 0) > 0 && (
                        <div className="mt-2 rounded-xl border border-accent/30 bg-accent/5 px-3 py-2">
                          <div className="flex items-center gap-2 text-xs font-medium">
                            <Sparkles className="h-3.5 w-3.5 text-accent" /> Sugerencias del texto
                            <span className="font-normal text-muted">(Claude las encontró; confírmalas antes de agregarlas)</span>
                            {c.suggestions!.some((s) => !s.accepted) && (
                              <button className="ml-auto text-accent hover:underline" onClick={() => patch(c.key, (x) => acceptAllSuggestions(x, places))}>
                                Agregar todas
                              </button>
                            )}
                          </div>
                          <ul className="mt-1.5 space-y-1.5">
                            {c.suggestions!.map((s) => (
                              <li key={s.id} className={cn("flex items-start gap-2 text-xs", s.accepted && "opacity-60")}>
                                <button
                                  className="btn-outline !h-6 shrink-0 !px-2 !py-0 text-[11px]"
                                  disabled={s.accepted}
                                  onClick={() => patch(c.key, (x) => acceptSuggestion(x, s.id, places))}
                                >
                                  {s.accepted ? "Agregada" : (<><Plus className="mr-0.5 h-3 w-3" /> Agregar</>)}
                                </button>
                                <div className="min-w-0">
                                  <div className="text-ink/90">
                                    <span className="text-muted">{s.kind === "location" ? "Locación" : s.kind === "festival" ? "Festival" : "Casa productora"}: </span>
                                    {s.kind === "location" ? [s.text, s.site, s.country].filter(Boolean).join(" · ") : [s.name, s.year, s.country].filter(Boolean).join(" · ")}
                                    {s.confidence < 0.6 && <span className="ml-1.5 text-warn">poco segura</span>}
                                  </div>
                                  <div className="truncate text-[11px] italic text-muted" title={s.evidence}>
                                    «{s.evidence}» · {s.source}
                                  </div>
                                </div>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

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

                      {c.duplicate && <DuplicateBox c={c} onChange={(fn) => patch(c.key, fn)} />}
                      {c.duplicate && c.decision === "review" && (
                        <p className="mt-2 rounded-xl border border-warn/30 bg-warn/5 px-3 py-2 text-xs text-warn">
                          No se crea ni se cambia nada ahora: el registro completo se envía a Aportes («Carga de archivo») para que el equipo decida.
                        </p>
                      )}
                      {c.duplicate && c.decision === "update" && <UpdatePreview c={c} plan={updatePlan(c, names)} onAccept={(accept) => patch(c.key, (x) => ({ ...x, accept }))} />}
                      {c.issues
                        .filter((i) => i.level === "doubt" && !c.placeTexts.length && !i.field.startsWith("count:") && !i.field.startsWith("columns:"))
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
          </>)}
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

/** «Qué se actualizaría»: lo que el archivo completa o agrega en el registro que ya existe, con casilla para cada cosa. */
function UpdatePreview({ c, plan, onAccept }: { c: Candidate; plan: UpdatePlan | null; onAccept(ids: string[]): void }) {
  if (!plan) return <p className="mt-2 text-xs text-muted">No pudimos comparar con el registro existente: se completarán solo los campos vacíos.</p>;
  if (plan.items.length === 0)
    return <p className="mt-2 rounded-xl border border-line px-3 py-2 text-xs text-muted">El archivo no trae nada nuevo para este registro: no se va a cambiar.</p>;
  const on = accepted(c, plan);
  const toggle = (it: UpdateItem) => {
    const next = new Set(on);
    if (next.has(it.id)) next.delete(it.id);
    else next.add(it.id);
    onAccept([...next]);
  };
  const groups: UpdateGroup[] = ["fill", "add", "conflict"];
  const hasConflicts = plan.items.some((i) => i.group === "conflict");
  return (
    <div className="mt-2 rounded-xl border border-line px-3 py-2.5 text-xs">
      <p className="font-medium text-ink">Qué se completaría</p>
      {groups.map((g) => {
        const items = plan.items.filter((i) => i.group === g);
        if (!items.length) return null;
        return (
          <div key={g} className="mt-2">
            <p className={cn("text-[10px] font-semibold uppercase tracking-[0.12em]", g === "conflict" ? "text-warn" : "text-muted")}>{GROUP_TITLE[g]}</p>
            <ul className="mt-1 space-y-1">
              {items.map((it) =>
                g === "conflict" ? (
                  <li key={it.id} className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-warn" />
                    <span className="min-w-0 flex-1">
                      <span className="text-muted">{it.label}: </span>
                      <span className="text-ink">{it.current}</span> <span className="text-muted">(en el sistema)</span> · <span className="text-ink">{it.incoming}</span> <span className="text-muted">(en el archivo)</span>
                    </span>
                  </li>
                ) : (
                  <li key={it.id}>
                    <label className="flex cursor-pointer items-start gap-2">
                      <input type="checkbox" className="mt-0.5 accent-[rgb(var(--accent))]" checked={on.has(it.id)} onChange={() => toggle(it)} />
                      <span className="min-w-0 flex-1">
                        <span className="text-muted">{it.label}: </span>
                        <span className="text-ink">{it.incoming}</span>
                      </span>
                    </label>
                  </li>
                ),
              )}
            </ul>
          </div>
        );
      })}
      {hasConflicts && (
        <p className="mt-2.5 text-[11px] leading-relaxed text-muted">
          Lo que ya tiene otro valor no se cambia desde la carga: las diferencias se envían a Aportes («Carga de archivo») para que el equipo decida.
        </p>
      )}
    </div>
  );
}

/** «¿Es la misma que…?»: nivel de la coincidencia y decisión (completar, crear, mandar a Aportes u omitir). */
function DuplicateBox({ c, onChange }: { c: Candidate; onChange(fn: (c: Candidate) => Candidate): void }) {
  const dup = c.duplicate!;
  const matches = everyMatch(dup);
  const decision = c.decision ?? "update";
  const value = decision === "update" ? `update:${dup.id}` : decision;
  const lvl = LEVEL[dup.level];
  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-2 rounded-xl bg-accent/8 px-3 py-2 text-xs">
      <Copy className="h-3.5 w-3.5 text-accent" />
      <span className="text-ink/90">
        ¿Es la misma que <b>{matchText(dup)}</b>?
      </span>
      <span className={cn("text-[11px] font-medium", lvl.cls)}>{lvl.text}</span>
      <select
        className="field !w-auto max-w-full !py-1 text-xs"
        value={value}
        aria-label="Qué hacer con la coincidencia"
        onChange={(e) => {
          const v = e.target.value;
          if (v.startsWith("update:")) {
            const picked = matches.find((m) => m.id === v.slice(7)) ?? dup;
            onChange((x) => ({ ...x, duplicate: { ...picked, alternatives: matches.filter((m) => m.id !== picked.id) }, decision: "update", accept: undefined }));
          } else {
            onChange((x) => ({ ...x, decision: v as Candidate["decision"] }));
          }
        }}
      >
        {matches.map((m) => (
          <option key={m.id} value={`update:${m.id}`}>
            Sí, es «{matchText(m)}»: completarla
          </option>
        ))}
        <option value="create">No, crear nueva</option>
        <option value="review">No estoy segura/o: enviar a Aportes</option>
        <option value="skip">Omitir</option>
      </select>
    </div>
  );
}

/** Tablas normalizadas por capa, tal como saldrían en el Excel. */
function NormalizedView({ tables, tableId, onTable }: { tables: NormalizedTable[]; tableId: NormalizedTable["id"] | null; onTable(id: NormalizedTable["id"]): void }) {
  if (!tables.length) return <p className="rounded-2xl border border-dashed border-line px-4 py-10 text-center text-sm text-muted">Nada que mostrar todavía.</p>;
  const t = tables.find((x) => x.id === tableId) ?? tables[0];
  const SHOW = 100;
  return (
    <div>
      <p className="mb-2 text-xs text-muted">
        Así quedó lo que entendimos, con las columnas del sistema. Puedes bajarlo como Excel: esos encabezados se reconocen solos al volver a cargarlo.
      </p>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {tables.map((x) => (
          <button key={x.id} onClick={() => onTable(x.id)} className={cn("rounded-xl px-3 py-1 text-xs transition-colors", x.id === t.id ? "bg-surface-2 text-ink" : "text-muted hover:text-ink")}>
            {x.title} ({x.rows.length})
          </button>
        ))}
      </div>
      <div className="max-h-[640px] overflow-auto rounded-2xl border border-line bg-surface">
        <table className="min-w-full border-collapse text-xs">
          <thead className="sticky top-0 bg-surface-2">
            <tr>
              {t.headers.map((h) => (
                <th key={h} className="whitespace-nowrap border-b border-line px-2.5 py-1.5 text-left font-medium text-muted">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {t.rows.slice(0, SHOW).map((r, i) => (
              <tr key={i} className="odd:bg-transparent even:bg-surface-2/30">
                {r.map((v, j) => (
                  <td key={j} className="max-w-[220px] truncate border-b border-line/50 px-2.5 py-1.5" title={v == null ? "" : String(v)}>
                    {v ?? <span className="text-muted/50">—</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {t.rows.length > SHOW && <p className="mt-2 text-xs text-muted">Se muestran las primeras {SHOW} filas; el Excel trae las {t.rows.length}.</p>}
    </div>
  );
}
