import { describe, expect, it } from "vitest";
import { busHeading, busPosition, createBusJourneys, individualBusJourney } from "@/components/transit/simulated-buses";
import type { TransitRoute } from "@/lib/services/transit";

const route: TransitRoute = {
  id: "demo", shortName: "D", longName: "Demo", color: "#000000", textColor: "#ffffff",
  url: null, headsigns: [], stopIds: ["middle"],
  geometry: { type: "MultiLineString", coordinates: [[[-79, 36], [-78.999, 36], [-78.998, 36]]] },
};

describe("simulated buses", () => {
  it("gives buses distinct, repeatable speeds and stop timing while preserving the path", () => {
    const [base] = createBusJourneys([route], [{ id: "middle", code: "1", name: "Middle", lng: -78.999, lat: 36 }]);
    const first = individualBusJourney(base, 0);
    const second = individualBusJourney(base, 1);
    expect(first).toEqual(individualBusJourney(base, 0));
    expect(busPosition(first, 3)).not.toEqual(busPosition(second, 3));
    expect(first.duration).not.toEqual(second.duration);
    expect(first.legs.map((leg) => [leg.from, leg.to])).toEqual(base.legs.map((leg) => [leg.from, leg.to]));
    const firstDwell = first.legs.find((leg) => leg.from === leg.to)!;
    const secondDwell = second.legs.find((leg) => leg.from === leg.to)!;
    expect(firstDwell.duration).not.toEqual(secondDwell.duration);
    expect(busPosition(first, first.duration)).toEqual(busPosition(first, 0));
    for (let i = 1; i < first.legs.length; i++) {
      expect(first.legs[i].start).toBeCloseTo(first.legs[i - 1].start + first.legs[i - 1].duration);
    }
  });
  it("faces along the road and keeps its heading during stop dwell", () => {
    const [journey] = createBusJourneys([route], [{ id: "middle", code: "1", name: "Middle", lng: -78.999, lat: 36 }]);
    expect(busHeading(journey, 1)).toBeCloseTo(Math.PI / 2);
    const dwell = journey.legs.find((leg) => leg.from === leg.to && leg.from[0] === -78.999)!;
    expect(busHeading(journey, dwell.start + 5)).toBeCloseTo(Math.PI / 2);
    const returning = journey.legs.find((leg) => leg.to[0] < leg.from[0])!;
    expect(busHeading(journey, returning.start + 1)).toBeCloseTo(-Math.PI / 2);
  });
  it("travels out and back continuously and repeats the trip", () => {
    const [journey] = createBusJourneys([route], []);
    expect(busPosition(journey, 0)).toEqual([-79, 36]);
    expect(busPosition(journey, journey.duration)).toEqual([-79, 36]);
    expect(busPosition(journey, 5)[0]).toBeGreaterThan(-79);
    const returnLeg = journey.legs.find((leg) => leg.to[0] < leg.from[0])!;
    expect(returnLeg).toBeDefined();
    expect(busPosition(journey, returnLeg.start + 1)[0]).toBeLessThan(returnLeg.from[0]);
    const before = busPosition(journey, journey.duration - 0.001);
    const after = busPosition(journey, journey.duration + 0.001);
    expect(Math.abs(before[0] - after[0])).toBeLessThan(0.000001);
  });

  it("dwells at nearby stops", () => {
    const [journey] = createBusJourneys([route], [{ id: "middle", code: "1", name: "Middle", lng: -78.999, lat: 36 }]);
    const dwell = journey.legs.find((leg) => leg.from[0] === -78.999 && leg.from === leg.to)!;
    expect(dwell.duration).toBe(10);
    expect(busPosition(journey, dwell.start + 1)).toEqual(busPosition(journey, dwell.start + 9));
  });

  it("skips invalid shapes and never bridges disconnected shapes", () => {
    expect(createBusJourneys([{ ...route, geometry: { type: "MultiLineString", coordinates: [[[NaN, 36], [-79, 36]]] } }], [])).toEqual([]);
    const [journey] = createBusJourneys([{ ...route, geometry: { type: "MultiLineString", coordinates: [...route.geometry.coordinates, [[-80, 36], [-79.9999, 36]]] } }], []);
    expect(journey.legs.every((leg) => leg.from[0] >= -79 && leg.to[0] >= -79)).toBe(true);
  });
});
