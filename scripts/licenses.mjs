#!/usr/bin/env node
/**
 * Genera los avisos de licencias de terceros a partir de package-lock.json:
 *
 *   npm run licenses
 *
 * Salida:
 *   THIRD_PARTY_NOTICES.md   (en la raíz del repositorio)
 *   public/licencias.txt     (la misma información en texto plano, enlazada desde /creditos)
 *
 * Incluye todas las dependencias de producción (directas y transitivas). El texto de cada
 * licencia se toma de node_modules; los paquetes específicos de otra plataforma (por ejemplo
 * los binarios de sharp para Linux) no están instalados en esta máquina y solo se listan.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lock = JSON.parse(readFileSync(path.join(root, "package-lock.json"), "utf8"));
const own = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));

const LICENSE_FILE = /^(licen[cs]e|copying|notice|unlicense)(\.|$|-)/i;

function licenseTexts(dir) {
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => LICENSE_FILE.test(f));
  const out = [];
  for (const f of files) {
    try {
      out.push(readFileSync(path.join(dir, f), "utf8").trim());
    } catch {}
  }
  return out;
}

const seen = new Map();
for (const [key, meta] of Object.entries(lock.packages ?? {})) {
  if (!key || meta.dev) continue;
  const name = meta.name ?? key.split("node_modules/").pop();
  const id = `${name}@${meta.version}`;
  if (seen.has(id)) continue;
  const dir = path.join(root, key);
  let pkg = {};
  try {
    pkg = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8"));
  } catch {}
  const repo = typeof pkg.repository === "string" ? pkg.repository : (pkg.repository?.url ?? "");
  seen.set(id, {
    name,
    version: meta.version,
    license: meta.license ?? pkg.license ?? "desconocida",
    repo: repo.replace(/^git\+/, "").replace(/\.git$/, ""),
    homepage: pkg.homepage ?? "",
    direct: name in (own.dependencies ?? {}),
    optional: !!meta.optional,
    texts: licenseTexts(dir),
  });
}
const pkgs = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));

const counts = {};
for (const p of pkgs) counts[p.license] = (counts[p.license] ?? 0) + 1;

const SERVICES = [
  {
    name: "OpenStreetMap",
    text: "Datos del mapa base © colaboradores de OpenStreetMap, disponibles bajo la Open Database License (ODbL 1.0). https://www.openstreetmap.org/copyright",
  },
  {
    name: "OpenMapTiles",
    text: "Esquema de teselas vectoriales © OpenMapTiles, bajo CC-BY 4.0 (diseño) y BSD-3-Clause (código). https://openmaptiles.org/",
  },
  {
    name: "OpenFreeMap",
    text: "Servidor del mapa base y estilo «Positron» (basado en OpenMapTiles). https://openfreemap.org/ — términos: https://openfreemap.org/tos/",
  },
  {
    name: "Esri World Imagery",
    text: "Vista satelital: imágenes © Esri, Maxar, Earthstar Geographics y la comunidad de usuarios de GIS. Sujetas a los términos de uso de Esri. https://www.esri.com/",
  },
  {
    name: "Límites administrativos de Guatemala (MINFIN / INE)",
    text: "Geometrías de departamentos y municipios y códigos INE, a partir del repositorio abierto https://github.com/minfin-bi/mapas del Ministerio de Finanzas Públicas de Guatemala. Procesadas con scripts/geo/build.mjs.",
  },
  {
    name: "Catálogo base de festivales (Festival library, Zenodo)",
    text: "Nombres, países y ciudades de festivales de cine, a partir de la «Festival library» del proyecto Film Circulation, bajo licencia CC BY 4.0. Se limpió, tradujo y deduplicó con scripts/seed-festivals.mjs. https://zenodo.org/records/7887672 — https://creativecommons.org/licenses/by/4.0/",
  },
  {
    name: "Anthropic API",
    text: "Servicio externo de IA utilizado para analizar archivos cargados por el equipo editorial. No se incluye código ni modelos de Anthropic en este repositorio (solo su SDK, listado arriba). https://www.anthropic.com/legal",
  },
  {
    name: "Supabase y Vercel",
    text: "Servicios de base de datos, autenticación, almacenamiento y alojamiento, sujetos a sus términos de servicio. https://supabase.com/terms — https://vercel.com/legal/terms",
  },
  {
    name: "Tipografía Montserrat",
    text: "Diseñada por Julieta Ulanovsky y colaboradores (The Montserrat Project Authors). Licencia SIL Open Font License 1.1, que permite usarla y redistribuirla libremente. Se sirve desde el propio sitio con el paquete @fontsource/montserrat. https://openfontlicense.org — https://github.com/JulietaUla/Montserrat",
  },
];

const bar = "=".repeat(78);
const head = [
  "AVISOS DE LICENCIAS DE TERCEROS",
  "Mapa del Cine de Guatemala",
  "",
  `El software propio de este proyecto es © ${new Date().getFullYear()} Javier Oswaldo Borrayo Mazariegos, todos los derechos reservados (ver LICENSE).`,
  "Este documento reproduce los avisos de copyright y las licencias de los componentes de código abierto que el proyecto utiliza, que conservan sus propias licencias.",
  "",
  `Componentes de producción: ${pkgs.length}`,
  "Licencias: " +
    Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k} (${v})`)
      .join(", "),
  "",
  "Nota sobre LGPL: sharp usa la biblioteca libvips mediante paquetes binarios independientes (@img/sharp-libvips-*), licenciados bajo LGPL-3.0-or-later. Se enlaza de forma dinámica y puede sustituirse por otra versión sin modificar este software.",
  "",
];

const plain = [...head, bar, "DATOS, SERVICIOS Y FUENTES", bar, ""];
for (const s of SERVICES) plain.push(`* ${s.name}`, `  ${s.text}`, "");
plain.push(bar, "COMPONENTES DE CÓDIGO ABIERTO", bar, "");
for (const p of pkgs) {
  plain.push(`--- ${p.name} ${p.version} — ${p.license}${p.direct ? " (dependencia directa)" : ""}`);
  if (p.repo || p.homepage) plain.push(p.repo || p.homepage);
  if (p.texts?.length) plain.push("", ...p.texts.map((t) => t.replace(/\r\n/g, "\n")), "");
  else plain.push("(El texto de la licencia no está instalado en esta plataforma; ver el repositorio del paquete.)", "");
}
writeFileSync(path.join(root, "public/licencias.txt"), plain.join("\n"));

const md = [
  "# Avisos de licencias de terceros",
  "",
  `Mapa del Cine de Guatemala. El software propio es © ${new Date().getFullYear()} Javier Oswaldo Borrayo Mazariegos, todos los derechos reservados (ver [LICENSE](LICENSE)).`,
  "",
  "Este documento reproduce los avisos de copyright y las licencias de los componentes de código abierto que el proyecto usa. Cada uno conserva su propia licencia. Se genera con `npm run licenses`; no lo edites a mano.",
  "",
  `- Componentes de producción: **${pkgs.length}**`,
  "- Licencias: " +
    Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k} (${v})`)
      .join(", "),
  "- **LGPL:** `sharp` usa libvips mediante paquetes binarios independientes (`@img/sharp-libvips-*`), con licencia LGPL-3.0-or-later. Se enlaza de forma dinámica y puede sustituirse sin modificar este software.",
  "",
  "## Datos, servicios y fuentes",
  "",
  ...SERVICES.map((s) => `- **${s.name}.** ${s.text}`),
  "",
  "## Componentes de código abierto",
  "",
  "| Paquete | Versión | Licencia |",
  "| --- | --- | --- |",
  ...pkgs.map((p) => `| ${p.name}${p.direct ? " (directa)" : ""} | ${p.version} | ${p.license} |`),
  "",
  "## Textos de licencia",
  "",
];
for (const p of pkgs) {
  md.push(`### ${p.name} ${p.version}`, "", `Licencia: ${p.license}${p.repo ? ` · ${p.repo}` : ""}`, "");
  if (p.texts?.length) for (const t of p.texts) md.push("```text", t.replace(/\r\n/g, "\n").replace(/```/g, "'''"), "```", "");
  else md.push("_El texto de la licencia no está instalado en esta plataforma; ver el repositorio del paquete._", "");
}
writeFileSync(path.join(root, "THIRD_PARTY_NOTICES.md"), md.join("\n"));

console.log(`✓ ${pkgs.length} componentes → THIRD_PARTY_NOTICES.md y public/licencias.txt`);
