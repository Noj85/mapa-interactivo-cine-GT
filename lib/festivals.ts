import { FESTIVAL_RESULTS, type FestivalResult, type FilmFestival } from "@/lib/types";
import { normalize } from "@/lib/utils";

/** Texto de búsqueda de un festival: nombre y alias sin acentos ni mayúsculas. */
export const festivalSearchKey = (name: string, aliases: string[] = []) => normalize([name, ...aliases].join(" "));

export const FESTIVAL_SEED_SOURCE = "Festival library · Zenodo (CC BY 4.0)";

export const resultLabel = (r: FestivalResult) => FESTIVAL_RESULTS.find((x) => x.id === r)?.label ?? r;

const RANK: Record<FestivalResult, number> = { premio: 0, nominacion: 1, mencion: 2, seleccion: 3, proyeccion: 4 };

/** Premios primero, luego nominaciones y selecciones; dentro de cada grupo, lo más reciente arriba. */
export function sortFestivals<T extends Pick<FilmFestival, "result" | "year" | "name">>(list: T[]): T[] {
  return [...list].sort(
    (a, b) => RANK[a.result] - RANK[b.result] || (b.year ?? 0) - (a.year ?? 0) || a.name.localeCompare(b.name),
  );
}

/** "Festival de Cine de Cannes 2019 · Premio · Mejor película" */
export function describeFestival(f: Pick<FilmFestival, "name" | "year" | "result" | "award" | "section">) {
  return [f.year ? `${f.name} ${f.year}` : f.name, resultLabel(f.result), f.award ?? f.section].filter(Boolean).join(" · ");
}

export const festivalPlace = (f: Pick<FilmFestival, "city" | "country">) => [f.city, f.country].filter(Boolean).join(", ");
