"use client";

import { ChevronDown, MapPin, X } from "lucide-react";
import { useMemo } from "react";
import type { Gazetteer } from "@/lib/geo/gazetteer";
import { cn } from "@/lib/utils";
import { deptoOf, type Place } from "@/lib/view";

/** Desplegable para ver el mapa de un solo departamento: acerca la cámara y atenúa el resto del país. */
export function DepartmentFilter({
  gaz,
  place,
  onPlace,
  onClear,
}: {
  gaz: Gazetteer;
  place: Place | null;
  onPlace(p: Place): void;
  onClear(): void;
}) {
  const deptos = useMemo(
    () =>
      gaz.entries
        .filter((e) => e.type === "depto")
        .map((e) => ({ code: e.code, name: e.name }))
        .sort((a, b) => a.name.localeCompare(b.name, "es")),
    [gaz],
  );
  const current = deptoOf(place);
  const active = current != null;

  return (
    <div
      className={cn(
        "pointer-events-auto glass flex w-fit max-w-full items-center gap-1 rounded-2xl border p-1 shadow-soft transition-colors",
        active ? "border-accent/60" : "border-line",
      )}
    >
      <label className="relative flex min-w-0 items-center">
        <span className="sr-only">Filtrar el mapa por departamento</span>
        <MapPin className={cn("pointer-events-none absolute left-3 h-4 w-4", active ? "text-accent" : "text-muted")} />
        <select
          value={current ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "") onClear();
            else onPlace({ type: "depto", code: Number(v) });
          }}
          className="h-9 min-w-0 cursor-pointer appearance-none rounded-xl bg-transparent pl-9 pr-9 text-sm font-medium text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          aria-label="Filtrar el mapa por departamento"
        >
          <option value="">Todo el país</option>
          {deptos.map((d) => (
            <option key={d.code} value={d.code}>
              {d.name}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 h-4 w-4 text-muted" />
      </label>
      {active && (
        <button className="btn-ghost h-9 w-9 !p-0" onClick={onClear} aria-label="Quitar el filtro de departamento" title="Ver todo el país">
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
