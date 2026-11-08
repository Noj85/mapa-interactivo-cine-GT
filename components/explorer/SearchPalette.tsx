"use client";

import { categoriesText } from "@/lib/categories";
import { companyNames } from "@/lib/companies";
import { AnimatePresence, motion } from "framer-motion";
import { Clapperboard, Landmark, MapPin, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { filmTypeLabel } from "@/lib/film-types";
import { PosterImage } from "@/components/ui/PosterImage";
import type { Gazetteer } from "@/lib/geo/gazetteer";
import type { Dataset } from "@/lib/types";
import type { Place } from "@/lib/view";
import { cn, normalize } from "@/lib/utils";

const SUGGESTIONS = ["Panajachel", "Antigua Guatemala", "Tikal", "Quetzaltenango"];

type Result =
  | { kind: "place"; id: string; label: string; sub: string; place: Place }
  | { kind: "film"; id: string; label: string; sub: string; slug: string; poster: string | null }
  | { kind: "org"; id: string; label: string; sub: string; slug: string };

/** Icono del resultado; las producciones con póster muestran su miniatura (si no carga, vuelve el icono). */
function ResultIcon({ result }: { result: Result }) {
  const [failed, setFailed] = useState(false);
  const poster = result.kind === "film" && !failed ? result.poster : null;
  if (poster)
    return (
      <PosterImage src={poster} heightClass="h-12" maxWidthClass="max-w-[4.5rem]" className="rounded-md bg-surface-2 ring-1 ring-line" onBroken={() => setFailed(true)} />
    );
  const Icon = result.kind === "place" ? MapPin : result.kind === "film" ? Clapperboard : Landmark;
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent/12 text-accent">
      <Icon className="h-4 w-4" />
    </span>
  );
}

export function SearchPalette({
  open,
  onClose,
  gaz,
  data,
  onPlace,
  onFilm,
  onOrg,
}: {
  open: boolean;
  onClose(): void;
  gaz: Gazetteer;
  data: Dataset;
  onPlace(p: Place): void;
  onFilm(slug: string): void;
  onOrg(slug: string): void;
}) {
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQ("");
      setIdx(0);
      setTimeout(() => input.current?.focus(), 30);
    }
  }, [open]);

  const results = useMemo<Result[]>(() => {
    const nq = normalize(q);
    if (!nq) return [];
    const out: Result[] = [];
    for (const m of gaz.search(q, 6)) {
      out.push({
        kind: "place",
        id: `p${m.entry.type}${m.entry.code}`,
        label: m.entry.name,
        sub: m.entry.type === "depto" ? "Departamento" : `Municipio · ${m.entry.depto}`,
        place: { type: m.entry.type, code: m.entry.code },
      });
    }
    for (const f of data.films) {
      const hay = normalize(`${f.title} ${f.director ?? ""} ${f.producer ?? ""} ${f.cinematographer ?? ""} ${f.screenwriter ?? ""} ${companyNames(f.companies).join(" ")} ${f.genres.join(" ")}`);
      if (hay.includes(nq))
        out.push({
          kind: "film",
          id: `f${f.id}`,
          label: f.title,
          sub: ["Producción", f.year, filmTypeLabel(f) || null, f.genres.slice(0, 2).join(", ") || null].filter(Boolean).join(" · "),
          slug: f.slug,
          poster: f.poster_url ?? null,
        });
    }
    for (const o of data.orgs) {
      if (normalize(`${o.name} ${categoriesText(o, " ")}`).includes(nq))
        out.push({ kind: "org", id: `o${o.id}`, label: o.name, sub: categoriesText(o), slug: o.slug });
    }
    return out.slice(0, 12);
  }, [q, gaz, data]);

  const pick = (r: Result) => {
    onClose();
    if (r.kind === "place") onPlace(r.place);
    else if (r.kind === "film") onFilm(r.slug);
    else onOrg(r.slug);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIdx((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter" && results[idx]) pick(results[idx]);
    else if (e.key === "Escape") onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-[2px] sm:px-4 sm:pt-[14vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={onClose}
        >
          <motion.div
            role="dialog"
            aria-label="Buscar"
            className="flex h-[100dvh] w-full flex-col overflow-hidden bg-surface shadow-float sm:h-auto sm:max-w-xl sm:rounded-xl sm:border sm:border-line"
            initial={{ y: -12, scale: 0.98, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: -8, opacity: 0 }}
            transition={{ duration: 0.18 }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b border-line px-4 pt-[env(safe-area-inset-top)] sm:px-5 sm:pt-0">
              <Search className="h-4 w-4 text-muted" />
              <input
                ref={input}
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setIdx(0);
                }}
                onKeyDown={onKey}
                placeholder="Busca un lugar, producción o entidad…"
                enterKeyHint="search"
                autoComplete="off"
                autoCorrect="off"
                className="h-14 w-full bg-transparent text-base text-ink placeholder:text-muted/70 focus:outline-none"
              />
              <span className="kbd hidden sm:inline">esc</span>
              <button type="button" className="shrink-0 py-3 text-sm font-medium text-accent sm:hidden" onClick={onClose}>
                Cancelar
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:max-h-[50vh] sm:flex-none">
              {!q && (
                <div className="px-3 py-5 text-center">
                  <p className="text-sm text-muted">Busca un lugar, el título de una producción o una entidad.</p>
                  <div className="mt-3 flex flex-wrap justify-center gap-2">
                    {SUGGESTIONS.map((x) => (
                      <button key={x} type="button" className="chip min-h-[36px] px-3 text-sm transition hover:border-accent hover:text-ink" onClick={() => setQ(x)}>
                        {x}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {q && results.length === 0 && (
                <p className="px-3 py-6 text-center text-sm text-muted">Sin resultados para “{q}”.</p>
              )}
              {results.map((r, i) => {
                return (
                  <button
                    key={r.id}
                    onMouseEnter={() => setIdx(i)}
                    onClick={() => pick(r)}
                    className={cn(
                      "flex min-h-[52px] w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors",
                      i === idx ? "bg-surface-2" : "",
                    )}
                  >
                    <ResultIcon result={r} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-ink">{r.label}</span>
                      <span className="block truncate text-xs text-muted">{r.sub}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
