"use client";
// Decorative NPC pedestrians: little low-poly people who stroll along real footpaths taken from the map tiles.
// They are scenery only (not real people or live data). Works the same way as the 3D bus layer.

import * as THREE from "three";
import maplibregl from "@/lib/maplibre";
import { CAMPUS_CENTER } from "@/lib/locations";

export const WALKERS_LAYER_ID = "aero-walkers";
const COUNT = 70;                 // how many people
const AREA = 0.012;               // degrees around campus center to look for paths (~1.3 km)
const PREFERRED = ["path", "pedestrian", "track"];
const FALLBACK = ["minor", "service"]; // used only if the map has too few footpaths loaded

type Line = { pts: [number, number][]; cum: number[]; length: number; offset: number };

const SHIRTS = ["#4aa3df", "#6fcf6f", "#ffb347", "#ff7aa2", "#b79cff", "#ffd84d", "#5ee0d0", "#ff6b6b"];
const PANTS = ["#3b4a66", "#6b5a4a", "#2f3b52", "#8a7f72"];
const SKINS = ["#f1c9a5", "#e0ac82", "#c68a62", "#8d5a3b", "#f6d8bf"];
const HAIRS = ["#2b1d14", "#5a3a22", "#c58b3a", "#16120f", "#8a3b2a"];

function rng(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function collectLines(map: maplibregl.Map, classes: string[], offset: number, origin: maplibregl.MercatorCoordinate, units: number): Line[] {
  let feats: ReturnType<maplibregl.Map["querySourceFeatures"]> = [];
  try {
    feats = map.querySourceFeatures("openmaptiles", { sourceLayer: "transportation", filter: ["in", ["get", "class"], ["literal", classes]] });
  } catch { return []; }
  const seen = new Set<string>();
  const out: Line[] = [];
  for (const f of feats) {
    const g = f.geometry;
    const parts: number[][][] = g.type === "LineString" ? [g.coordinates] : g.type === "MultiLineString" ? g.coordinates : [];
    for (const part of parts) {
      if (part.length < 2) continue;
      const first = part[0], last = part[part.length - 1];
      if (Math.abs(first[0] - CAMPUS_CENTER[0]) > AREA * 1.3 || Math.abs(first[1] - CAMPUS_CENTER[1]) > AREA) continue;
      const key = `${first[0].toFixed(5)},${first[1].toFixed(5)}:${last[0].toFixed(5)},${last[1].toFixed(5)}`;
      if (seen.has(key)) continue; // the same path often appears in several tiles
      seen.add(key);
      const pts = part.map(([lng, lat]) => {
        const c = maplibregl.MercatorCoordinate.fromLngLat([lng, lat]);
        return [(c.x - origin.x) / units, (c.y - origin.y) / units] as [number, number];
      });
      const cum = [0];
      for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      const length = cum[cum.length - 1];
      if (length >= 25) out.push({ pts, cum, length, offset });
    }
  }
  return out;
}

function pointAt(line: Line, d: number) {
  const { pts, cum } = line;
  let i = 1;
  while (i < cum.length - 1 && cum[i] < d) i++;
  const a = pts[i - 1], b = pts[i];
  const u = (d - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
  const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz) || 1;
  return { x: a[0] + dx * u, z: a[1] + dz * u, dx: dx / len, dz: dz / len };
}

function createWalkersLayer(lines: Line[], origin: maplibregl.MercatorCoordinate, units: number) {
  const scene = new THREE.Scene();
  const camera = new THREE.Camera();
  scene.add(new THREE.HemisphereLight("#ffffff", "#8aa0b5", 1.6));
  const sun = new THREE.DirectionalLight("#fff4da", 1.4);
  sun.position.set(-80, 150, -100); scene.add(sun);
  const transform = new THREE.Matrix4().makeTranslation(origin.x, origin.y, origin.z)
    .multiply(new THREE.Matrix4().makeScale(units, -units, units))
    .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));

  // Shared geometry (a person is a few simple shapes). Pivots sit at the hip/shoulder so limbs can swing.
  const geo = {
    torso: new THREE.CylinderGeometry(0.22, 0.26, 0.62, 10),
    head: new THREE.SphereGeometry(0.24, 12, 10),
    hair: new THREE.SphereGeometry(0.25, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    leg: new THREE.CylinderGeometry(0.09, 0.08, 0.8, 8).translate(0, -0.4, 0),
    arm: new THREE.CylinderGeometry(0.06, 0.05, 0.56, 8).translate(0, -0.28, 0),
  };
  const mats = new Map<string, THREE.MeshLambertMaterial>();
  const mat = (c: string) => { let m = mats.get(c); if (!m) { m = new THREE.MeshLambertMaterial({ color: c, flatShading: true }); mats.set(c, m); } return m; };
  const mesh = (g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D) => {
    const o = new THREE.Mesh(g, m); o.position.set(x, y, z); parent.add(o); return o;
  };

  const rand = rng(2026);
  const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)];
  const totalLength = lines.reduce((s, l) => s + l.length, 0);
  const chooseLine = () => { let r = rand() * totalLength; for (const l of lines) { r -= l.length; if (r <= 0) return l; } return lines[0]; };

  const walkers = Array.from({ length: COUNT }, () => {
    const g = new THREE.Group();
    const shirt = mat(pick(SHIRTS)), pants = mat(pick(PANTS)), skin = mat(pick(SKINS));
    mesh(geo.torso, shirt, 0, 1.15, 0, g);
    mesh(geo.head, skin, 0, 1.64, 0, g);
    mesh(geo.hair, mat(pick(HAIRS)), 0, 1.68, 0, g);
    const legs = [-0.11, 0.11].map((x) => { const p = new THREE.Group(); p.position.set(x, 0.84, 0); g.add(p); mesh(geo.leg, pants, 0, 0, 0, p); return p; });
    const arms = [-0.3, 0.3].map((x) => { const p = new THREE.Group(); p.position.set(x, 1.4, 0); g.add(p); mesh(geo.arm, shirt, 0, 0, 0, p); return p; });
    scene.add(g);
    const line = chooseLine();
    return { g, legs, arms, line, dist: rand() * line.length, dir: rand() < 0.5 ? 1 : -1, speed: 1.1 + rand() * 0.7, phase: rand() * 6, heading: 0 };
  });

  let renderer: THREE.WebGLRenderer;
  let map: maplibregl.Map;
  let previous = performance.now();
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const layer: maplibregl.CustomLayerInterface = {
    id: WALKERS_LAYER_ID, type: "custom", renderingMode: "3d",
    onAdd(instance, gl) {
      map = instance;
      renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl as WebGL2RenderingContext, antialias: true });
      renderer.autoClear = false;
    },
    render(_gl, args) {
      const now = performance.now();
      const dt = reducedMotion ? 0 : Math.min((now - previous) / 1000, 0.1);
      previous = now;
      const zoom = map.getZoom();
      const show = zoom >= 14.8;
      // Same exaggeration idea as the 3D buses: people stay visible when zoomed out.
      const scale = 4.5 * Math.min(12, Math.max(1, 2 ** (16.5 - zoom)));
      for (const w of walkers) {
        w.g.visible = show;
        if (!show) continue;
        w.dist += w.dir * w.speed * dt;
        if (w.dist <= 0) { w.dist = 0; w.dir = 1; } else if (w.dist >= w.line.length) { w.dist = w.line.length; w.dir = -1; }
        const p = pointAt(w.line, w.dist);
        const fx = p.dx * w.dir, fz = p.dz * w.dir; // facing direction
        w.g.position.set(p.x - fz * w.line.offset, 0.05 + Math.abs(Math.sin(w.phase)) * 0.04 * scale, p.z + fx * w.line.offset);
        const target = Math.atan2(-fx, -fz);
        const delta = Math.atan2(Math.sin(target - w.heading), Math.cos(target - w.heading));
        w.heading += delta * Math.min(1, dt * 8 + (dt === 0 ? 1 : 0));
        w.g.rotation.y = w.heading;
        w.g.scale.setScalar(scale);
        w.phase += dt * w.speed * 5.5;
        const swing = Math.sin(w.phase);
        w.legs[0].rotation.x = swing * 0.7; w.legs[1].rotation.x = -swing * 0.7;
        w.arms[0].rotation.x = -swing * 0.5; w.arms[1].rotation.x = swing * 0.5;
      }
      camera.projectionMatrix.fromArray(args.defaultProjectionData.mainMatrix).multiply(transform);
      renderer.resetState();
      renderer.render(scene, camera);
      renderer.resetState();
      if (!reducedMotion && show) map.triggerRepaint();
    },
    onRemove() {
      Object.values(geo).forEach((g) => g.dispose());
      mats.forEach((m) => m.dispose());
      renderer?.dispose();
    },
  };
  return layer;
}

/** Adds the walkers if enough footpaths are loaded. Returns false if it should be retried later. */
export function addWalkers(map: maplibregl.Map): boolean {
  if (!map.getStyle() || !map.getSource("openmaptiles")) return false;
  if (map.getLayer(WALKERS_LAYER_ID)) return true;
  const origin = maplibregl.MercatorCoordinate.fromLngLat(CAMPUS_CENTER);
  const units = origin.meterInMercatorCoordinateUnits();
  let lines = collectLines(map, PREFERRED, 0, origin, units);
  if (lines.length < 8) lines = [...lines, ...collectLines(map, FALLBACK, 3, origin, units)]; // streets: walk on the "sidewalk" side
  if (lines.length < 3) return false;
  map.addLayer(createWalkersLayer(lines, origin, units));
  return true;
}

export function removeWalkers(map: maplibregl.Map) {
  if (map.getLayer(WALKERS_LAYER_ID)) map.removeLayer(WALKERS_LAYER_ID);
}

/** Waits for the map tiles to load, then adds the walkers (retrying a few times). Call from the style.load handler. */
export function addWalkersWhenReady(map: maplibregl.Map, attempts = 4) {
  const tryAdd = () => {
    if (!map.getStyle()) return;
    if (!addWalkers(map) && attempts-- > 0) map.once("idle", tryAdd);
  };
  map.once("idle", tryAdd);
}