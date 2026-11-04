"use client";

import { MapPin, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { loadGeo, type GeoBundle } from "@/lib/geo/load";
import { cn } from "@/lib/utils";

export interface PlaceValue {
  muni_ine: number | null;
  depto_ine: number | null;
}

/** Selector de departamento / municipio con búsqueda por texto (alias incluidos). */
export function PlaceField({
  value,
  onChange,
  geo,
}: {
  value: PlaceValue;
  onChange(v: PlaceValue): void;
  geo?: GeoBundle | null;
}) {
  const [loaded, setLoaded] = useState<GeoBundle | null>(geo ?? null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loaded) loadGeo().then(setLoaded);
  }, [loaded]);

  useEffect(() => {
    const on = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", on);
    return () => document.removeEventListener("mousedown", on);
  }, []);

  const results = useMemo(() => (loaded && q ? loaded.gaz.search(q, 7) : []), [loaded, q]);
  const gaz = loaded?.gaz;
  const current = gaz?.muni(value.muni_ine) ?? gaz?.depto(value.depto_ine);

  const pick = (i: number) => {
    const m = results[i];
    if (!m) return;
    onChange({
      muni_ine: m.entry.type === "muni" ? m.entry.code : null,
      depto_ine: m.entry.depto_ine,
    });
    setQ("");
    setOpen(false);
  };

  return (
    <div ref={box} className="relative">
      {current && !open ? (
        <div className="field flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-2">
            <MapPin className="h-4 w-4 shrink-0 text-accent" />
            <span className="truncate">
              {current.name}
              {current.type === "muni" && <span className="text-muted"> · {current.depto}</span>}
              {current.type === "depto" && <span className="text-warn"> · municipio por confirmar</span>}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-1">
            <button type="button" className="text-xs text-muted hover:text-ink" onClick={() => setOpen(true)}>
              Cambiar
            </button>
            <button
              type="button"
              aria-label="Quitar lugar"
              className="text-muted hover:text-danger"
              onClick={() => onChange({ muni_ine: null, depto_ine: null })}
            >
              <X className="h-4 w-4" />
            </button>
          </span>
        </div>
      ) : (
        <input
          className="field"
          placeholder="Busca un municipio o departamento…"
          value={q}
          autoFocus={open}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQ(e.target.value);
            setIdx(0);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setIdx((i) => Math.min(results.length - 1, i + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setIdx((i) => Math.max(0, i - 1));
            } else if (e.key === "Enter") {
              e.preventDefault();
              pick(idx);
            } else if (e.key === "Escape") setOpen(false);
          }}
        />
      )}
      {open && results.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-2xl border border-line bg-surface p-1 shadow-float">
          {results.map((r, i) => (
            <li key={`${r.entry.type}${r.entry.code}`}>
              <button
                type="button"
                onMouseEnter={() => setIdx(i)}
                onClick={() => pick(i)}
                className={cn("flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm", i === idx && "bg-surface-2")}
              >
                <span>{r.entry.name}</span>
                <span className="text-xs text-muted">{r.entry.type === "depto" ? "Departamento" : r.entry.depto}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
