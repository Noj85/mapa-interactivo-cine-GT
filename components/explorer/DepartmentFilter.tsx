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
  compact,
}: {
  gaz: Gazetteer;
  place: Place | null;
  onPlace(p: Place): void;
  onClear(): void;
  /** Teléfono: solo el ícono del lugar (el nombre aparece en la ruta de arriba del panel); el selector nativo queda encima. */
  compact?: boolean;
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

  if (compact)
    return (
      <label
        className={cn(
          "pointer-events-auto glass relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border shadow-soft transition-colors",
          active ? "border-accent/60 text-accent" : "border-line text-muted",
        )}
      >
        <span className="sr-only">Filtrar el mapa por departamento</span>
        <MapPin className="h-5 w-5" aria-hidden />
        {active && <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-accent" aria-hidden />}
        <select
          value={current ?? ""}
          onChange={(e) => (e.target.value === "" ? onClear() : onPlace({ type: "depto", code: Number(e.target.value) }))}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          aria-label="Filtrar el mapa por departamento"
        >
          <option value="">Todo el país</option>
          {deptos.map((d) => (
            <option key={d.code} value={d.code}>
              {d.name}
            </option>
          ))}
        </select>
      </label>
    );

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
