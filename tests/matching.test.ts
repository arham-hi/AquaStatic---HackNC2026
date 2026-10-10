import { describe, it, expect } from "vitest";
import { scoreMatch, MATCH_THRESHOLD } from "@/lib/services/matching";
import type { Post } from "@/lib/db/schema";

const now = Date.UTC(2026, 9, 10, 19, 0, 0);
const base = (over: Partial<Post>): Post => ({
  id: "p", authorId: "u", type: "request", category: "borrowing", title: "t", description: "d", summary: "s", locationId: "davis-library", locationNote: null,
  startsAt: new Date(now), expiresAt: new Date(now + 3600_000), urgency: "soon", sourceStatus: "community", status: "open", keywords: ["charger", "usb-c"],
  attributes: { item: "USB-C laptop charger", powerClass: "laptop" }, isDemo: false, createdAt: new Date(now), updatedAt: new Date(now), ...over,
});

describe("request/offer compatibility", () => {
  it("matches the charger scenario with a high, explained score", () => {
    const r = scoreMatch(base({ id: "r", authorId: "maya" }), base({ id: "o", authorId: "jordan", type: "offer", expiresAt: new Date(now + 2 * 3600_000) }), now);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.score).toBeGreaterThanOrEqual(0.9);
    expect(r.explanation.parts).toHaveLength(4);
    expect(r.explanation.reason).toContain("Davis Library");
  });
  it("scores nearby-but-different buildings lower than the same building", () => {
    const same = scoreMatch(base({ id: "r" }), base({ id: "o", authorId: "x", type: "offer" }), now);
    const near = scoreMatch(base({ id: "r" }), base({ id: "o", authorId: "x", type: "offer", locationId: "undergraduate-library" }), now);
    const far = scoreMatch(base({ id: "r" }), base({ id: "o", authorId: "x", type: "offer", locationId: "dean-dome" }), now);
    expect(same.ok && near.ok && far.ok).toBe(true);
    if (same.ok && near.ok && far.ok) { expect(same.score).toBeGreaterThan(near.score); expect(near.score).toBeGreaterThan(far.score); }
  });
});

describe("rejection of incompatible matches", () => {
  it("rejects same author, same type, different category", () => {
    expect(scoreMatch(base({ id: "r" }), base({ id: "o", type: "offer" }), now)).toMatchObject({ ok: false, reason: "same author" });
    expect(scoreMatch(base({ id: "r" }), base({ id: "o", authorId: "x" }), now)).toMatchObject({ ok: false });
    expect(scoreMatch(base({ id: "r" }), base({ id: "o", authorId: "x", type: "offer", category: "tutoring" }), now)).toMatchObject({ ok: false, reason: "different categories" });
  });
  it("rejects a phone cable for a laptop charger request", () => {
    const r = scoreMatch(base({ id: "r" }), base({ id: "o", authorId: "x", type: "offer", attributes: { item: "USB-C cable", powerClass: "cable" } }), now);
    expect(r).toMatchObject({ ok: false, reason: "offer cannot power a laptop" });
  });
  it("rejects lost+lost pairs", () => {
    const r = scoreMatch(base({ id: "r", category: "lost_found", attributes: { item: "AirPods", lostOrFound: "lost" } }), base({ id: "o", authorId: "x", type: "offer", category: "lost_found", attributes: { item: "AirPods", lostOrFound: "lost" } }), now);
    expect(r.ok).toBe(false);
  });
  it("rejects non-overlapping availability windows", () => {
    const r = scoreMatch(base({ id: "r" }), base({ id: "o", authorId: "x", type: "offer", startsAt: new Date(now + 2 * 3600_000), expiresAt: new Date(now + 3 * 3600_000) }), now);
    expect(r).toMatchObject({ ok: false, reason: "availability windows do not overlap" });
  });
  it("keeps weak item overlap under the threshold", () => {
    const r = scoreMatch(base({ id: "r", keywords: [] }), base({ id: "o", authorId: "x", type: "offer", keywords: [], locationId: "dean-dome", attributes: { item: "umbrella" } }), now);
    if (r.ok) expect(r.score).toBeLessThan(MATCH_THRESHOLD);
  });
});

describe("expired post behavior", () => {
  it("never matches an expired request or offer", () => {
    expect(scoreMatch(base({ id: "r", expiresAt: new Date(now - 1000) }), base({ id: "o", authorId: "x", type: "offer" }), now)).toMatchObject({ ok: false, reason: "request expired" });
    expect(scoreMatch(base({ id: "r" }), base({ id: "o", authorId: "x", type: "offer", status: "expired" }), now)).toMatchObject({ ok: false });
  });
});
