"use client";
// Dedicated MapLibre instance for the Transit page: route lines, stop circles, optional 3D buildings.
// Vehicle positions are a labeled local simulation over schedule geometry.

import { useEffect, useRef, useState } from "react";
import maplibregl from "@/lib/maplibre";
import { Box, Bus, LocateFixed } from "lucide-react";
import { createBusJourneys } from "./simulated-buses";
import { BUS_LAYER_ID, createBusModelLayer } from "./bus-model-layer";
import { CAMPUS_CENTER } from "@/lib/locations";
import type { TransitRoute, TransitStop } from "@/lib/services/transit";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STYLE = { light: "https://tiles.openfreemap.org/styles/liberty", dark: "https://tiles.openfreemap.org/styles/dark" } as const;
const HOME = { center: CAMPUS_CENTER, zoom: 13.6, pitch: 45, bearing: -15 };

export type StopFocus = { stop: TransitStop; nonce: number } | null;

type Props = {
  theme: "light" | "dark";
  routes: TransitRoute[];
  stops: TransitStop[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  focus: StopFocus;
  className?: string;
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const popupHtml = (s: TransitStop) =>
  `<div class="glass-strong rounded-xl px-3 py-2 text-fg"><div class="text-sm font-semibold leading-tight">${esc(s.name)}</div><div class="text-[11px] text-fg-muted mt-0.5">Stop ${esc(s.code)}</div></div>`;

/** Create sources/layers on first call (per style), push fresh data on later calls. */
function syncData(map: maplibregl.Map, routes: TransitRoute[], stops: TransitStop[]) {
  const routesFC: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: routes.map((r) => ({ type: "Feature", geometry: r.geometry, properties: { id: r.id, color: r.color, shortName: r.shortName } })) };
  const stopsFC: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: stops.map((s) => ({ type: "Feature", geometry: { type: "Point", coordinates: [s.lng, s.lat] }, properties: { id: s.id, name: s.name, code: s.code } })) };
  const existing = map.getSource("routes") as maplibregl.GeoJSONSource | undefined;
  if (existing) {
    existing.setData(routesFC);
    (map.getSource("stops") as maplibregl.GeoJSONSource).setData(stopsFC);
    return;
  }
  map.addSource("routes", { type: "geojson", data: routesFC });
  map.addSource("stops", { type: "geojson", data: stopsFC });
  const round = { "line-join": "round" as const, "line-cap": "round" as const };
  map.addLayer({ id: "routes-halo", type: "line", source: "routes", layout: round, paint: { "line-color": "#ffffff", "line-width": 0, "line-opacity": 0.55, "line-blur": 1.5 } });
  map.addLayer({ id: "routes-line", type: "line", source: "routes", layout: round, paint: { "line-color": ["get", "color"], "line-width": 3, "line-opacity": 0.9 } });
  map.addLayer({ id: "stops-circle", type: "circle", source: "stops", minzoom: 14, paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 14, 3, 17, 5], "circle-color": "#4b9cd3", "circle-stroke-color": "#ffffff", "circle-stroke-width": 1.5 } });
}

/** Paint/filter for the current selection. Cheap (no data rebuild). */
function applySelection(map: maplibregl.Map, route: TransitRoute | null) {
  if (!map.getLayer("routes-line")) return;
  const sel: maplibregl.ExpressionSpecification = ["==", ["get", "id"], route?.id ?? ""];
  map.setPaintProperty("routes-halo", "line-width", route ? ["case", sel, 12, 0] : 0);
  map.setPaintProperty("routes-line", "line-width", route ? ["case", sel, 6, 3] : 3);
  map.setPaintProperty("routes-line", "line-opacity", route ? ["case", sel, 1, 0.35] : 0.9);
  map.setFilter("stops-circle", route ? ["in", ["get", "id"], ["literal", route.stopIds]] : null);
  map.setPaintProperty("stops-circle", "circle-radius", route ? ["interpolate", ["linear"], ["zoom"], 14, 4.5, 17, 7] : ["interpolate", ["linear"], ["zoom"], 14, 3, 17, 5]);
  map.setPaintProperty("stops-circle", "circle-color", route ? route.color : "#4b9cd3");
  if (route) {
    const b = new maplibregl.LngLatBounds();
    for (const line of route.geometry.coordinates) for (const c of line) b.extend(c as [number, number]);
    if (!b.isEmpty()) map.fitBounds(b, { padding: 60, pitch: map.getPitch(), bearing: map.getBearing(), duration: 900, maxZoom: 16 });
  }
}

function set3d(map: maplibregl.Map, on: boolean) {
  const has = !!map.getLayer("buildings-3d");
  if (on && !has && map.getSource("openmaptiles")) {
    const labels = map.getStyle().layers.find((l) => l.type === "symbol")?.id;
    map.addLayer({
      id: "buildings-3d", type: "fill-extrusion", source: "openmaptiles", "source-layer": "building", minzoom: 14,
      paint: { "fill-extrusion-color": "#7fb6dc", "fill-extrusion-height": ["get", "render_height"], "fill-extrusion-base": ["get", "render_min_height"], "fill-extrusion-opacity": 0.55 },
    }, labels);
  } else if (!on && has) map.removeLayer("buildings-3d");
}

export function TransitMap({ theme, routes, stops, selectedId, onSelect, focus, className }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popup = useRef<maplibregl.Popup | null>(null);
  const styleReady = useRef(false); // true between style.load and the next setStyle; isStyleLoaded() is false while tiles stream
  const [styleGen, setStyleGen] = useState(0);
  const [show3d, setShow3d] = useState(false);
  const [busesEnabled, setBusesEnabled] = useState(true);
  const simulationSeconds = useRef(0);
  const busHit = useRef<((point: maplibregl.PointLike) => string | null) | null>(null);
  // Latest props for the style.load handler, which outlives any render.
  const latest = useRef({ routes, stops, selectedId, show3d, onSelect });
  latest.current = { routes, stops, selectedId, show3d, onSelect };
  const selected = routes.find((r) => r.id === selectedId) ?? null;

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady.current || !busesEnabled) return;
    const journeys = createBusJourneys(selectedId ? routes.filter((route) => route.id === selectedId) : routes, stops);
    const models = createBusModelLayer(journeys, simulationSeconds);
    map.addLayer(models.layer);
    busHit.current = models.hit;
    return () => {
      busHit.current = null;
      if (map.getLayer(BUS_LAYER_ID)) map.removeLayer(BUS_LAYER_ID);
    };
  }, [routes, stops, selectedId, busesEnabled, styleGen]);

  useEffect(() => {
    if (!el.current || mapRef.current) return;
    const map = new maplibregl.Map({ container: el.current, style: STYLE[theme], ...HOME, minZoom: 11, maxZoom: 19, attributionControl: false, canvasContextAttributes: { antialias: true } });
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    map.on("style.load", () => {
      const { routes, stops, selectedId, show3d } = latest.current;
      syncData(map, routes, stops);
      applySelection(map, routes.find((r) => r.id === selectedId) ?? null);
      set3d(map, show3d);
      styleReady.current = true;
      setStyleGen((n) => n + 1);
    });
    // Delegated hit-testing (layers may not exist yet; per-layer listeners would error until they do).
    const hit = (p: maplibregl.PointLike) => map.queryRenderedFeatures(p, { layers: ["stops-circle", "routes-line"].filter((l) => map.getLayer(l)) });
    map.on("click", (e) => {
      const busRoute = busHit.current?.(e.point);
      if (busRoute) { latest.current.onSelect(busRoute); return; }
      const f = hit(e.point)[0];
      if (!f) return;
      if (f.layer.id === "routes-line") { latest.current.onSelect(f.properties.id as string); return; }
      const p = f.properties as { id: string; name: string; code: string };
      const [lng, lat] = (f.geometry as GeoJSON.Point).coordinates;
      popup.current?.remove();
      popup.current = new maplibregl.Popup({ closeButton: false, offset: 10 }).setLngLat([lng, lat]).setHTML(popupHtml({ ...p, lat, lng })).addTo(map);
    });
    map.on("mousemove", (e) => { map.getCanvas().style.cursor = busHit.current?.(e.point) || hit(e.point).length ? "pointer" : ""; });
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(el.current);
    mapRef.current = map;
    return () => { ro.disconnect(); popup.current?.remove(); map.remove(); mapRef.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Theme → swap style; layers come back via style.load.
  const firstTheme = useRef(theme);
  useEffect(() => {
    if (firstTheme.current === theme) return;
    firstTheme.current = theme;
    styleReady.current = false;
    mapRef.current?.setStyle(STYLE[theme]);
  }, [theme]);

  // Data usually arrives after the style: push it in (style.load handles the other ordering).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady.current || !routes.length) return;
    syncData(map, routes, stops);
    applySelection(map, selected);
  }, [routes, stops, styleGen]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const map = mapRef.current;
    if (map?.getLayer("routes-line")) { applySelection(map, selected); popup.current?.remove(); }
  }, [selected]);

  useEffect(() => {
    const map = mapRef.current;
    if (map && styleReady.current) set3d(map, show3d);
  }, [show3d, styleGen]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focus) return;
    const { stop } = focus;
    map.flyTo({ center: [stop.lng, stop.lat], zoom: Math.max(map.getZoom(), 16.5), duration: 900, essential: true });
    popup.current?.remove();
    popup.current = new maplibregl.Popup({ closeButton: false, offset: 10 }).setLngLat([stop.lng, stop.lat]).setHTML(popupHtml(stop)).addTo(map);
  }, [focus]);

  return (
    <div className={cn("relative overflow-hidden rounded-2xl border border-border shadow-md bg-bg-elev", className)}>
      <div ref={el} className="aqua-map absolute inset-0" />
      <div className="absolute left-3 top-3 flex flex-col gap-2">
        <Button variant="glass" size="sm" onClick={() => mapRef.current?.flyTo({ ...HOME, duration: 900, essential: true })}><LocateFixed /> Reset view</Button>
        <Button variant="glass" size="sm" aria-pressed={show3d} className={cn(show3d && "bg-carolina-soft text-carolina")} onClick={() => setShow3d((v) => !v)}><Box /> 3D buildings</Button>
      </div>
      <button
        type="button"
        className={cn("absolute bottom-9 left-3 flex size-10 items-center justify-center rounded-full transition-colors hover:bg-bg-elev/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-carolina", busesEnabled ? "text-carolina" : "text-fg-muted")}
        aria-label={busesEnabled ? "Hide demo 3D buses" : "Show demo 3D buses"}
        title={busesEnabled ? "Hide demo 3D buses" : "Show demo 3D buses"}
        aria-pressed={busesEnabled}
        onClick={() => setBusesEnabled((value) => !value)}
      >
        <Bus className="size-6" aria-hidden />
      </button>
    </div>
  );
}
