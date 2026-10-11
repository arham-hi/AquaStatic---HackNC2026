// Cute-but-realistic 3D buildings for the campus map: warm brick tones, solid walls, soft footprint outlines.
// Exports the two functions campus-map.tsx imports. Safe to call repeatedly (it checks before adding).
import type { Map as MapLibreMap, LayerSpecification, ExpressionSpecification } from "maplibre-gl";

const FILL_ID = "aero-buildings";
const EDGE_ID = "aero-buildings-edge";

// Height in meters. OSM often has no height for campus buildings, so fall back to a believable ~3 floors.
const HEIGHT: ExpressionSpecification = ["coalesce", ["get", "render_height"], 9];
const BASE: ExpressionSpecification = ["coalesce", ["get", "render_min_height"], 0];

const PALETTE = {
  light: { low: "#dba58f", mid: "#cf8a72", high: "#c07a64", tower: "#e6dccd", edge: "#a86a58" },
  dark: { low: "#7a5668", mid: "#6c4c60", high: "#5e4357", tower: "#7d7a92", edge: "#3d2a3a" },
};

export function addAeroBuildings(map: MapLibreMap, dark: boolean) {
  if (!map.getSource("openmaptiles")) return;
  removeAeroBuildings(map); // re-adding picks up a theme change cleanly
  const p = dark ? PALETTE.dark : PALETTE.light;

  // Hide the base style's own 3D buildings so only ours show.
  if (map.getLayer("building-3d")) map.setLayoutProperty("building-3d", "visibility", "none");

  const labelLayer = map.getStyle().layers.find(
    (l: LayerSpecification) => l.type === "symbol" && (l.layout as Record<string, unknown> | undefined)?.["text-field"],
  )?.id;

  map.addLayer({
    id: FILL_ID, type: "fill-extrusion", source: "openmaptiles", "source-layer": "building", minzoom: 13.5,
    paint: {
      // Short buildings are warm brick; the few tall ones read as pale stone/concrete.
      "fill-extrusion-color": ["interpolate", ["linear"], HEIGHT, 0, p.low, 14, p.mid, 30, p.high, 55, p.tower],
      "fill-extrusion-height": ["interpolate", ["linear"], ["zoom"], 13.5, 0, 15.2, HEIGHT],
      "fill-extrusion-base": ["interpolate", ["linear"], ["zoom"], 13.5, 0, 15.2, BASE],
      "fill-extrusion-opacity": 0.97,
      "fill-extrusion-vertical-gradient": true,
    },
  }, labelLayer);

  // Soft footprint outline so neighbouring buildings read as separate shapes instead of one blob.
  map.addLayer({
    id: EDGE_ID, type: "line", source: "openmaptiles", "source-layer": "building", minzoom: 16,
    paint: { "line-color": p.edge, "line-opacity": 0.35, "line-width": ["interpolate", ["linear"], ["zoom"], 16, 0.4, 19, 1.2] },
  }, labelLayer);
}

export function removeAeroBuildings(map: MapLibreMap) {
  for (const id of [EDGE_ID, FILL_ID]) if (map.getLayer(id)) map.removeLayer(id);
  if (map.getLayer("building-3d")) map.setLayoutProperty("building-3d", "visibility", "visible");
}