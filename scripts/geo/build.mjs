#!/usr/bin/env node
/**
 * Genera las geometrías y el gazetteer de Guatemala a partir del TopoJSON
 * abierto de MINFIN (22 departamentos, 340 municipios, códigos INE).
 *
 *   npm run geo:build
 *
 * Salida en public/geo/:
 *   departamentos.geojson  (22, disueltos desde municipios: bordes coincidentes)
 *   municipios.geojson     (340)
 *   lagos.geojson          (Atitlán y Amatitlán)
 *   belice.geojson         (contexto)
 *   pais.geojson           (contorno de Guatemala)
 *   gazetteer.json         (nombres, alias, centroides, bbox)
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { feature } from "topojson-client";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const cache = path.join(here, ".cache");
const out = path.join(root, "public/geo");
const mapshaper = path.join(root, "node_modules/.bin/mapshaper");

const SOURCES = {
  munis: "https://raw.githubusercontent.com/minfin-bi/mapas/main/munis.json",
};

async function download(name, url) {
  const file = path.join(cache, `${name}.json`);
  if (!existsSync(file)) {
    console.log("↓ descargando", url);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url} → ${res.status}`);
    await writeFile(file, Buffer.from(await res.arrayBuffer()));
  }
  return JSON.parse(await readFile(file, "utf8"));
}

const SMALL = new Set(["de", "del", "la", "las", "los", "el", "y", "e"]);
function fixName(s) {
  return s
    .split(/\s+/)
    .map((w, i) => (i > 0 && SMALL.has(w.toLowerCase()) ? w.toLowerCase() : w))
    .join(" ");
}

const norm = (s) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function bboxOf(geom) {
  let w = 180, s = 90, e = -180, n = -90;
  const walk = (c) => {
    if (typeof c[0] === "number") {
      w = Math.min(w, c[0]); e = Math.max(e, c[0]);
      s = Math.min(s, c[1]); n = Math.max(n, c[1]);
    } else c.forEach(walk);
  };
  walk(geom.coordinates);
  return [w, s, e, n].map((v) => +v.toFixed(5));
}

function ms(args) {
  execFileSync(mapshaper, args, { stdio: ["ignore", "inherit", "inherit"] });
}

const DEPT_ALIASES = {
  1: ["Guatemala", "Departamento de Guatemala"],
  9: ["Xela"],
  17: ["El Petén", "Peten"],
  14: ["El Quiché"],
};

/** Alias coloquiales -> nombre oficial del municipio (comparación normalizada). */
const MUNI_ALIASES = {
  "Guatemala": ["Ciudad de Guatemala", "Ciudad Guatemala", "Guate", "Ciudad Capital", "Zona 1", "Centro Histórico"],
  "Quetzaltenango": ["Xela", "Quetzaltenango Xela"],
  "Antigua Guatemala": ["Antigua", "La Antigua", "La Antigua Guatemala"],
  "Panajachel": ["Pana"],
  "Flores": ["Isla de Flores", "Tikal"],
  "Santiago Atitlán": ["Atitlán", "Lago de Atitlán"],
  "Livingston": ["Livingstone", "Río Dulce", "Rio Dulce", "Fronteras"],
  "Chichicastenango": ["Chichi", "Santo Tomás Chichicastenango"],
  "San Pedro La Laguna": ["San Pedro Atitlán"],
  "Lanquín": ["Semuc Champey"],
  "Cobán": ["Coban"],
  "Puerto Barrios": ["Barrios"],
  "Esquipulas": ["Basílica de Esquipulas"],
  "Villa Nueva": [],
  "Tecpán Guatemala": ["Tecpan"],
  "San Juan Sacatepéquez": [],
  "El Estor": ["Lago de Izabal"],
  "Poptún": ["Poptun"],
  "Jutiapa": [],
};

async function main() {
  await mkdir(cache, { recursive: true });
  await mkdir(out, { recursive: true });

  const topo = await download("munis", SOURCES.munis);
  const fc = feature(topo, topo.objects.municipios_gtm);

  const normalized = { type: "FeatureCollection", features: [] };
  const lakes = { type: "FeatureCollection", features: [] };
  const belize = { type: "FeatureCollection", features: [] };

  for (const f of fc.features) {
    const p = f.properties;
    if (p.id === 0) {
      lakes.features.push({
        type: "Feature",
        properties: { name: p.Municipio, depto_ine: p.id_depto / 100 },
        geometry: f.geometry,
      });
    } else if (p.id === 4000) {
      belize.features.push({ type: "Feature", properties: { name: "Belice" }, geometry: f.geometry });
    } else {
      normalized.features.push({
        type: "Feature",
        id: p.id,
        properties: {
          muni_ine: p.id,
          name: fixName(p.Municipio),
          depto_ine: p.id_depto / 100,
          depto: p.Departamento,
        },
        geometry: f.geometry,
      });
    }
  }
  if (normalized.features.length !== 340) {
    console.warn(`⚠ se esperaban 340 municipios y hay ${normalized.features.length}`);
  }

  const rawMunis = path.join(cache, "municipios.raw.geojson");
  const rawAll = path.join(cache, "todo.raw.geojson");
  await writeFile(rawMunis, JSON.stringify(normalized));
  // Para disolver departamentos usamos municipios + lagos (los lagos pertenecen al depto).
  await writeFile(
    rawAll,
    JSON.stringify({
      type: "FeatureCollection",
      features: [
        ...normalized.features,
        ...lakes.features.map((l) => ({
          ...l,
          properties: { depto_ine: l.properties.depto_ine, lago: 1 },
        })),
      ],
    }),
  );

  // Municipios: simplificación suave que conserva topología y formas pequeñas.
  ms([rawMunis, "-simplify", "visvalingam", "weighted", "70%", "keep-shapes", "-o", path.join(out, "municipios.geojson"), "format=geojson", "precision=0.0001", "force"]);

  // Departamentos: disolver desde la misma base para que los bordes coincidan.
  ms([
    rawAll, "-each", "depto_ine=depto_ine", "-dissolve", "depto_ine", "copy-fields=depto_ine",
    "-simplify", "visvalingam", "weighted", "35%", "keep-shapes",
    "-o", path.join(cache, "deptos.geojson"), "format=geojson", "precision=0.0001", "force",
  ]);

  // País: disolver todo
  ms([
    rawAll, "-dissolve", "-simplify", "visvalingam", "weighted", "45%", "keep-shapes",
    "-o", path.join(out, "pais.geojson"), "format=geojson", "precision=0.0001", "force",
  ]);

  await writeFile(path.join(out, "lagos.geojson"), JSON.stringify(lakes));
  const beliceRaw = path.join(cache, "belice.raw.geojson");
  await writeFile(beliceRaw, JSON.stringify(belize));
  ms([beliceRaw, "-simplify", "visvalingam", "weighted", "8%", "keep-shapes", "-o", path.join(out, "belice.geojson"), "format=geojson", "precision=0.001", "force"]);

  // Departamentos con nombre/id
  const deptNames = new Map();
  for (const f of normalized.features) deptNames.set(f.properties.depto_ine, f.properties.depto);
  const deptRaw = JSON.parse(await readFile(path.join(cache, "deptos.geojson"), "utf8"));
  const deptFc = {
    type: "FeatureCollection",
    features: deptRaw.features
      .map((f) => {
        const code = f.properties.depto_ine;
        return {
          type: "Feature",
          id: code,
          properties: { depto_ine: code, name: deptNames.get(code) },
          geometry: f.geometry,
        };
      })
      .sort((a, b) => a.id - b.id),
  };
  await writeFile(path.join(out, "departamentos.geojson"), JSON.stringify(deptFc));

  // Puntos de etiqueta (punto interior) para municipios y departamentos.
  const labelPoints = async (srcFile, key) => {
    const tmp = path.join(cache, `${key}.points.geojson`);
    ms([srcFile, "-points", "inner", "-o", tmp, "format=geojson", "precision=0.0001", "force"]);
    const j = JSON.parse(await readFile(tmp, "utf8"));
    const map = new Map();
    for (const f of j.features) map.set(f.properties[key], f.geometry.coordinates);
    return map;
  };
  const muniPts = await labelPoints(path.join(out, "municipios.geojson"), "muni_ine");
  const deptPts = await labelPoints(path.join(out, "departamentos.geojson"), "depto_ine");

  // Gazetteer
  const entries = [];
  for (const f of deptFc.features) {
    const code = f.id;
    entries.push({
      type: "depto",
      code,
      name: f.properties.name,
      depto_ine: code,
      depto: f.properties.name,
      center: deptPts.get(code),
      bbox: bboxOf(f.geometry),
      aliases: DEPT_ALIASES[code] ?? [],
    });
  }
  const byNorm = new Map();
  for (const f of normalized.features) {
    const p = f.properties;
    const e = {
      type: "muni",
      code: p.muni_ine,
      name: p.name,
      depto_ine: p.depto_ine,
      depto: p.depto,
      center: muniPts.get(p.muni_ine),
      bbox: bboxOf(f.geometry),
      aliases: [],
    };
    entries.push(e);
    const k = norm(p.name);
    if (!byNorm.has(k)) byNorm.set(k, []);
    byNorm.get(k).push(e);
  }
  for (const [official, aliases] of Object.entries(MUNI_ALIASES)) {
    const hits = byNorm.get(norm(official));
    if (!hits) {
      console.warn("⚠ alias sin municipio:", official);
      continue;
    }
    hits[0].aliases.push(...aliases);
  }

  await writeFile(path.join(out, "gazetteer.json"), JSON.stringify({ version: 1, entries }));
  console.log(`✓ ${deptFc.features.length} departamentos, ${normalized.features.length} municipios, ${entries.length} entradas`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
