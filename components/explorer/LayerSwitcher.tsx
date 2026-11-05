"use client";

import { orgCategories } from "@/lib/categories";
import { motion } from "framer-motion";
import { Clapperboard, Factory, Projector } from "lucide-react";
import { CIRC_CATEGORIES, FILM_KINDS, IND_CATEGORIES, LAYERS, type Film, type LayerId, type Org } from "@/lib/types";
import { cn } from "@/lib/utils";

const ICONS: Record<LayerId, typeof Clapperboard> = {
  produccion: Clapperboard,
  circulacion: Projector,
  industria: Factory,
};

export function LayerSwitcher({ layer, onChange }: { layer: LayerId; onChange(l: LayerId): void }) {
  return (
    <div role="tablist" aria-label="Capa del mapa" className="glass flex w-full rounded-2xl border border-line p-1 shadow-soft sm:w-auto">
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
              "relative flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-2 py-2 text-xs font-medium transition-colors sm:flex-none sm:gap-2 sm:px-4 sm:text-sm",
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
            <Icon className="relative h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span className="relative">{l.label}</span>
          </button>
        );
      })}
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
    for (const o of orgs) if (o.layer === layer) for (const c of orgCategories(o)) counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  const cats = [...known.filter((c) => counts.has(c)), ...[...counts.keys()].filter((c) => !known.includes(c))];
  if (cats.length < 2) return null;
  // una entidad con varias categorías cuenta una sola vez en el total
  const total = layer === "produccion" ? films.filter((f) => f.kind).length : orgs.filter((o) => o.layer === layer).length;
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
