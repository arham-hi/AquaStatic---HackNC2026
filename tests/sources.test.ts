import { describe, it, expect } from "vitest";
import { parseRss, parseLocalist, parseEngage, stripHtml } from "@/lib/sources/adapters";
import { parseCsv, parseGtfs } from "@/lib/services/transit";
import { freshDb } from "./setup";

await freshDb("sources");
const { postToFeed, externalToFeed } = await import("@/lib/services/feed");
const { getDb, schema } = await import("@/lib/db/client");
const { ensureSources, listExternalItems } = await import("@/lib/services/sources");

const RSS = `<?xml version="1.0"?><rss><channel><title>UNC News</title>
<item><title>Tar Heels &amp; friends</title><link>https://example.edu/a?utm=1</link><guid>https://example.edu/a</guid><pubDate>Fri, 10 Oct 2026 12:00:00 GMT</pubDate><description><![CDATA[<p>Hello <b>world</b></p>]]></description></item>
<item><title>Second</title><link>https://example.edu/b</link><pubDate>Fri, 10 Oct 2026 13:00:00 GMT</pubDate><description>Plain</description></item>
</channel></rss>`;

describe("source adapters", () => {
  it("parses RSS items, strips HTML and decodes entities", () => {
    const items = parseRss(RSS);
    expect(items).toHaveLength(2);
    expect(items[0].title).toBe("Tar Heels & friends");
    expect(items[0].summary).toBe("Hello world");
    expect(items[0].publishedAt).toBeTypeOf("number");
    expect(stripHtml("<a href='x'>Hi&nbsp;there &#8217;</a>")).toBe("Hi there '");
  });
  it("parses Localist and Engage payloads", () => {
    const l = parseLocalist({ events: [{ event: { id: 1, title: "Talk", description_text: "About things", localist_url: "https://calendar.unc.edu/event/talk", location_name: "Davis Library", geo: { latitude: "35.9108", longitude: "-79.0481" }, event_instances: [{ event_instance: { start: "2026-10-10T18:00:00-04:00", end: null } }] } }] });
    expect(l[0]).toMatchObject({ providerId: "1", title: "Talk", lat: 35.9108, locationName: "Davis Library" });
    const e = parseEngage({ value: [{ id: "9", name: "Club night", description: "<p>Fun</p>", startsOn: "2026-10-10T23:00:00+00:00", location: "Union 3206", latitude: "35.9102", longitude: "-79.0474", organizationName: "CS Club" }] });
    expect(e[0]).toMatchObject({ providerId: "9", url: "https://heellife.unc.edu/event/9" });
    expect(e[0].summary).toContain("CS Club");
  });
});

describe("ingestion deduplication", () => {
  it("does not insert the same dedupe key twice", async () => {
    (await ensureSources());
    const db = getDb();
    const row = { id: "unc-news:x", sourceId: "unc-news", providerId: "x", type: "news", title: "T", summary: "S", url: "https://example.edu/x", imageUrl: null, publishedAt: new Date(), startsAt: null, endsAt: null, locationName: null, lat: null, lng: null, locationId: null, category: "news" as const, dedupeKey: "unc-news:https://example.edu/x", createdAt: new Date() };
    (await db.insert(schema.externalItems).values(row).onConflictDoNothing());
    (await db.insert(schema.externalItems).values({ ...row, id: "unc-news:x2", providerId: "x2" }).onConflictDoNothing());
    expect((await listExternalItems({ type: "news" })).filter((i) => i.dedupeKey === row.dedupeKey)).toHaveLength(1);
  });
});

describe("map marker transformation", () => {
  it("maps posts and external items to a single feed shape with coordinates", () => {
    const now = new Date();
    const post = postToFeed({ id: "p1", authorId: "u", type: "request", category: "borrowing", title: "Need charger", description: "d", summary: "s", locationId: "davis-library", locationNote: null, startsAt: now, expiresAt: now, urgency: "soon", sourceStatus: "community", status: "open", keywords: [], attributes: {}, isDemo: true, createdAt: now, updatedAt: now }, { displayName: "Maya (demo)", avatar: "🔌", isDemo: true });
    expect(post).toMatchObject({ id: "post:p1", kind: "post", lat: 35.9108, lng: -79.0481, trust: "demo", locationName: "Davis Library" });
    const ext = externalToFeed({ id: "unc-calendar:1", sourceId: "unc-calendar", providerId: "1", type: "event", title: "Talk", summary: "s", url: "https://x", imageUrl: null, publishedAt: null, startsAt: now, endsAt: null, locationName: "Somewhere", lat: null, lng: null, locationId: "the-pit", category: "event", dedupeKey: "k", createdAt: now });
    expect(ext).toMatchObject({ kind: "external", trust: "official", lat: 35.9103, sourceLabel: "UNC Events Calendar" });
  });
});

describe("GTFS parsing", () => {
  it("parses CSV with quotes and builds routes with geometry and stops", () => {
    expect(parseCsv('a,b\n"x, y",2\n')).toEqual([{ a: "x, y", b: "2" }]);
    const d = parseGtfs({
      "agency.txt": "agency_id,agency_name,agency_url,agency_timezone\n1,Chapel Hill Transit,https://x,America/New_York\n",
      "routes.txt": "route_id,route_short_name,route_long_name,route_color,route_text_color,route_url\nR1,U,U - Loop,4B9CD3,FFFFFF,https://pdf\n",
      "stops.txt": "stop_id,stop_code,stop_name,stop_lat,stop_lon,location_type\nS1,100,Union,35.9098,-79.0475,0\nS2,101,Morrison,35.9052,-79.0436,0\n",
      "trips.txt": "trip_id,route_id,service_id,trip_headsign,shape_id\nT1,R1,1,Loop,SH1\n",
      "shapes.txt": "shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence\nSH1,35.9098,-79.0475,0\nSH1,35.9052,-79.0436,1\n",
      "stop_times.txt": "trip_id,arrival_time,departure_time,stop_id,stop_sequence\nT1,08:00:00,08:00:00,S1,1\nT1,08:05:00,08:05:00,S2,2\n",
      "feed_info.txt": "feed_publisher_name,feed_version\nX,v1\n",
    }, 123);
    expect(d.mode).toBe("gtfs");
    expect(d.routes).toHaveLength(1);
    expect(d.routes[0]).toMatchObject({ shortName: "U", color: "#4B9CD3", stopIds: ["S1", "S2"], headsigns: ["Loop"] });
    expect(d.routes[0].geometry.coordinates[0]).toHaveLength(2);
    expect(d.stops).toHaveLength(2);
  });
});
