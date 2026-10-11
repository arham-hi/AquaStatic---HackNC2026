import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { freshDb } from "./setup";

freshDb("station");

const { getDb, schema } = await import("@/lib/db/client");
const { createPost, CreatePostSchema } = await import("@/lib/services/posts");
const { ensureDemoUsers, syncLocations } = await import("@/lib/services/demo");
const { planNextSegment, nextSegments, kindOf } = await import("@/lib/services/station");
const { voiceFor, resetBudgetCache } = await import("@/lib/voice/budget");
import type { User } from "@/lib/db/schema";

let maya: User;
const post = (text: string, extra: Record<string, unknown> = {}, now?: number) =>
  createPost(maya, CreatePostSchema.parse({
    description: text, type: "request", category: "borrowing", title: text.slice(0, 60),
    locationId: "davis-library", expiry: "3h", ...extra,
  }), now);

const extItem = (over: Record<string, unknown>) => {
  const db = getDb();
  db.insert(schema.externalSources).values({ id: "test-src", name: "Test Source", url: "https://example.com", adapter: "rss", kind: "events", enabled: true })
    .onConflictDoNothing().run();
  db.insert(schema.externalItems).values({
    id: `test-src:${Math.random().toString(36).slice(2)}`, sourceId: "test-src", providerId: "x",
    type: "event", title: "T", summary: "S", url: "https://example.com/e", publishedAt: null,
    startsAt: null, endsAt: null, locationName: "The Pit", lat: null, lng: null, locationId: null,
    category: "event", dedupeKey: `k${Math.random()}`, createdAt: new Date(), ...over,
  }).run();
};

beforeAll(() => {
  syncLocations();
  ensureDemoUsers();
  maya = getDb().select().from(schema.users).all().find((u) => u.id === "u_demo_maya")!;
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetBudgetCache();
  delete process.env.ELEVENLABS_API_KEY;
  delete process.env.RADIO_VOICE;
});

describe("station planner", () => {
  it("cold start: produces an honest first segment even with nothing to report", async () => {
    // Empty feed on a fresh station table → the empty-state time check, never silence.
    const seg = await planNextSegment();
    expect(seg).not.toBeNull();
    expect(kindOf(seg!)).toBe("time_check");
    expect(seg!.script).toMatch(/listening to Aqua Static/);
    expect(seg!.audioProvider).toBe("browser");
  });

  it("announces a brand-new post as an update segment", async () => {
    await post("Need a graphing calculator at Davis Library");
    const seg = await planNextSegment();
    expect(seg).not.toBeNull();
    expect(kindOf(seg!)).toBe("update");
    expect(seg!.format).toBe("station");
    expect(seg!.script).toMatch(/graphing calculator/i);
    expect(seg!.sources.some((s) => s.isDemo)).toBe(true); // Maya is a demo user
    expect(seg!.audioProvider).toBe("browser");
  });

  it("never announces the same post twice", async () => {
    const again = await planNextSegment();
    // No new posts: the previous post is already in the announced set.
    expect(again === null || kindOf(again) !== "update" || !again!.script.match(/graphing calculator/i)).toBe(true);
  });

  it("prioritizes an official alert over updates", async () => {
    const now = Date.now();
    extItem({ type: "alert", title: "Carolina Alert: shelter in place drill", summary: "Drill on campus.", publishedAt: new Date(now), category: "alert" });
    const seg = await planNextSegment(now);
    expect(seg).not.toBeNull();
    expect(kindOf(seg!)).toBe("alert");
    expect(seg!.script).toMatch(/Alert/i);
  });

  it("announces an ingested event starting within 45 minutes", async () => {
    const now = Date.now();
    extItem({ type: "event", title: "Sunset yoga on the quad", startsAt: new Date(now + 20 * 60_000), endsAt: new Date(now + 80 * 60_000) });
    const seg = await planNextSegment(now);
    expect(kindOf(seg!)).toBe("event_soon");
    expect(seg!.script).toMatch(/yoga/i);
  });

  it("fires a roundup every 15 minutes while there's enough to say", async () => {
    const { recent } = await nextSegments(null);
    const lastRoundupAt = new Date(recent.find((s) => s.kind === "roundup")?.createdAt ?? recent[0].createdAt).getTime();
    const seg = await planNextSegment(lastRoundupAt + 16 * 60_000);
    expect(seg).not.toBeNull();
    expect(kindOf(seg!)).toBe("roundup");
    expect(seg!.format).toBe("station");
  });

  it("does a time check after five quiet minutes", async () => {
    const { recent } = await nextSegments(null);
    const lastAt = new Date(recent[0].createdAt).getTime();
    const seg = await planNextSegment(lastAt + 6 * 60_000);
    // 6 min since the last segment, no new content — roundup is < 15 min old → time_check
    expect(seg).not.toBeNull();
    expect(kindOf(seg!)).toBe("time_check");
    expect(seg!.audioProvider).toBe("browser");
    expect(seg!.script).toMatch(/listening to Aqua Static/i);
  });

  it("returns only new segments after a cursor", async () => {
    const { recent, latest } = await nextSegments(null);
    expect(recent.length).toBeGreaterThan(0);
    const again = await nextSegments(latest);
    expect(again.segments).toEqual([]);
    const after = new Date(recent[0].createdAt).getTime() + 60_000;
    await post("Anyone selling a mini fridge near Morrison?", {}, after);
    const r = await nextSegments(latest, after);
    expect(r.segments.length).toBe(1);
    expect(r.segments[0].kind).toBe("update");
    expect(r.segments[0].id).not.toBe(latest);
  });
});

describe("voice budget guard", () => {
  const sub = (remaining: number, limit = 10000) =>
    new Response(JSON.stringify({ character_limit: limit, character_count: limit - remaining }), { status: 200 });

  it("uses browser voice with no key, without touching the network", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect(await voiceFor("hello")).toBe("browser");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("uses browser voice when RADIO_VOICE=browser even with a key", async () => {
    process.env.ELEVENLABS_API_KEY = "sk-test";
    process.env.RADIO_VOICE = "browser";
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect(await voiceFor("hello")).toBe("browser");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("keeps the demo reserve: browser under the threshold, elevenlabs above it", async () => {
    process.env.ELEVENLABS_API_KEY = "sk-test";
    process.env.ELEVENLABS_RESERVE_CHARS = "3000";
    vi.stubGlobal("fetch", vi.fn(async () => sub(3100)));
    expect(await voiceFor("x".repeat(200))).toBe("browser"); // 3100 - 200 < 3000
    resetBudgetCache();
    vi.stubGlobal("fetch", vi.fn(async () => sub(9000)));
    expect(await voiceFor("x".repeat(400))).toBe("elevenlabs");
  });
});
