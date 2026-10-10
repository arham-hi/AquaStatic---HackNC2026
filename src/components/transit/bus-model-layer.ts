"use client";

import * as THREE from "three";
import maplibregl from "@/lib/maplibre";
import { CAMPUS_CENTER } from "@/lib/locations";
import { busHeading, busPosition, individualBusJourney, type BusJourney } from "./simulated-buses";

export const BUS_LAYER_ID = "simulated-3d-buses";

function createBus(route: BusJourney["route"]) {
  const group = new THREE.Group();
  const routeColor = new THREE.Color(route.color);
  const hsl = { h: 0, s: 0, l: 0 };
  routeColor.getHSL(hsl);
  // Keep each route's hue, but lift dark colors and strengthen pale colors.
  routeColor.setHSL(hsl.h, Math.max(0.8, hsl.s), Math.max(0.32, Math.min(0.48, hsl.l)));
  const materials = {
    body: new THREE.MeshLambertMaterial({ color: routeColor, emissive: routeColor, emissiveIntensity: 0.2, flatShading: true }),
    white: new THREE.MeshLambertMaterial({ color: "#eef5fa", flatShading: true }),
    glass: new THREE.MeshLambertMaterial({ color: "#173c51", flatShading: true }),
    dark: new THREE.MeshLambertMaterial({ color: "#18222d", flatShading: true }),
    hub: new THREE.MeshLambertMaterial({ color: "#a8bbc9", flatShading: true }),
    lights: new THREE.MeshBasicMaterial({ color: "#fff3b0" }),
    tail: new THREE.MeshBasicMaterial({ color: "#ff4747" }),
  };
  const box = (size: number[], position: number[], material: THREE.Material) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size as [number, number, number]), material);
    mesh.position.set(...position as [number, number, number]);
    group.add(mesh);
    return mesh;
  };
  // Model dimensions in meters; forward is -Z, height is +Y.
  box([2.6, 2.6, 11.8], [0, 1.95, 0], materials.body);
  box([2.65, 0.25, 11.9], [0, 3.35, 0], materials.body);
  box([1.2, 0.25, 2.4], [0, 3.6, 1], materials.body);
  // Broad colored roof stays visible from above; white trim separates the silhouette.
  for (const side of [-1, 1]) {
    box([0.12, 0.06, 11.5], [side * 1.25, 3.51, 0], materials.white);
    box([0.07, 0.24, 11.4], [side * 1.34, 1.56, 0], materials.white);
  }
  box([2.65, 0.28, 11.8], [0, 0.7, 0], materials.dark);
  box([2.4, 1.3, 0.06], [0, 2.4, -5.93], materials.glass);
  box([2.2, 1.1, 0.06], [0, 2.45, 5.93], materials.glass);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 7; i++) box([0.06, 1.1, 1.05], [side * 1.33, 2.45, -4.3 + i * 1.4], materials.glass);
    box([0.18, 0.14, 0.9], [side * 1.42, 2.15, -5.25], materials.dark);
    box([0.35, 0.25, 0.09], [side * 0.9, 1.25, -5.97], materials.lights);
    box([0.22, 0.4, 0.09], [side * 0.95, 1.3, 5.97], materials.tail);
  }
  for (const z of [-3.9, 2.1]) {
    box([0.08, 2.1, 1.25], [1.35, 1.7, z], materials.dark);
    box([0.09, 1.3, 0.48], [1.4, 2, z - 0.29], materials.glass);
    box([0.09, 1.3, 0.48], [1.4, 2, z + 0.29], materials.glass);
  }
  const wheels: THREE.Group[] = [];
  for (const x of [-1.28, 1.28]) for (const z of [-3.8, 3.6]) {
    const wheel = new THREE.Group();
    wheel.position.set(x, 0.65, z);
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.64, 0.64, 0.32, 10), materials.dark);
    tire.rotation.z = Math.PI / 2;
    wheel.add(tire);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.35, 8), materials.hub);
    hub.rotation.z = Math.PI / 2;
    wheel.add(hub);
    group.add(wheel);
    wheels.push(wheel);
  }
  const canvas = document.createElement("canvas");
  canvas.width = 256; canvas.height = 64;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#111c23"; context.fillRect(0, 0, 256, 64);
  context.fillStyle = "#ffda80"; context.font = "bold 40px sans-serif";
  context.textAlign = "center"; context.textBaseline = "middle";
  context.fillText(`${route.shortName} · DEMO`, 128, 34, 240);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  box([2.3, 0.4, 0.07], [0, 3.07, -5.98], new THREE.MeshBasicMaterial({ map: texture }));
  return { group, wheels };
}

export function createBusModelLayer(journeys: BusJourney[], clock: { current: number }) {
  const scene = new THREE.Scene();
  const camera = new THREE.Camera();
  scene.add(new THREE.HemisphereLight("#ffffff", "#556577", 1.5));
  const sun = new THREE.DirectionalLight("#fff4da", 1.6);
  sun.position.set(-80, 150, -100); scene.add(sun);
  const origin = maplibregl.MercatorCoordinate.fromLngLat(CAMPUS_CENTER);
  const units = origin.meterInMercatorCoordinateUnits();
  const transform = new THREE.Matrix4().makeTranslation(origin.x, origin.y, origin.z)
    .multiply(new THREE.Matrix4().makeScale(units, -units, units))
    .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
  const buses = journeys.flatMap((baseJourney) => [0].map((index) => {
    const journey = individualBusJourney(baseJourney, index);
    const model = createBus(journey.route);
    scene.add(model.group);
    return { ...model, journey, offset: journey.duration * (index / 2 + 0.13), position: busPosition(journey, clock.current + journey.duration * (index / 2 + 0.13)), heading: busHeading(journey, clock.current + journey.duration * (index / 2 + 0.13)) };
  }));
  let renderer: THREE.WebGLRenderer;
  let map: maplibregl.Map;
  let previous = performance.now();
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const layer: maplibregl.CustomLayerInterface = {
    id: BUS_LAYER_ID, type: "custom", renderingMode: "3d",
    onAdd(instance, gl) {
      map = instance;
      renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl as WebGL2RenderingContext, antialias: true });
      renderer.autoClear = false;
    },
    render(_gl, args) {
      const now = performance.now();
      const elapsed = Math.min((now - previous) / 1000, 0.1);
      if (!reducedMotion) clock.current += elapsed;
      previous = now;
      const scale = 2.5 * Math.min(16, Math.max(1, 2 ** (16 - map.getZoom())));
      for (const bus of buses) {
        const position = busPosition(bus.journey, clock.current + bus.offset);
        const distance = Math.hypot(
          (position[0] - bus.position[0]) * Math.cos(position[1] * Math.PI / 180),
          position[1] - bus.position[1],
        ) * Math.PI / 180 * 6371000;
        bus.position = position;
        const target = busHeading(bus.journey, clock.current + bus.offset);
        const delta = Math.atan2(Math.sin(target - bus.heading), Math.cos(target - bus.heading));
        bus.heading += delta * Math.min(1, elapsed * 7);
        const coordinate = maplibregl.MercatorCoordinate.fromLngLat(position);
        bus.group.position.set((coordinate.x - origin.x) / units, 0.1, (coordinate.y - origin.y) / units);
        bus.group.rotation.y = -bus.heading;
        bus.group.scale.set(scale * 1.15, scale, scale);
        for (const wheel of bus.wheels) wheel.rotation.x -= distance / 0.64;
      }
      camera.projectionMatrix.fromArray(args.defaultProjectionData.mainMatrix).multiply(transform);
      renderer.resetState();
      renderer.render(scene, camera);
      renderer.resetState();
      if (!reducedMotion && buses.length) map.triggerRepaint();
    },
    onRemove() {
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          geometries.add(object.geometry);
          (Array.isArray(object.material) ? object.material : [object.material]).forEach((material) => materials.add(material));
        }
      });
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => { if ("map" in material) (material.map as THREE.Texture | null)?.dispose(); material.dispose(); });
      renderer?.dispose();
    },
  };
  return { layer, hit(point: maplibregl.PointLike) {
    const target = Array.isArray(point) ? { x: point[0], y: point[1] } : point;
    let nearest = 42;
    let routeId: string | null = null;
    for (const bus of buses) {
      const screen = map.project(bus.position);
      const distance = Math.hypot(screen.x - target.x, screen.y - target.y);
      if (distance < nearest) { nearest = distance; routeId = bus.journey.route.id; }
    }
    return routeId;
  } };
}
