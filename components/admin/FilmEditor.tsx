"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { deleteFilmAction, saveFilmAction } from "@/app/admin/actions";
import { filmDraft, filmPayload, type FilmDraft } from "@/components/records/drafts";
import { FilmFields } from "@/components/records/FilmFields";
import { ImageField } from "@/components/records/ImageField";
import { FestivalsEditor } from "@/components/records/FestivalsEditor";
import { LocationsEditor } from "@/components/records/LocationsEditor";
import { CompletenessMeter } from "@/components/ui/Badges";
import { filmCompleteness } from "@/lib/completeness";
import type { Film } from "@/lib/types";

export function FilmEditor({ film }: { film?: Film }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [d, setD] = useState<FilmDraft>(() => filmDraft(film));
  const [publish, setPublish] = useState(film ? film.status === "published" : true);
  const set = (patch: Partial<FilmDraft>) => setD((x) => ({ ...x, ...patch }));

  const data = useMemo(() => filmPayload(d), [d]);
  const payload = useMemo(
    () => ({ ...data, id: film?.id, status: publish ? ("published" as const) : ("draft" as const) }),
    [data, film?.id, publish],
  );

  const comp = useMemo(
    () =>
      filmCompleteness({
        title: d.title,
        year: data.year,
        kind: data.kind,
        director: data.director,
        producer: data.producer,
        nationality: data.nationality,
        budget: data.budget,
        currency: d.currency,
        synopsis: data.synopsis,
        companies: data.companies,
        locations: data.locations as never,
      }),
    [data, d.title, d.currency],
  );

  const submit = () => {
    setError(null);
    setSaved(false);
    start(async () => {
      const res = await saveFilmAction(payload);
      if (!res.ok) return setError(res.error);
      setSaved(true);
      if (!film) router.replace(`/admin/peliculas/${res.id}`);
      else router.refresh();
    });
  };

  const remove = () => {
    if (!film || !confirm(`¿Eliminar “${film.title}”? Esta acción no se puede deshacer.`)) return;
    start(async () => {
      const res = await deleteFilmAction(film.id);
      if (res.ok) router.replace("/admin/peliculas");
      else setError(res.error);
    });
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
      <div className="space-y-8">
        <FilmFields draft={d} onChange={set} />
        <LocationsEditor locs={d.locs} onChange={(locs) => set({ locs })} />
        <FestivalsEditor fests={d.fests} onChange={(fests) => set({ fests })} />
      </div>

      <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
        <div className="rounded-2xl border border-line bg-surface p-4">
          <ImageField kind="poster" value={d.poster} onChange={(poster) => set({ poster })} />
        </div>
        <div className="rounded-2xl border border-line bg-surface p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-medium">Completitud</span>
            <span className="font-display text-2xl">{comp.completeness}%</span>
          </div>
          <div className="mt-2"><CompletenessMeter pct={comp.completeness} /></div>
          {comp.missing.length > 0 && <p className="mt-3 text-xs leading-relaxed text-muted">Falta: {comp.missing.join(", ")}.</p>}

          <label className="mt-4 flex cursor-pointer items-start gap-3 text-sm">
            <input type="checkbox" className="mt-1 accent-[rgb(var(--accent))]" checked={publish} onChange={(e) => setPublish(e.target.checked)} />
            <span>
              Publicar en el mapa
              <span className="block text-xs text-muted">
                {comp.publishable
                  ? payload.locations.length === 0
                    ? "Se publicará en la zona «Sin ubicación», fuera del mapa, hasta que tenga un lugar de rodaje."
                    : comp.completeness < 100
                      ? "Se verá marcada como incompleta."
                      : "Lista para publicar."
                  : "Necesita al menos el título para publicarse; se guardará como borrador."}
              </span>
            </span>
          </label>

          {error && <p className="mt-3 text-sm text-danger">{error}</p>}
          {saved && !error && <p className="mt-3 text-sm text-ok">Guardado.</p>}
          <button className="btn-primary mt-4 w-full" disabled={pending || !d.title.trim()} onClick={submit}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />} Guardar
          </button>
          {film && (
            <button className="btn-ghost mt-2 w-full text-danger hover:!text-danger" disabled={pending} onClick={remove}>
              <Trash2 className="h-4 w-4" /> Eliminar
            </button>
          )}
        </div>
      </aside>
    </div>
  );
}
