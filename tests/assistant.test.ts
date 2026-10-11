import { beforeEach, describe, expect, it, vi } from "vitest";
import { interpretQueryLocal } from "@/lib/ai/fallback";
import { getLocation } from "@/lib/locations";
import type { FeedItem } from "@/lib/services/feed";

const mocks = vi.hoisted(() => ({ feed: vi.fn(), compose: vi.fn() }));
vi.mock("@/lib/services/feed", () => ({ listFeed: mocks.feed }));
vi.mock("@/lib/ai", () => ({
  interpretQuery: async (q: string) => ({ ...interpretQueryLocal(q), provider: "local" }),
  composeAnswer: mocks.compose, parsePost: vi.fn(),
}));
vi.mock("@/lib/services/briefings", () => ({ toRecord: (i: FeedItem) => ({ id: i.id, title: i.title, detail: i.summary }) }));
vi.mock("@/lib/services/transit", () => ({ loadTransit: vi.fn(), OFFICIAL_TRACKING_URL: "https://mychtransit.org/" }));
const { ask } = await import("@/lib/services/assistant");
const now = Date.parse("2026-10-11T16:00:00Z");
function item(id: string, locationId: string, type = "event", startsAt = now + 3600000): FeedItem {
  const loc = getLocation(locationId)!;
  return { id, title: id, summary: "Campus activity", type, kind: "external", category: "event",
    locationId, lat: loc.lat, lng: loc.lng, locationName: loc.name, startsAt, endsAt: startsAt + 3600000,
    at: startsAt, href: `/discover?item=${id}`, isDemo: false } as FeedItem;
}
beforeEach(() => { mocks.feed.mockReset(); mocks.compose.mockReset(); mocks.compose.mockResolvedValue(null); });
describe("assistant follow-ups and grounding", () => {
  it("keeps events intent for Davis Library after a Polk Place question", async () => {
    mocks.feed.mockResolvedValue({ items: [item("wilson-event", "wilson-library"), item("charger", "davis-library", "request")] });
    const r = await ask(null, "davis library?", now, ["what events are happening near polk place"]);
    expect(r.intent).toBe("events");
    expect(r.sources.map((s) => s.id)).toEqual(["wilson-event"]);
    expect(mocks.compose.mock.calls[0][0]).toContain("Search intent: events");
    expect(mocks.compose.mock.calls[0][0]).toContain("location: Davis Library");
  });
  it("does not replace missing nearby events with distant campus events", async () => {
    mocks.feed.mockResolvedValue({ items: [item("distant-event", "chase")] });
    const r = await ask(null, "events near Polk Place", now);
    expect(r.sources).toEqual([]);
    expect(r.answer).toContain("within 350 metres of Polk Place");
    expect(mocks.compose).not.toHaveBeenCalled();
  });
  it("shows only the records actually cited by Gemini", async () => {
    mocks.feed.mockResolvedValue({ items: [item("one", "davis-library"), item("two", "wilson-library")] });
    mocks.compose.mockResolvedValue({ answer: "An event at Wilson.", citedIds: ["two", "invented-id"] });
    const r = await ask(null, "events near Davis", now);
    expect(r.provider).toBe("gemini");
    expect(r.sources.map((s) => s.id)).toEqual(["two"]);
  });
  it("preserves today's window for follow-ups and excludes past and tomorrow's events", async () => {
    mocks.feed.mockResolvedValue({ items: [item("past", "davis-library", "event", now - 7200000),
      item("today", "davis-library"), item("tomorrow", "davis-library", "event", now + 86400000)] });
    const r = await ask(null, "Davis Library?", now, ["events today near Polk Place"]);
    expect(r.sources.map((s) => s.id)).toEqual(["today"]);
  });
  it("does not attach retrieved records when Gemini cites none", async () => {
    mocks.feed.mockResolvedValue({ items: [item("one", "davis-library")] });
    mocks.compose.mockResolvedValue({ answer: "The records do not answer that question.", citedIds: [] });
    expect((await ask(null, "events near Davis", now)).sources).toEqual([]);
  });
});
