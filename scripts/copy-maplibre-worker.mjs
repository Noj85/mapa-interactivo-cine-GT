// MapLibre GL 6 sirve el worker como archivo aparte: lo copiamos a /public.
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules/maplibre-gl/dist");
const dst = join(root, "public/vendor/maplibre");
if (!existsSync(src)) process.exit(0);
mkdirSync(dst, { recursive: true });
for (const f of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) copyFileSync(join(src, f), join(dst, f));
console.log("worker de maplibre copiado a public/vendor/maplibre");
