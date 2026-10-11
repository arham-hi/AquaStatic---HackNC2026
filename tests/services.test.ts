import { describe, it, expect, beforeAll } from "vitest";
import { freshDb } from "./setup";

freshDb("services");

// Imports after env is set so the DB path is picked up.
const { getDb, schema } = await import("@/lib/db/client");
const { createPost, listPosts, updatePost, sweepExpirations, CreatePostSchema } = await import("@/lib/services/posts");
const { respondToMatch, completeMatch, listMyMatches, sendMessage, listMessages, listConversations, getConversation } = await import("@/lib/services/connections");
const { listNotifications, unreadCount, markAllRead, notify } = await import("@/lib/services/notifications");
const { generateBriefing } = await import("@/lib/services/briefings");
const { ask } = await import("@/lib/services/assistant");
const { ensureDemoUsers, syncLocations, DEMO_USERS } = await import("@/lib/services/demo");
const { ApiError } = await import("@/lib/api");
const { parsePost } = await import("@/lib/ai");
import type { User } from "@/lib/db/schema";

let maya: User, jordan: User, priya: User;

beforeAll(() => {
  syncLocations();
  ensureDemoUsers();
  const db = getDb();
  const users = db.select().from(schema.users).all();
  maya = users.find((u) => u.id === "u_demo_maya")!;
  jordan = users.find((u) => u.id === "u_demo_jordan")!;
  priya = users.find((u) => u.id === "u_demo_priya")!;
  expect(DEMO_USERS.length).toBeGreaterThan(3);
});

async function postFromText(user: User, text: string, expiry: "30m" | "1h" | "3h" | "today" = "1h") {
  const p = await parsePost(text);
  expect(p.provider).toBe("local"); // no Gemini key in tests → deterministic fallback
  return createPost(user, CreatePostSchema.parse({
    description: text, type: p.type, category: p.category, title: p.title, summary: p.summary, locationId: p.locationId, locationNote: p.locationNote,
    urgency: p.urgency, expiry, keywords: p.keywords, attributes: { item: p.item, subject: p.subject, powerClass: p.powerClass, durationMinutes: p.durationMinutes, lostOrFound: p.lostOrFound },
  }));
}

describe("post validation and persistence", () => {
  it("rejects invalid input", () => {
    expect(() => CreatePostSchema.parse({ description: "x", type: "request", category: "borrowing", title: "t", locationId: null })).toThrow();
    expect(() => CreatePostSchema.parse({ description: "long enough", type: "bogus", category: "borrowing", title: "title", locationId: null })).toThrow();
  });
  it("persists a post and lists it", async () => {
    const { post } = await postFromText(priya, "Free pizza in the Pit from the CS club");
    expect(post.id).toMatch(/^p_/);
    expect(post.locationId).toBe("the-pit");
    expect(listPosts().some((p) => p.id === post.id)).toBe(true);
  });
  it("allows manual correction by the owner only", async () => {
    const { post } = await postFromText(priya, "Does anyone have a graphing calculator I can borrow?");
    expect(post.locationId).toBeNull();
    const fixed = updatePost(priya, post.id, { locationId: "carolina-union", title: "Need a graphing calculator at the Union" });
    expect(fixed.locationId).toBe("carolina-union");
    expect(() => updatePost(maya, post.id, { title: "hijack" })).toThrow(ApiError);
  });
});

describe("matching → acceptance → messaging → completion", () => {
  let matchId: string;
  it("creates a suggested match and notifies both participants", async () => {
    const r1 = await postFromText(maya, "Need a USB-C laptop charger at Davis Library for the next hour");
    expect(r1.matches).toHaveLength(0);
    const r2 = await postFromText(jordan, "I have an extra USB-C laptop charger at Davis until late tonight", "3h");
    expect(r2.matches).toHaveLength(1);
    matchId = r2.matches[0].id;
    expect(r2.matches[0].score).toBeGreaterThanOrEqual(0.9);
    expect(listNotifications(maya.id).some((n) => n.type === "match_suggested")).toBe(true);
    expect(listNotifications(jordan.id).some((n) => n.type === "match_suggested")).toBe(true);
  });
  it("requires both to accept before opening a conversation", () => {
    const after1 = respondToMatch(maya, matchId, "accept");
    expect(after1.status).toBe("suggested");
    expect(after1.requesterAccepted).toBe(true);
    expect(after1.conversationId).toBeNull();
    const after2 = respondToMatch(jordan, matchId, "accept");
    expect(after2.status).toBe("accepted");
    expect(after2.conversationId).toBeTruthy();
    const db = getDb();
    const posts = db.select().from(schema.posts).all().filter((p) => [after2.requestPostId, after2.offerPostId].includes(p.id));
    expect(posts.every((p) => p.status === "matched")).toBe(true);
  });
  it("rejects outsiders from responding or reading", () => {
    expect(() => respondToMatch(priya, matchId, "accept")).toThrow(ApiError);
    const conv = listMyMatches(maya).find((m) => m.id === matchId)!.conversationId!;
    expect(() => listMessages(priya, conv)).toThrow(ApiError);
    expect(() => sendMessage(priya, conv, "hi")).toThrow(ApiError);
  });
  it("persists messages, tracks unread, and notifies", () => {
    const conv = listMyMatches(maya).find((m) => m.id === matchId)!.conversationId!;
    sendMessage(maya, conv, "Hey Jordan! I'm on the 3rd floor by the windows.");
    sendMessage(jordan, conv, "On my way up.");
    const msgs = listMessages(maya, conv);
    expect(msgs.map((m) => m.content)).toEqual(["Hey Jordan! I'm on the 3rd floor by the windows.", "On my way up."]);
    expect(listConversations(jordan)[0].lastMessage?.content).toBe("On my way up.");
    expect(getConversation(maya, conv)?.participants.map((p) => p.id).sort()).toEqual([jordan.id, maya.id].sort());
    expect(listNotifications(jordan.id).some((n) => n.type === "new_message")).toBe(true);
    expect(() => sendMessage(maya, conv, "")).toThrow(ApiError);
  });
  it("completion updates posts and match status", () => {
    const done = completeMatch(jordan, matchId);
    expect(done.status).toBe("completed");
    const db = getDb();
    expect(db.select().from(schema.posts).all().find((p) => p.id === done.requestPostId)?.status).toBe("fulfilled");
    expect(db.select().from(schema.posts).all().find((p) => p.id === done.offerPostId)?.status).toBe("resolved");
    expect(listNotifications(maya.id).some((n) => n.type === "request_fulfilled")).toBe(true);
  });
});

describe("notifications", () => {
  it("deduplicates, counts unread, and marks all read", () => {
    const before = unreadCount(priya.id);
    expect(notify(priya.id, { type: "relevant_event", title: "A", body: "b", dedupeKey: "evt:1" })).toBe(true);
    expect(notify(priya.id, { type: "relevant_event", title: "A", body: "b", dedupeKey: "evt:1" })).toBe(false);
    expect(unreadCount(priya.id)).toBe(before + 1);
    markAllRead(priya.id);
    expect(unreadCount(priya.id)).toBe(0);
  });
});

describe("expiration", () => {
  it("expires overdue posts and cancels their suggestions", async () => {
    const { post } = await createPost(priya, CreatePostSchema.parse({ description: "Need an umbrella at Wilson right now", type: "request", category: "borrowing", title: "Need an umbrella", locationId: "wilson-library", expiry: "30m", attributes: { item: "umbrella" } }), Date.now() - 3600_000);
    expect(post.expiresAt!.getTime()).toBeLessThan(Date.now());
    expect(listPosts().some((p) => p.id === post.id)).toBe(false);
    sweepExpirations();
    expect(getDb().select().from(schema.posts).all().find((p) => p.id === post.id)?.status).toBe("expired");
  });
});

describe("digest and assistant from actual records (no Gemini key)", () => {
  it("builds a briefing that references stored posts and flags demo data", async () => {
    const b = await generateBriefing(maya, { format: "radio", length: "medium", interests: [] });
    expect(b.provider).toBe("local");
    expect(b.audioProvider).toBe("browser");
    expect(b.segments.length).toBeGreaterThanOrEqual(4);
    expect(b.script).toContain("Aqua Static Radio");
    expect(b.sources.length).toBeGreaterThan(0);
    expect(b.includesDemo).toBe(true);
    expect(b.script).toMatch(/pizza|Pit/i);
  });
  it("answers grounded questions and says when nothing is found", async () => {
    const a = await ask(null, "Any free food on campus right now?");
    expect(a.provider).toBe("local");
    expect(a.answer).toMatch(/pizza/i);
    expect(a.sources.length).toBeGreaterThan(0);
    const none = await ask(null, "Any events at Kenan Stadium tonight?");
    expect(none.sources.length === 0 ? /couldn't find/i.test(none.answer) : true).toBe(true);
    const draft = await ask(maya, "I need a phone charger at the Union for 20 minutes");
    expect(draft.draft?.type).toBe("request");
  });
});

describe("missing credentials never break core flows", () => {
  it("reports fallback states without network", async () => {
    const { integrationStatusQuick } = await import("@/lib/services/integrations");
    const s = integrationStatusQuick();
    expect(s.find((x) => x.id === "gemini")?.state).toBe("fallback");
    expect(s.find((x) => x.id === "elevenlabs")?.state).toBe("fallback");
    expect(s.find((x) => x.id === "photon")?.state).toBe("not_configured");
  });
  it("channel handler drafts and refuses to publish without confirmation/link", async () => {
    const { handleChannelMessage } = await import("@/lib/services/channels");
    const r1 = await handleChannelMessage("sim:+15550001111", "I need a USB-C charger at Davis for an hour");
    expect(r1.text).toMatch(/Reply YES/);
    const r2 = await handleChannelMessage("sim:+15550001111", "yes");
    expect(r2.text).toMatch(/link your account/i);
  });
});

describe("giveaway claims", () => {
  it("claiming an offer creates a pre-accepted match that opens chat when the giver accepts", async () => {
    const { claimOffer } = await import("@/lib/services/connections");
    const { post: offer } = await postFromText(jordan, "Giving away a desk chair, pick up at Hinton James lobby today", "today");
    expect(offer).toMatchObject({ type: "offer", category: "giveaway" });
    const claim = claimOffer(priya, offer.id);
    expect(claim.status).toBe("suggested");
    expect(claim.requesterAccepted).toBe(true);
    expect(claim.offererAccepted).toBe(false);
    expect(() => claimOffer(jordan, offer.id)).toThrow(ApiError); // own post
    const accepted = respondToMatch(jordan, claim.id, "accept");
    expect(accepted.status).toBe("accepted");
    expect(accepted.conversationId).toBeTruthy();
    expect(() => claimOffer(maya, offer.id)).toThrow(ApiError); // already claimed
  });
});

describe("kept-in-use tally", () => {
  it("counts only completed reuse connections, by kind", async () => {
    const { sharedBreakdown, sharedSummary } = await import("@/lib/services/posts");
    const before = sharedBreakdown();
    // The charger exchange earlier in this file was completed (borrowing) and the chair claim was accepted but not completed.
    expect(before.borrowed).toBeGreaterThanOrEqual(1);
    expect(before.total).toBe(before.borrowed + before.rehomed + before.returned + before.rides + before.food);
    expect(sharedSummary(before)).toMatch(/borrowed/);
  });
});
