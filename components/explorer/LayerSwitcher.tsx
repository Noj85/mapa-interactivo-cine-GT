"use client";

import { motion } from "framer-motion";
import { Clapperboard, Factory, Projector } from "lucide-react";
import { CIRC_CATEGORIES, FILM_KINDS, IND_CATEGORIES, LAYERS, LAYER_METRICS, type Film, type LayerId, type MetricId, type Org } from "@/lib/types";
import { metricLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

const ICONS: Record<LayerId, typeof Clapperboard> = {
  produccion: Clapperboard,
  circulacion: Projector,
  industria: Factory,
};

export function LayerSwitcher({ layer, onChange }: { layer: LayerId; onChange(l: LayerId): void }) {
  return (
    <div role="tablist" aria-label="Capa del mapa" className="glass flex rounded-2xl border border-line p-1 shadow-soft">
      {LAYERS.map((l) => {
        const Icon = ICONS[l.id];
        const active = layer === l.id;
        return (
          <button
            key={l.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(l.id)}
            title={l.blurb}
            className={cn(
              "relative flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors sm:px-4",
              active ? "text-accent-ink" : "text-muted hover:text-ink",
            )}
          >
            {active && (
              <motion.span
                layoutId="layer-pill"
                className="absolute inset-0 rounded-xl bg-accent"
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
              />
            )}
            <Icon className="relative h-4 w-4" />
            <span className="relative hidden sm:inline">{l.label}</span>
            <span className="relative sm:hidden">{l.short}</span>
          </button>
        );
      })}
    </div>
  );
}

export function MetricPicker({
  layer,
  metric,
  onChange,
}: {
  layer: LayerId;
  metric: MetricId;
  onChange(m: MetricId): void;
}) {
  const list = LAYER_METRICS[layer];
  if (list.length < 2) return null;
  return (
    <div className="glass flex max-w-full gap-1 overflow-x-auto whitespace-nowrap rounded-2xl border border-line p-1 shadow-soft [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="radiogroup" aria-label="Métrica">
      {list.map((m) => (
        <button
          key={m}
          role="radio"
          aria-checked={metric === m}
          onClick={() => onChange(m)}
          className={cn(
            "shrink-0 rounded-xl px-3 py-1.5 text-xs font-medium transition-colors",
            metric === m ? "bg-surface-2 text-ink" : "text-muted hover:text-ink",
          )}
        >
          {metricLabel(m, layer)}
        </button>
      ))}
    </div>
  );
}

/** Filtro por categoría del Atlas: una fila de chips que se desplaza en horizontal. */
export function CategoryFilter({
  layer,
  orgs,
  films,
  value,
  onChange,
}: {
  layer: LayerId;
  orgs: Org[];
  films: Film[];
  value: string | null;
  onChange(cat: string | null): void;
}) {
  const known: readonly string[] = layer === "produccion" ? FILM_KINDS.map((k) => k.id) : layer === "circulacion" ? CIRC_CATEGORIES : IND_CATEGORIES;
  const labelOf = (id: string) => (layer === "produccion" ? (FILM_KINDS.find((k) => k.id === id)?.label ?? id) : id);
  const counts = new Map<string, number>();
  if (layer === "produccion") {
    for (const f of films) if (f.kind) counts.set(f.kind, (counts.get(f.kind) ?? 0) + 1);
  } else {
    for (const o of orgs) if (o.layer === layer) counts.set(o.category, (counts.get(o.category) ?? 0) + 1);
  }
  const cats = [...known.filter((c) => counts.has(c)), ...[...counts.keys()].filter((c) => !known.includes(c))];
  if (cats.length < 2) return null;
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  const chip = (id: string | null, label: string, n: number) => {
    const active = value === id;
    return (
      <button
        key={label}
        role="radio"
        aria-checked={active}
        onClick={() => onChange(id)}
        className={cn(
          "shrink-0 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
          active ? "border-accent bg-accent text-accent-ink" : "glass border-line text-muted hover:text-ink",
        )}
      >
        {label} <span className={cn("ml-0.5", active ? "opacity-70" : "opacity-60")}>{n}</span>
      </button>
    );
  };
  return (
    <div
      role="radiogroup"
      aria-label="Categoría"
      className="pointer-events-auto -mx-3 flex gap-1.5 overflow-x-auto px-3 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden"
    >
      {chip(null, "Todas", total)}
      {cats.map((c) => chip(c, labelOf(c), counts.get(c) ?? 0))}
    </div>
  );
}
