"use client";

import { Eye, EyeOff, Landmark, Loader2, Search, Send, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { setRecordsStatusAction } from "@/app/admin/actions";
import { RequestInfoDialog, type RequestTarget } from "@/components/admin/RequestInfoDialog";
import { CompletenessBadge } from "@/components/ui/Badges";
import { cn, normalize } from "@/lib/utils";
import type { RecordStatus, SubmissionKind } from "@/lib/types";

/** Una fila del listado, ya preparada en el servidor (solo datos simples). */
export interface RecordRow {
  id: string;
  name: string;
  /** Primera columna gris: "2019 · Ficción" o "Industria · Productoras". */
  meta: string;
  /** Segunda columna gris: locaciones o lugar. */
  place: string;
  /** Valores para el filtro de tipo / categoría. */
  types: string[];
  status: RecordStatus;
  completeness: number;
  missing: string[];
  /** Puede mostrarse en el mapa (título; en entidades, categoría y lugar). */
  publishable: boolean;
  /** Sin lugar de rodaje / sin locación. */
  unlocated: boolean;
  /** Solo producciones. */
  noFestivals?: boolean;
  openRequests: number;
  thumb: string | null;
  /** Texto ya normalizado para buscar. */
  search: string;
}

type Estado = "todos" | "mapa" | "oculto";
type Comp = "todas" | "completa" | "incompleta" | "baja";
type Flag = "solicitud";
/** Con o sin un dato (locación, festivales): «todos» no filtra. */
type Tri = "todos" | "con" | "sin";

const FLAG_LABEL: Record<Flag, string> = {
  solicitud: "Con solicitud abierta",
};

const tri = (v: string | null | undefined): Tri => (v === "con" || v === "sin" ? v : "todos");

const PAGE = 100;

function Switch({ on, disabled, label, onChange }: { on: boolean; disabled?: boolean; label: string; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-45",
        on ? "border-accent bg-accent" : "border-line bg-surface-2",
      )}
    >
      <span className={cn("inline-block h-4 w-4 rounded-full bg-white shadow transition-transform", on ? "translate-x-[22px]" : "translate-x-[3px]")} />
    </button>
  );
}

export function RecordsTable({
  kind,
  rows,
  typeLabel,
  typeOptions,
}: {
  kind: SubmissionKind;
  rows: RecordRow[];
  typeLabel: string;
  typeOptions: { value: string; label: string }[];
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const isFilm = kind === "film";

  // filtros: viven en el estado y se reflejan en la URL sin recargar la página
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [estado, setEstado] = useState<Estado>((sp.get("estado") as Estado) || "todos");
  const [comp, setComp] = useState<Comp>((sp.get("comp") as Comp) || "todas");
  const [tipo, setTipo] = useState(sp.get("tipo") ?? "");
  // enlaces anteriores: ?f=sinubicacion,sinfestivales
  const legacy = (sp.get("f") ?? "").split(",");
  const [loc, setLoc] = useState<Tri>(() => tri(sp.get("loc")) !== "todos" ? tri(sp.get("loc")) : legacy.includes("sinubicacion") ? "sin" : "todos");
  const [fest, setFest] = useState<Tri>(() => tri(sp.get("fest")) !== "todos" ? tri(sp.get("fest")) : legacy.includes("sinfestivales") ? "sin" : "todos");
  const [flags, setFlags] = useState<Flag[]>(() => legacy.filter((x): x is Flag => x in FLAG_LABEL));
  const [limit, setLimit] = useState(PAGE);

  useEffect(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    if (estado !== "todos") p.set("estado", estado);
    if (comp !== "todas") p.set("comp", comp);
    if (tipo) p.set("tipo", tipo);
    if (loc !== "todos") p.set("loc", loc);
    if (fest !== "todos") p.set("fest", fest);
    if (flags.length) p.set("f", flags.join(","));
    const qs = p.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [q, estado, comp, tipo, loc, fest, flags]);

  // estado "al instante": se aplica antes de que el servidor confirme
  const [overrides, setOverrides] = useState<Record<string, RecordStatus>>({});
  useEffect(() => setOverrides({}), [rows]);
  const statusOf = (r: RecordRow) => overrides[r.id] ?? r.status;

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [note, setNote] = useState<{ text: string; undo?: () => void; error?: boolean } | null>(null);
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [requestFor, setRequestFor] = useState<RequestTarget[] | null>(null);

  const say = (text: string, opts?: { undo?: () => void; error?: boolean }) => {
    if (noteTimer.current) clearTimeout(noteTimer.current);
    setNote({ text, ...opts });
    noteTimer.current = setTimeout(() => setNote(null), opts?.error ? 8000 : 9000);
  };

  const nq = normalize(q);
  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        const st = overrides[r.id] ?? r.status;
        if (estado === "mapa" && st !== "published") return false;
        if (estado === "oculto" && st !== "draft") return false;
        if (comp === "completa" && r.completeness < 100) return false;
        if (comp === "incompleta" && r.completeness >= 100) return false;
        if (comp === "baja" && r.completeness >= 50) return false;
        if (tipo && !r.types.includes(tipo)) return false;
        if (loc === "sin" && !r.unlocated) return false;
        if (loc === "con" && r.unlocated) return false;
        if (isFilm && fest === "sin" && !r.noFestivals) return false;
        if (isFilm && fest === "con" && r.noFestivals) return false;
        if (flags.includes("solicitud") && r.openRequests === 0) return false;
        if (nq && !r.search.includes(nq)) return false;
        return true;
      }),
    [rows, overrides, estado, comp, tipo, loc, fest, flags, isFilm, nq],
  );
  const visible = filtered.slice(0, limit);

  const total = rows.length;
  const inMap = rows.filter((r) => statusOf(r) === "published").length;
  const filtersOn = !!q.trim() || estado !== "todos" || comp !== "todas" || !!tipo || loc !== "todos" || (isFilm && fest !== "todos") || flags.length > 0;
  const clearFilters = () => {
    setQ("");
    setEstado("todos");
    setComp("todas");
    setTipo("");
    setLoc("todos");
    setFest("todos");
    setFlags([]);
  };

  const apply = (ids: string[], status: RecordStatus) => {
    const targets = rows.filter((r) => ids.includes(r.id));
    const prev = Object.fromEntries(targets.map((r) => [r.id, statusOf(r)])) as Record<string, RecordStatus>;
    setOverrides((o) => ({ ...o, ...Object.fromEntries(ids.map((id) => [id, status])) }));
    start(async () => {
      const res = await setRecordsStatusAction(kind, ids, status);
      if (!res.ok) {
        setOverrides((o) => ({ ...o, ...prev }));
        return say(res.error, { error: true });
      }
      // al refrescar, los que no se pudieron publicar vuelven a mostrar su estado real
      router.refresh();
      const name = targets.length === 1 ? `«${targets[0].name}»` : `${res.count} registros`;
      const done = status === "published" ? `Ahora se muestra en el mapa: ${name}.` : `Se ocultó del mapa: ${name}.`;
      const skipped = res.skipped > 0 ? ` ${res.skipped} no se pudo${res.skipped === 1 ? "" : "ieron"} publicar (les falta categoría o locación).` : "";
      say(done + skipped, {
        undo: () =>
          start(async () => {
            const hidden = Object.entries(prev).filter(([, s]) => s === "draft").map(([id]) => id);
            const shown = Object.entries(prev).filter(([, s]) => s === "published").map(([id]) => id);
            setOverrides((o) => ({ ...o, ...prev }));
            if (hidden.length) await setRecordsStatusAction(kind, hidden, "draft");
            if (shown.length) await setRecordsStatusAction(kind, shown, "published");
            router.refresh();
            setNote(null);
          }),
      });
    });
  };

  const toggleOne = (r: RecordRow, on: boolean) => apply([r.id], on ? "published" : "draft");
  const toggleSel = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const allVisibleSelected = visible.length > 0 && visible.every((r) => selected.has(r.id));
  const selRows = rows.filter((r) => selected.has(r.id));

  const flagBtn = (f: Flag) => {
    const on = flags.includes(f);
    return (
      <button
        key={f}
        type="button"
        aria-pressed={on}
        onClick={() => setFlags((x) => (on ? x.filter((y) => y !== f) : [...x, f]))}
        className={cn("chip !px-2.5 !py-1 text-xs transition-colors", on ? "border-accent bg-accent/12 text-accent" : "hover:border-muted/60 hover:text-ink")}
      >
        {FLAG_LABEL[f]}
      </button>
    );
  };

  return (
    <div>
      <p className="mb-3 text-sm text-muted">
        <b className="font-medium text-ink">{total}</b> registradas · <b className="font-medium text-ink">{inMap}</b> en el mapa
        {total - inMap > 0 && <> · {total - inMap} ocult{total - inMap === 1 ? "a" : "as"}</>}
      </p>

      <div className="space-y-3 rounded-2xl border border-line bg-surface p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            className="field !pl-9"
            type="search"
            placeholder={isFilm ? "Buscar por título, director/a, productor/a, casa productora o lugar…" : "Buscar por nombre, categoría o lugar…"}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setLimit(PAGE);
            }}
            aria-label="Buscar"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Estado" className="inline-flex rounded-lg border border-line bg-bg p-0.5">
            {(
              [
                ["todos", "Todos"],
                ["mapa", "En el mapa"],
                ["oculto", "Ocultos"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={estado === id}
                onClick={() => setEstado(id)}
                className={cn("rounded-md px-3 py-1 text-xs font-medium transition-colors", estado === id ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink")}
              >
                {label}
              </button>
            ))}
          </div>
          <select className="field !w-auto !py-1.5 text-xs" aria-label="Completitud" value={comp} onChange={(e) => setComp(e.target.value as Comp)}>
            <option value="todas">Completitud: cualquiera</option>
            <option value="completa">Completa (100%)</option>
            <option value="incompleta">Incompleta</option>
            <option value="baja">Menos de 50%</option>
          </select>
          <select className="field !w-auto max-w-[14rem] !py-1.5 text-xs" aria-label={typeLabel} value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="">{typeLabel}: todas</option>
            {typeOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <select className="field !w-auto !py-1.5 text-xs" aria-label="Locación" value={loc} onChange={(e) => setLoc(tri(e.target.value))}>
            <option value="todos">Locación: todas</option>
            <option value="con">Con locación registrada</option>
            <option value="sin">Sin locación</option>
          </select>
          {isFilm && (
            <select className="field !w-auto !py-1.5 text-xs" aria-label="Festivales" value={fest} onChange={(e) => setFest(tri(e.target.value))}>
              <option value="todos">Festivales: todos</option>
              <option value="con">Con festivales</option>
              <option value="sin">Sin festivales</option>
            </select>
          )}
          {(["solicitud"] as Flag[]).map(flagBtn)}
          {filtersOn && (
            <button type="button" className="btn-ghost !min-h-0 !px-2 !py-1 text-xs" onClick={clearFilters}>
              <X className="h-3.5 w-3.5" /> Limpiar
            </button>
          )}
        </div>
      </div>

      {note && (
        <div
          role="status"
          className={cn(
            "mt-3 flex flex-wrap items-center gap-3 rounded-xl border px-4 py-2.5 text-sm",
            note.error ? "border-danger/40 text-danger" : "border-line bg-surface text-ink",
          )}
        >
          <span className="min-w-0 flex-1">{note.text}</span>
          {note.undo && (
            <button type="button" className="font-medium text-accent hover:underline" onClick={note.undo}>
              Deshacer
            </button>
          )}
        </div>
      )}

      {selected.size > 0 && (
        <div className="sticky top-14 z-10 mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-accent/40 bg-surface px-4 py-2.5 text-sm shadow-sm">
          <span className="mr-auto font-medium">{selected.size} seleccionad{selected.size === 1 ? "o" : "os"}</span>
          <button className="btn-outline !min-h-0 !py-1.5 text-xs" disabled={pending} onClick={() => apply([...selected], "published")}>
            <Eye className="h-3.5 w-3.5" /> Mostrar en el mapa
          </button>
          <button className="btn-outline !min-h-0 !py-1.5 text-xs" disabled={pending} onClick={() => apply([...selected], "draft")}>
            <EyeOff className="h-3.5 w-3.5" /> Ocultar
          </button>
          <button
            className="btn-outline !min-h-0 !py-1.5 text-xs"
            disabled={pending}
            onClick={() => setRequestFor(selRows.slice(0, 60).map((r) => ({ id: r.id, title: r.name })))}
            title={selRows.length > 60 ? "Se preparan las primeras 60" : isFilm ? "Las producciones del mismo director/a pueden ir en un solo enlace" : undefined}
          >
            <Send className="h-3.5 w-3.5" /> Solicitar información
          </button>
          <button className="btn-ghost !min-h-0 !py-1.5 text-xs" onClick={() => setSelected(new Set())}>Quitar selección</button>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-line px-4 py-12 text-center text-sm text-muted">
          Ningún registro coincide con los filtros.{" "}
          <button type="button" className="text-accent underline" onClick={clearFilters}>Limpiar filtros</button>
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-2xl border border-line bg-surface">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-xs uppercase tracking-wider text-muted">
              <tr>
                <th className="w-10 px-4 py-2.5">
                  <input
                    type="checkbox"
                    aria-label="Seleccionar los que se ven"
                    className="accent-[rgb(var(--accent))]"
                    checked={allVisibleSelected}
                    onChange={() =>
                      setSelected((s) => {
                        const n = new Set(s);
                        if (allVisibleSelected) visible.forEach((r) => n.delete(r.id));
                        else visible.forEach((r) => n.add(r.id));
                        return n;
                      })
                    }
                  />
                </th>
                <th className="px-2 py-2.5 font-medium">{isFilm ? "Título" : "Nombre"}</th>
                <th className="hidden px-4 py-2.5 font-medium md:table-cell">{isFilm ? "Año y formato" : "Capa y categoría"}</th>
                <th className="hidden px-4 py-2.5 font-medium sm:table-cell">{isFilm ? "Locaciones" : "Lugar"}</th>
                <th className="px-4 py-2.5 font-medium">Datos</th>
                <th className="px-4 py-2.5 text-right font-medium">En el mapa</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {visible.map((r) => {
                const st = statusOf(r);
                const on = st === "published";
                return (
                  <tr key={r.id} className={cn("transition-colors hover:bg-surface-2/50", !on && "bg-bg/40")}>
                    <td className="px-4 py-2.5">
                      <input
                        type="checkbox"
                        aria-label={`Seleccionar ${r.name}`}
                        className="accent-[rgb(var(--accent))]"
                        checked={selected.has(r.id)}
                        onChange={() => toggleSel(r.id)}
                      />
                    </td>
                    <td className="px-2 py-2.5">
                      <Link href={`/admin/${isFilm ? "peliculas" : "entidades"}/${r.id}`} className={cn("flex items-center gap-3 hover:text-accent", !on && "text-muted")}>
                        {isFilm ? (
                          <span className="h-10 w-7 shrink-0 overflow-hidden rounded-[3px] bg-surface-2">
                            {r.thumb && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={r.thumb} alt="" loading="lazy" className="h-full w-full object-cover" />
                            )}
                          </span>
                        ) : (
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-2 text-accent">
                            {r.thumb ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={r.thumb} alt="" loading="lazy" className="h-full w-full bg-white object-contain p-1" />
                            ) : (
                              <Landmark className="h-4 w-4" />
                            )}
                          </span>
                        )}
                        <span className="font-display text-[15px]">{r.name}</span>
                      </Link>
                    </td>
                    <td className="hidden px-4 py-2.5 text-muted md:table-cell">{r.meta || "—"}</td>
                    <td className="hidden px-4 py-2.5 text-muted sm:table-cell">{r.place || "—"}</td>
                    <td className="px-4 py-2.5">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <CompletenessBadge pct={r.completeness} missing={r.missing} compact />
                        {r.openRequests > 0 && <span className="chip !py-0 text-[11px]" title="Hay una solicitud de información activa">Solicitud</span>}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex justify-end">
                        <Switch
                          on={on}
                          disabled={pending || (!on && !r.publishable)}
                          label={`${r.name}: ${on ? "se muestra" : "oculto"} en el mapa`}
                          onChange={(v) => toggleOne(r, v)}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-2.5 text-xs text-muted">
            <span>
              {filtersOn ? `${filtered.length} de ${total} coinciden` : `${total} registros`}
              {filtered.length > visible.length && ` · mostrando ${visible.length}`}
            </span>
            <span className="flex items-center gap-3">
              {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {filtered.length > 0 && !allVisibleSelected && filtered.length > visible.length && (
                <button type="button" className="text-accent hover:underline" onClick={() => setSelected(new Set(filtered.map((r) => r.id)))}>
                  Seleccionar los {filtered.length}
                </button>
              )}
              {filtered.length > visible.length && (
                <button type="button" className="text-accent hover:underline" onClick={() => setLimit((l) => l + PAGE)}>
                  Mostrar más
                </button>
              )}
            </span>
          </div>
        </div>
      )}

      {requestFor && <RequestInfoDialog kind={kind} targets={requestFor} onClose={() => setRequestFor(null)} />}
    </div>
  );
}
