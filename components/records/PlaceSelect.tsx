"use client";

import { useEffect, useMemo, useState } from "react";
import { loadGeo, type GeoBundle } from "@/lib/geo/load";

export interface PlaceValue {
  muni_ine: number | null;
  depto_ine: number | null;
}

/**
 * Lugar como Departamento y luego Municipio (dos listas dependientes).
 * Un departamento sin municipio queda «por confirmar»; el municipio elegido fija su departamento.
 */
export function PlaceSelect({
  value,
  onChange,
  geo,
  idPrefix = "place",
}: {
  value: PlaceValue;
  onChange(v: PlaceValue): void;
  geo?: GeoBundle | null;
  idPrefix?: string;
}) {
  const [loaded, setLoaded] = useState<GeoBundle | null>(geo ?? null);
  useEffect(() => {
    if (!loaded) loadGeo().then(setLoaded);
  }, [loaded]);

  const gaz = loaded?.gaz;
  const deptos = useMemo(
    () =>
      (gaz?.entries ?? [])
        .filter((e) => e.type === "depto")
        .map((e) => ({ code: e.code, name: e.name }))
        .sort((a, b) => a.name.localeCompare(b.name, "es")),
    [gaz],
  );
  const depto = value.depto_ine ?? (value.muni_ine != null ? Math.floor(value.muni_ine / 100) : null);
  const munis = useMemo(
    () =>
      depto == null || !gaz
        ? []
        : gaz
            .munisOf(depto)
            .map((e) => ({ code: e.code, name: e.name }))
            .sort((a, b) => a.name.localeCompare(b.name, "es")),
    [gaz, depto],
  );

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <div>
        <label className="sr-only" htmlFor={`${idPrefix}-depto`}>Departamento</label>
        <select
          id={`${idPrefix}-depto`}
          className="field"
          value={depto ?? ""}
          onChange={(e) => onChange({ depto_ine: e.target.value ? Number(e.target.value) : null, muni_ine: null })}
        >
          <option value="">Departamento…</option>
          {deptos.map((d) => (
            <option key={d.code} value={d.code}>{d.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="sr-only" htmlFor={`${idPrefix}-muni`}>Municipio</label>
        <select
          id={`${idPrefix}-muni`}
          className="field"
          value={value.muni_ine ?? ""}
          disabled={depto == null}
          onChange={(e) => onChange({ depto_ine: depto, muni_ine: e.target.value ? Number(e.target.value) : null })}
        >
          <option value="">{depto == null ? "Municipio…" : "Municipio por confirmar"}</option>
          {munis.map((m) => (
            <option key={m.code} value={m.code}>{m.name}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
