// Grounded campus assistant: interpret → retrieve from our own data → compose. Never answers from thin air.

import { interpretQuery, composeAnswer, parsePost, type GroundingRecord } from "@/lib/ai";
import { getLocation, LOCATIONS } from "@/lib/locations";
import { fmtTime, fmtDay, HOUR } from "@/lib/time";
import { listFeed, type FeedItem } from "./feed";
import { toRecord } from "./briefings";
import { loadTransit, OFFICIAL_TRACKING_URL } from "./transit";
import type { ParseResult } from "@/lib/ai/types";
import type { User } from "@/lib/db/schema";

export type AssistantSource = { id: string; title: string; href: string; kind: string; at: number | null; isDemo: boolean; external: boolean };
export type AssistantReply = {
  answer: string;
  sources: AssistantSource[];
  provider: "gemini" | "local";
  intent: string;
  draft: ParseResult | null; // when the user seems to want to post something
  mapFocus: { lat: number; lng: number; label: string } | null;
};

const src = (it: FeedItem): AssistantSource => ({ id: it.id, title: it.title, href: it.href, kind: `${it.type}`, at: it.startsAt ?? it.at, isDemo: it.isDemo, external: it.kind === "external" });

const say = (it: FeedItem, now: number) => {
  const where = it.locationName && !it.title.includes(it.locationName) ? ` at ${it.locationName}` : "";
  const when = it.startsAt && it.startsAt > now ? ` (${fmtDay(it.startsAt)} ${fmtTime(it.startsAt)})` : it.kind === "post" ? ` (${fmtTime(it.at)})` : "";
  const demo = it.isDemo ? " [demo]" : "";
  const who = it.authorName ? `${it.authorName.replace(/ \(demo\)$/, "")}: ` : it.kind === "external" ? `${it.sourceLabel}: ` : "";
  return `• ${who}${it.title}${where}${when}${demo}`;
};

export async function ask(user: User | null, question: string, now = Date.now()): Promise<AssistantReply> {
  const q = question.trim();
  const intent = await interpretQuery(q);
  const loc = getLocation(intent.locationId);

  // A statement like "I need a charger at Davis" → prepare a draft, do not publish.
  if (intent.intent === "create_post") {
    const draft = await parsePost(q, now);
    return {
      answer: `Sounds like you want to post ${draft.type === "offer" ? "an offer" : "a request"}: "${draft.title}". Review the details and confirm to publish it to the map.`,
      sources: [], provider: draft.provider, intent: intent.intent, draft, mapFocus: loc ? { lat: loc.lat, lng: loc.lng, label: loc.name } : null,
    };
  }

  // ---- retrieval tools ----
  const base = listFeed({ filter: "all", window: "all", limit: 400 }, now).items;
  const inWindow = (it: FeedItem) => {
    const t = it.startsAt ?? it.at;
    if (intent.timeframe === "now") return it.kind === "post" || it.type === "alert" || (it.startsAt != null && it.startsAt < now + 3 * HOUR && (it.endsAt ?? it.startsAt) > now - HOUR);
    if (intent.timeframe === "today" || intent.timeframe === "tonight") return it.kind === "post" || t < now + 18 * HOUR;
    if (intent.timeframe === "week") return t < now + 7 * 24 * HOUR;
    return true;
  };
  let pool = base.filter(inWindow);
  if (loc) {
    const near = pool.filter((it) => it.locationId === loc.id || (it.lat != null && it.lng != null && Math.hypot((it.lat - loc.lat) * 111000, (it.lng - loc.lng) * 90000) < 350));
    pool = near.length ? near : pool;
  }
  const kw = intent.keywords.filter((k) => k.length > 2 && !LOCATIONS.some((l) => l.aliases.includes(k) || l.name.toLowerCase() === k));
  const kwMatch = (it: FeedItem) => kw.some((k) => `${it.title} ${it.summary} ${it.category}`.toLowerCase().includes(k));

  let picked: FeedItem[] = [];
  let heading = "";
  switch (intent.intent) {
    case "find_help": picked = pool.filter((i) => i.type === "request"); heading = loc ? `Open requests near ${loc.name}` : "Open requests right now"; break;
    case "find_offers": {
      const offers = pool.filter((i) => i.type === "offer");
      const hit = offers.filter(kwMatch);
      picked = hit.length ? hit : offers;
      const reqs = pool.filter((i) => i.type === "request" && kwMatch(i));
      heading = hit.length ? "People offering what you asked about" : reqs.length ? "No matching offers yet, but these people are asking for the same thing" : "Current offers";
      if (!hit.length && reqs.length) picked = reqs;
      break;
    }
    case "events": picked = pool.filter((i) => i.type === "event"); heading = `Events ${intent.timeframe === "tonight" ? "tonight" : intent.timeframe === "today" ? "today" : "coming up"}${loc ? ` near ${loc.name}` : ""}`; break;
    case "food": picked = pool.filter((i) => i.category === "free_food" || /\bfood\b|\bpizza\b|\bsnack/.test(`${i.title} ${i.summary}`.toLowerCase())); heading = "Food around campus"; break;
    case "news": picked = pool.filter((i) => i.type === "news"); heading = "Latest campus news"; break;
    case "alerts": picked = pool.filter((i) => i.type === "alert" || i.category === "alert"); heading = "Alerts and notices"; break;
    case "transit": {
      picked = pool.filter((i) => i.category === "transit" || i.type === "notice");
      const t = await loadTransit({}, now);
      const extra = t.mode === "gtfs" ? `Chapel Hill Transit schedule data lists ${t.routes.length} routes and ${t.stops.length} stops (feed: ${t.feedVersion}).` : "Live transit data is not loaded right now; showing a demo overlay only.";
      const answer = `${picked.length ? `Transit notices posted:\n${picked.map((i) => say(i, now)).join("\n")}\n\n` : "No transit notices are posted in Aqua Static right now. "}${extra} For live bus positions use the official tracker: ${OFFICIAL_TRACKING_URL}`;
      return { answer, sources: picked.map(src), provider: intent.provider, intent: intent.intent, draft: null, mapFocus: null };
    }
    case "near_location": picked = pool; heading = `Around ${loc?.name ?? "campus"}`; break;
    default: picked = pool.filter((i) => i.type !== "news" || i.at > now - 24 * HOUR); heading = loc ? `Around ${loc.name}` : "Happening on campus";
  }
  if (kw.length && intent.intent !== "find_offers") {
    const narrowed = picked.filter(kwMatch);
    if (narrowed.length) picked = narrowed;
  }
  picked = picked.slice(0, 8);
  const records: GroundingRecord[] = picked.map(toRecord);

  // ---- compose ----
  const ai = await composeAnswer(q, records);
  let answer: string;
  let provider: "gemini" | "local" = "local";
  if (ai) {
    answer = ai.answer;
    provider = "gemini";
    if (ai.citedIds.length) picked = picked.filter((p) => ai.citedIds.includes(p.id)).concat(picked.filter((p) => !ai.citedIds.includes(p.id))).slice(0, 6);
  } else if (!picked.length) {
    answer = `I couldn't find anything verified in Aqua Static for that${loc ? ` near ${loc.name}` : ""}${intent.timeframe !== "any" ? ` for ${intent.timeframe}` : ""}. Nothing is posted yet. For official listings try calendar.unc.edu, alertcarolina.unc.edu for safety notices, or mychtransit.org for buses.`;
  } else {
    const demoNote = picked.some((p) => p.isDemo) ? "\n\nItems marked [demo] are simulated demonstration posts, not real campus activity." : "";
    answer = `${heading} (${picked.length}):\n${picked.map((i) => say(i, now)).join("\n")}${demoNote}`;
  }
  const focus = loc ? { lat: loc.lat, lng: loc.lng, label: loc.name } : picked[0]?.lat != null ? { lat: picked[0].lat!, lng: picked[0].lng!, label: picked[0].locationName ?? picked[0].title } : null;
  return { answer, sources: picked.map(src), provider, intent: intent.intent, draft: null, mapFocus: focus };
}
