// Aqua Static Radio: build grounded scripts from real records, store them as immutable snapshots.

import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db/client";
import { newId } from "@/lib/ids";
import { bump } from "@/lib/realtime";
import { hasElevenLabs } from "@/lib/env";
import { fmtTime, fmtDay, greeting, HOUR } from "@/lib/time";
import { composeBriefingScript, type GroundingRecord } from "@/lib/ai";
import { listFeed, type FeedItem } from "./feed";
import { BRIEFING_FORMATS, type Briefing, type BriefingFormat, type BriefingSegment, type BriefingSourceRef, type User } from "@/lib/db/schema";

export { INTERESTS, INTEREST_LABELS } from "@/lib/constants";
import { INTERESTS } from "@/lib/constants";

export const GenerateBriefingSchema = z.object({
  format: z.enum(BRIEFING_FORMATS).default("radio").refine((f) => f !== "station", "Station segments are created by the station service, not this endpoint"),
  length: z.enum(["short", "medium", "long"]).default("medium"),
  interests: z.array(z.enum(INTERESTS)).max(9).default([]),
  topic: z.string().max(80).optional(),
});
export type GenerateBriefingInput = z.infer<typeof GenerateBriefingSchema>;

const FORMAT_TITLES: Record<BriefingFormat, string> = { flash: "Campus Flash", radio: "Aqua Static Radio", podcast: "Deep Dive", digest: "Text Digest", letter: "Your Carolina Letter", station: "Aqua FM" };

function matchesInterest(it: FeedItem, interests: string[]): boolean {
  if (!interests.length) return true;
  const t = `${it.title} ${it.summary}`.toLowerCase();
  return interests.some((i) => {
    switch (i) {
      case "academics": return ["tutoring", "study"].includes(it.category) || /\blecture\b|\bseminar\b|\bresearch\b|\bexam\b/.test(t);
      case "social": return it.type === "event" && !/\bcareer\b|\blecture\b/.test(t);
      case "free_food": return it.category === "free_food" || /\bfood\b|\bpizza\b/.test(t);
      case "sports": return /\bgame\b|\bbasketball\b|\bfootball\b|\bsoccer\b|\btar heels\b|\bathletic/.test(t);
      case "career": return /\bcareer\b|\binternship\b|\bjob\b|\bhiring\b|\bresume\b|\bnetworking\b/.test(t);
      case "community": return it.type === "request" || it.type === "offer" || it.category === "lost_found";
      case "transit": return it.category === "transit" || it.type === "notice";
      case "news": return it.type === "news";
      case "culture": return /\bart\b|\bmusic\b|\bconcert\b|\btheat|\bperformance\b|\bfilm\b|\bmuseum\b/.test(t);
      default: return false;
    }
  });
}

export function toRecord(it: FeedItem): GroundingRecord {
  const when = it.startsAt ? `${fmtDay(it.startsAt)} ${fmtTime(it.startsAt)}` : `posted ${fmtTime(it.at)}`;
  return {
    id: it.id, kind: `${it.type}/${it.category}`, title: it.title,
    detail: `${it.summary}${it.locationName ? ` @ ${it.locationName}` : ""}${it.sourceLabel ? ` [${it.sourceLabel}]` : ""}`,
    at: when, isDemo: it.isDemo, href: it.href,
  };
}

export function gatherBriefingItems(interests: string[], now = Date.now(), topic?: string) {
  const { items } = listFeed({ filter: "all", window: "recent", limit: 300, q: topic || undefined }, now);
  const alerts = items.filter((i) => i.type === "alert");
  const community = items.filter((i) => i.kind === "post" && ["request", "offer"].includes(i.type));
  const events = items.filter((i) => i.type === "event" && (i.startsAt ?? 0) > now - HOUR && (i.startsAt ?? 0) < now + 36 * HOUR);
  const news = items.filter((i) => i.type === "news");
  const transit = items.filter((i) => i.category === "transit" || i.type === "notice");
  const pick = (arr: FeedItem[], n: number) => {
    const pref = arr.filter((i) => matchesInterest(i, interests));
    return Array.from(new Set([...pref, ...arr])).slice(0, n);
  };
  return { alerts: pick(alerts, 3), community: pick(community, 6), events: pick(events, 6), news: pick(news, 5), transit: pick(transit, 3) };
}

type Buckets = ReturnType<typeof gatherBriefingItems>;

function localScript(format: BriefingFormat, length: "short" | "medium" | "long", b: Buckets, now: number): { title: string; segments: BriefingSegment[] } {
  const n = { short: 2, medium: 3, long: 5 }[length];
  const line = (it: FeedItem) => {
    const where = it.locationName && !it.title.includes(it.locationName) ? ` at ${it.locationName}` : "";
    const when = it.startsAt && it.startsAt > now ? ` at ${fmtTime(it.startsAt)}` : "";
    const demo = it.isDemo ? " (demo post)" : "";
    const who = it.authorName ? `${it.authorName.replace(/ \(demo\)$/, "")} ` : "";
    const title = it.title.replace(/ \((simulated|demo)\)$/i, "");
    if (it.type === "request") return `${who}is looking for help: ${title}${where}${demo}.`;
    if (it.type === "offer") return `${who}is offering: ${title}${where}${demo}.`;
    if (it.type === "event") return `${title}${where}${when}${it.kind === "external" ? `, via ${it.sourceLabel}` : ""}${demo}.`;
    if (it.type === "news") return `From ${it.sourceLabel}: ${it.title}.`;
    if (it.type === "alert") return `${it.sourceLabel} reports: ${it.title}. ${it.summary}`;
    return `${title}${where}${demo}.`;
  };
  const refs = (arr: FeedItem[]) => arr.map((i) => i.id);
  const segs: BriefingSegment[] = [];
  const day = fmtDay(now);
  const open = format === "letter" ? `${greeting(now)}, Carolina. It's ${day}. Here's your letter from Aqua Static, written only from what's actually posted right now.`
    : format === "flash" ? `${greeting(now)}, Carolina. Your Campus Flash for ${fmtTime(now)}.`
    : `${greeting(now)}, Carolina, and welcome to Aqua Static Radio. It's ${fmtTime(now)} on ${day}. Here's what's happening around campus right now.`;
  segs.push({ title: "Opening", text: open, refs: [] });
  if (b.alerts.length) segs.push({ title: "Important updates", text: b.alerts.slice(0, n).map(line).join(" "), refs: refs(b.alerts.slice(0, n)) });
  if (format !== "flash" || b.news.length) {
    segs.push({ title: "Campus updates", text: b.news.length ? b.news.slice(0, n).map(line).join(" ") : "No new campus news has come in from UNC News or the Daily Tar Heel in the last day.", refs: refs(b.news.slice(0, n)) });
  }
  segs.push({ title: "Upcoming events", text: b.events.length ? `Coming up: ` + b.events.slice(0, n + 1).map(line).join(" ") : "Nothing is on the calendar for the next day and a half yet. Check calendar.unc.edu for the full listing.", refs: refs(b.events.slice(0, n + 1)) });
  segs.push({ title: "Community needs & opportunities", text: b.community.length ? `In the community: ` + b.community.slice(0, n + 2).map(line).join(" ") + (b.community.some((c) => c.type === "request") ? " If you can help, open Connect and accept the match." : "") : "No open requests or offers right now. Be the first to post one in Connect.", refs: refs(b.community.slice(0, n + 2)) });
  if (format !== "flash") segs.push({ title: "Transit", text: b.transit.length ? b.transit.slice(0, n).map(line).join(" ") : "No transit notices are posted. Routes and live bus tracking are on mychtransit dot org.", refs: refs(b.transit.slice(0, n)) });
  segs.push({ title: "Closing", text: format === "letter" ? "That's your Carolina Letter. Post what you see, help who you can, and we'll write again soon. — Aqua Static" : format === "flash" ? "That's your flash. Stay sharp, Carolina." : "That's the pulse of campus for now. Post what you see, help who you can, and keep it Carolina. This has been Aqua Static Radio.", refs: [] });
  if (format === "flash") {
    // Compress: keep opening, the two most important segments, closing.
    const keep = segs.filter((s) => s.refs.length > 0).slice(0, 2);
    return { title: `Campus Flash · ${fmtTime(now)}`, segments: [segs[0], ...(keep.length ? keep : [segs[segs.length - 2]]), segs[segs.length - 1]] };
  }
  return { title: `${FORMAT_TITLES[format]} · ${fmtTime(now)}`, segments: segs };
}

export async function generateBriefing(user: User | null, input: GenerateBriefingInput, now = Date.now()): Promise<Briefing> {
  const interests = input.interests.length ? input.interests : (user?.interests ?? []);
  const b = gatherBriefingItems(interests, now, input.topic);
  const all = [...b.alerts, ...b.news, ...b.events, ...b.community, ...b.transit];
  const uniq = Array.from(new Map(all.map((i) => [i.id, i])).values());
  const records = uniq.map(toRecord);

  let script = await composeBriefingScript(input.format, input.length, interests, records, now);
  let provider: "gemini" | "local" = "gemini";
  if (!script) { script = localScript(input.format, input.length, b, now); provider = "local"; }

  // Only keep refs that point at real records we gathered.
  const known = new Map(uniq.map((i) => [i.id, i]));
  const segments = script.segments.map((s) => ({ ...s, refs: s.refs.filter((r) => known.has(r)) }));
  const usedIds = Array.from(new Set(segments.flatMap((s) => s.refs)));
  const sources: BriefingSourceRef[] = (usedIds.length ? usedIds : uniq.map((i) => i.id)).map((id) => {
    const it = known.get(id)!;
    return { kind: it.kind === "post" ? "post" : "external", id: it.refId, title: it.title, href: it.url ?? it.href, at: it.startsAt ?? it.at, isDemo: it.isDemo };
  });
  const text = segments.map((s) => s.text).join("\n\n");
  const row: Briefing = {
    id: newId("b"), userId: user?.id ?? null, format: input.format, title: script.title, script: text, segments, sources, interests, length: input.length,
    includesDemo: sources.some((s) => s.isDemo), provider, audioProvider: hasElevenLabs() ? "elevenlabs" : "browser", audioRef: null,
    wordCount: text.split(/\s+/).filter(Boolean).length, createdAt: new Date(now),
  };
  getDb().insert(schema.briefings).values(row).run();
  bump("briefings");
  return row;
}

export function listBriefings(limit = 12): Briefing[] {
  return getDb().select().from(schema.briefings).orderBy(desc(schema.briefings.createdAt)).limit(limit).all();
}

export function getBriefing(id: string): Briefing | null {
  return getDb().select().from(schema.briefings).where(eq(schema.briefings.id, id)).get() ?? null;
}

export function setBriefingAudio(id: string, audioRef: string) {
  getDb().update(schema.briefings).set({ audioRef, audioProvider: "elevenlabs" }).where(eq(schema.briefings.id, id)).run();
}
