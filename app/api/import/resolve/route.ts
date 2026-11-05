import { NextResponse } from "next/server";
import { z } from "zod";
import { adminStore, getSession } from "@/lib/auth";
import { claudeEnabled } from "@/lib/claude/client";
import { resolveWithClaude } from "@/lib/claude/places";
import { serverGazetteer } from "@/lib/geo/server";
import { findDuplicates } from "@/lib/import/duplicates";
import type { PlaceResolution, ResolveResponse } from "@/lib/import/types";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const body = z.object({
  places: z.array(z.string().max(300)).max(3000),
  items: z
    .array(z.object({ key: z.string(), type: z.enum(["film", "org"]), title: z.string(), year: z.number().nullable() }))
    .max(8000),
});

export async function POST(req: Request) {
  if (!(await getSession())) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  const { places, items } = parsed.data;

  const gaz = await serverGazetteer();
  const out: Record<string, PlaceResolution> = {};
  const hard: string[] = [];

  for (const text of places) {
    const hits = gaz.resolve(text);
    const top = hits[0];
    const second = hits[1];
    const candidates = hits.slice(0, 5).map((h) => ({ type: h.entry.type, code: h.entry.code, name: h.entry.name, depto: h.entry.depto }));
    if (top && top.score >= 0.85 && (!second || second.score <= top.score - 0.12)) {
      out[text] = {
        status: "ok",
        muni_ine: top.entry.type === "muni" ? top.entry.code : null,
        depto_ine: top.entry.depto_ine,
        candidates,
        via: "gazetteer",
      };
    } else {
      out[text] = {
        status: candidates.length > 1 ? "ambiguous" : "unknown",
        muni_ine: null,
        depto_ine: null,
        candidates,
        via: "gazetteer",
      };
      hard.push(text);
    }
  }

  let engine: ResolveResponse["engine"] = "gazetteer";
  let places_out = out;
  if (hard.length && claudeEnabled()) {
    engine = "claude";
    const CHUNK = 40;
    for (let i = 0; i < hard.length; i += CHUNK) {
      places_out = await resolveWithClaude(hard.slice(i, i + CHUNK), gaz, places_out);
    }
  }

  // Duplicados contra lo ya guardado (incluye borradores)
  const store = await adminStore();
  const [films, orgs] = await Promise.all([store.listFilms({ drafts: true }), store.listOrgs({ drafts: true })]);
  const duplicates = findDuplicates(items, [
    ...films.map((f) => ({ id: f.id, title: f.title, year: f.year, type: "film" as const })),
    ...orgs.map((o) => ({ id: o.id, title: o.name, year: null, type: "org" as const })),
  ]);

  // cada coincidencia lleva una copia del registro existente: el navegador calcula con ella qué se completaría
  const filmById = new Map(films.map((f) => [f.id, f]));
  const orgById = new Map(orgs.map((o) => [o.id, o]));
  for (const [key, d] of Object.entries(duplicates)) {
    const item = items.find((i) => i.key === key);
    d.record = (item?.type === "org" ? orgById.get(d.id) : filmById.get(d.id)) ?? undefined;
  }

  const res: ResolveResponse = { places: places_out, duplicates, engine };
  return NextResponse.json(res);
}
