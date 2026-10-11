// Live call service: Aqua's conversational brain. One in-memory session per call (never persisted —
// calls are private and transcripts are not stored). Every campus fact comes from retrieval over the
// real feed; Gemini only writes the spoken line on top of it, and a local persona path covers no-key dev.

import { getLocation, findLocationInText } from "@/lib/locations";
import { interpretQueryLocal } from "@/lib/ai/fallback";
import { composeCallReply, type GroundingRecord } from "@/lib/ai";
import { fmtTime, fmtDay, HOUR } from "@/lib/time";
import { listFeed, type FeedItem } from "./feed";
import { toRecord } from "./briefings";
import { postFromText } from "./assistant";
import type { AssistantSource } from "./assistant";
import type { QueryIntent } from "@/lib/ai/types";
import type { User } from "@/lib/db/schema";

export type CallCard = AssistantSource;
export type CallTurn = {
  reply: string;
  cards: CallCard[];
  callerName: string | null;
  provider: "gemini" | "local";
  endCall: boolean;
  draftContext: string | null; // mid-draft post text — the client echoes it back so drafts survive cold sessions
  posted: { id: string; title: string; href: string } | null; // a post we just published for the caller
  acted: boolean; // the turn ran a board action — the reply matters even without Gemini
};

type Session = {
  callerName: string | null;
  history: { role: "user" | "aqua"; text: string }[];
  lastIntent: QueryIntent["intent"] | null;
  lastKeywords: string[];
  draftContext: string | null;
  touched: number;
};

export type CallContext = { history: Session["history"]; callerName: string | null; draftContext?: string | null };

const sessions = new Map<string, Session>();
const SESSION_TTL = 30 * 60 * 1000;
const MAX_SESSIONS = 60;

function getSession(id: string): Session {
  let s = sessions.get(id);
  if (!s) {
    const now = Date.now();
    for (const [k, v] of sessions) if (now - v.touched > SESSION_TTL) sessions.delete(k);
    if (sessions.size >= MAX_SESSIONS) {
      // evict the oldest
      let oldest: string | null = null;
      for (const [k, v] of sessions) if (!oldest || v.touched < sessions.get(oldest)!.touched) oldest = k;
      if (oldest) sessions.delete(oldest);
    }
    s = { callerName: null, history: [], lastIntent: null, lastKeywords: [], draftContext: null, touched: 0 };
    sessions.set(id, s);
  }
  s.touched = Date.now();
  return s;
}

export function dropSession(id: string) {
  sessions.delete(id);
}

const GREETING = "Yoooo, looks like we've got someone calling in! Welcome to Aqua FM! Who do I have on the line?";

export function startCall(sessionId: string): CallTurn {
  getSession(sessionId);
  return { reply: GREETING, cards: [], callerName: null, provider: "local", endCall: false, draftContext: null, posted: null, acted: false };
}

const NAME_RE = /^(?:hey,? |hi,? |yo,? |uh,? )?(?:i'?m|i am|it'?s|this is|my name'?s? (?:is )?|call me|they call me) ([a-z][a-z'-]{1,20})/i;
const BARE_NAME_RE = /^[a-z][a-z'-]{1,20}$/i;
const CAMPUSY = /\b(post|posts|event|events|study|group|groups|charger|help|food|bus|alert|lost|found|ride|happen|going on|news|borrow|lend|free|tonight|today|library|gym|davis|wilson|union|pit|class|exam|party|concert|game)\b/i;

function callerNameFrom(message: string, hasName: boolean): string | null {
  if (hasName) return null;
  const m = NAME_RE.exec(message.trim());
  if (m) return m[1][0].toUpperCase() + m[1].slice(1).toLowerCase();
  const t = message.trim().replace(/[.!,?]+$/, "");
  // "Aadee." as a whole message counts only when it can't be a campus topic.
  if (BARE_NAME_RE.test(t) && !CAMPUSY.test(t) && !findLocationInText(t)) return t[0].toUpperCase() + t.slice(1).toLowerCase();
  return null;
}

// ---------- grounded retrieval (the "tools" — all read-only) ----------

const src = (it: FeedItem): CallCard => ({ id: it.id, title: it.title, href: it.href, kind: `${it.type}`, at: it.startsAt ?? it.at, isDemo: it.isDemo, external: it.kind === "external" });

async function pickItems(message: string, s: Session, now: number): Promise<{ intent: QueryIntent["intent"]; picked: FeedItem[] }> {
  const intent = interpretQueryLocal(message);
  const followUp = intent.intent === "unknown" || (intent.intent === "whats_happening" && /about|what about|how about|and |also|too\b/i.test(message));
  const effIntent = followUp && s.lastIntent ? s.lastIntent : intent.intent;
  const loc = getLocation(intent.locationId) ?? findLocationInText(message);

  const base = (await listFeed({ filter: "all", window: "all", limit: 400 }, now)).items;
  const t = (it: FeedItem) => it.startsAt ?? it.at;
  const inWindow = (it: FeedItem) => {
    const tf = intent.timeframe === "any" && followUp ? "any" : intent.timeframe;
    if (tf === "now") return it.kind === "post" || it.type === "alert" || (it.startsAt != null && it.startsAt < now + 3 * HOUR);
    if (tf === "today" || tf === "tonight") return it.kind === "post" || t(it) < now + 18 * HOUR;
    if (tf === "week") return t(it) < now + 7 * 24 * HOUR;
    return true;
  };
  let pool = base.filter(inWindow);
  if (loc) {
    const near = pool.filter((it) => it.locationId === loc.id || (it.lat != null && it.lng != null && Math.hypot((it.lat - loc.lat) * 111000, (it.lng - loc.lng) * 90000) < 400));
    if (near.length) pool = near;
  }
  const kw = [...new Set([...intent.keywords, ...(followUp ? s.lastKeywords : [])])].filter((k) => k.length > 2);
  const kwMatch = (it: FeedItem) => kw.some((k) => `${it.title} ${it.summary} ${it.category}`.toLowerCase().includes(k));

  let picked: FeedItem[] = [];
  switch (effIntent) {
    case "find_help": picked = pool.filter((i) => i.type === "request"); break;
    case "find_offers": picked = pool.filter((i) => i.type === "offer"); break;
    case "events": picked = pool.filter((i) => i.type === "event"); break;
    case "food": picked = pool.filter((i) => i.category === "free_food" || /\bfood\b|\bpizza\b|\bsnack/.test(`${i.title} ${i.summary}`.toLowerCase())); break;
    case "news": picked = pool.filter((i) => i.type === "news"); break;
    case "alerts": picked = pool.filter((i) => i.type === "alert" || i.category === "alert"); break;
    case "transit": picked = pool.filter((i) => i.category === "transit"); break;
    default: picked = pool.filter((i) => i.kind === "post" || i.type !== "news" || t(i) > now - 24 * HOUR);
  }
  if (kw.length) {
    const narrowed = picked.filter(kwMatch);
    if (narrowed.length) picked = narrowed;
    else if (["find_offers", "find_help", "events"].includes(effIntent)) picked = pool.filter(kwMatch);
  }
  picked = picked.slice(0, 6);
  s.lastIntent = effIntent;
  s.lastKeywords = kw;
  return { intent: effIntent, picked };
}

// ---------- local persona composer (no Gemini needed) ----------

const first = (n: string | null | undefined) => (n ?? "").replace(/ \(demo\)$/, "").split(" ")[0];

function describe(it: FeedItem, now: number): string {
  const where = it.locationName && !it.title.includes(it.locationName) ? ` at ${it.locationName}` : "";
  const when = it.startsAt && it.startsAt > now ? ` ${fmtDay(it.startsAt)} at ${fmtTime(it.startsAt)}` : "";
  if (it.kind === "external") return `${it.title}${where}${when} (via ${it.sourceLabel})`;
  const who = it.authorName ? `${first(it.authorName)} ` : "";
  return `${who}${it.type === "request" ? "is looking for" : it.type === "offer" ? "is offering" : "posted"}: ${it.title}${where}${when}`;
}

function localReply(message: string, s: Session, picked: FeedItem[], intent: string, name: string | null, now: number): string {
  const t = message.toLowerCase();
  if (name) return s.history.length <= 1
    ? `${name}! What's going on? You're live with Aqua — what's on your mind?`
    : `Nice to finally get a name, ${name}! So what's on your mind?`;
  if (/\b(bye|goodbye|gotta go|hang up|later|peace|see ya|thanks,? (that'?s all|aqua)|that'?s all)\b/.test(t)) {
    return s.callerName ? `Later, ${s.callerName}! Thanks for calling Aqua FM — stay bubbly!` : "Later! Thanks for calling Aqua FM — stay bubbly!";
  }
  if (/\b(hi|hello|hey|yo|what'?s up|sup)\b/.test(t) && t.length < 30 && !picked.length) {
    return s.callerName ? `Hey ${s.callerName}! What can I find for you on campus?` : "Hey hey! You're on with Aqua — what's on your mind?";
  }
  if (/\bthank/.test(t)) return "Anytime! That's literally what I'm here for. Anything else?";
  if (/\bwho are you\b|\bwhat are you\b/.test(t)) {
    return "I'm Aqua — the AI radio host running Aqua FM, live from the Pit. I read the real campus board and chat with callers like you!";
  }
  if (/\bweather\b/.test(t)) return "Honestly? I'm a radio — I don't get out much. The board doesn't track weather, but I can tell you what's happening on campus!";
  if (!picked.length) {
    return intent === "whats_happening" || intent === "unknown"
      ? "Honestly, the board's a little quiet right now — nothing matching that is posted. Try asking about requests, events, free food, or lost and found!"
      : "Ahh, I'm not seeing anything about that on the board right now. Want to try another category — maybe events, requests, or free food?";
  }
  const demo = picked.some((i) => i.isDemo) ? " Heads up, that's demo data by the way." : "";
  const one = describe(picked[0], now);
  const more = picked.length > 1 ? ` Also: ${describe(picked[1], now)}.` : "";
  const cta = picked.some((i) => i.kind === "post") ? " If that sounds like you, the post is in Connect." : "";
  const lead = { find_help: "Someone needs a hand!", find_offers: "Ooh, check this out —", events: "On the calendar —", food: "Food radar says —", alerts: "Heads up on this one —", news: "In the news —", transit: "Transit-wise —" }[intent] ?? "So here's what the board says —";
  return `${lead} ${one}.${more}${demo}${cta}`;
}

// Intents that clearly mean "answer a question" — a short fragment like "Davis" or "a Chromebook
// charger" mid-draft completes the post instead of changing the topic.
const RETRIEVAL_INTENTS = new Set(["whats_happening", "find_help", "find_offers", "events", "food", "transit", "news", "alerts"]);
const QUESTIONY = /^(what|what'?s|who|where|when|which|how|any|is|are|do|does|show|list|tell me|can you tell|could you tell)\b|\?\s*$/i;
const CANCEL = /^(?:nah|nope|no thanks?|never ?mind|nvm|forget it|cancel|stop|don'?t post|actually never mind)[.!\s]*$/i;

// ---------- the turn ----------

export async function callTurn(sessionId: string, message: string, now = Date.now(), context?: CallContext, user: User | null = null): Promise<CallTurn> {
  // The browser carries its own recent transcript. This is conversation context,
  // never identity/authorization, and avoids relying on one warm Vercel instance.
  const previous = context?.history.slice().reverse().filter((line) => line.role === "user")
    .map((line) => interpretQueryLocal(line.text)).find((intent) => intent.intent !== "unknown");
  const s: Session = context ? {
    callerName: context.callerName, history: context.history.map((line) => ({ ...line })),
    lastIntent: previous?.intent ?? null, lastKeywords: previous?.keywords ?? [],
    draftContext: context.draftContext ?? null, touched: now,
  } : getSession(sessionId);
  const nameGuess = callerNameFrom(message, !!s.callerName);
  if (nameGuess) s.callerName = nameGuess;

  const done = (turn: Omit<CallTurn, "callerName">): CallTurn => {
    s.history.push({ role: "user", text: message }, { role: "aqua", text: turn.reply });
    if (s.history.length > 16) s.history.splice(0, s.history.length - 16);
    return { ...turn, callerName: s.callerName };
  };

  // ---- write tool: posting to the board for the caller ----
  const local = interpretQueryLocal(message);
  if (s.draftContext && CANCEL.test(message)) {
    s.draftContext = null;
    return done({ reply: "No worries — scrapped that draft. What else is on your mind?", cards: [], provider: "local", endCall: false, draftContext: null, posted: null, acted: true });
  }
  const wantsPost = local.intent === "create_post";
  const newTopic = QUESTIONY.test(message) || (RETRIEVAL_INTENTS.has(local.intent) && message.split(/\s+/).length > 6);
  if (wantsPost || (s.draftContext && !newTopic)) {
    const text = wantsPost ? message : `${s.draftContext}. ${message}`;
    const res = await postFromText(user, text, now);
    const kindLabel = res.draft.type === "event" ? "an event" : res.draft.type === "offer" ? "an offer" : res.draft.type === "request" ? "a request" : `a ${res.draft.type}`;
    if (res.outcome === "missing") {
      s.draftContext = text.slice(0, 700);
      const ask = res.missing.includes("location") ? (res.draft.type === "event" ? "where on campus is it happening?" : "where are you on campus?")
        : res.missing.includes("time") ? "when does it start?"
        : res.draft.category === "ride" ? "where are you headed?" : "what exactly is the item?";
      return done({ reply: `On it — posting ${kindLabel}: "${res.draft.title}". Quick thing first: ${ask}`, cards: [], provider: res.draft.provider, endCall: false, draftContext: s.draftContext, posted: null, acted: true });
    }
    if (res.outcome === "invalid") {
      return done({ reply: `I drafted "${res.draft.title}" but a couple of details need a human eye — mind finishing it in the Connect tab?`, cards: [], provider: res.draft.provider, endCall: false, draftContext: s.draftContext, posted: null, acted: true });
    }
    s.draftContext = null;
    const loc = getLocation(res.draft.locationId);
    const where = loc ? ` at ${loc.name}` : "";
    const matched = res.matchCount ? ` It already matched ${res.matchCount} other post${res.matchCount > 1 ? "s" : ""}!` : "";
    const href = `/connect?post=${res.post.id}`;
    const card: CallCard = { id: res.post.id, title: res.post.title, href, kind: res.post.type, at: res.post.startsAt?.getTime() ?? res.post.createdAt.getTime(), isDemo: false, external: false };
    return done({ reply: `Done — "${res.post.title}" is live on Connect${where}.${matched} Anything else?`, cards: [card], provider: res.draft.provider, endCall: false, draftContext: null, posted: { id: res.post.id, title: res.post.title, href }, acted: true });
  }
  // A clear topic change drops any half-finished draft, same as the chat assistant.
  if (newTopic) s.draftContext = null;

  const { intent, picked } = await pickItems(message, s, now);
  const records: GroundingRecord[] = picked.map(toRecord);

  const ai = await composeCallReply({ message, history: s.history, records, callerName: s.callerName, now });
  let reply: string;
  let cards = picked;
  let provider: CallTurn["provider"] = "local";
  let endCall = /\b(bye|goodbye|hang up|see ya|later)\b/i.test(message);
  if (ai) {
    reply = ai.reply;
    provider = "gemini";
    if (ai.callerName && !s.callerName) s.callerName = ai.callerName;
    if (ai.cardIds.length) {
      const chosen = picked.filter((p) => ai.cardIds.includes(p.id));
      if (chosen.length) cards = chosen;
    }
    endCall = endCall || ai.endCall;
  } else {
    reply = localReply(message, s, picked, intent, nameGuess, now);
    // Local path: only show cards when records were actually referenced.
    if (!picked.length) cards = [];
  }

  return done({ reply, cards: cards.map(src), provider, endCall, draftContext: s.draftContext, posted: null, acted: false });
}

export function endCall(sessionId: string): { reply: string } {
  const s = sessions.get(sessionId);
  sessions.delete(sessionId);
  const name = s?.callerName;
  return {
    reply: name
      ? `That was fun, ${name}! Catch you on the airwaves — Aqua FM, out!`
      : "That was fun! Catch you on the airwaves — Aqua FM, out!",
  };
}
