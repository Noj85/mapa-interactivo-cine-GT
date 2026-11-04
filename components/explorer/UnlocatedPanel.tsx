"use client";

import { MapPinOff, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { unlocatedFilms } from "@/lib/map/features";
import { normalize } from "@/lib/utils";
import { Empty, FilmCard, PanelShell, type PanelCtx, SectionTitle } from "./parts";

const STEP = 40;

/** Películas que todavía no tienen lugar de rodaje: viven en la zona «Sin ubicación», fuera del territorio. */
export default function UnlocatedPanel({ ctx }: { ctx: PanelCtx }) {
  const { data, gaz, go, canEdit } = ctx;
  const films = useMemo(() => unlocatedFilms(data.films).sort((a, b) => a.title.localeCompare(b.title, "es")), [data.films]);
  const [q, setQ] = useState("");
  const [shown, setShown] = useState(STEP);

  const list = useMemo(() => {
    const nq = normalize(q);
    return nq ? films.filter((f) => normalize(`${f.title} ${f.director ?? ""} ${f.producer ?? ""}`).includes(nq)) : films;
  }, [films, q]);

  return (
    <PanelShell eyebrow="Fuera del territorio" onBack={go.up} onClose={go.clear}>
      <div className="flex items-start gap-3">
        <span className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-muted">
          <MapPinOff className="h-5 w-5" />
        </span>
        <h2 className="font-display text-[30px] leading-[1.05] tracking-tight text-ink">Sin ubicación</h2>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        {films.length === 1 ? "Esta película aún no tiene" : `Estas ${films.length.toLocaleString("es-GT")} películas aún no tienen`} un lugar de rodaje registrado. Se
        muestran en la zona punteada del Pacífico, fuera de Guatemala, hasta que se sepa dónde se filmaron.
      </p>
      {canEdit && (
        <Link href="/admin/peliculas" className="mt-3 inline-block text-xs text-accent underline underline-offset-2">
          Completar locaciones en el panel del equipo
        </Link>
      )}

      {films.length > 8 && (
        <label className="relative mt-5 block">
          <span className="sr-only">Buscar entre las películas sin ubicación</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            className="field !pl-9"
            placeholder="Buscar por título, dirección o productora"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setShown(STEP);
            }}
          />
        </label>
      )}

      <SectionTitle aside={list.length.toLocaleString("es-GT")}>Películas sin lugar de rodaje</SectionTitle>
      <div className="-mx-2 space-y-0.5">
        {list.length ? (
          list.slice(0, shown).map((f) => <FilmCard key={f.id} film={f} gaz={gaz} onClick={() => go.film(f.slug)} />)
        ) : (
          <Empty>{films.length ? "Ninguna coincide con la búsqueda." : "Todas las películas ya tienen lugar de rodaje."}</Empty>
        )}
      </div>
      {list.length > shown && (
        <button className="btn-outline mt-3 w-full text-xs" onClick={() => setShown((n) => n + STEP)}>
          Mostrar {Math.min(STEP, list.length - shown)} más
        </button>
      )}
    </PanelShell>
  );
}
