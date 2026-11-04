import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { Gazetteer } from "@/lib/geo/gazetteer";
import type { GazetteerEntry } from "@/lib/types";

let cached: Gazetteer | null = null;

/** Gazetteer en el servidor (carga inteligente y respuestas a preguntas). */
export async function serverGazetteer(): Promise<Gazetteer> {
  if (cached) return cached;
  const raw = await fs.readFile(path.join(process.cwd(), "public", "geo", "gazetteer.json"), "utf8");
  const j = JSON.parse(raw) as { entries: GazetteerEntry[] } | GazetteerEntry[];
  cached = new Gazetteer(Array.isArray(j) ? j : j.entries);
  return cached;
}
