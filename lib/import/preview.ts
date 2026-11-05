import { buildFilm, buildOrg } from "@/lib/data/records";
import type { Dataset } from "@/lib/types";
import { slugify } from "@/lib/utils";
import type { Candidate } from "./types";

/** Dataset temporal con lo que se va a publicar, para la vista previa en el mapa. */
export function candidatesToDataset(candidates: Candidate[]): Dataset {
  const films: Dataset["films"] = [];
  const orgs: Dataset["orgs"] = [];
  for (const c of candidates) {
    if (!c.include || c.decision === "skip") continue;
    if (c.type === "film" && c.film?.title) {
      const f = buildFilm({ ...c.film, status: "published" }, { id: `prev-${c.key}`, slug: `prev-${slugify(c.key)}` });
      films.push({ ...f, status: "published" });
    } else if (c.type === "org" && c.org?.name) {
      const o = buildOrg({ ...c.org, status: "published" }, { id: `prev-${c.key}`, slug: `prev-${slugify(c.key)}` });
      orgs.push({ ...o, status: "published" });
    }
  }
  return { films, orgs, festivalOrgs: {}, mode: "local" };
}
