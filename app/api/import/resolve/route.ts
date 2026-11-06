import { NextResponse } from "next/server";
import { z } from "zod";
import { adminStore, getSession } from "@/lib/auth";
import { claudeEnabled } from "@/lib/claude/client";
import { resolveWithClaude } from "@/lib/claude/places";
import { serverGazetteer } from "@/lib/geo/server";
import { findDuplicates } from "@/lib/import/duplicates";
import { existingRefs } from "@/lib/import/existing";
import type { DuplicateMatch, PlaceResolution, ResolveResponse } from "@/lib/import/types";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const body = z.object({
  places: z.array(z.string().max(300)).max(3000),
  items: z
    .array(
      z.object({
        key: z.string(),
        type: z.enum(["film", "org"]),
        title: z.string(),
        year: z.number().nullable(),
        director: z.string().nullable().optional(),
        layer: z.enum(["circulacion", "industria"]).nullable().optional(),
        muni_ine: z.number().nullable().optional(),
        depto_ine: z.number().nullable().optional(),
        placeTexts: z.array(z.string().max(300)).max(10).optional(),
      }),
    )
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
  for (const it of items) {
    if (it.type !== "org" || it.muni_ine != null || !it.placeTexts?.length) continue;
    for (const t of it.placeTexts) {
      const p = places_out[t];
      if (p?.status === "ok") {
        it.muni_ine = p.muni_ine;
        it.depto_ine = p.depto_ine;
        break;
      }
    }
  }
  const duplicates = findDuplicates(items, existingRefs(films, orgs));

  // cada coincidencia lleva una copia del registro existente: el navegador calcula con ella qué se completaría
  const filmById = new Map(films.map((f) => [f.id, f]));
  const orgById = new Map(orgs.map((o) => [o.id, o]));
  const withRecord = (type: "film" | "org", d: DuplicateMatch) => {
    d.record = (type === "org" ? orgById.get(d.id) : filmById.get(d.id)) ?? undefined;
  };
  const typeOf = new Map(items.map((i) => [i.key, i.type]));
  for (const [key, d] of Object.entries(duplicates)) {
    const type = typeOf.get(key) ?? "film";
    withRecord(type, d);
    d.alternatives?.forEach((a) => withRecord(type, a));
  }

  const res: ResolveResponse = { places: places_out, duplicates, engine };
  return NextResponse.json(res);
}
