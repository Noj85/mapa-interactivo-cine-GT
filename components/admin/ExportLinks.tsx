"use client";

import { Download } from "lucide-react";
import { useState } from "react";
import { SORT_LABELS, sortOptions, type ExportKind, type ExportRows, type SortKey } from "@/lib/filters";

const LINKS: { label: string; tipo: ExportKind; filas?: ExportRows }[] = [
  { label: "Producciones", tipo: "producciones" },
  { label: "Locaciones por territorio", tipo: "producciones", filas: "locaciones" },
  { label: "Circulación", tipo: "circulacion" },
  { label: "Entidades", tipo: "entidades" },
];

/** Todas las claves de orden que alguna de las descargas ofrece, sin repetir. */
const ALL: SortKey[] = [...new Set(LINKS.flatMap((l) => sortOptions(l.tipo, l.filas ?? "producciones")))];

/** Descargas rápidas del resumen (con borradores). El orden elegido se aplica a las que lo admiten. */
export function ExportLinks() {
  const [orden, setOrden] = useState<SortKey | "">("");

  return (
    <section className="mt-6 flex flex-wrap items-center gap-2 text-sm">
      <span className="mr-1 flex items-center gap-1.5 text-muted">
        <Download className="h-4 w-4" /> Descargar para informes (incluye borradores):
      </span>
      {LINKS.map((l) => {
        const filas = l.filas ?? "producciones";
        const p = new URLSearchParams({ tipo: l.tipo });
        if (l.filas) p.set("filas", l.filas);
        p.set("borradores", "1");
        if (orden && sortOptions(l.tipo, filas).includes(orden)) p.set("orden", orden);
        return (
          <a key={l.label} className="chip transition hover:border-accent hover:text-ink" href={`/api/export?${p.toString()}`} download>
            {l.label}
          </a>
        );
      })}
      <a className="chip transition hover:border-accent hover:text-ink" href="/descargas">Con filtros →</a>
      <label className="ml-auto flex items-center gap-2 text-muted">
        <span className="text-xs">Ordenar por</span>
        <select aria-label="Ordenar las descargas por" className="field !w-auto !py-1 text-xs" value={orden} onChange={(e) => setOrden(ALL.find((k) => k === e.target.value) ?? "")}>
          <option value="">Como en el mapa</option>
          {ALL.map((k) => (
            <option key={k} value={k}>{SORT_LABELS[k]}</option>
          ))}
        </select>
      </label>
    </section>
  );
}
