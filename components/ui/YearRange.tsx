"use client";

import { useEffect, useState } from "react";

const digits = (s: string) => s.replace(/\D/g, "").slice(0, 4);
const text = (n: number | null) => (n == null ? "" : String(n));

/**
 * Rango de años: «Desde» y «Hasta», cada uno opcional. El filtro cambia solo con un año completo (4 dígitos) o
 * con la casilla vacía, así que escribir «20» de camino a «2015» no vacía la lista. Si «Desde» queda mayor que
 * «Hasta», se intercambian al salir de la casilla.
 */
export function YearRange({
  desde,
  hasta,
  onChange,
  idPrefix = "anio",
  className,
}: {
  desde: number | null;
  hasta: number | null;
  onChange(desde: number | null, hasta: number | null): void;
  idPrefix?: string;
  className?: string;
}) {
  const [a, setA] = useState(text(desde));
  const [b, setB] = useState(text(hasta));

  // lo que cambie por fuera (limpiar filtros, enlace) se refleja en las casillas
  useEffect(() => setA((cur) => (digits(cur).length === 4 || cur === "" ? text(desde) : cur)), [desde]);
  useEffect(() => setB((cur) => (digits(cur).length === 4 || cur === "" ? text(hasta) : cur)), [hasta]);

  const parse = (v: string) => (v.length === 4 ? Number(v) : null);

  const edit = (which: "a" | "b", raw: string) => {
    const v = digits(raw);
    (which === "a" ? setA : setB)(v);
    if (v !== "" && v.length < 4) return;
    onChange(which === "a" ? parse(v) : desde, which === "b" ? parse(v) : hasta);
  };

  const settle = () => {
    // un año a medias vuelve al último valor aplicado
    setA(text(desde));
    setB(text(hasta));
    if (desde != null && hasta != null && desde > hasta) onChange(hasta, desde);
  };

  // también tras una pausa: un rango invertido se corrige solo, y un año a medias se descarta si el cursor ya no está en las casillas
  useEffect(() => {
    const inverted = desde != null && hasta != null && desde > hasta;
    const partial = (a !== "" && a.length < 4) || (b !== "" && b.length < 4);
    if (!inverted && !partial) return;
    const t = setTimeout(() => {
      const el = document.activeElement;
      const inside = el instanceof HTMLElement && el.id.startsWith(`${idPrefix}-`);
      if (partial && inside) return;
      settle();
    }, 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a, b, desde, hasta]);

  return (
    <div className={className}>
      <div className="grid grid-cols-2 gap-2">
        <input
          id={`${idPrefix}-desde`}
          aria-label="Año: desde"
          className="field"
          inputMode="numeric"
          placeholder="Desde (2010)"
          maxLength={4}
          value={a}
          onChange={(e) => edit("a", e.target.value)}
          onBlur={settle}
        />
        <input
          id={`${idPrefix}-hasta`}
          aria-label="Año: hasta"
          className="field"
          inputMode="numeric"
          placeholder="Hasta (2024)"
          maxLength={4}
          value={b}
          onChange={(e) => edit("b", e.target.value)}
          onBlur={settle}
        />
      </div>
      <p className="mt-1 text-xs text-muted">Un rango de años; deja una casilla vacía para no limitar ese lado.</p>
    </div>
  );
}
