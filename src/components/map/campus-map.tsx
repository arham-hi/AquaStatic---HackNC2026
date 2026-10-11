"use client";
// The centerpiece: real Chapel Hill geography (OpenFreeMap vector tiles), 3D buildings, live markers, transit overlay,
// match connection animation. Markers are DOM elements so they can carry icons, pulses and DEMO labels.

import { useEffect, useRef, useState, useCallback } from "react";
import maplibregl from "@/lib/maplibre";
import { createRoot, type Root } from "react-dom/client";
import { CAMPUS_CENTER } from "@/lib/locations";
import { cn } from "@/lib/utils";
import { categoryMeta } from "@/lib/categories";
import { HandHelping, Gift, Siren, Search, type LucideIcon } from "lucide-react";
import type { FeedItem } from "@/lib/services/feed";
import type { TransitRoute, TransitStop } from "@/lib/services/transit";
import { addWalkersWhenReady } from "./walkers-layer";
import { removeAeroBuildings } from "./aero-buildings";
import { createBusJourneys } from "@/components/transit/simulated-buses";
import { BUS_LAYER_ID, createBusModelLayer } from "@/components/transit/bus-model-layer";

export const STYLE_URLS = { light: "https://tiles.openfreemap.org/styles/liberty", dark: "https://tiles.openfreemap.org/styles/dark" } as const;
export const HOME_CAMERA = { center: CAMPUS_CENTER as [number, number], zoom: 15.6, pitch: 55, bearing: -17 };

export type MapHandle = {
  flyTo: (lng: number, lat: number, zoom?: number) => void;
  reset: () => void;
  setPitch: (p: number) => void;
  rotate: (delta: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  getMap: () => maplibregl.Map | null;
};

export type ConnectionLine = { id: string; from: [number, number]; to: [number, number]; focused?: boolean };

/** The two ends of a selected match, drawn as labeled glowing endpoints. Same coords = one shared pin. */
export type MatchEndpoints = { id: string; from: [number, number]; to: [number, number]; fromName: string; toName: string };

type Props = {
  theme: "light" | "dark";
  markers: FeedItem[];
  selectedId: string | null;
  onSelect: (item: FeedItem | null) => void;
  show3d: boolean;
  transit: { routes: TransitRoute[]; stops: TransitStop[]; selectedRouteId: string | null; busesEnabled?: boolean } | null;
  onRouteSelect?: (id: string) => void;
  onStopSelect?: (stop: TransitStop) => void;
  focusedStop?: TransitStop | null;
  connections: ConnectionLine[];
  matchFocus?: MatchEndpoints | null;
  onReady?: (h: MapHandle) => void;
  userLocation?: { lat: number; lng: number } | null;
  className?: string;
};

// Visual identity per pin. Community posts read by TYPE (amber = needs help, mint = offering,
// purple = lost & found, red = official alert); ingested items keep their category look
// (blue calendar = event, slate = news, orange = transit notice).
function markerVisual(it: FeedItem): { color: string; icon: LucideIcon } {
  if (it.kind === "external") { const m = categoryMeta(it.category); return { color: m.color, icon: m.icon }; }
  if (it.type === "alert") return { color: "#e5484d", icon: Siren };
  if (it.category === "lost_found") return { color: "#a855f7", icon: Search };
  if (it.type === "request") return { color: "#f0a21b", icon: HandHelping };
  if (it.type === "offer") return { color: "#2fbf8f", icon: Gift };
  const m = categoryMeta(it.category);
  return { color: m.color, icon: m.icon };
}

// Clustering: below this zoom, pins sharing a ~72px cell collapse into one count bubble.
const CLUSTER_BELOW = 15.3;
const CLUSTER_CELL = 72;
const rank = (it: FeedItem) => (it.type === "alert" ? 0 : it.kind === "post" ? 1 : 2);

// Jitter so several posts at the same landmark fan out instead of stacking.
function jitter(id: string, index: number): [number, number] {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const angle = ((h % 360) * Math.PI) / 180 + index * 0.9;
  const r = index === 0 ? 0 : 0.00022 + (index % 3) * 0.00009;
  return [Math.cos(angle) * r * 1.3, Math.sin(angle) * r];
}

function add3d(map: maplibregl.Map, dark: boolean) {
  // Use one blue extrusion layer; the brick layer used to cover it at lower zooms.
  removeAeroBuildings(map);
  if (!map.getSource("openmaptiles") || map.getLayer("aqua-3d")) return;
  const labelLayer = map.getStyle().layers.find((l: maplibregl.LayerSpecification) => l.type === "symbol" && (l.layout as Record<string, unknown> | undefined)?.["text-field"])?.id;
  // Hide the style's own extrusion layer if present so we control the look.
  if (map.getLayer("building-3d")) map.setLayoutProperty("building-3d", "visibility", "none");
  map.addLayer({
    id: "aqua-3d", type: "fill-extrusion", source: "openmaptiles", "source-layer": "building", minzoom: 13.5,
    paint: {
      "fill-extrusion-color": dark ? ["interpolate", ["linear"], ["coalesce", ["get", "render_height"], 6], 0, "#1c2b4d", 30, "#2a3f6e", 80, "#3b5a95"] : ["interpolate", ["linear"], ["coalesce", ["get", "render_height"], 6], 0, "#dcefff", 30, "#b9ddfa", 80, "#8fc6f2"],
      // Buildings without height data get a modest 6m default so they still read as 3D (visual fallback only).
      "fill-extrusion-height": ["interpolate", ["linear"], ["zoom"], 13.5, 0, 15, ["coalesce", ["get", "render_height"], 6]],
      "fill-extrusion-base": ["interpolate", ["linear"], ["zoom"], 13.5, 0, 15, ["coalesce", ["get", "render_min_height"], 0]],
      "fill-extrusion-opacity": dark ? 0.85 : 0.82,
      "fill-extrusion-vertical-gradient": true,
    },
  }, labelLayer);
}

function ensureOverlaySources(map: maplibregl.Map) {
  if (!map.getSource("transit-routes")) {
    map.addSource("transit-routes", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    map.addLayer({ id: "transit-routes-halo", type: "line", source: "transit-routes", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": "#ffffff", "line-width": ["case", ["boolean", ["get", "selected"], false], 9, 0], "line-opacity": 0.6 } });
    map.addLayer({ id: "transit-routes-line", type: "line", source: "transit-routes", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": ["get", "color"], "line-width": ["case", ["boolean", ["get", "selected"], false], 5, 2.5], "line-opacity": ["case", ["boolean", ["get", "dim"], false], 0.25, 0.9] } });
  }
  if (!map.getSource("transit-stops")) {
    map.addSource("transit-stops", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    map.addLayer({ id: "transit-stops-circle", type: "circle", source: "transit-stops", minzoom: 14.2, paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 14, 2.5, 17, 5], "circle-color": "#ffffff", "circle-stroke-color": "#f97316", "circle-stroke-width": 1.5, "circle-opacity": 0.95 } });
  }
  if (!map.getSource("connections")) {
    map.addSource("connections", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    map.addLayer({ id: "connections-glow", type: "line", source: "connections", layout: { "line-cap": "round" }, paint: { "line-color": ["case", ["boolean", ["get", "focused"], false], "#67e8f9", "#2fbf8f"], "line-width": ["case", ["boolean", ["get", "focused"], false], 14, 10], "line-opacity": ["case", ["boolean", ["get", "focused"], false], 0.35, 0.25], "line-blur": 6 } });
    map.addLayer({ id: "connections-line", type: "line", source: "connections", layout: { "line-cap": "round" }, paint: { "line-color": ["case", ["boolean", ["get", "focused"], false], "#22d3ee", "#2fbf8f"], "line-width": ["case", ["boolean", ["get", "focused"], false], 4, 3], "line-dasharray": [1.5, 1.5] } });
  }
  if (!map.getSource("me")) {
    map.addSource("me", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    map.addLayer({ id: "me-halo", type: "circle", source: "me", paint: { "circle-radius": 18, "circle-color": "#4b9cd3", "circle-opacity": 0.2 } });
    map.addLayer({ id: "me-dot", type: "circle", source: "me", paint: { "circle-radius": 6, "circle-color": "#4b9cd3", "circle-stroke-color": "#fff", "circle-stroke-width": 2 } });
  }
}

/** Quadratic bezier arc between two points, for the match connection animation. */
function arc(from: [number, number], to: [number, number], n = 32): [number, number][] {
  const mx = (from[0] + to[0]) / 2, my = (from[1] + to[1]) / 2;
  const dx = to[0] - from[0], dy = to[1] - from[1];
  const len = Math.hypot(dx, dy) || 1e-6;
  const cx = mx - (dy / len) * len * 0.35, cy = my + (dx / len) * len * 0.35;
  const pts: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push([(1 - t) ** 2 * from[0] + 2 * (1 - t) * t * cx + t ** 2 * to[0], (1 - t) ** 2 * from[1] + 2 * (1 - t) * t * cy + t ** 2 * to[1]]);
  }
  return pts;
}

export function CampusMap({ theme, markers, selectedId, onSelect, show3d, transit, onRouteSelect, onStopSelect, focusedStop, connections, matchFocus, onReady, userLocation, className }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRefs = useRef(new Map<string, { marker: maplibregl.Marker; root: Root; el: HTMLDivElement }>());
  const clusterRefs = useRef(new Map<string, maplibregl.Marker>());
  const seen = useRef(new Set<string>());
  const [clusterTick, setClusterTick] = useState(0);
  const [styleReady, setStyleReady] = useState(0);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const show3dRef = useRef(show3d);
  show3dRef.current = show3d;
  const themeRef = useRef(theme);
  const loadedRef = useRef(false);
  const transitRef = useRef({ transit, onRouteSelect, onStopSelect });
  transitRef.current = { transit, onRouteSelect, onStopSelect };
  const busHit = useRef<((point: maplibregl.PointLike) => string | null) | null>(null);
  const simulationSeconds = useRef(0);

  // ---- init ----
  useEffect(() => {
    if (!el.current || mapRef.current) return;
    const markersForMap = markerRefs.current;
    const clustersForMap = clusterRefs.current;
    const map = new maplibregl.Map({
      container: el.current, style: STYLE_URLS[theme], ...HOME_CAMERA, minZoom: 12, maxZoom: 19, attributionControl: false,
      maxBounds: [[-79.14, 35.86], [-78.96, 35.96]], canvasContextAttributes: { antialias: true },
    });
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
    map.dragRotate.enable();
    map.touchZoomRotate.enableRotation();
    map.on("style.load", () => {
      loadedRef.current = true;
      // Keep the base footprints blue too, including while zooming out or disabling 3D.
      const blue = themeRef.current === "dark" ? "#1c2b4d" : "#dcefff";
      for (const layer of map.getStyle().layers) {
        if ("source-layer" in layer && layer["source-layer"] === "building") {
          if (layer.type === "fill") map.setPaintProperty(layer.id, "fill-color", blue);
          if (layer.type === "fill-extrusion") map.setPaintProperty(layer.id, "fill-extrusion-color", blue);
        }
      }
      ensureOverlaySources(map);
      if (show3dRef.current) add3d(map, themeRef.current === "dark");
      addWalkersWhenReady(map);
      setStyleReady((n) => n + 1);
    });
    map.on("click", (e: maplibregl.MapMouseEvent) => {
      const current = transitRef.current;
      const busRoute = busHit.current?.(e.point);
      if (busRoute) { current.onRouteSelect?.(busRoute); return; }
      const feats = map.queryRenderedFeatures(e.point, { layers: ["transit-routes-line", "transit-stops-circle"].filter((l) => map.getLayer(l)) });
      const stop = feats.find((f) => f.layer.id === "transit-stops-circle");
      if (stop) {
        const found = current.transit?.stops.find((s) => s.id === stop.properties.id);
        if (found) current.onStopSelect?.(found);
        return;
      }
      const route = feats.find((f) => f.layer.id === "transit-routes-line");
      if (route) { current.onRouteSelect?.(route.properties.id as string); return; }
      if (!feats.length) onSelectRef.current(null);
    });
    map.on("mousemove", (e) => {
      const layers = ["transit-routes-line", "transit-stops-circle"].filter((id) => map.getLayer(id));
      map.getCanvas().style.cursor = busHit.current?.(e.point) || (layers.length && map.queryRenderedFeatures(e.point, { layers }).length) ? "pointer" : "";
    });
    mapRef.current = map;
    // Regroup pins when the zoom settles (clusters form/dissolve at CLUSTER_BELOW).
    map.on("zoomend", () => setClusterTick((n) => n + 1));
    // Debug handle for the 3D-map teammate and for automated render checks (`window.__aquaMap`).
    (window as unknown as { __aquaMap?: maplibregl.Map }).__aquaMap = map;
    const handle: MapHandle = {
      flyTo: (lng, lat, zoom = 17) => map.flyTo({ center: [lng, lat], zoom, pitch: Math.max(map.getPitch(), 50), duration: 1100, essential: true }),
      reset: () => map.flyTo({ ...HOME_CAMERA, duration: 1200, essential: true }),
      setPitch: (p) => map.easeTo({ pitch: p, duration: 500 }),
      rotate: (d) => map.easeTo({ bearing: map.getBearing() + d, duration: 500 }),
      zoomIn: () => map.zoomIn(), zoomOut: () => map.zoomOut(),
      getMap: () => map,
    };
    onReady?.(handle);
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(el.current);
    return () => {
      ro.disconnect();
      // Dev StrictMode remounts this map. Never reuse DOM markers from the removed instance.
      for (const ref of markersForMap.values()) {
        ref.marker.remove();
        queueMicrotask(() => ref.root.unmount());
      }
      markersForMap.clear();
      for (const m of clustersForMap.values()) m.remove();
      clustersForMap.clear();
      map.remove(); mapRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- theme ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map || themeRef.current === theme) return;
    themeRef.current = theme;
    loadedRef.current = false;
    map.setStyle(STYLE_URLS[theme], { diff: false });
  }, [theme]);

  // ---- 3D toggle ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    if (show3d) add3d(map, theme === "dark");
    else {
      if (map.getLayer("aqua-3d")) map.removeLayer("aqua-3d");
      removeAeroBuildings(map);
    }
  }, [show3d, theme, styleReady]);

  // ---- markers (with zoom clustering) ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const next = new Map<string, FeedItem>();
    const byLoc = new Map<string, number>();
    for (const m of markers) if (m.lat != null && m.lng != null) next.set(m.id, m);

    // Below CLUSTER_BELOW, group pins that fall in the same screen cell into a count bubble.
    const clusters = new Map<string, { items: FeedItem[]; lng: number; lat: number }>();
    const singles: FeedItem[] = [];
    if (map.getZoom() < CLUSTER_BELOW) {
      const cells = new Map<string, FeedItem[]>();
      for (const m of next.values()) {
        const p = map.project([m.lng!, m.lat!]);
        const key = `${Math.floor(p.x / CLUSTER_CELL)},${Math.floor(p.y / CLUSTER_CELL)}`;
        const arr = cells.get(key) ?? [];
        arr.push(m);
        cells.set(key, arr);
      }
      for (const [key, items] of cells) {
        if (items.length < 2) { singles.push(...items); continue; }
        clusters.set(key, {
          items,
          lng: items.reduce((s, i) => s + i.lng!, 0) / items.length,
          lat: items.reduce((s, i) => s + i.lat!, 0) / items.length,
        });
      }
    } else singles.push(...next.values());
    const visible = new Set(singles.map((s) => s.id));

    // remove stale pins + stale cluster bubbles
    for (const [id, ref] of markerRefs.current) {
      // Defer root.unmount() — this effect can run while React is mid-render (zoomend → state).
      if (!visible.has(id)) { ref.marker.remove(); queueMicrotask(() => ref.root.unmount()); markerRefs.current.delete(id); }
    }
    for (const [key, mk] of clusterRefs.current) {
      if (!clusters.has(key)) { mk.remove(); clusterRefs.current.delete(key); }
    }

    // Cluster bubbles: count + the color of the most important member (alert > post > external).
    for (const [key, c] of clusters) {
      const rep = [...c.items].sort((a, b) => rank(a) - rank(b))[0];
      const color = markerVisual(rep).color;
      let mk = clusterRefs.current.get(key);
      if (!mk) {
        const el = document.createElement("div");
        el.className = "marker-cluster";
        el.setAttribute("role", "button");
        el.setAttribute("tabindex", "0");
        const zoom = () => map.easeTo({ center: [c.lng, c.lat], zoom: Math.min(map.getZoom() + 1.7, 17), duration: 500 });
        el.addEventListener("click", (e) => { e.stopPropagation(); zoom(); });
        el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); zoom(); } });
        mk = new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat([c.lng, c.lat]).addTo(map);
        clusterRefs.current.set(key, mk);
      } else {
        mk.setLngLat([c.lng, c.lat]);
      }
      const el = mk.getElement();
      el.style.setProperty("--pin", color);
      el.setAttribute("aria-label", `${c.items.length} items here — zoom in`);
      el.innerHTML = `<span>${c.items.length}</span>`;
    }

    for (const m of singles) {
      const key = `${m.lat!.toFixed(4)},${m.lng!.toFixed(4)}`;
      const idx = byLoc.get(key) ?? 0;
      byLoc.set(key, idx + 1);
      const [jx, jy] = jitter(m.id, idx);
      const existing = markerRefs.current.get(m.id);
      const vis = markerVisual(m);
      const isNew = !seen.current.has(m.id) && seen.current.size > 0;
      if (existing) {
        existing.el.dataset.selected = String(selectedId === m.id);
        existing.marker.setLngLat([m.lng! + jx, m.lat! + jy]);
        continue;
      }
      // Outer element is positioned by MapLibre (absolute + translate); the inner pin carries our styling/animation.
      const wrap = document.createElement("div");
      wrap.className = "marker-wrap";
      const div = document.createElement("div");
      wrap.appendChild(div);
      div.className = "marker";
      div.style.background = vis.color;
      div.style.setProperty("--pin", vis.color);
      div.dataset.selected = String(selectedId === m.id);
      div.dataset.urgent = String(m.urgency === "urgent");
      div.dataset.demo = String(m.isDemo);
      div.dataset.new = String(isNew);
      div.setAttribute("role", "button");
      div.setAttribute("tabindex", "0");
      div.setAttribute("aria-label", `${m.title}${m.locationName ? ` at ${m.locationName}` : ""}`);
      div.title = m.title;
      const root = createRoot(div);
      const Icon = vis.icon;
      root.render(<><span className="shine" aria-hidden /><Icon aria-hidden /></>);
      const onClick = (e: Event) => { e.stopPropagation(); onSelectRef.current(m); };
      div.addEventListener("click", onClick);
      div.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelectRef.current(m); } });
      const marker = new maplibregl.Marker({ element: wrap, anchor: "center" }).setLngLat([m.lng! + jx, m.lat! + jy]).addTo(map);
      markerRefs.current.set(m.id, { marker, root, el: div });
      seen.current.add(m.id);
    }
    if (seen.current.size === 0) for (const id of next.keys()) seen.current.add(id);
  }, [markers, selectedId, clusterTick]);

  // ---- transit overlay ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current || !map.getSource("transit-routes")) return;
    const routes = (map.getSource("transit-routes") as maplibregl.GeoJSONSource);
    const stops = (map.getSource("transit-stops") as maplibregl.GeoJSONSource);
    if (!transit) { routes.setData({ type: "FeatureCollection", features: [] }); stops.setData({ type: "FeatureCollection", features: [] }); return; }
    const sel = transit.selectedRouteId;
    routes.setData({ type: "FeatureCollection", features: transit.routes.map((r) => ({ type: "Feature", geometry: r.geometry, properties: { id: r.id, color: r.color, selected: r.id === sel, dim: !!sel && r.id !== sel } })) });
    const stopSet = sel ? new Set(transit.routes.find((r) => r.id === sel)?.stopIds ?? []) : null;
    const routeColor = transit.routes.find((r) => r.id === sel)?.color ?? "#f97316";
    map.setPaintProperty("transit-stops-circle", "circle-stroke-color", routeColor);
    stops.setData({ type: "FeatureCollection", features: transit.stops.filter((s) => !stopSet || stopSet.has(s.id)).map((s) => ({ type: "Feature", geometry: { type: "Point", coordinates: [s.lng, s.lat] }, properties: { id: s.id, name: s.name } })) });
  }, [transit, styleReady]);

  // One animated bus per route, using the same models/speeds as the dedicated bus map.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current || !transit || transit.busesEnabled === false) return;
    const routes = transit.selectedRouteId ? transit.routes.filter((r) => r.id === transit.selectedRouteId) : transit.routes;
    const models = createBusModelLayer(createBusJourneys(routes, transit.stops), simulationSeconds);
    map.addLayer(models.layer);
    busHit.current = models.hit;
    return () => {
      busHit.current = null;
      if (map.getLayer(BUS_LAYER_ID)) map.removeLayer(BUS_LAYER_ID);
    };
  }, [transit, styleReady]);

  const routeId = transit?.selectedRouteId;
  const routeGeometry = transit?.routes.find((r) => r.id === routeId)?.geometry;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !routeGeometry) return;
    const bounds = new maplibregl.LngLatBounds();
    for (const line of routeGeometry.coordinates) for (const point of line) bounds.extend(point as [number, number]);
    if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: window.innerWidth >= 768 ? { top: 170, left: 60, bottom: 60, right: 420 } : { top: 140, left: 35, bottom: Math.min(window.innerHeight * 0.5, 420), right: 35 }, maxZoom: 16, duration: 900 });
  }, [routeId, routeGeometry]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setMaxBounds(transit ? null : [[-79.14, 35.86], [-78.96, 35.96]]);
    map.setMinZoom(transit ? 10 : 12);
  }, [!!transit]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusedStop) return;
    const content = document.createElement("div");
    content.className = "glass-strong rounded-xl px-3 py-2 text-fg";
    const name = document.createElement("div");
    name.className = "text-sm font-semibold"; name.textContent = focusedStop.name;
    const code = document.createElement("div");
    code.className = "text-xs text-fg-muted"; code.textContent = `Stop ${focusedStop.code}`;
    content.append(name, code);
    const popup = new maplibregl.Popup({ offset: 10 }).setLngLat([focusedStop.lng, focusedStop.lat]).setDOMContent(content).addTo(map);
    return () => { popup.remove(); };
  }, [focusedStop]);

  // ---- connections (match animation) ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded() || !map.getSource("connections")) return;
    (map.getSource("connections") as maplibregl.GeoJSONSource).setData({ type: "FeatureCollection", features: connections.map((c) => ({ type: "Feature", geometry: { type: "LineString", coordinates: arc(c.from, c.to) }, properties: { id: c.id, focused: !!c.focused } })) });
    if (!connections.length) return;
    let frame = 0;
    let raf = 0;
    const step = () => {
      frame = (frame + 1) % 60;
      if (map.getLayer("connections-line")) map.setPaintProperty("connections-line", "line-dasharray", [1.5 + (frame / 60) * 3, 1.5]);
      raf = requestAnimationFrame(step);
    };
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [connections, styleReady]);

  // ---- match endpoints (labeled glowing pins for the selected match) ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !matchFocus) return;
    const same = matchFocus.from[0] === matchFocus.to[0] && matchFocus.from[1] === matchFocus.to[1];
    const specs = same
      ? [{ at: matchFocus.from, kind: "both", name: matchFocus.fromName }]
      : [
          { at: matchFocus.from, kind: "request", name: matchFocus.fromName },
          { at: matchFocus.to, kind: "offer", name: matchFocus.toName },
        ];
    const made: maplibregl.Marker[] = [];
    for (const s of specs) {
      const el = document.createElement("div");
      el.className = "match-end";
      el.dataset.kind = s.kind;
      el.title = s.name;
      const dot = document.createElement("span");
      dot.className = "match-end-dot";
      dot.setAttribute("aria-hidden", "true");
      const tag = document.createElement("span");
      tag.className = "match-end-label";
      const b = document.createElement("b");
      b.textContent = s.kind === "request" ? "Request" : s.kind === "offer" ? "Offer" : "Match";
      tag.append(b, document.createTextNode(` · ${s.name}`));
      el.append(dot, tag);
      made.push(new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat(s.at).addTo(map));
    }
    return () => { for (const m of made) m.remove(); };
  }, [matchFocus, styleReady]);

  // ---- user location ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded() || !map.getSource("me")) return;
    (map.getSource("me") as maplibregl.GeoJSONSource).setData({ type: "FeatureCollection", features: userLocation ? [{ type: "Feature", geometry: { type: "Point", coordinates: [userLocation.lng, userLocation.lat] }, properties: {} }] : [] });
  }, [userLocation, styleReady]);

  const stop = useCallback((e: React.SyntheticEvent) => e.stopPropagation(), []);
  // `aqua-map` wins over maplibre-gl.css (which sets position: relative) so the map always fills its parent.
  return <div ref={el} className={cn("aqua-map", className)} onContextMenu={stop} aria-label="Interactive 3D map of UNC-Chapel Hill" role="application" />;
}
