"use client";

import { Globe2, Home, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export function MapControls({
  onZoomIn,
  onZoomOut,
  onReset,
  satellite,
  onSatellite,
}: {
  onZoomIn(): void;
  onZoomOut(): void;
  onReset(): void;
  satellite: boolean;
  onSatellite(): void;
}) {
  const btn =
    "flex h-10 w-10 items-center justify-center text-ink/80 transition-colors hover:bg-surface-2 hover:text-ink";
  return (
    <div className="flex flex-col gap-2">
      <div className="glass flex flex-col divide-y divide-line overflow-hidden rounded-2xl border border-line shadow-soft">
        <button className={btn} onClick={onZoomIn} aria-label="Acercar">
          <Plus className="h-4 w-4" />
        </button>
        <button className={btn} onClick={onZoomOut} aria-label="Alejar">
          <Minus className="h-4 w-4" />
        </button>
      </div>
      <div className="glass flex flex-col divide-y divide-line overflow-hidden rounded-2xl border border-line shadow-soft">
        <button className={btn} onClick={onReset} aria-label="Ver todo el país" title="Ver todo el país">
          <Home className="h-4 w-4" />
        </button>
        <button
          className={cn(btn, satellite && "bg-accent/15 text-accent")}
          onClick={onSatellite}
          aria-pressed={satellite}
          aria-label="Vista satelital"
          title="Vista satelital"
        >
          <Globe2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
