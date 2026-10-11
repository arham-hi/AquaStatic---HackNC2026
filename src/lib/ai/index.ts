// The AI interface the rest of the app talks to. Each capability tries Gemini when configured and
// falls back to deterministic local logic. Callers get `provider` back so the UI can be honest about it.

import { hasGemini } from "@/lib/env";
import { LOCATIONS, getLocation } from "@/lib/locations";
import { generateJson } from "./gemini";
import { parsePostLocal, interpretQueryLocal } from "./fallback";
import {
  ParsedPostSchema, QueryIntentSchema, AssistantAnswerSchema, BriefingScriptSchema, ExternalClassificationSchema, CallReplySchema,
  type ParseResult, type QueryIntent, type BriefingScript,
} from "./types";
import type { BriefingFormat } from "@/lib/db/schema";

const LOCATION_LIST = LOCATIONS.map((l) => `${l.id} = ${l.name}${l.aliases.length ? ` (aka ${l.aliases.join(", ")})` : ""}`).join("\n");

const SYSTEM = `You are the structuring engine for Aqua Static, a real-time campus coordination app at UNC-Chapel Hill.
Be precise. Never invent details that are not in the input. Use null when something is not stated.
Known campus locations (use the id, or null if none clearly matches):
${LOCATION_LIST}`;

export async function parsePost(raw: string, now = Date.now()): Promise<ParseResult> {
  const local = parsePostLocal(raw, now);
  if (!hasGemini()) return { ...local, provider: "local" };
  try {
    const ai = await generateJson(
      `Interpret this student message for the campus board. Decide if it is a request (asking for something), an offer (providing something/help, or reporting a found item), an event, news, an alert, or a notice.
Categories: borrowing (short loans of items), giveaway (giving something away for keeps: furniture, fridges, move-out stuff; "offer" when giving, "request" when looking for one), tutoring (academic help), study (study partners), lost_found, free_food, ride, event, news, alert, transit, other.
powerClass only for chargers/cables: laptop (can power a laptop), phone, cable (just a cable).
destination = for rides only, where the person is going (e.g. "RDU Airport", "Harris Teeter"); null otherwise.
durationMinutes = how long the post stays relevant if stated (e.g. "for 45 mins", "until 5pm" relative to now). startsInMinutes if the thing starts later.
List in "missing" what a human must confirm: location (if none is clear), time, item.
Current campus time: ${new Date(now).toLocaleString("en-US", { timeZone: "America/New_York" })}.

Message: ${JSON.stringify(raw)}`,
      ParsedPostSchema,
      { system: SYSTEM, temperature: 0.1 },
    );
    // Guard: never trust an out-of-registry location id.
    const locationId = ai.locationId && getLocation(ai.locationId) ? ai.locationId : local.locationId;
    const missing = new Set(ai.missing);
    if (!locationId && ["borrowing", "giveaway", "tutoring", "study", "lost_found", "free_food"].includes(ai.category)) missing.add("location");
    if (locationId) missing.delete("location");
    return { ...ai, locationId, missing: Array.from(missing), item: ai.item ?? local.item, powerClass: ai.powerClass ?? local.powerClass, provider: "gemini" };
  } catch (e) {
    console.warn("[ai] parsePost fell back to local:", (e as Error).message);
    return { ...local, provider: "local" };
  }
}

export async function interpretQuery(q: string): Promise<QueryIntent & { provider: "gemini" | "local" }> {
  const local = interpretQueryLocal(q);
  if (!hasGemini()) return { ...local, provider: "local" };
  try {
    const ai = await generateJson(
      `Classify this question to the campus assistant. intents: whats_happening (general), find_help (who needs help / open requests), find_offers (who can help / has an item), events, food, transit, news, alerts, near_location (asks about a place), create_post (user wants to post something — a request, offer, event, announcement; e.g. "i need a charger", "post an event", "i'm hosting a study session"), unknown.\nQuestion: ${JSON.stringify(q)}`,
      QueryIntentSchema,
      { system: SYSTEM, temperature: 0 },
    );
    return { ...ai, locationId: ai.locationId && getLocation(ai.locationId) ? ai.locationId : local.locationId, provider: "gemini" };
  } catch {
    return { ...local, provider: "local" };
  }
}

export type GroundingRecord = { id: string; kind: string; title: string; detail: string; at: string; isDemo: boolean; href: string };

/** Compose a grounded answer. Returns null when Gemini is not available (caller uses the local template). */
export async function composeAnswer(question: string, records: GroundingRecord[]): Promise<{ answer: string; citedIds: string[] } | null> {
  if (!hasGemini()) return null;
  try {
    return await generateJson(
      `Answer the student's question using ONLY the records below. If the records do not answer it, say you could not find verified information and suggest where to look (calendar.unc.edu, alertcarolina.unc.edu, mychtransit.org). Keep it under 120 words, friendly, specific, with times. Mention when something is DEMO data. Return citedIds = ids of records you used.

Question: ${JSON.stringify(question)}

Records:
${records.map((r) => `[${r.id}] (${r.kind}${r.isDemo ? ", DEMO" : ""}) ${r.title} — ${r.detail} — ${r.at}`).join("\n") || "(none)"}`,
      AssistantAnswerSchema,
      { system: SYSTEM, temperature: 0.4 },
    );
  } catch (e) {
    console.warn("[ai] composeAnswer failed:", (e as Error).message);
    return null;
  }
}

export async function composeBriefingScript(
  format: BriefingFormat, length: "short" | "medium" | "long", interests: string[], records: GroundingRecord[], now = Date.now(),
): Promise<BriefingScript | null> {
  if (!hasGemini()) return null;
  const f = format === "station" ? "radio" : format; // station rows are written by the station service, not here
  const words = { flash: { short: 70, medium: 110, long: 150 }, radio: { short: 220, medium: 320, long: 420 }, podcast: { short: 400, medium: 600, long: 800 }, digest: { short: 120, medium: 200, long: 300 }, letter: { short: 180, medium: 280, long: 400 } }[f][length];
  const style = {
    flash: "a 30-60 second 'Campus Flash' spoken briefing. Punchy, no filler.",
    radio: "a friendly 2-3 minute 'Aqua Static Radio' show with segments: Opening, Campus updates, Upcoming events, Community needs & opportunities, Transit, Closing.",
    podcast: "a conversational single-host podcast deep dive. Give context and texture, but only from the records.",
    digest: "a written text digest with short highlight bullets per segment. Plain text, no markdown symbols.",
    letter: "a warm written newsletter titled 'Your Carolina Letter', with short sections and a sign-off.",
  }[f];
  try {
    return await generateJson(
      `You are Aqua, a charming, youthful student radio host on Aqua FM at UNC-Chapel Hill. Write ${style} Target about ${words} words total. Date/time: ${new Date(now).toLocaleString("en-US", { timeZone: "America/New_York" })}.
Listener interests: ${interests.join(", ") || "everything"}. Prioritize records matching those interests but mention anything urgent.
Style: Sound like a real produced campus show, not a news feed. Paraphrase each story into one or two natural sentences — NEVER read a record's detail verbatim or dump titles in a list. Use varied spoken transitions between items ("Next up", "Also on the board", "If you're looking to help someone out", "Meanwhile over at") — never the same phrase twice. A warm sign-off at the end like "That's your update — now back to the music." Light personality, no excessive slang. For official alerts drop the jokes: serious, factual, calm.
Rules: Use ONLY the records. Do not invent news, events, people, or numbers. Never claim a past event is happening now — if an item's time has passed, frame it as "earlier today". Say "demo" or "simulated" for DEMO records. If a segment has no records, say briefly that nothing is posted yet and move on (or drop it). Spoken-word friendly: no URLs, no markdown, no source names like "[UNC Events]" read aloud. Each segment lists refs = record ids it used.

Records:
${records.map((r) => `[${r.id}] (${r.kind}${r.isDemo ? ", DEMO" : ""}) ${r.title} — ${r.detail} — ${r.at}`).join("\n") || "(no records)"}`,
      BriefingScriptSchema,
      { system: SYSTEM, temperature: 0.7 },
    );
  } catch (e) {
    console.warn("[ai] composeBriefingScript failed:", (e as Error).message);
    return null;
  }
}

/** One short spoken segment for the 24/7 station (update, event_soon, alert). Returns null without Gemini. */
export async function composeStationLine(kind: string, records: GroundingRecord[], now = Date.now()): Promise<string | null> {
  if (!hasGemini() || !records.length) return null;
  const style = {
    update: "a 30-second radio update announcing a brand-new post on the community board. Lead with the newest item, mention who posted (first name only), what and where, and end with a natural call to reply in Connect",
    event_soon: "a 20-second heads-up that an event starts within the hour. Give the title, place and start time, and who listed it",
    alert: "a calm, serious 20-second read of an official campus alert. No jokes, no hype. Say the source, what it says, and that details are on Alert Carolina",
  }[kind] ?? "a short radio update";
  try {
    const script = await generateJson(
      `You are Aqua, a charming, youthful student radio host on Aqua FM. Write ${style}. At most ${kind === "update" ? 60 : 45} words, one segment, spoken-word friendly, no markdown, no URLs.
Open with a short natural lead-in (vary it: "Here's what's going on", "New on the board", "Quick heads up") — not always the same phrase. Paraphrase; never read the record verbatim.
Rules: Use ONLY the records. Never invent details, people, or numbers. Say "demo" out loud for DEMO records.
Current campus time: ${new Date(now).toLocaleString("en-US", { timeZone: "America/New_York" })}.

Records:
${records.map((r) => `[${r.id}] (${r.kind}${r.isDemo ? ", DEMO" : ""}) ${r.title} — ${r.detail} — ${r.at}`).join("\n")}`,
      BriefingScriptSchema,
      { system: SYSTEM, temperature: 0.5 },
    );
    return script.segments.map((s) => s.text).join(" ").trim() || null;
  } catch (e) {
    console.warn("[ai] composeStationLine failed:", (e as Error).message);
    return null;
  }
}

/** Aqua's spoken reply during a live call. Persona lives here; grounding comes from the
 *  records the server retrieved for this turn. Returns null without Gemini (caller uses local reply). */
export async function composeCallReply(args: {
  message: string;
  history: { role: "user" | "aqua"; text: string }[];
  records: GroundingRecord[];
  callerName: string | null;
  now?: number;
}): Promise<import("./types").CallReply | null> {
  if (!hasGemini()) return null;
  const { message, history, records, callerName, now = Date.now() } = args;
  const system = `You are Aqua, the AI radio host of Aqua Static Radio (Aqua FM) at UNC-Chapel Hill — a living radio mascot taking a private listener call.
Personality: energetic, warm, funny but not obnoxious, curious about the caller, confident, occasionally playful. A real student-run radio host, never a corporate chatbot.
Rules:
- 1-3 spoken sentences MAX. Written for the ear: contractions, no markdown, no lists, no URLs.
- Answer from the RECORDS and conversation ONLY. Never invent posts, people, events, alerts or numbers.
- If records are empty for a campus question, say honestly that nothing on the board matches and suggest checking Connect or asking differently.
- Say "demo" naturally for DEMO records.
- callerName: the caller's name once they give it (null otherwise). Use it occasionally, not every line.
- If the caller is clearly saying goodbye, set endCall=true and give a short warm sign-off.
- cardIds: ids of up to 3 records you actually referenced (empty if none).
- Follow-ups like "what about CS?" refer to the previous topic — answer in context.
- This is a private call, not a broadcast. Never claim others can hear them.`;
  try {
    return await generateJson(
      `Conversation so far:
${history.slice(-10).map((h) => `${h.role === "user" ? "CALLER" : "AQUA"}: ${h.text}`).join("\n") || "(call just started)"}
Caller name so far: ${callerName ?? "unknown"}
Current campus time: ${new Date(now).toLocaleString("en-US", { timeZone: "America/New_York" })}

CALLER: ${JSON.stringify(message)}

Records retrieved for this turn (may be empty):
${records.map((r) => `[${r.id}] (${r.kind}${r.isDemo ? ", DEMO" : ""}) ${r.title} — ${r.detail} — ${r.at}`).join("\n") || "(none)"}`,
      CallReplySchema,
      { system, temperature: 0.8 },
    );
  } catch (e) {
    console.warn("[ai] composeCallReply failed:", (e as Error).message);
    return null;
  }
}

export async function classifyExternal(title: string, text: string, locationName: string | null) {
  if (!hasGemini()) return null;
  try {
    return await generateJson(
      `Classify this campus item. Give a 1-2 sentence factual summary (no hype), a category (event, news, alert, free_food, transit, study, other), and a campus locationId if the location clearly matches a known place.\nTitle: ${title}\nLocation: ${locationName ?? "unknown"}\nText: ${text.slice(0, 1200)}`,
      ExternalClassificationSchema,
      { system: SYSTEM, temperature: 0.1 },
    );
  } catch {
    return null;
  }
}
