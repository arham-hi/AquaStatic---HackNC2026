// Copies the MapLibre web worker next to our static assets so it loads from a stable URL in every bundler/host.
import fs from "node:fs";
import path from "node:path";
const src = path.resolve("node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs");
const dst = path.resolve("public/maplibre-gl-worker.mjs");
if (fs.existsSync(src)) { fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(src, dst); console.log("copied maplibre worker →", dst); }
else console.warn("maplibre-gl not installed yet; skipping worker copy");
