"use client";
// Decorative NPC pedestrians: little low-poly people who stroll along real footpaths taken from the map tiles.
// They are scenery only (not real people or live data). Works the same way as the 3D bus layer.

import * as THREE from "three";
import maplibregl from "@/lib/maplibre";
import { CAMPUS_CENTER } from "@/lib/locations";
import { softShadowTexture } from "@/lib/soft-shadow";

export const WALKERS_LAYER_ID = "aero-walkers";
const COUNT = 70;                 // how many people
const SPEED = 7;                 // ground-speed exaggeration: walkers render ~30-65x life-size, so real walking speed looks frozen
const SIZE = 0.98;                // global size tweak on top of the zoom-aware scale
const AREA = 0.012;               // degrees around campus center to look for paths (~1.3 km)
const PREFERRED = ["path", "pedestrian", "track"];
const FALLBACK = ["minor", "service"]; // used only if the map has too few footpaths loaded

type Line = { pts: [number, number][]; cum: number[]; length: number; offset: number };

// Frutiger Aero cast: glossy translucent gummy people in aqua / lime / turquoise / lavender.
// One color per walker — the whole body shares it, like a jelly-bean mascot.
const AERO = ["#38c8e8", "#7ee0d2", "#9be34d", "#c9a8ff", "#5aa7f0", "#8ef0b0", "#ffc8e8", "#ffe066"];

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
  scene.add(new THREE.HemisphereLight("#ffffff", "#c4d9e8", 1.9));
  const sun = new THREE.DirectionalLight("#fff4da", 1.2);
  sun.position.set(-80, 150, -100); scene.add(sun);
  // Fill from the camera-facing side so the unlit side of each person stays colorful, not black.
  const fill = new THREE.DirectionalLight("#cfeaff", 0.85);
  fill.position.set(120, 60, 150); scene.add(fill);
  const transform = new THREE.Matrix4().makeTranslation(origin.x, origin.y, origin.z)
    .multiply(new THREE.Matrix4().makeScale(units, -units, units))
    .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));

  // Shared geometry — smooth rounded capsules/spheres, nothing angular. Pivots sit at the hip/shoulder so limbs can swing.
  const geo = {
    torso: new THREE.CapsuleGeometry(0.24, 0.42, 6, 14),
    head: new THREE.SphereGeometry(0.3, 16, 12),
    leg: new THREE.CapsuleGeometry(0.085, 0.66, 4, 10).translate(0, -0.41, 0),
    arm: new THREE.CapsuleGeometry(0.06, 0.4, 4, 10).translate(0, -0.24, 0),
  };
  // Gummy Frutiger Aero material: bright, glossy, slightly translucent-looking without
  // relying on transparency (MeshPhysicalMaterial renders almost black in the shared
  // maplibre GL context — its clearcoat/sheen lighting breaks down there).
  const mats = new Map<string, THREE.MeshPhongMaterial>();
  const mat = (c: string) => {
    let m = mats.get(c);
    if (!m) {
      m = new THREE.MeshPhongMaterial({ color: c, shininess: 90, specular: new THREE.Color("#dff6ff"), emissive: c, emissiveIntensity: 0.32 });
      mats.set(c, m);
    }
    return m;
  };
  const mesh = (g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D) => {
    const o = new THREE.Mesh(g, m); o.position.set(x, y, z); parent.add(o); return o;
  };

  // Soft contact shadow: a flat gradient disc pinned to the ground under each walker.
  // No shadow maps — this is cheap, translucent, and keeps feet feeling grounded.
  const shadowGeo = new THREE.CircleGeometry(0.5, 24).rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({ map: softShadowTexture(), transparent: true, depthWrite: false });

  const rand = rng(2026);
  const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)];
  const totalLength = lines.reduce((s, l) => s + l.length, 0);
  const chooseLine = () => { let r = rand() * totalLength; for (const l of lines) { r -= l.length; if (r <= 0) return l; } return lines[0]; };

  const walkers = Array.from({ length: COUNT }, () => {
    const g = new THREE.Group();
    const body = mat(pick(AERO));
    mesh(geo.torso, body, 0, 1.15, 0, g);
    mesh(geo.head, body, 0, 1.66, 0, g);
    const legs = [-0.11, 0.11].map((x) => { const p = new THREE.Group(); p.position.set(x, 0.84, 0); g.add(p); mesh(geo.leg, body, 0, 0, 0, p); return p; });
    const arms = [-0.3, 0.3].map((x) => { const p = new THREE.Group(); p.position.set(x, 1.4, 0); g.add(p); mesh(geo.arm, body, 0, 0, 0, p); return p; });
    scene.add(g);
    const shadow = new THREE.Mesh(shadowGeo, shadowMat);
    scene.add(shadow);
    const line = chooseLine();
    return { g, shadow, legs, arms, line, dist: rand() * line.length, dir: rand() < 0.5 ? 1 : -1, speed: (1.1 + rand() * 0.7) * SPEED, phase: rand() * 6, heading: 0 };
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
      const show = zoom >= 14.4;
      // Zoom-aware exaggeration: people stay much larger than life so they read at the
      // default campus view, then ease back toward sane sizes as you zoom in.
      const scale = Math.min(65, Math.max(5.5, 30 * 2 ** ((15.6 - zoom) * 0.5))) * SIZE;
      for (const w of walkers) {
        w.g.visible = show;
        w.shadow.visible = show;
        if (!show) continue;
        w.dist += w.dir * w.speed * dt;
        if (w.dist <= 0) { w.dist = 0; w.dir = 1; } else if (w.dist >= w.line.length) { w.dist = w.line.length; w.dir = -1; }
        const p = pointAt(w.line, w.dist);
        const fx = p.dx * w.dir, fz = p.dz * w.dir; // facing direction
        const x = p.x - fz * w.line.offset, z = p.z + fx * w.line.offset;
        w.g.position.set(x, 0.02 + Math.abs(Math.sin(w.phase)) * 0.03 * scale, z);
        w.shadow.position.set(x, 0.06, z);
        w.shadow.scale.setScalar(scale);
        const target = Math.atan2(-fx, -fz);
        const delta = Math.atan2(Math.sin(target - w.heading), Math.cos(target - w.heading));
        w.heading += delta * Math.min(1, dt * 8 + (dt === 0 ? 1 : 0));
        w.g.rotation.y = w.heading;
        w.g.scale.setScalar(scale);
        w.phase += dt * w.speed * 1.2;
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
      shadowGeo.dispose();
      shadowMat.dispose();
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