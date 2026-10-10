"use client";
// Single MapLibre entry point. The worker is served from /public so it loads reliably under Next's bundler.
import * as maplibregl from "maplibre-gl";

if (typeof window !== "undefined") maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs");

export default maplibregl;
export type { Map as MapLibreMap } from "maplibre-gl";
