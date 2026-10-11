// Demo mode: fictional profiles and scenario posts with times relative to now.
// Everything here is gated behind env.demoMode by the API layer. Reset only touches demo rows.
//
// The seed builds a believable campus history through the REAL service layer:
// createPost → runMatching → respondToMatch → sendMessage → completeMatch, just with
// backdated `now` values. Nothing is hardcoded into metrics — AquaImpact computes its
// numbers from these completed matches exactly like it does for real users.

import { and, eq, inArray, ne, or } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { env } from "@/lib/env";
import { bump } from "@/lib/realtime";
import { LOCATIONS } from "@/lib/locations";
import { ApiError } from "@/lib/api";
import { createPost, type CreatePostInput } from "./posts";
import { parsePost } from "@/lib/ai";
import { ensureSources } from "./sources";
import { completeMatch, respondToMatch, sendMessage } from "./connections";
import type { Post, PostAttributes, PostCategory, PostStatus, PostType, Urgency, User } from "@/lib/db/schema";

const AADEE = "u_demo_aadee";
const MAYA = "u_demo_maya";
const JORDAN = "u_demo_jordan";
const PRIYA = "u_demo_priya";
const ALEX = "u_demo_alex";
const SAM = "u_demo_sam";

export const DEMO_USERS: User[] = [
  // The demo protagonist for HackNC judging. Interests map to the app's fixed list:
  // technology/studying → academics, community/sustainability → community + free_food, events → social.
  { id: AADEE, displayName: "Aadee (Demo)", avatar: "🌊", interests: ["academics", "community", "social", "free_food"], helpSubjects: ["Computer Science"], preferredArea: "davis-library", notificationPrefs: { matches: true, messages: true, events: true, browser: false }, isDemo: true, createdAt: new Date(0) },
  { id: MAYA, displayName: "Maya (demo)", avatar: "🔌", interests: ["academics", "free_food", "community"], helpSubjects: ["Writing"], preferredArea: "davis-library", notificationPrefs: { matches: true, messages: true, events: true, browser: false }, isDemo: true, createdAt: new Date(0) },
  { id: JORDAN, displayName: "Jordan (demo)", avatar: "⚡", interests: ["social", "sports", "community"], helpSubjects: ["Computer Science"], preferredArea: "davis-library", notificationPrefs: { matches: true, messages: true, events: true, browser: false }, isDemo: true, createdAt: new Date(0) },
  { id: PRIYA, displayName: "Priya (demo)", avatar: "📐", interests: ["academics", "culture"], helpSubjects: [], preferredArea: "undergraduate-library", notificationPrefs: { matches: true, messages: true, events: true, browser: false }, isDemo: true, createdAt: new Date(0) },
  { id: ALEX, displayName: "Alex (demo)", avatar: "🧮", interests: ["academics", "career", "transit"], helpSubjects: ["Calculus", "Calculus II", "Physics"], preferredArea: "phillips-hall", notificationPrefs: { matches: true, messages: true, events: true, browser: false }, isDemo: true, createdAt: new Date(0) },
  { id: SAM, displayName: "Sam (demo)", avatar: "🍕", interests: ["free_food", "social", "news"], helpSubjects: [], preferredArea: "the-pit", notificationPrefs: { matches: true, messages: true, events: true, browser: false }, isDemo: true, createdAt: new Date(0) },
];

export function assertDemoMode() {
  if (!env.demoMode) throw new ApiError(403, "Demo mode is disabled");
}

export async function ensureDemoUsers() {
  const db = getDb();
  for (const u of DEMO_USERS) {
    (await db.insert(schema.users).values({ ...u, createdAt: new Date() }).onConflictDoUpdate({
      target: schema.users.id,
      set: { displayName: u.displayName, avatar: u.avatar, interests: u.interests, helpSubjects: u.helpSubjects, preferredArea: u.preferredArea, notificationPrefs: u.notificationPrefs, isDemo: true },
    }));
  }
}

export async function syncLocations() {
  const db = getDb();
  for (const l of LOCATIONS) {
    (await db.insert(schema.locations).values({ id: l.id, name: l.name, aliases: l.aliases, lat: l.lat, lng: l.lng, category: l.category })
      .onConflictDoUpdate({ target: schema.locations.id, set: { name: l.name, aliases: l.aliases, lat: l.lat, lng: l.lng, category: l.category } }));
  }
}

/** Remove demo posts and everything hanging off them (matches, conversations, messages, notifications of demo users). */
export async function resetDemoData() {
  const db = getDb();
  const demoUserIds = DEMO_USERS.map((u) => u.id);
  const demoPosts = (await db.select({ id: schema.posts.id }).from(schema.posts).where(or(eq(schema.posts.isDemo, true), inArray(schema.posts.authorId, demoUserIds)))).map((p) => p.id);
  await db.transaction(async (tx) => {
    if (demoPosts.length) {
      const ms = (await tx.select({ id: schema.matches.id }).from(schema.matches).where(or(inArray(schema.matches.requestPostId, demoPosts), inArray(schema.matches.offerPostId, demoPosts)))).map((m) => m.id);
      if (ms.length) {
        const cs = (await tx.select({ id: schema.conversations.id }).from(schema.conversations).where(inArray(schema.conversations.matchId, ms))).map((c) => c.id);
        if (cs.length) {
          (await tx.delete(schema.messages).where(inArray(schema.messages.conversationId, cs)));
          (await tx.delete(schema.conversationParticipants).where(inArray(schema.conversationParticipants.conversationId, cs)));
          (await tx.delete(schema.conversations).where(inArray(schema.conversations.id, cs)));
        }
        (await tx.delete(schema.matches).where(inArray(schema.matches.id, ms)));
      }
      (await tx.delete(schema.bookmarks).where(inArray(schema.bookmarks.itemId, demoPosts)));
      (await tx.delete(schema.reports).where(inArray(schema.reports.itemId, demoPosts)));
      (await tx.delete(schema.posts).where(inArray(schema.posts.id, demoPosts)));
    }
    (await tx.delete(schema.notifications).where(inArray(schema.notifications.userId, demoUserIds)));
    (await tx.delete(schema.briefings).where(eq(schema.briefings.includesDemo, true)));
  });

  bump("posts"); bump("matches"); bump("messages"); bump("notifications"); bump("briefings");
}

// ---------- Deterministic scenario ----------

type LiveSpec = {
  user: string;
  type: PostType;
  category: PostCategory;
  title: string;
  text: string;
  locationId: string;
  locationNote?: string;
  urgency?: Urgency;
  agoMin: number;          // created this many minutes ago
  liveMin: number;         // stays live this many minutes from real now
  startsInMin?: number;    // events only
  keywords: string[];
  attrs?: PostAttributes;
};

type ExchangeSpec = {
  agoMin: number;          // request posted this many minutes ago
  requester: string;
  offerer: string;
  category: PostCategory;
  requestTitle: string;
  offerTitle: string;
  requestText: string;
  offerText: string;
  requestLoc: string;
  offerLoc?: string;       // defaults to requestLoc
  keywords: string[];
  attrs: PostAttributes;
  messages: { from: "req" | "off"; text: string; atMin: number }[];
  /** Minutes after the request when the match is completed. null = stays accepted (ongoing). */
  completeMin: number | null;
  /**
   * Minutes of post life from real now. Historical posts still need a future expiry:
   * sweepExpirations retires open/matched posts on every feed read, so a post whose
   * expiry is already past would be swept mid-seed before its completion can land.
   */
  postLiveMin?: number;
};

// Completed community history. Each pair runs the full lifecycle with times spread across
// yesterday evening, last night and today. Seeded FIRST so fulfilled/resolved posts can
// never match the still-open posts below.
const COMPLETED: ExchangeSpec[] = [
  {
    agoMin: 22 * 60, requester: AADEE, offerer: JORDAN, category: "borrowing",
    requestTitle: "Needed: USB-C laptop charger at Davis Library",
    offerTitle: "Spare USB-C laptop charger headed to Davis",
    requestText: "Laptop at 4% and I'm camped at Davis Library — does anyone have a USB-C charger I can borrow for a bit?",
    offerText: "Carrying a spare USB-C laptop charger today, swinging by the Union then Davis. Happy to lend it.",
    requestLoc: "davis-library", offerLoc: "carolina-union",
    keywords: ["usb-c", "charger", "laptop"], attrs: { item: "USB-C laptop charger", powerClass: "laptop" },
    messages: [
      { from: "req", text: "You're a lifesaver — I'm on the 3rd floor by the windows, blue backpack.", atMin: 22 },
      { from: "off", text: "On my way over from the Union, be there in five.", atMin: 25 },
      { from: "req", text: "Got it! I'll bring it back down before you head out.", atMin: 31 },
    ],
    completeMin: 55,
  },
  {
    agoMin: 19 * 60, requester: PRIYA, offerer: AADEE, category: "giveaway",
    requestTitle: "Needed: graphing calculator for my stats exam",
    offerTitle: "Spare TI-84 calculator, free to keep",
    requestText: "Stats exam tomorrow and my calculator just died — does anyone have a spare TI-84 I could have or borrow?",
    offerText: "I upgraded calculators and my old TI-84 works perfectly. Free to whoever needs it — I'm at Wilson Library.",
    requestLoc: "wilson-library",
    keywords: ["calculator", "ti-84", "stats"], attrs: { item: "graphing calculator" },
    messages: [
      { from: "req", text: "Wait really? I was about to buy one tonight 😭", atMin: 20 },
      { from: "off", text: "All yours! I'm in Wilson on the first floor, come grab it whenever.", atMin: 23 },
      { from: "req", text: "Picked it up — good luck charms included I hope. Thank you!!", atMin: 36 },
    ],
    completeMin: 48,
  },
  {
    agoMin: 15 * 60 + 30, requester: ALEX, offerer: AADEE, category: "study",
    requestTitle: "Needed: people to study CS with near The Pit",
    offerTitle: "COMP study session at The Pit, all welcome",
    requestText: "Anyone studying for CS classes this evening? Looking for a group to join around The Pit.",
    offerText: "Running a chill study session at The Pit for the next couple hours — laptop stands, snacks, good vibes. Come through.",
    requestLoc: "the-pit",
    keywords: ["study", "computer science", "group"], attrs: { subject: "Computer Science" },
    messages: [
      { from: "req", text: "Is it cool if I join? Mostly reviewing for the midterm.", atMin: 18 },
      { from: "off", text: "That's literally all of us. Grab a spot at the north tables.", atMin: 21 },
    ],
    completeMin: 40,
  },
  {
    agoMin: 12 * 60, requester: SAM, offerer: AADEE, category: "borrowing",
    requestTitle: "Needed: intro psychology textbook for a day",
    offerTitle: "Can lend my psych textbook at the UL",
    requestText: "Anyone have the intro psych textbook? Left mine at home and need it for a reading at the undergrad library.",
    offerText: "I've got my psych textbook with me at the UL — borrow it for the day, just bring it back before I leave.",
    requestLoc: "undergraduate-library",
    keywords: ["textbook", "psychology", "borrow"], attrs: { item: "textbook" },
    messages: [
      { from: "req", text: "Legend. I'm upstairs in the quiet section.", atMin: 19 },
      { from: "off", text: "Dropped it at your table — sticky notes are staying in though 😄", atMin: 26 },
    ],
    completeMin: 44,
  },
  {
    agoMin: 9 * 60 + 20, requester: MAYA, offerer: SAM, category: "free_food",
    requestTitle: "Needed: anything edible near The Pit, running on fumes",
    offerTitle: "Extra pizza slices at The Pit, come grab one",
    requestText: "Studied through dinner — anyone near The Pit have extra food? Will trade gratitude and a charger.",
    offerText: "CS club ordered way too much pizza. Three slices left at our table in The Pit, first come first served.",
    requestLoc: "the-pit",
    keywords: ["pizza", "food", "hungry"], attrs: { item: "pizza" },
    messages: [
      { from: "req", text: "Be right there — saving me from a vending machine dinner.", atMin: 14 },
      { from: "off", text: "Saved you a slice with peppers, no crumbs left now.", atMin: 28 },
    ],
    completeMin: 35,
  },
  {
    agoMin: 6 * 60 + 40, requester: PRIYA, offerer: JORDAN, category: "tutoring",
    requestTitle: "Needed: help with chemistry problem set at Wilson",
    offerTitle: "Can help with chem problem sets at Wilson",
    requestText: "Stuck on the equilibrium section of the chem problem set — anyone free at Wilson Library to walk me through it?",
    offerText: "Took chem last semester and TA the lab now. I'm at Wilson for a bit, happy to work through the pset with someone.",
    requestLoc: "wilson-library",
    keywords: ["chemistry", "problem set", "tutoring"], attrs: { subject: "Chemistry" },
    messages: [
      { from: "req", text: "Second floor, corner table by the window?", atMin: 16 },
      { from: "off", text: "On my way — bring the pset, we'll start with Q3.", atMin: 18 },
      { from: "req", text: "That ICE table explanation finally made it click, thank you!", atMin: 42 },
    ],
    completeMin: 50,
  },
  {
    agoMin: 4 * 60 + 15, requester: ALEX, offerer: MAYA, category: "lost_found",
    requestTitle: "Lost: gray water bottle near Carolina Union",
    offerTitle: "Found: gray water bottle near Carolina Union",
    requestText: "Lost my gray water bottle somewhere around the Carolina Union this afternoon. Stickers on the side. Reward = coffee.",
    offerText: "Found a gray water bottle with stickers near the Union benches — describe the stickers and it's yours.",
    requestLoc: "carolina-union",
    keywords: ["water bottle", "lost", "found"], attrs: { item: "water bottle", lostOrFound: "lost" },
    messages: [
      { from: "req", text: "One is a tiny raccoon astronaut. Please tell me that's the one.", atMin: 15 },
      { from: "off", text: "Space raccoon confirmed! I'm by the main entrance.", atMin: 17 },
    ],
    completeMin: 34,
  },
  {
    agoMin: 2 * 60 + 50, requester: SAM, offerer: ALEX, category: "ride",
    requestTitle: "Needed: ride to Harris Teeter this afternoon",
    offerTitle: "Driving to Harris Teeter, two seats open",
    requestText: "Need a grocery run to Harris Teeter — anyone driving that way? Happy to chip in gas money.",
    offerText: "Heading to Harris Teeter anyway, two seats free. Leaving from Rams Head area in about half an hour.",
    requestLoc: "rams-head",
    keywords: ["ride", "groceries", "harris teeter"], attrs: { destination: "Harris Teeter" },
    messages: [
      { from: "req", text: "Perfect timing, I just finished class. Where are you parked?", atMin: 12 },
      { from: "off", text: "Rams Head deck, silver hatchback. Leaving in 20.", atMin: 14 },
    ],
    completeMin: 38,
  },
];

// An accepted-but-not-completed exchange: Aadee's "ongoing conversation" for the demo.
const ONGOING: ExchangeSpec = {
  agoMin: 2 * 60 + 10, requester: AADEE, offerer: MAYA, category: "borrowing",
  requestTitle: "Need an HDMI cable at the UL tonight",
  offerTitle: "Spare HDMI cable at the UL",
  requestText: "Group project at the UL tonight — need an HDMI cable to hook a laptop to the study room screen.",
  offerText: "Got a spare HDMI cable in my bag, I'm at the UL until late. Come by.",
  requestLoc: "undergraduate-library",
  keywords: ["hdmi", "cable", "study room"], attrs: { item: "HDMI cable", powerClass: "cable" },
  messages: [
    { from: "req", text: "Amazing — our room's on the second floor, 204.", atMin: 20 },
    { from: "off", text: "I know that one! Swing by whenever, I'm in the corner with the big headphones.", atMin: 24 },
    { from: "off", text: "Still here whenever you're ready 🙌", atMin: 118 },
  ],
  completeMin: null,
  postLiveMin: 360, // the accepted pair stays live through the whole demo session
};

// Still-open community activity. Same-item request/offer pairs below are intentional —
// they produce live suggested matches; every other pair is built to hard-reject.
const LIVE: LiveSpec[] = [
  // The headline pair for the live demo: a suggested match, never completed by the seed.
  { user: AADEE, type: "request", category: "borrowing", title: "Need a USB-C laptop charger at Davis Library", text: "Laptop at 8% at Davis Library — need a USB-C charger for the next couple of hours.", locationId: "davis-library", locationNote: "3rd floor", urgency: "soon", agoMin: 35, liveMin: 150, keywords: ["usb-c", "charger", "laptop"], attrs: { item: "USB-C laptop charger", powerClass: "laptop" } },
  { user: JORDAN, type: "offer", category: "borrowing", title: "Spare USB-C laptop charger near Carolina Union", text: "I have a spare USB-C laptop charger with me near the Carolina Union, happy to lend it for a few hours.", locationId: "carolina-union", agoMin: 12, liveMin: 200, keywords: ["usb-c", "charger", "laptop"], attrs: { item: "USB-C laptop charger", powerClass: "laptop" } },
  // A second live suggested match, with Aadee on the offer side.
  { user: MAYA, type: "request", category: "borrowing", title: "Need a graphing calculator for my exam today", text: "Exam in two hours and my calculator screen is cracked — anyone at Davis have a spare TI-84?", locationId: "davis-library", urgency: "soon", agoMin: 300, liveMin: 240, keywords: ["calculator", "ti-84", "exam"], attrs: { item: "graphing calculator" } },
  { user: AADEE, type: "offer", category: "borrowing", title: "Can lend my spare TI-84 at Davis", text: "I carry a backup TI-84 — borrow it for your exam, just drop it back at Davis after.", locationId: "davis-library", agoMin: 170, liveMin: 260, keywords: ["calculator", "ti-84"], attrs: { item: "graphing calculator" } },
  // Priya ↔ Jordan live study match at Wilson.
  { user: PRIYA, type: "request", category: "study", title: "Looking for a chemistry study partner at Wilson", text: "Reviewing chem before the quiz — anyone want to split a table at Wilson Library and quiz each other?", locationId: "wilson-library", agoMin: 250, liveMin: 260, keywords: ["chemistry", "study", "quiz"], attrs: { subject: "Chemistry" } },
  { user: JORDAN, type: "offer", category: "study", title: "Chemistry study session at Wilson, 2nd floor", text: "Running a chem review session at Wilson 2nd floor for the next few hours — come join, practice problems provided.", locationId: "wilson-library", locationNote: "2nd floor", agoMin: 130, liveMin: 240, keywords: ["chemistry", "study", "review"], attrs: { subject: "Chemistry" } },
  // Lost & found (won't match each other: different items).
  { user: ALEX, type: "request", category: "lost_found", title: "Lost: black wallet near The Pit", text: "Lost my black wallet somewhere between The Pit and the Union. OneCard inside — really need it back.", locationId: "the-pit", urgency: "urgent", agoMin: 200, liveMin: 480, keywords: ["wallet", "lost"], attrs: { item: "wallet", lostOrFound: "lost" } },
  { user: MAYA, type: "offer", category: "lost_found", title: "Found: set of keys near Student Stores", text: "Found a set of keys on a Tar Heel lanyard near Student Stores — describe them and I'll hand them over.", locationId: "student-stores", agoMin: 160, liveMin: 480, keywords: ["keys", "found"], attrs: { item: "keys", lostOrFound: "found" } },
  // Giveaways, tutoring, food, rides — the variety that makes the map feel lived-in.
  { user: SAM, type: "offer", category: "giveaway", title: "Free reusable water bottle at the Union", text: "Got a duplicate UNC water bottle at orientation — brand new, free to whoever wants it at the Carolina Union.", locationId: "carolina-union", agoMin: 400, liveMin: 420, keywords: ["water bottle", "free"], attrs: { item: "water bottle" } },
  { user: ALEX, type: "offer", category: "giveaway", title: "Free desk chair, pick up at Hinton James", text: "Moving out soon — desk chair in good shape, free to first person who can carry it out of HoJo lobby.", locationId: "hinton-james", locationNote: "lobby", agoMin: 540, liveMin: 600, keywords: ["desk chair", "free", "move out"], attrs: { item: "desk chair" } },
  { user: MAYA, type: "offer", category: "tutoring", title: "Can proofread essays at Davis tonight", text: "English major, happy to look over drafts tonight at Davis — essays, applications, anything.", locationId: "davis-library", agoMin: 330, liveMin: 300, keywords: ["writing", "essay", "proofread"], attrs: { subject: "Writing" } },
  { user: ALEX, type: "offer", category: "tutoring", title: "Can help with CS homework at Sitterson", text: "TA'd COMP 110 last year — at Sitterson for a while, come by with pset questions.", locationId: "sitterson-hall", agoMin: 280, liveMin: 300, keywords: ["computer science", "homework", "help"], attrs: { subject: "Computer Science" } },
  { user: SAM, type: "offer", category: "free_food", title: "Leftover bagels at Lenoir, still fresh", text: "Club meeting ordered too many bagels — a dozen left at our Lenoir table, come take some.", locationId: "lenoir", agoMin: 80, liveMin: 110, keywords: ["bagels", "free food"], attrs: { item: "bagels" } },
  { user: PRIYA, type: "request", category: "ride", title: "Looking for a ride to Southpoint this weekend", text: "Need to get to Southpoint Mall Saturday — anyone driving from the Granville area? Will split gas.", locationId: "granville-towers", agoMin: 700, liveMin: 700, keywords: ["ride", "southpoint", "weekend"], attrs: { destination: "Southpoint Mall" } },
  { user: JORDAN, type: "offer", category: "borrowing", title: "Can lend a compact umbrella at the UL", text: "Rain forecast — I have a spare compact umbrella at the undergrad library if anyone's stuck.", locationId: "undergraduate-library", agoMin: 230, liveMin: 320, keywords: ["umbrella", "rain"], attrs: { item: "umbrella" } },
  { user: AADEE, type: "request", category: "study", title: "Study partner for COMP 550 final", text: "Looking for someone to grind through COMP 550 review with — I'm usually at Sitterson or Davis.", locationId: "sitterson-hall", agoMin: 150, liveMin: 400, keywords: ["computer science", "study", "final"], attrs: { subject: "Computer Science" } },
  // Clearly-labeled demo event + simulated transit notice (never a fake official alert).
  { user: ALEX, type: "event", category: "event", title: "Open mic night at the Cabaret (simulated)", text: "DEMO EVENT: Open mic night at the Carolina Union Cabaret tonight, free entry, sign-ups at the door.", locationId: "carolina-union", agoMin: 500, liveMin: 560, startsInMin: 170, keywords: ["open mic", "music", "free"], attrs: {} },
  { user: JORDAN, type: "notice", category: "transit", title: "P2P running ~10 min late near Morrison (simulated)", text: "DEMO NOTICE: P2P Express looks about 10 minutes behind near Morrison this evening (simulated service notice).", locationId: "morrison-stop", agoMin: 45, liveMin: 150, keywords: ["p2p", "bus", "late"], attrs: {} },
];

const LIVE_STATUSES: PostStatus[] = ["open", "matched", "in_progress"];

/** Newest non-deleted demo post by an author with this exact title, if any. */
async function findSeedPost(authorId: string, title: string): Promise<Post | null> {
  const rows = await getDb().select().from(schema.posts).where(and(
    eq(schema.posts.authorId, authorId), eq(schema.posts.title, title), eq(schema.posts.isDemo, true), ne(schema.posts.status, "deleted"),
  ));
  return rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null;
}

function specInput(s: LiveSpec, now: number): CreatePostInput {
  return {
    description: s.text, type: s.type, category: s.category, title: s.title, summary: s.text.length > 200 ? s.text.slice(0, 197) + "…" : s.text,
    locationId: s.locationId, locationNote: s.locationNote ?? null, urgency: s.urgency ?? "low",
    expiry: "custom", expiresAt: now + s.liveMin * 60_000,
    startsAt: s.startsInMin ? now + s.startsInMin * 60_000 : null,
    keywords: s.keywords, attributes: s.attrs ?? {}, isDemo: true,
  };
}

/** Create a still-open scenario post unless a matching one already exists (idempotent). */
async function seedLive(s: LiveSpec, users: Map<string, User>, now: number) {
  const existing = await findSeedPost(s.user, s.title);
  if (existing && (LIVE_STATUSES.includes(existing.status) && (!existing.expiresAt || existing.expiresAt.getTime() > now)
    || existing.status === "fulfilled" || existing.status === "resolved")) return null;
  const { post, matches } = await createPost(users.get(s.user) ?? null, specInput(s, now), now - s.agoMin * 60_000);
  return { post, matches };
}

/**
 * Run one complete exchange — request, offer, real suggested match, both acceptances,
 * conversation, optional completion — with backdated timestamps. Skips if its request
 * post already exists, so reseeding never duplicates history.
 */
async function seedExchange(e: ExchangeSpec, users: Map<string, User>, now: number) {
  if (await findSeedPost(e.requester, e.requestTitle)) return [];
  const t0 = now - e.agoMin * 60_000;
  const postInput = (title: string, text: string, loc: string): CreatePostInput => ({
    description: text, type: title === e.requestTitle ? "request" : "offer", category: e.category, title, summary: text,
    locationId: loc, locationNote: null, urgency: "low", expiry: "custom", expiresAt: now + (e.postLiveMin ?? 90) * 60_000,
    keywords: e.keywords, attributes: { ...e.attrs, ...(e.category === "lost_found" && title !== e.requestTitle ? { lostOrFound: "found" as const } : {}) }, isDemo: true,
  });
  const requester = users.get(e.requester) ?? null;
  const offerer = users.get(e.offerer) ?? null;
  const req = await createPost(requester, postInput(e.requestTitle, e.requestText, e.requestLoc), t0);
  const offer = await createPost(offerer, postInput(e.offerTitle, e.offerText, e.offerLoc ?? e.requestLoc), t0 + 4 * 60_000);
  const match = offer.matches.find((m) => m.requestPostId === req.post.id);
  if (!match || !requester || !offerer) return [{ post: req.post, matches: [] }, offer];
  const t = (min: number) => t0 + min * 60_000;
  await respondToMatch(requester, match.id, "accept", t(12));
  const accepted = await respondToMatch(offerer, match.id, "accept", t(18));
  if (accepted.conversationId) {
    for (const m of e.messages) await sendMessage(m.from === "req" ? requester : offerer, accepted.conversationId, m.text, t(m.atMin));
  }
  if (e.completeMin != null) await completeMatch(requester, match.id, t(e.completeMin));
  return [{ post: req.post, matches: [] }, offer];
}

export async function seedDemoData(opts: { reset?: boolean } = {}) {
  (await syncLocations());
  (await ensureSources());
  (await ensureDemoUsers());
  if (opts.reset) (await resetDemoData());
  const db = getDb();
  const now = Date.now();
  const users = new Map((await db.select().from(schema.users).where(inArray(schema.users.id, DEMO_USERS.map((u) => u.id)))).map((u) => [u.id, u]));
  const out: { post: Post; matches: unknown[] }[] = [];
  // History first: completed exchanges land while no active scenario posts are open,
  // so nothing cross-matches. Then the still-open board, which produces today's live matches.
  for (const e of COMPLETED) out.push(...(await seedExchange(e, users, now)));
  out.push(...(await seedExchange(ONGOING, users, now)));
  for (const s of LIVE) {
    const made = await seedLive(s, users, now);
    if (made) out.push(made);
  }
  return out;
}

// ---------- Manual triggers (the "type it live" fallback for the judged scenario) ----------

export const DEMO_STEPS = {
  aadeeRequest: { user: AADEE, text: "Need a USB-C laptop charger at Davis Library for the next couple of hours, laptop is dying." },
  jordanOffer: { user: JORDAN, text: "I have a spare USB-C laptop charger near the Carolina Union, happy to lend it out." },
} as const;

export async function injectStep(step: keyof typeof DEMO_STEPS) {
  const s = DEMO_STEPS[step];
  (await ensureDemoUsers());
  const db = getDb();
  // Idempotent: if this demo user already has a live charger post up, reuse it instead of duplicating.
  const existing = (await db.select().from(schema.posts).where(and(
    eq(schema.posts.authorId, s.user), eq(schema.posts.isDemo, true), inArray(schema.posts.status, ["open", "matched"]),
  ))).filter((p) => /usb-c|charger/i.test(`${p.title} ${p.description}`) && (!p.expiresAt || p.expiresAt.getTime() > Date.now()))[0];
  if (existing) return { post: existing, matches: [] };
  const user = (await db.select().from(schema.users).where(eq(schema.users.id, s.user)).limit(1))[0]!;
  const parsed = await parsePost(s.text);
  return (await createPost(user, {
    description: s.text, type: parsed.type, category: parsed.category, title: parsed.title, summary: parsed.summary,
    locationId: parsed.locationId ?? (step === "aadeeRequest" ? "davis-library" : "carolina-union"), locationNote: parsed.locationNote, urgency: parsed.urgency,
    expiry: parsed.durationMinutes && parsed.durationMinutes > 90 ? "3h" : "1h", keywords: parsed.keywords,
    attributes: { item: parsed.item, subject: parsed.subject, powerClass: parsed.powerClass, durationMinutes: parsed.durationMinutes, destination: parsed.destination, lostOrFound: parsed.lostOrFound },
    isDemo: true,
  }));
}
