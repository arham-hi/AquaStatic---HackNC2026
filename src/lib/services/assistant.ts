// Grounded campus assistant: interpret → retrieve from our own data → compose. Never answers from thin air.

import { interpretQuery, composeAnswer, parsePost, type GroundingRecord } from "@/lib/ai";
import { interpretQueryLocal } from "@/lib/ai/fallback";
import { getLocation, LOCATIONS } from "@/lib/locations";
import { fmtTime, fmtDay, HOUR, MINUTE, startOfCampusDay, endOfCampusDay, campusTodayAt } from "@/lib/time";
import { requireUser } from "@/lib/session";
import { listFeed, type FeedItem } from "./feed";
import { toRecord } from "./briefings";
import { loadTransit, OFFICIAL_TRACKING_URL } from "./transit";
import { createPost, CreatePostSchema, type CreatePostInput } from "./posts";
import type { ParseResult } from "@/lib/ai/types";
import type { User } from "@/lib/db/schema";

export type AssistantSource = { id: string; title: string; href: string; kind: string; at: number | null; isDemo: boolean; external: boolean };
export type AssistantReply = {
  answer: string;
  sources: AssistantSource[];
  provider: "gemini" | "local";
  intent: string;
  draft: ParseResult | null; // when the user seems to want to post something
  posted: { id: string; title: string; href: string; matches: number } | null; // a post we just published for the user
  awaiting: { context: string; missing: string[] } | null; // mid-draft: we asked for a detail and the next message completes it
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

// Intents that clearly mean "answer a question" — used to tell a topic change apart from
// a short reply ("Davis", "in an hour") that completes the post we were already drafting.
const RETRIEVAL_INTENTS = new Set(["whats_happening", "find_help", "find_offers", "events", "food", "transit", "news", "alerts"]);
const QUESTIONY = /^(what|what'?s|who|where|when|which|how|any|is|are|do|does|show|list|tell me|can you tell|could you tell)\b|\?\s*$/i;
const CANCEL = /^(?:nah|nope|no thanks?|never ?mind|nvm|forget it|cancel|stop|don'?t post|actually never mind)[.!\s]*$/i;

const LOC_REQUIRED = new Set(["borrowing", "giveaway", "tutoring", "study", "lost_found", "free_food"]);

/** What a human still has to supply before a parsed draft is publishable. */
function missingFor(d: ParseResult): string[] {
  const m = new Set<string>(d.missing);
  if (LOC_REQUIRED.has(d.category) && !d.locationId) m.add("location");
  if (d.locationId) m.delete("location");
  if (d.category === "ride" && !d.destination) m.add("item");
  if (d.type === "event" && d.startsInMinutes == null) m.add("time");
  return [...m];
}

function toCreateInput(d: ParseResult, raw: string, now: number): CreatePostInput {
  const startsAt = d.startsInMinutes != null ? now + d.startsInMinutes * MINUTE : undefined;
  const expiry: Pick<CreatePostInput, "expiry" | "expiresAt"> = startsAt != null
    ? { expiry: "custom", expiresAt: startsAt + Math.max(d.durationMinutes ?? 0, 60) * MINUTE }
    : d.durationMinutes == null
      ? { expiry: d.category === "lost_found" ? "today" : "1h" }
      : { expiry: d.durationMinutes <= 30 ? "30m" : d.durationMinutes <= 75 ? "1h" : d.durationMinutes <= 200 ? "3h" : "today" };
  return {
    description: raw.trim().slice(0, 500), type: d.type, category: d.category,
    title: d.title.trim().slice(0, 80), summary: d.summary.trim().slice(0, 200) || undefined,
    locationId: d.locationId, locationNote: d.locationNote?.slice(0, 80) ?? null,
    urgency: d.urgency, ...expiry, startsAt, keywords: d.keywords.slice(0, 12),
    attributes: { item: d.item, subject: d.subject, powerClass: d.powerClass, durationMinutes: d.durationMinutes, destination: d.destination, lostOrFound: d.lostOrFound },
  };
}

/**
 * Turn a "post this for me" message into either a published post, a follow-up question
 * for the one detail that's missing, or (channels only) a draft for explicit confirm.
 */
async function postFor(user: User | null, text: string, provider: "gemini" | "local", now: number, autoPublish: boolean): Promise<AssistantReply> {
  const draft = await parsePost(text, now);
  const loc = getLocation(draft.locationId);
  const mapFocus = loc ? { lat: loc.lat, lng: loc.lng, label: loc.name } : null;
  const p = draft.provider === "gemini" ? "gemini" : provider;
  const kindLabel = draft.type === "event" ? "an event" : draft.type === "offer" ? "an offer" : draft.type === "request" ? "a request" : `a ${draft.type}`;

  if (!autoPublish) {
    return {
      answer: `Sounds like you want to post ${draft.type === "offer" ? "an offer" : "a request"}: "${draft.title}". Review the details and confirm to publish it to the map.`,
      sources: [], provider: p, intent: "create_post", draft, posted: null, awaiting: null, mapFocus,
    };
  }

  const missing = missingFor(draft);
  if (missing.length) {
    const first = ["location", "time", "item"].find((k) => missing.includes(k))!;
    const askQ = first === "location" ? (draft.type === "event" ? "Where on campus is it happening?" : "Where are you on campus?")
      : first === "time" ? "When does it start? (\"tonight at 7\", \"in 2 hours\"…)"
      : draft.category === "ride" ? "Where are you headed?" : "What exactly is the item?";
    return {
      answer: `On it — posting ${kindLabel}: "${draft.title}". One thing first: ${askQ}`,
      sources: [], provider: p, intent: "create_post", draft, posted: null,
      awaiting: { context: text.slice(0, 700), missing }, mapFocus,
    };
  }

  const parsed = CreatePostSchema.safeParse(toCreateInput(draft, text, now));
  if (!parsed.success) {
    return {
      answer: `I drafted "${draft.title}" but a couple of details need a human eye — open the editor to publish it.`,
      sources: [], provider: p, intent: "create_post", draft, posted: null,
      awaiting: { context: text.slice(0, 700), missing: [] }, mapFocus,
    };
  }
  const me = user ?? (await requireUser());
  const { post, matches } = await createPost(me, parsed.data, now);
  const where = loc ? ` at ${loc.name}` : "";
  const matched = matches.length ? ` It already matched ${matches.length} other post${matches.length > 1 ? "s" : ""}.` : "";
  return {
    answer: `Done — "${post.title}" is live on Connect${where}.${matched} If anything's off, undo it below or edit the post from Connect.`,
    sources: [], provider: p, intent: "create_post", draft: null,
    posted: { id: post.id, title: post.title, href: `/connect?post=${post.id}`, matches: matches.length },
    awaiting: null, mapFocus,
  };
}

export async function ask(
  user: User | null, question: string,
  opts: { draftContext?: string | null; autoPublish?: boolean; now?: number; history?: string[] } = {},
): Promise<AssistantReply> {
  const now = opts.now ?? Date.now();
  const history = opts.history ?? [];
  const q = question.trim();
  const prior = opts.draftContext?.trim() || null;
  const intent = await interpretQuery(q);
  const local = interpretQueryLocal(q);
  // A short location-only follow-up changes the place, not the topic.
  if (local.intent === "near_location" && local.locationId && q.split(/\s+/).length <= 6) {
    const previous = history.slice(-8).reverse().map(interpretQueryLocal)
      .find((p) => !["near_location", "unknown", "create_post"].includes(p.intent));
    if (previous) Object.assign(intent, { ...previous, locationId: local.locationId,
      timeframe: local.timeframe === "any" ? previous.timeframe : local.timeframe });
  }
  const loc = getLocation(intent.locationId);

  if (prior && CANCEL.test(q)) {
    return { answer: "No problem — scrapped that draft. What else can I help with?", sources: [], provider: intent.provider, intent: "create_post", draft: null, posted: null, awaiting: null, mapFocus: null };
  }
  // Mid-draft: a follow-up that isn't clearly a new question continues the post we were building.
  const continuing = !!prior && (intent.intent === "create_post" || (!RETRIEVAL_INTENTS.has(intent.intent) && !QUESTIONY.test(q)));
  if (continuing || intent.intent === "create_post") {
    return postFor(user, continuing ? `${prior}. ${q}` : q, intent.provider, now, !!opts.autoPublish);
  }

  // ---- retrieval tools ----
  const base = (await listFeed({ filter: "all", window: "all", limit: 400 }, now)).items;
  const inWindow = (it: FeedItem) => {
    const t = it.startsAt ?? it.at;
    if (it.type === "event" && (it.endsAt ?? it.startsAt ?? it.expiresAt ?? t) < now) return false;
    if (intent.timeframe === "now") return it.kind === "post" || it.type === "alert" || (it.startsAt != null && it.startsAt < now + 3 * HOUR && (it.endsAt ?? it.startsAt) > now - HOUR);
    if (intent.timeframe === "today" || intent.timeframe === "tonight") {
      if (it.type !== "event" && it.kind === "post") return true;
      const begin = intent.timeframe === "tonight" ? campusTodayAt(17, 0, now) : startOfCampusDay(now);
      return t <= endOfCampusDay(now) && (it.endsAt ?? t) >= begin;
    }
    if (intent.timeframe === "week") return t < now + 7 * 24 * HOUR;
    return true;
  };
  let pool = base.filter(inWindow);
  if (loc) {
    const near = pool.filter((it) => it.locationId === loc.id || (it.lat != null && it.lng != null && Math.hypot((it.lat - loc.lat) * 111000, (it.lng - loc.lng) * 90000) < 350));
    pool = near;
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
      return { answer, sources: picked.map(src), provider: intent.provider, intent: intent.intent, draft: null, posted: null, awaiting: null, mapFocus: null };
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
  const resolvedQuestion = `${q}\nSearch intent: ${intent.intent}; timeframe: ${intent.timeframe}; location: ${loc?.name ?? "campus"}. Current campus time: ${fmtDay(now)} ${fmtTime(now)}. Records have already been filtered for this search; a nearby event need not mention the exact building in its title.`;
  const ai = records.length ? await composeAnswer(resolvedQuestion, records) : null;
  let answer: string;
  let provider: "gemini" | "local" = "local";
  if (ai) {
    answer = ai.answer;
    provider = "gemini";
    picked = picked.filter((p) => ai.citedIds.includes(p.id));
  } else if (!picked.length) {
    answer = intent.intent === "events"
      ? `No ${intent.timeframe === "any" ? "upcoming" : intent.timeframe === "now" ? "current" : intent.timeframe} events are listed in Aqua Static${loc ? ` within 350 metres of ${loc.name}` : ""}. Try another location or a wider time window. This doesn't mean there are no events—only that none match the records available here.`
      : `I couldn't find matching records in Aqua Static${loc ? ` within 350 metres of ${loc.name}` : ""}${intent.timeframe !== "any" ? ` for ${intent.timeframe}` : ""}. Try another location or a wider time window.`;
  } else {
    const demoNote = picked.some((p) => p.isDemo) ? "\n\nItems marked [demo] are simulated demonstration posts, not real campus activity." : "";
    answer = `${heading} (${picked.length}):\n${picked.map((i) => say(i, now)).join("\n")}${demoNote}`;
  }
  const focus = loc ? { lat: loc.lat, lng: loc.lng, label: loc.name } : picked[0]?.lat != null ? { lat: picked[0].lat!, lng: picked[0].lng!, label: picked[0].locationName ?? picked[0].title } : null;
  return { answer, sources: picked.map(src), provider, intent: intent.intent, draft: null, posted: null, awaiting: null, mapFocus: focus };
}
