"use client";

import { ChevronUp } from "lucide-react";
import { LocacionChip, locacionCounts, type PanelCtx } from "./parts";

/**
 * Hoja inferior del teléfono en su altura mínima: qué se está viendo (con el chip de locación) y un botón para abrir la lista.
 * Es lo único que tapa el mapa cuando nadie ha elegido nada.
 */
export function MobilePeek({ ctx, onOpen }: { ctx: PanelCtx; onOpen(): void }) {
  const { data, view, allFilms, go } = ctx;
  const film = view.layer === "produccion";
  const n = film ? data.films.length : data.orgs.filter((o) => o.layer === view.layer).length;
  const noun = film ? (n === 1 ? "producción" : "producciones") : view.layer === "circulacion" ? (n === 1 ? "espacio" : "espacios") : n === 1 ? "entidad" : "entidades";
  return (
    <div className="flex items-center gap-2 px-4 pb-2">
      {film && allFilms.length > 0 ? (
        <LocacionChip value={view.filmFilter.locacion} counts={locacionCounts(allFilms)} onChange={go.locacion} />
      ) : (
        <span className="text-sm text-ink">
          <b className="font-medium tabular-nums">{n}</b> <span className="text-muted">{noun}</span>
        </span>
      )}
      <button type="button" onClick={onOpen} className="btn-ghost ml-auto h-11 gap-1.5 px-3 text-sm font-medium text-ink">
        Ver lista <ChevronUp className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
