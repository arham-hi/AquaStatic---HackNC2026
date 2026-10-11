// Demo mode: fictional, clearly labeled profiles and scenario posts with times relative to now.
// Everything here is gated behind env.demoMode by the API layer. Reset only touches demo rows.

import { eq, inArray, or } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { env } from "@/lib/env";
import { bump } from "@/lib/realtime";
import { LOCATIONS } from "@/lib/locations";
import { ApiError } from "@/lib/api";
import { createPost, type CreatePostInput } from "./posts";
import { parsePost } from "@/lib/ai";
import { ensureSources } from "./sources";
import type { User } from "@/lib/db/schema";

export const DEMO_USERS: User[] = [
  { id: "u_demo_maya", displayName: "Maya (demo)", avatar: "🔌", interests: ["academics", "free_food", "community"], helpSubjects: ["Writing"], preferredArea: "davis-library", notificationPrefs: { matches: true, messages: true, events: true, browser: false }, isDemo: true, createdAt: new Date(0) },
  { id: "u_demo_jordan", displayName: "Jordan (demo)", avatar: "⚡", interests: ["social", "sports", "community"], helpSubjects: ["Computer Science"], preferredArea: "davis-library", notificationPrefs: { matches: true, messages: true, events: true, browser: false }, isDemo: true, createdAt: new Date(0) },
  { id: "u_demo_priya", displayName: "Priya (demo)", avatar: "📐", interests: ["academics", "culture"], helpSubjects: [], preferredArea: "undergraduate-library", notificationPrefs: { matches: true, messages: true, events: true, browser: false }, isDemo: true, createdAt: new Date(0) },
  { id: "u_demo_alex", displayName: "Alex (demo)", avatar: "🧮", interests: ["academics", "career", "transit"], helpSubjects: ["Calculus", "Calculus II", "Physics"], preferredArea: "phillips-hall", notificationPrefs: { matches: true, messages: true, events: true, browser: false }, isDemo: true, createdAt: new Date(0) },
  { id: "u_demo_sam", displayName: "Sam (demo)", avatar: "🍕", interests: ["free_food", "social", "news"], helpSubjects: [], preferredArea: "the-pit", notificationPrefs: { matches: true, messages: true, events: true, browser: false }, isDemo: true, createdAt: new Date(0) },
];

export function assertDemoMode() {
  if (!env.demoMode) throw new ApiError(403, "Demo mode is disabled");
}

export async function ensureDemoUsers() {
  const db = getDb();
  for (const u of DEMO_USERS) {
    (await db.insert(schema.users).values({ ...u, createdAt: new Date() }).onConflictDoUpdate({ target: schema.users.id, set: { displayName: u.displayName, avatar: u.avatar, isDemo: true } }));
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

type Scenario = { user: string; text: string; expiry?: CreatePostInput["expiry"]; type?: CreatePostInput["type"]; category?: CreatePostInput["category"]; title?: string; startsInMin?: number };

// Maya's charger request and Jordan's offer are intentionally NOT seeded: they are the live part of the demo.
const SCENARIOS: Scenario[] = [
  { user: "u_demo_priya", text: "Can someone help me understand Calculus II tonight? I'm at the Undergraduate Library and totally lost on series.", expiry: "3h" },
  { user: "u_demo_alex", text: "I can help with Calculus II this evening at the UL, free, I TA'd it last year.", expiry: "3h" },
  { user: "u_demo_sam", text: "Free pizza in the Pit from the CS club table, like 6 boxes left, come grab a slice!", expiry: "1h" },
  { user: "u_demo_priya", text: "Lost my AirPods (white case, blue sticker) somewhere near the Carolina Union this afternoon.", expiry: "today" },
  { user: "u_demo_jordan", text: "Studying chemistry at Wilson Library 2nd floor if anybody wants to join, got snacks.", expiry: "3h" },
  { user: "u_demo_sam", text: "Looking for a ride to Harris Teeter / grocery store around 6, can chip in for gas.", expiry: "3h" },
  { user: "u_demo_priya", text: "Anyone going to RDU airport Friday around 3? Happy to split an Uber from Granville.", expiry: "today" },
  { user: "u_demo_sam", text: "Moving out, giving away a desk chair in good shape. Pick up at Hinton James lobby today, first come first serve.", expiry: "today", category: "giveaway", type: "offer" },
  { user: "u_demo_alex", text: "Free mini fridge, works fine, just don't want to haul it home. Granville Towers, come get it this weekend.", expiry: "today", category: "giveaway", type: "offer" },
  { user: "u_demo_alex", text: "DEMO EVENT: Open mic night at the Carolina Union Cabaret, 8pm, free entry.", type: "event", category: "event", title: "Open mic night (simulated)", startsInMin: 150, expiry: "today" },
  { user: "u_demo_jordan", text: "DEMO NOTICE: P2P Express running about 10 minutes behind near Morrison this evening (simulated service notice).", type: "notice", category: "transit", title: "P2P running ~10 min late (simulated)", expiry: "3h" },
];

export async function seedDemoData(opts: { reset?: boolean } = {}) {
  (await syncLocations());
  (await ensureSources());
  (await ensureDemoUsers());
  if (opts.reset) (await resetDemoData());
  const db = getDb();
  const users = new Map((await db.select().from(schema.users).where(inArray(schema.users.id, DEMO_USERS.map((u) => u.id)))).map((u) => [u.id, u]));
  const out = [];
  for (const s of SCENARIOS) {
    const parsed = await parsePost(s.text);
    const input: CreatePostInput = {
      description: s.text, type: s.type ?? parsed.type, category: s.category ?? parsed.category, title: s.title ?? parsed.title, summary: parsed.summary,
      locationId: parsed.locationId, locationNote: parsed.locationNote, urgency: parsed.urgency, expiry: s.expiry ?? "1h",
      startsAt: s.startsInMin ? Date.now() + s.startsInMin * 60000 : null, keywords: parsed.keywords,
      attributes: { item: parsed.item, subject: parsed.subject, powerClass: parsed.powerClass, durationMinutes: parsed.durationMinutes, destination: parsed.destination, lostOrFound: parsed.lostOrFound },
      isDemo: true,
    };
    out.push(await createPost(users.get(s.user) ?? null, input));
  }
  return out;
}

export const DEMO_STEPS = {
  mayaRequest: { user: "u_demo_maya", text: "Need a USB-C laptop charger at Davis Library for the next hour, 3rd floor by the windows." },
  jordanOffer: { user: "u_demo_jordan", text: "I have an extra USB-C laptop charger at Davis until 5, happy to lend it." },
} as const;

export async function injectStep(step: keyof typeof DEMO_STEPS) {
  const s = DEMO_STEPS[step];
  (await ensureDemoUsers());
  const user = (await getDb().select().from(schema.users).where(eq(schema.users.id, s.user)).limit(1))[0]!;
  const parsed = await parsePost(s.text);
  return (await createPost(user, {
    description: s.text, type: parsed.type, category: parsed.category, title: parsed.title, summary: parsed.summary,
    locationId: parsed.locationId ?? "davis-library", locationNote: parsed.locationNote, urgency: parsed.urgency,
    expiry: parsed.durationMinutes && parsed.durationMinutes > 90 ? "3h" : "1h", keywords: parsed.keywords,
    attributes: { item: parsed.item, subject: parsed.subject, powerClass: parsed.powerClass, durationMinutes: parsed.durationMinutes, destination: parsed.destination, lostOrFound: parsed.lostOrFound },
    isDemo: true,
  }));
}
