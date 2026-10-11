// The 24/7 station planner. Pure decision logic — no timers. The client's poll (GET /api/station) drives it:
// each call creates at most ONE new segment when the rules qualify, then returns anything new for playback.

import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { newId } from "@/lib/ids";
import { bump } from "@/lib/realtime";
import { fmtTime, fmtDay, HOUR, MINUTE } from "@/lib/time";
import { composeStationLine } from "@/lib/ai";
import { voiceFor } from "@/lib/voice/budget";
import { listFeed, type FeedItem } from "./feed";
import { generateBriefing, toRecord } from "./briefings";
import type { Briefing, BriefingSourceRef } from "@/lib/db/schema";

export const STATION_KINDS = ["alert", "update", "event_soon", "roundup", "time_check"] as const;
export type StationKind = (typeof STATION_KINDS)[number];

const KIND_TITLE: Record<StationKind, string> = {
  alert: "Official alert",
  update: "Campus update",
  event_soon: "Event starting soon",
  roundup: "Campus roundup",
  time_check: "Time check",
};

const EVENT_SOON_WINDOW = 45 * MINUTE;
const ROUNDUP_EVERY = 15 * MINUTE;
const TIME_CHECK_AFTER = 5 * MINUTE;
const FIRST_SEGMENT_POST_WINDOW = 10 * MINUTE; // on a cold start, only announce genuinely fresh posts
const FIRST_SEGMENT_ALERT_WINDOW = 2 * HOUR;

async function stationRows(limit = 60): Promise<Briefing[]> {
  return (await getDb().select().from(schema.briefings).where(eq(schema.briefings.format, "station")).orderBy(desc(schema.briefings.createdAt)).limit(limit));
}

/** The segment kind is stored in `length` for station rows (the column is unused there). */
export function kindOf(b: Briefing): StationKind {
  return (STATION_KINDS as readonly string[]).includes(b.length) ? (b.length as StationKind) : "update";
}

export type StationSegmentClient = {
  id: string;
  kind: StationKind;
  title: string;
  text: string;
  sources: BriefingSourceRef[];
  includesDemo: boolean;
  audioProvider: string;
  wordCount: number;
  createdAt: string;
};

const toClient = (b: Briefing): StationSegmentClient => ({
  id: b.id, kind: kindOf(b), title: b.title, text: b.script, sources: b.sources, includesDemo: b.includesDemo,
  audioProvider: b.audioProvider, wordCount: b.wordCount, createdAt: b.createdAt.toISOString(),
});

const refOf = (it: FeedItem): BriefingSourceRef => ({ kind: it.kind === "post" ? "post" : "external", id: it.refId, title: it.title, href: it.url ?? it.href, at: it.startsAt ?? it.at, isDemo: it.isDemo });
const announcedKey = (s: BriefingSourceRef) => `${s.kind}:${s.id}`;
const itemKey = (it: FeedItem) => `${it.kind === "post" ? "post" : "external"}:${it.refId}`;
const words = (t: string) => t.split(/\s+/).filter(Boolean).length;
const firstName = (it: FeedItem) => (it.authorName ?? "").replace(/ \(demo\)$/, "").split(" ")[0] || "Someone";

// ---------- local template writers (used when Gemini is off or fails) ----------

function localPostLine(it: FeedItem): string {
  const title = it.title.replace(/ \((simulated|demo)\)$/i, "");
  const where = it.locationName && !title.includes(it.locationName) ? ` at ${it.locationName}` : "";
  const demo = it.isDemo ? " — that's a demo post" : "";
  if (it.type === "request") return `${firstName(it)} is looking for help: ${title}${where}${demo}`;
  if (it.type === "offer") return `${firstName(it)} is offering: ${title}${where}${demo}`;
  return `${firstName(it)} posted: ${title}${where}${demo}`;
}

// Rotating lead-ins so back-to-back local segments don't all open the same way.
const UPDATE_OPENERS = [
  "Here's what's going on",
  "New on the board",
  "Quick update for you",
  "Fresh on Aqua Static",
];
const UPDATE_CTAS = [
  "If you can help, reply in Connect",
  "You can jump on that in Connect",
  "Check it out in Connect if that sounds like you",
];
const SOON_OPENERS = ["Starting soon", "Coming up shortly", "Heads up, this is about to start"];
const pick = <T,>(arr: T[], seed: number) => arr[Math.abs(Math.floor(seed)) % arr.length];

function localScript(kind: StationKind, items: FeedItem[], liveCount: number, now: number): string {
  const rot = now / MINUTE; // rotates the opener roughly once a minute
  switch (kind) {
    case "update": {
      const lines = items.slice(0, 3).map(localPostLine).join(". ");
      const cta = items.some((i) => i.type === "request") ? pick(UPDATE_CTAS, rot) : "Details are in Connect";
      return `${pick(UPDATE_OPENERS, rot)}: ${lines}. ${cta}.`;
    }
    case "event_soon": {
      const it = items[0];
      return `${pick(SOON_OPENERS, rot)}: ${it.title} at ${fmtTime(it.startsAt)}${it.locationName ? `, ${it.locationName}` : ""}${it.sourceLabel ? `, via ${it.sourceLabel}` : ""}.`;
    }
    case "alert": {
      const it = items[0];
      const detail = it.summary && it.summary !== it.title ? ` ${it.summary.split(/\s+/).slice(0, 20).join(" ")}.` : "";
      return `Heads up, Carolina. ${it.sourceLabel} reports: ${it.title}.${detail} Full details are on Alert Carolina.`;
    }
    case "time_check": {
      const live = liveCount > 0 ? `${liveCount} ${liveCount === 1 ? "thing is" : "things are"} live on the board right now.` : "The board is quiet right now.";
      return `It's ${fmtTime(now)} on ${fmtDay(now)} — you're listening to Aqua FM. ${live}`;
    }
    default:
      return "";
  }
}

// ---------- segment creation ----------

async function createSegment(kind: StationKind, items: FeedItem[], liveCount: number, now: number): Promise<Briefing> {
  const db = getDb();
  if (kind === "roundup") {
    // Reuse the existing Campus Flash writer (Gemini when configured, local template otherwise).
    const b = await generateBriefing(null, { format: "flash", length: "short", interests: [] }, now);
    const audioProvider = await voiceFor(b.script);
    (await db.update(schema.briefings).set({ format: "station", length: "roundup", title: KIND_TITLE.roundup, audioProvider }).where(eq(schema.briefings.id, b.id)));
    return { ...b, format: "station", length: "roundup", title: KIND_TITLE.roundup, audioProvider };
  }

  const records = items.map((it) => toRecord(it));
  let text = (kind === "update" || kind === "event_soon" || kind === "alert") ? await composeStationLine(kind, records, now) : null;
  let provider: "gemini" | "local" = "gemini";
  if (!text) { text = (await localScript(kind, items, liveCount, now)); provider = "local"; }

  const audioProvider = kind === "time_check" ? "browser" : await voiceFor(text);
  const row: Briefing = {
    id: newId("b"), userId: null, format: "station", title: KIND_TITLE[kind], script: text,
    segments: [{ title: kind, text, refs: items.map((i) => i.id) }],
    sources: items.map(refOf), interests: [], length: kind,
    includesDemo: items.some((i) => i.isDemo), provider, audioProvider, audioRef: null,
    wordCount: words(text), createdAt: new Date(now),
  };
  (await db.insert(schema.briefings).values(row));
  bump("briefings");
  return row;
}

/** Decide which single segment to create, if any. Priority: alert → update → event_soon → roundup → time_check. */
export async function planNextSegment(now = Date.now()): Promise<Briefing | null> {
  const recent = (await stationRows(30));
  const announced = new Set(recent.flatMap((b) => b.sources.map(announcedKey)));
  const fresh = (it: FeedItem) => !announced.has(itemKey(it));
  const lastAt = recent[0]?.createdAt.getTime() ?? 0;
  const lastRoundup = recent.find((b) => kindOf(b) === "roundup")?.createdAt.getTime() ?? 0;

  const { items } = (await listFeed({ filter: "all", window: "recent", limit: 300 }, now));

  // 1. Official alerts first — new ones since the last segment (or last 2h on a cold start).
  const alertSince = lastAt || now - FIRST_SEGMENT_ALERT_WINDOW;
  const alerts = items.filter((i) => i.type === "alert" && i.at > alertSince && fresh(i));
  if (alerts.length) return (await createSegment("alert", [alerts[0]], items.length, now));

  // 2. New community posts since the last segment (or last 10min on a cold start).
  const postSince = lastAt || now - FIRST_SEGMENT_POST_WINDOW;
  const updates = items.filter((i) => i.kind === "post" && i.createdAt > postSince && fresh(i));
  if (updates.length) return (await createSegment("update", updates.slice(0, 3), items.length, now));

  // 3. An ingested event starting within 45 minutes that hasn't been announced.
  const soon = items.filter((i) => i.type === "event" && i.startsAt != null && i.startsAt > now && i.startsAt <= now + EVENT_SOON_WINDOW && fresh(i));
  if (soon.length) return (await createSegment("event_soon", [soon.sort((a, b) => a.startsAt! - b.startsAt!)[0]], items.length, now));

  // 4. Roundup: immediately on sign-on (never done one) then every 15 min, when there's enough to say.
  if ((lastRoundup === 0 || now - lastRoundup >= ROUNDUP_EVERY) && items.length >= 3) {
    return createSegment("roundup", [], items.length, now);
  }

  // 5. Time check after 5 quiet minutes — and the honest empty-state on a cold start with nothing to report.
  if (lastAt === 0 || now - lastAt >= TIME_CHECK_AFTER) return createSegment("time_check", [], items.length, now);

  return null;
}

export type StationResponse = { segments: StationSegmentClient[]; recent: StationSegmentClient[]; latest: string | null };

/** GET /api/station?after=<lastSegmentId>. Idempotent: creates at most one segment, returns what the client missed. */
export async function nextSegments(after: string | null, now = Date.now()): Promise<StationResponse> {
  try {
    await planNextSegment(now);
  } catch (e) {
    console.warn("[station] planner failed:", (e as Error).message);
  }
  const rows = (await stationRows(60));
  const recent = rows.slice(0, 15).map(toClient);
  const latest = rows[0]?.id ?? null;

  let segments: StationSegmentClient[] = [];
  if (after) {
    const idx = rows.findIndex((r) => r.id === after);
    if (idx === -1) return { segments: [], recent, latest }; // id fell off the window — client re-syncs to latest
    segments = rows.slice(0, idx).map(toClient).reverse(); // chronological for playback
  }
  return { segments, recent, latest };
}
