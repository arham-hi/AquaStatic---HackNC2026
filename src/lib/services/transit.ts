// Chapel Hill Transit via the public GTFS static feed (https://mychtransit.org/gtfs).
// Downloaded at most once per 24h, parsed once, cached on disk and in memory.
// No real-time vehicle positions are shown: the feed we verified is schedule-only. We link to the official tracker.

import fs from "node:fs";
import path from "node:path";
import { unzipSync, strFromU8 } from "fflate";
import { env } from "@/lib/env";
import { fetchWithTimeout } from "@/lib/sources/adapters";
import { HOUR } from "@/lib/time";

export type TransitRoute = {
  id: string; shortName: string; longName: string; color: string; textColor: string; url: string | null;
  headsigns: string[]; stopIds: string[]; geometry: GeoJSON.MultiLineString;
};
export type TransitStop = { id: string; code: string; name: string; lat: number; lng: number };
export type TransitData = {
  mode: "gtfs" | "demo"; fetchedAt: number; feedVersion: string; agency: string; agencyUrl: string; trackingUrl: string;
  routes: TransitRoute[]; stops: TransitStop[];
};

export { OFFICIAL_TRACKING_URL, OFFICIAL_ROUTES_URL } from "@/lib/constants";
import { OFFICIAL_TRACKING_URL, OFFICIAL_ROUTES_URL } from "@/lib/constants";
const TTL = 24 * HOUR;
const dir = () => path.resolve(process.cwd(), "data", "gtfs");

/** Minimal RFC-4180 CSV parser (handles quoted commas and doubled quotes). */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", inQ = false;
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQ) {
      if (c === '"') { if (src[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [header, ...body] = rows;
  if (!header) return [];
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? "").trim()])));
}

export function parseGtfs(files: Record<string, string>, fetchedAt: number): TransitData {
  const routesRaw = parseCsv(files["routes.txt"] ?? "");
  const stopsRaw = parseCsv(files["stops.txt"] ?? "");
  const tripsRaw = parseCsv(files["trips.txt"] ?? "");
  const shapesRaw = parseCsv(files["shapes.txt"] ?? "");
  const agency = parseCsv(files["agency.txt"] ?? "")[0];
  const feedInfo = parseCsv(files["feed_info.txt"] ?? "")[0];

  const shapePts = new Map<string, [number, number, number][]>();
  for (const s of shapesRaw) {
    const arr = shapePts.get(s.shape_id) ?? [];
    arr.push([Number(s.shape_pt_lon), Number(s.shape_pt_lat), Number(s.shape_pt_sequence)]);
    shapePts.set(s.shape_id, arr);
  }
  for (const arr of shapePts.values()) arr.sort((a, b) => a[2] - b[2]);

  const routeShapes = new Map<string, Map<string, number>>(); // route -> shape -> trip count
  const routeHeadsigns = new Map<string, Set<string>>();
  const tripRoute = new Map<string, string>();
  for (const t of tripsRaw) {
    tripRoute.set(t.trip_id, t.route_id);
    if (t.shape_id) {
      const m = routeShapes.get(t.route_id) ?? new Map();
      m.set(t.shape_id, (m.get(t.shape_id) ?? 0) + 1);
      routeShapes.set(t.route_id, m);
    }
    if (t.trip_headsign) (routeHeadsigns.get(t.route_id) ?? routeHeadsigns.set(t.route_id, new Set()).get(t.route_id)!).add(t.trip_headsign);
  }

  // stop_times is the big file; stream it line by line rather than materializing objects.
  const routeStops = new Map<string, Set<string>>();
  const st = files["stop_times.txt"];
  if (st) {
    const lines = st.split(/\r?\n/);
    const header = lines[0].replace(/^﻿/, "").split(",");
    const ti = header.indexOf("trip_id"), si = header.indexOf("stop_id");
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      const cols = line.split(",");
      const rid = tripRoute.get(cols[ti]);
      if (!rid) continue;
      (routeStops.get(rid) ?? routeStops.set(rid, new Set()).get(rid)!).add(cols[si]);
    }
  }

  const routes: TransitRoute[] = routesRaw.map((r) => {
    const shapes = Array.from(routeShapes.get(r.route_id)?.entries() ?? []).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([id]) => id);
    const coords = shapes.map((id) => (shapePts.get(id) ?? []).map(([lng, lat]) => [lng, lat] as [number, number])).filter((c) => c.length > 1);
    return {
      id: r.route_id, shortName: r.route_short_name || r.route_id, longName: r.route_long_name || r.route_desc || "",
      color: `#${(r.route_color || "4B9CD3").replace("#", "")}`, textColor: `#${(r.route_text_color || "FFFFFF").replace("#", "")}`,
      url: r.route_url || null, headsigns: Array.from(routeHeadsigns.get(r.route_id) ?? []).slice(0, 6),
      stopIds: Array.from(routeStops.get(r.route_id) ?? []), geometry: { type: "MultiLineString" as const, coordinates: coords },
    };
  }).filter((r) => r.geometry.coordinates.length > 0).sort((a, b) => a.shortName.localeCompare(b.shortName, undefined, { numeric: true }));

  const usedStops = new Set(routes.flatMap((r) => r.stopIds));
  const stops: TransitStop[] = stopsRaw.filter((s) => (s.location_type || "0") === "0" && (usedStops.size === 0 || usedStops.has(s.stop_id)))
    .map((s) => ({ id: s.stop_id, code: s.stop_code || s.stop_id, name: s.stop_name, lat: Number(s.stop_lat), lng: Number(s.stop_lon) }))
    .filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng));

  return {
    mode: "gtfs", fetchedAt, feedVersion: feedInfo?.feed_version || "unknown", agency: agency?.agency_name || "Chapel Hill Transit",
    agencyUrl: agency?.agency_url || OFFICIAL_ROUTES_URL, trackingUrl: OFFICIAL_TRACKING_URL, routes, stops,
  };
}

// Clearly labeled demo geometry, used only when the GTFS feed cannot be downloaded (offline venues).
export const DEMO_TRANSIT: TransitData = {
  mode: "demo", fetchedAt: 0, feedVersion: "DEMO (approximate campus loop, not a real schedule)", agency: "Chapel Hill Transit (demo overlay)",
  agencyUrl: OFFICIAL_ROUTES_URL, trackingUrl: OFFICIAL_TRACKING_URL,
  stops: [
    { id: "d1", code: "D1", name: "Student Union (South Rd) — DEMO", lat: 35.9098, lng: -79.0475 },
    { id: "d2", code: "D2", name: "Morrison Residence Hall — DEMO", lat: 35.9052, lng: -79.0436 },
    { id: "d3", code: "D3", name: "Franklin St at Columbia St — DEMO", lat: 35.9133, lng: -79.0558 },
    { id: "d4", code: "D4", name: "UNC Hospitals — DEMO", lat: 35.9044, lng: -79.0514 },
  ],
  routes: [
    { id: "demo-u", shortName: "U", longName: "U — Campus loop (DEMO geometry)", color: "#4B9CD3", textColor: "#fff", url: OFFICIAL_ROUTES_URL, headsigns: ["Campus Loop (demo)"], stopIds: ["d1", "d2", "d4"],
      geometry: { type: "MultiLineString", coordinates: [[[-79.0475, 35.9098], [-79.0455, 35.9075], [-79.0436, 35.9052], [-79.0480, 35.9040], [-79.0514, 35.9044], [-79.0520, 35.9085], [-79.0475, 35.9098]]] } },
    { id: "demo-ru", shortName: "RU", longName: "RU — Franklin / Hospitals (DEMO geometry)", color: "#E07A5F", textColor: "#fff", url: OFFICIAL_ROUTES_URL, headsigns: ["Franklin St (demo)"], stopIds: ["d3", "d1", "d4"],
      geometry: { type: "MultiLineString", coordinates: [[[-79.0558, 35.9133], [-79.0530, 35.9120], [-79.0505, 35.9108], [-79.0475, 35.9098], [-79.0490, 35.9070], [-79.0514, 35.9044]]] } },
  ],
};

const g = globalThis as unknown as { __aquaTransit?: TransitData };

export async function loadTransit(opts: { force?: boolean } = {}, now = Date.now()): Promise<TransitData> {
  if (!opts.force && g.__aquaTransit && now - g.__aquaTransit.fetchedAt < TTL) return g.__aquaTransit;
  fs.mkdirSync(dir(), { recursive: true });
  const jsonPath = path.join(dir(), "cht.json");
  if (!opts.force && fs.existsSync(jsonPath)) {
    try {
      const cached = JSON.parse(fs.readFileSync(jsonPath, "utf8")) as TransitData;
      if (now - cached.fetchedAt < TTL) return (g.__aquaTransit = cached);
    } catch { /* re-download below */ }
  }
  try {
    const res = await fetchWithTimeout(env.transitGtfsUrl, 30000);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = new Uint8Array(await res.arrayBuffer());
    const unzipped = unzipSync(buf);
    const files: Record<string, string> = {};
    for (const [name, data] of Object.entries(unzipped)) files[name] = strFromU8(data);
    const parsed = parseGtfs(files, now);
    if (!parsed.routes.length) throw new Error("GTFS had no routes with geometry");
    fs.writeFileSync(jsonPath, JSON.stringify(parsed));
    return (g.__aquaTransit = parsed);
  } catch (e) {
    console.warn("[transit] GTFS download failed, using demo overlay:", (e as Error).message);
    if (fs.existsSync(jsonPath)) {
      try { return (g.__aquaTransit = JSON.parse(fs.readFileSync(jsonPath, "utf8"))); } catch { /* fall through */ }
    }
    return (g.__aquaTransit = { ...DEMO_TRANSIT, fetchedAt: now });
  }
}

export function transitSummary(d: TransitData) {
  return { mode: d.mode, fetchedAt: d.fetchedAt, feedVersion: d.feedVersion, agency: d.agency, routeCount: d.routes.length, stopCount: d.stops.length, trackingUrl: d.trackingUrl };
}
