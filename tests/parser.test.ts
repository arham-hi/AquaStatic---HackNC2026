import { describe, it, expect } from "vitest";
import { parsePostLocal, interpretQueryLocal, parseDurationMinutes } from "@/lib/ai/fallback";
import { findLocationInText, searchLocations, nearestLocation } from "@/lib/locations";

describe("natural-language request classification (local parser)", () => {
  it("classifies a charger request with location, item, duration and power class", () => {
    const p = parsePostLocal("I'm in Davis rn and forgot my laptop charger. Anyone got USB C for like 45 mins?");
    expect(p.type).toBe("request");
    expect(p.category).toBe("borrowing");
    expect(p.locationId).toBe("davis-library");
    expect(p.item).toBe("USB-C laptop charger");
    expect(p.powerClass).toBe("laptop");
    expect(p.durationMinutes).toBe(45);
    expect(p.urgency).toBe("soon");
    expect(p.missing).not.toContain("location");
  });
  it("classifies an offer", () => {
    const p = parsePostLocal("I have an extra USB-C laptop charger at Davis until 5.");
    expect(p.type).toBe("offer");
    expect(p.category).toBe("borrowing");
    expect(p.locationId).toBe("davis-library");
  });
  it("classifies tutoring request vs offer", () => {
    expect(parsePostLocal("Can someone help me understand Calculus II tonight at the UL?")).toMatchObject({ type: "request", category: "tutoring", subject: "Calculus II", locationId: "undergraduate-library" });
    expect(parsePostLocal("I can help with Calculus II this afternoon at Phillips")).toMatchObject({ type: "offer", category: "tutoring", subject: "Calculus II", locationId: "phillips-hall" });
  });
  it("classifies lost vs found", () => {
    expect(parsePostLocal("I lost my AirPods near the Carolina Union")).toMatchObject({ type: "request", category: "lost_found", lostOrFound: "lost", item: "AirPods", locationId: "carolina-union" });
    expect(parsePostLocal("Found a pair of AirPods near the Union")).toMatchObject({ type: "offer", category: "lost_found", lostOrFound: "found" });
  });
  it("classifies free food, rides, study groups", () => {
    expect(parsePostLocal("Free pizza in the Pit from the CS club").category).toBe("free_food");
    expect(parsePostLocal("Looking for a ride to the grocery store around 6").category).toBe("ride");
    expect(parsePostLocal("Studying chemistry at Wilson if anybody wants to join")).toMatchObject({ category: "study", type: "offer", locationId: "wilson-library" });
  });
  it("flags missing location instead of inventing one", () => {
    const p = parsePostLocal("Does anyone have a graphing calculator I can borrow?");
    expect(p.locationId).toBeNull();
    expect(p.missing).toContain("location");
  });
  it("parses durations", () => {
    expect(parseDurationMinutes("for the next hour")).toBe(60);
    expect(parseDurationMinutes("for 2 hours")).toBe(120);
    expect(parseDurationMinutes("for like 45 mins")).toBe(45);
  });
});

describe("location registry", () => {
  it("resolves aliases with word boundaries", () => {
    expect(findLocationInText("meet at the ul")?.id).toBe("undergraduate-library");
    expect(findLocationInText("you could come")?.id).not.toBe("undergraduate-library");
    expect(findLocationInText("on franklin")?.id).toBe("franklin-street");
  });
  it("prefers the most specific match", () => {
    expect(findLocationInText("undergraduate library 2nd floor")?.id).toBe("undergraduate-library");
  });
  it("autocompletes and snaps coordinates", () => {
    expect(searchLocations("dav")[0].id).toBe("davis-library");
    expect(nearestLocation(35.9108, -79.0481)?.id).toBe("davis-library");
    expect(nearestLocation(35.95, -79.1)).toBeNull();
  });
});

describe("query interpretation", () => {
  it("detects intents and locations", () => {
    expect(interpretQueryLocal("Any free food around campus?").intent).toBe("food");
    expect(interpretQueryLocal("What help requests exist around Davis?")).toMatchObject({ intent: "find_help", locationId: "davis-library" });
    expect(interpretQueryLocal("Does someone have a charger?").intent).toBe("find_offers");
    expect(interpretQueryLocal("Are there transit notices?").intent).toBe("transit");
    expect(interpretQueryLocal("I need a charger at the library").intent).toBe("create_post");
  });
});

describe("giveaways", () => {
  it("classifies move-out giveaways as giveaway offers with the item", () => {
    expect(parsePostLocal("Moving out, giving away a desk chair in good shape. Pick up at Hinton James lobby today.")).toMatchObject({ type: "offer", category: "giveaway", item: "desk chair", locationId: "hinton-james" });
    expect(parsePostLocal("Free mini fridge, works fine, Granville Towers, come get it")).toMatchObject({ type: "offer", category: "giveaway", item: "mini fridge", locationId: "granville-towers" });
    expect(parsePostLocal("anyone want a couch? free, at Craige")).toMatchObject({ type: "offer", category: "giveaway", item: "couch" });
  });
  it("keeps free food as food and loans as borrowing", () => {
    expect(parsePostLocal("Free pizza in the Pit").category).toBe("free_food");
    expect(parsePostLocal("Can I borrow a lamp for the weekend at Cobb?").category).toBe("borrowing");
  });
  it("recognizes someone looking for a free item", () => {
    expect(parsePostLocal("Looking for a free desk for my dorm, anyone giving one away near Ehringhaus?")).toMatchObject({ type: "request", category: "giveaway", item: "desk" });
  });
});
