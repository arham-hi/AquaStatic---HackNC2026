import type { TransitRoute, TransitStop } from "@/lib/services/transit";

type Leg = { from: number[]; to: number[]; start: number; duration: number };
export type BusJourney = { route: TransitRoute; legs: Leg[]; duration: number };

/** Stable per-vehicle timings keep speeds distinct across route selection and theme changes. */
export function individualBusJourney(journey: BusJourney, busIndex: number): BusJourney {
  let seed = 2166136261;
  for (const character of `${journey.route.id}:${busIndex}`) {
    seed = Math.imul(seed ^ character.charCodeAt(0), 16777619) >>> 0;
  }
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const cruisingSpeed = 6 + random() * 6; // 22–43 km/h, before local slowdowns.
  let duration = 0;
  const legs = journey.legs.map((leg, index) => {
    const distance = meters(leg.from, leg.to);
    const next = journey.legs[(index + 1) % journey.legs.length];
    const approachingStop = next.from === next.to;
    const speed = cruisingSpeed * (0.8 + random() * 0.35) * (approachingStop ? 0.65 : 1);
    const seconds = distance > 0 ? distance / speed : leg.duration * (0.65 + random() * 0.9);
    const timed = { ...leg, start: duration, duration: seconds };
    duration += seconds;
    return timed;
  });
  return { ...journey, legs, duration };
}

function meters(a: number[], b: number[]) {
  const radians = Math.PI / 180;
  const x = (b[0] - a[0]) * radians * Math.cos((a[1] + b[1]) * radians / 2);
  const y = (b[1] - a[1]) * radians;
  return Math.hypot(x, y) * 6371000;
}

/** Use one continuous shape; never connect unrelated GTFS shapes across town. */
export function createBusJourneys(routes: TransitRoute[], stops: TransitStop[]): BusJourney[] {
  const byId = new Map(stops.map((stop) => [stop.id, stop]));
  return routes.flatMap((route) => {
    const lines = route.geometry.coordinates.filter((line) => line.length > 1 && line.every((p) => p.length >= 2 && p.every(Number.isFinite)));
    const length = (line: number[][]) => line.slice(1).reduce((sum, point, i) => sum + meters(line[i], point), 0);
    const points = lines.reduce<number[][]>((best, line) => length(line) > length(best) ? line : best, []);
    if (length(points) < 10) return [];
    const stopIndices = new Set<number>();
    for (const id of route.stopIds) {
      const stop = byId.get(id);
      if (!stop) continue;
      let nearest = 60, index = -1;
      points.forEach((point, i) => {
        const distance = meters(point, [stop.lng, stop.lat]);
        if (distance < nearest) { nearest = distance; index = i; }
      });
      if (index >= 0) stopIndices.add(index);
    }
    const legs: Leg[] = [];
    let duration = 0;
    const add = (from: number[], to: number[], seconds: number) => {
      if (seconds <= 0) return;
      legs.push({ from, to, start: duration, duration: seconds });
      duration += seconds;
    };
    const travel = (indices: number[]) => {
      indices.slice(1).forEach((index, i) => {
        const previous = indices[i];
        add(points[previous], points[index], meters(points[previous], points[index]) / 9);
        if (stopIndices.has(index)) add(points[index], points[index], 10);
      });
    };
    const indices = points.map((_, i) => i);
    travel(indices);
    add(points.at(-1)!, points.at(-1)!, 25);
    // Closed shapes repeat naturally; open shapes retrace the road instead of teleporting.
    if (meters(points[0], points.at(-1)!) > 30) travel([...indices].reverse());
    else add(points.at(-1)!, points[0], meters(points.at(-1)!, points[0]) / 9);
    add(points[0], points[0], 25);
    return [{ route, legs, duration }];
  });
}

function currentLegIndex(journey: BusJourney, seconds: number) {
  const time = ((seconds % journey.duration) + journey.duration) % journey.duration;
  let low = 0, high = journey.legs.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const leg = journey.legs[middle];
    if (time >= leg.start + leg.duration) low = middle + 1;
    else high = middle;
  }
  return { index: low, time };
}

export function busHeading(journey: BusJourney, seconds: number): number {
  const { index } = currentLegIndex(journey, seconds);
  // Preserve the incoming direction while waiting at a stop or terminal.
  for (let offset = 0; offset < journey.legs.length; offset++) {
    const leg = journey.legs[(index - offset + journey.legs.length) % journey.legs.length];
    const east = (leg.to[0] - leg.from[0]) * Math.cos(leg.from[1] * Math.PI / 180);
    const north = leg.to[1] - leg.from[1];
    if (east || north) return Math.atan2(east, north);
  }
  return 0;
}

export function busPosition(journey: BusJourney, seconds: number): [number, number] {
  const { index, time } = currentLegIndex(journey, seconds);
  const leg = journey.legs[index];
  const progress = Math.min(1, Math.max(0, (time - leg.start) / leg.duration));
  return [leg.from[0] + (leg.to[0] - leg.from[0]) * progress, leg.from[1] + (leg.to[1] - leg.from[1]) * progress];
}
