// ============================================================================
// MAP CONTRACT (for whoever builds the 3D version)
//
// Replace this file with any renderer that accepts the same props:
//
//   <Map center={[lat, lng]} pins={Pin[]} selected={id|null} onSelect={(id) => void} />
//
//   Pin = {
//     id: number,
//     lat: number, lng: number,        // always present (pins without a location are filtered out before this)
//     title: string,
//     category: "food"|"help"|"lost_found"|"alert"|"event"|"transit"|"other",
//     kind: "need"|"offer"|"info",
//     urgency: 1|2|3,
//     location: string|null,           // landmark name
//     matched_with: number|null,
//     created_at: string               // ISO timestamp
//   }
//
// Nothing else in the app knows what the map is made of. Keep the props, swap the guts.
// ============================================================================

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export const CATEGORY_COLORS = {
  food: "#f59e0b",
  help: "#3b82f6",
  lost_found: "#a855f7",
  alert: "#ef4444",
  event: "#10b981",
  transit: "#06b6d4",
  other: "#9ca3af",
};

export default function Map({ center, pins, selected, onSelect }) {
  const el = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);
  const markers = useRef({});

  useEffect(() => {
    map.current = L.map(el.current, { zoomControl: false }).setView(center, 16);
    L.control.zoom({ position: "bottomright" }).addTo(map.current);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution: "&copy; OpenStreetMap &copy; CARTO",
      maxZoom: 19,
    }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    return () => map.current.remove();
  }, []);

  useEffect(() => {
    layer.current.clearLayers();
    markers.current = {};
    for (const p of pins) {
      // small random jitter so pins at the same landmark don't stack perfectly
      const seed = (p.id * 9301 + 49297) % 233280 / 233280;
      const m = L.circleMarker([p.lat + (seed - 0.5) * 0.0006, p.lng + ((seed * 7) % 1 - 0.5) * 0.0008], {
        radius: 6 + p.urgency * 3,
        color: "#fff",
        weight: 1.5,
        fillColor: CATEGORY_COLORS[p.category] || CATEGORY_COLORS.other,
        fillOpacity: 0.9,
      })
        .bindTooltip(`<b>${p.title}</b><br/>${p.kind} · ${p.category}${p.location ? " · " + p.location : ""}`)
        .on("click", () => onSelect?.(p.id))
        .addTo(layer.current);
      markers.current[p.id] = m;
    }
  }, [pins]);

  useEffect(() => {
    const m = selected != null && markers.current[selected];
    if (m) { map.current.flyTo(m.getLatLng(), 17, { duration: 0.6 }); m.openTooltip(); }
  }, [selected]);

  return <div ref={el} className="map" />;
}
