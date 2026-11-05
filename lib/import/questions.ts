import { filmCompleteness, orgCompleteness } from "@/lib/completeness";
import type { Gazetteer } from "@/lib/geo/gazetteer";
import { CIRC_CATEGORIES, FILM_KINDS, IND_CATEGORIES, type FilmKind } from "@/lib/types";
import { normalizeKind } from "./normalize";
import type { Candidate, PlaceResolution } from "./types";

export type QStatus = "open" | "answered" | "deferred";

export interface Question {
  id: string;
  kind: "place" | "bulk" | "field";
  question: string;
  /** Opciones sugeridas (valor interno + etiqueta). Si no hay, es respuesta libre. */
  options?: { value: string; label: string }[];
  placeholder?: string;
  /** Texto de lugar a resolver (place) */
  placeText?: string;
  /** Campo afectado (bulk / field) */
  field?: string;
  /** Candidato afectado (field) */
  candidateKey?: string;
  status: QStatus;
  answer?: string;
}

const MAX_QUESTIONS = 24;

const FILM_BULK: { field: string; label: string; placeholder: string; options?: { value: string; label: string }[] }[] = [
  { field: "year", label: "el año", placeholder: "Por ejemplo 2023" },
  {
    field: "kind",
    label: "el tipo de producción",
    placeholder: "",
    options: FILM_KINDS.map((k) => ({ value: k.id, label: k.label })),
  },
  {
    field: "nationality",
    label: "la nacionalidad",
    placeholder: "",
    options: [
      { value: "guatemalteca", label: "Guatemalteca" },
      { value: "coproduccion", label: "Coproducción" },
      { value: "extranjera", label: "Extranjera" },
    ],
  },
];

const isMissing = (c: Candidate, field: string) => {
  const f = c.film as Record<string, unknown> | undefined;
  return !!f && (f[field] === null || f[field] === undefined || f[field] === "");
};

/** Preguntas que el asistente le hace a la persona, de la más útil a la menos. */
export function buildQuestions(
  candidates: Candidate[],
  places: Record<string, PlaceResolution>,
  opts: { mode: "claude" | "heuristic" },
): Question[] {
  const live = candidates.filter((c) => c.include);
  const qs: Question[] = [];

  // 1. Lugares dudosos (una sola pregunta por texto repetido)
  const seen = new Set<string>();
  for (const c of live) {
    for (const issue of c.issues) {
      if (!issue.field.startsWith("location")) continue;
      const text = c.placeTexts.find((t) => {
        const r = places[t];
        return !r || r.status !== "ok";
      });
      if (!text || seen.has(text)) continue;
      seen.add(text);
      const r = places[text];
      qs.push({
        id: `place:${text}`,
        kind: "place",
        placeText: text,
        status: "open",
        question:
          r?.status === "ambiguous"
            ? `“${text}” puede ser más de un lugar. ¿Cuál es?`
            : `No encontramos “${text}” en la lista de municipios. ¿En qué municipio queda?`,
        options: r?.candidates.map((p) => ({ value: `${p.type}:${p.code}`, label: p.type === "muni" ? `${p.name} (${p.depto})` : `${p.name} (departamento)` })),
        placeholder: "Municipio o departamento",
      });
    }
  }

  // 2. Campos que casi todo el archivo no trae (pregunta única para todas)
  const films = live.filter((c) => c.type === "film");
  if (films.length >= 4) {
    for (const b of FILM_BULK) {
      const missing = films.filter((c) => isMissing(c, b.field)).length;
      if (missing / films.length >= 0.6) {
        qs.push({
          id: `bulk:${b.field}`,
          kind: "bulk",
          field: b.field,
          status: "open",
          question: `El archivo no trae ${b.label} en ${missing} de ${films.length} producciones. ¿Quieres usar el mismo valor para todas?`,
          options: b.options,
          placeholder: b.placeholder,
        });
      }
    }
  }

  // 3. Registros a los que les falta lo esencial
  for (const c of live) {
    if (c.type === "film" && c.film && c.film.locations.length === 0) {
      qs.push({
        id: `film-place:${c.key}`,
        kind: "place",
        placeText: `@${c.key}`,
        candidateKey: c.key,
        status: "open",
        question: `¿Dónde se rodó “${c.film.title}”? (municipio o departamento)`,
        placeholder: "Municipio o departamento",
      });
    }
    if (c.type === "org" && c.org) {
      if (c.org.muni_ine == null && c.org.depto_ine == null && !c.issues.some((i) => i.field.startsWith("location"))) {
        qs.push({
          id: `org-place:${c.key}`,
          kind: "place",
          placeText: `@${c.key}`,
          candidateKey: c.key,
          status: "open",
          question: `¿Dónde queda “${c.org.name}”?`,
          placeholder: "Municipio o departamento",
        });
      }
      if (!c.org.category) {
        const list = c.org.layer === "circulacion" ? CIRC_CATEGORIES : IND_CATEGORIES;
        qs.push({
          id: `org-cat:${c.key}`,
          kind: "field",
          field: "category",
          candidateKey: c.key,
          status: "open",
          question: `¿Qué tipo de entidad es “${c.org.name}”?`,
          options: list.map((x) => ({ value: x, label: x })),
        });
      }
    }
  }

  void opts;
  return qs.slice(0, MAX_QUESTIONS);
}

function recompute(c: Candidate): Candidate {
  // los issues de lugar se limpian si ya hay ancla
  if (c.type === "film" && c.film) {
    c.issues = c.issues.filter((i) => {
      if (!i.field.startsWith("location:")) return true;
      const idx = Number(i.field.split(":")[1]);
      const l = c.film!.locations[idx];
      return !(l && (l.muni_ine != null || (l.lat != null && l.lng != null)));
    });
  }
  if (c.type === "org" && c.org && (c.org.muni_ine != null || c.org.depto_ine != null)) {
    c.issues = c.issues.filter((i) => !i.field.startsWith("location"));
  }
  return c;
}

export function setCandidateLocation(c: Candidate, idx: number, v: { muni_ine: number | null; depto_ine: number | null }): Candidate {
  const next: Candidate = structuredClone(c);
  if (next.type === "film" && next.film) {
    const locs = next.film.locations;
    if (!locs[idx]) locs[idx] = {};
    locs[idx] = { ...locs[idx], ...v, confidence: 1 };
  } else if (next.org) {
    next.org = { ...next.org, ...v };
  }
  return recompute(next);
}

/** Aplica la respuesta a todos los candidatos afectados. */
export function applyAnswer(
  candidates: Candidate[],
  q: Question,
  answer: string,
  gaz: Gazetteer,
  places: Record<string, PlaceResolution>,
): { candidates: Candidate[]; places: Record<string, PlaceResolution> } {
  let nextPlaces = places;

  if (q.kind === "place") {
    // option "muni:301" / "depto:3" o texto libre
    let target: { muni_ine: number | null; depto_ine: number | null } | null = null;
    const m = answer.match(/^(muni|depto):(\d+)$/);
    if (m) {
      const e = m[1] === "muni" ? gaz.muni(Number(m[2])) : gaz.depto(Number(m[2]));
      if (e) target = { muni_ine: e.type === "muni" ? e.code : null, depto_ine: e.depto_ine };
    } else {
      const hit = gaz.resolve(answer)[0];
      if (hit) target = { muni_ine: hit.entry.type === "muni" ? hit.entry.code : null, depto_ine: hit.entry.depto_ine };
    }
    if (!target) return { candidates, places };

    if (q.candidateKey) {
      return { candidates: candidates.map((c) => (c.key === q.candidateKey ? setCandidateLocation(c, 0, target!) : c)), places };
    }
    const text = q.placeText!;
    nextPlaces = {
      ...places,
      [text]: { status: "ok", muni_ine: target.muni_ine, depto_ine: target.depto_ine, candidates: [], via: "user" },
    };
    return {
      places: nextPlaces,
      candidates: candidates.map((c) => {
        if (!c.placeTexts.includes(text)) return c;
        let next = c;
        if (c.type === "film" && c.film) {
          // la i-ésima locación corresponde al i-ésimo texto de lugar
          c.placeTexts.forEach((t, i) => {
            if (t === text) next = setCandidateLocation(next, i, target!);
          });
        } else next = setCandidateLocation(next, 0, target!);
        return next;
      }),
    };
  }

  // bulk / field
  const apply = (c: Candidate): Candidate => {
    const next: Candidate = structuredClone(c);
    const f = q.field!;
    if (next.type === "film" && next.film) {
      const o = next.film as unknown as Record<string, unknown>;
      if (o[f] !== null && o[f] !== undefined && o[f] !== "") return c;
      if (f === "year") {
        const y = Number(answer.replace(/\D/g, "").slice(0, 4));
        if (y >= 1890 && y <= 2100) o.year = y;
      } else if (f === "kind") o.kind = normalizeKind(answer) as FilmKind | null;
      else o[f] = answer;
    } else if (next.org) {
      (next.org as unknown as Record<string, unknown>)[f] = answer;
      if (f === "category") next.org.categories = [answer];
    }
    return next;
  };

  if (q.kind === "bulk") return { candidates: candidates.map((c) => (c.include && c.type === "film" ? apply(c) : c)), places };
  return { candidates: candidates.map((c) => (c.key === q.candidateKey ? recompute(apply(c)) : c)), places };
}

/** Completitud y faltantes de un candidato (para la tabla de revisión). */
export function candidateStatus(c: Candidate) {
  if (c.type === "film" && c.film) {
    return filmCompleteness({
      ...c.film,
      year: c.film.year ?? null,
      kind: c.film.kind ?? null,
      director: c.film.director ?? null,
      producer: c.film.producer ?? null,
      nationality: c.film.nationality ?? null,
      budget: c.film.budget ?? null,
      currency: c.film.currency ?? "GTQ",
      synopsis: c.film.synopsis ?? null,
      locations: c.film.locations.map((l) => ({
        depto_ine: l.depto_ine ?? null,
        muni_ine: l.muni_ine ?? null,
        lat: l.lat ?? null,
        lng: l.lng ?? null,
        days: l.days ?? null,
        local_spend: l.local_spend ?? null,
        jobs: l.jobs ?? null,
      })),
    });
  }
  const o = c.org!;
  return orgCompleteness({
    name: o.name,
    category: o.category,
    initiative_type: o.initiative_type ?? null,
    depto_ine: o.depto_ine ?? null,
    muni_ine: o.muni_ine ?? null,
    lat: o.lat ?? null,
    lng: o.lng ?? null,
    web: o.web ?? null,
    instagram: o.instagram ?? null,
    contact: o.contact ?? null,
    description: o.description ?? null,
  });
}
