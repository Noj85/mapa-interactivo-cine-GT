"use client";

import { motion } from "framer-motion";
import { Clapperboard, Factory, Projector } from "lucide-react";
import { LAYERS, type LayerId } from "@/lib/types";
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
