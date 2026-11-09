import { parseLooseNumber, parseWholeNumber } from "@/lib/numbers";
import type { Film, FilmInput, Submission } from "@/lib/types";

export interface NumberFix {
  label: string;
  from: string;
  to: string;
}

export interface TypeCard {
  key: string;
  title: string;
  href: string;
  kindLabel: string;
  fixes: NumberFix[];
}

type Loose = Record<string, unknown>;
type Kind = "whole" | "decimal";

const shown = (v: unknown) => (typeof v === "string" ? `«${v}»` : String(v));

function take(obj: Loose, key: string, kind: Kind, label: string, fixes: NumberFix[]) {
  if (!(key in obj)) return;
  const current = obj[key];
  if (current == null || current === "") return;
  const ok =
    kind === "whole"
      ? typeof current === "number" && Number.isInteger(current) && current >= 0
      : typeof current === "number" && Number.isFinite(current);
  if (ok) return;
  const next = kind === "whole" ? parseWholeNumber(current) : parseLooseNumber(current);
  fixes.push({ label, from: shown(current), to: next == null ? "vacío" : String(next) });
  obj[key] = next;
}

function walk(bag: Loose, locations: Loose[], festivals: Loose[], fixes: NumberFix[]) {
  take(bag, "year", "whole", "Año", fixes);
  take(bag, "duration_min", "whole", "Duración", fixes);
  take(bag, "budget", "decimal", "Presupuesto", fixes);
  locations.forEach((l, i) => {
    const n = locations.length > 1 ? ` (locación ${i + 1})` : "";
    take(l, "days", "whole", `Días de rodaje${n}`, fixes);
    take(l, "jobs", "whole", `Empleos${n}`, fixes);
    take(l, "local_spend", "decimal", `Inversión local${n}`, fixes);
  });
  festivals.forEach((f, i) => {
    const n = festivals.length > 1 ? ` (${i + 1})` : "";
    take(f, "year", "whole", `Año de festival${n}`, fixes);
  });
}

/** Producción con algún número de tipo incorrecto, lista para volver a guardar. Null si ya está bien. */
export function filmTypeFixes(film: Film): { input: FilmInput; fixes: NumberFix[] } | null {
  const locations = film.locations.map((l) => ({ ...l })) as unknown as Loose[];
  const festivals = (film.festivals ?? []).map((f) => ({ ...f })) as unknown as Loose[];
  const bag: Loose = { year: film.year, duration_min: film.duration_min, budget: film.budget };
  const fixes: NumberFix[] = [];
  walk(bag, locations, festivals, fixes);
  if (!fixes.length) return null;
  return {
    input: {
      ...film,
      year: bag.year as number | null,
      duration_min: bag.duration_min as number | null,
      budget: bag.budget as number | null,
      locations: locations as FilmInput["locations"],
      festivals: festivals as FilmInput["festivals"],
      status: film.status,
    },
    fixes,
  };
}

/** Aporte cuyo payload trae un número de tipo incorrecto. Null si ya está bien o no es una producción. */
export function submissionTypeFixes(sub: Submission): { payload: FilmInput; fixes: NumberFix[] } | null {
  if (sub.kind !== "film") return null;
  const copy = structuredClone(sub.payload) as FilmInput;
  const bag = copy as unknown as Loose;
  const locations = (Array.isArray(copy.locations) ? copy.locations : []) as unknown as Loose[];
  const festivals = (Array.isArray(copy.festivals) ? copy.festivals : []) as unknown as Loose[];
  const fixes: NumberFix[] = [];
  walk(bag, locations, festivals, fixes);
  if (!fixes.length) return null;
  copy.locations = locations as FilmInput["locations"];
  copy.festivals = festivals as FilmInput["festivals"];
  return { payload: copy, fixes };
}

export function typeCards(films: Film[], submissions: Submission[]): TypeCard[] {
  const cards: TypeCard[] = [];
  for (const film of films) {
    const hit = filmTypeFixes(film);
    if (!hit) continue;
    cards.push({ key: `film:${film.id}`, title: film.title, href: `/admin/peliculas/${film.id}`, kindLabel: "Producción", fixes: hit.fixes });
  }
  for (const sub of submissions) {
    const hit = submissionTypeFixes(sub);
    if (!hit) continue;
    cards.push({
      key: `sub:${sub.id}`,
      title: sub.label,
      href: `/admin/aportes/${sub.id}`,
      kindLabel: sub.status === "pending" ? "Aporte pendiente" : "Aporte",
      fixes: hit.fixes,
    });
  }
  return cards;
}
