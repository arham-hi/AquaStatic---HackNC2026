// Matches → acceptance → conversations → messages. All authorization is checked here, server-side.

import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { getDb, schema, type DB } from "@/lib/db/client";
import { newId } from "@/lib/ids";
import { bump } from "@/lib/realtime";
import { ApiError } from "@/lib/api";
import { publicUser } from "@/lib/session";
import type { Match, Post, User } from "@/lib/db/schema";
import { notify } from "./notifications";

export type MatchView = Match & {
  request: Post; offer: Post;
  requester: ReturnType<typeof publicUser>; offerer: ReturnType<typeof publicUser>;
  myRole: "requester" | "offerer" | null; conversationId: string | null;
};

async function hydrate(rows: Match[], me: User | null, db: Pick<DB, "select"> = getDb()): Promise<MatchView[]> {
  if (!rows.length) return [];
  const postIds = Array.from(new Set(rows.flatMap((m) => [m.requestPostId, m.offerPostId])));
  const posts = (await db.select().from(schema.posts).where(inArray(schema.posts.id, postIds)));
  const byId = new Map(posts.map((p) => [p.id, p]));
  const userIds = Array.from(new Set(posts.map((p) => p.authorId).filter(Boolean) as string[]));
  const users = userIds.length ? (await db.select().from(schema.users).where(inArray(schema.users.id, userIds))) : [];
  const userById = new Map(users.map((u) => [u.id, u]));
  const convs = (await db.select().from(schema.conversations).where(inArray(schema.conversations.matchId, rows.map((m) => m.id))));
  const convByMatch = new Map(convs.map((c) => [c.matchId, c.id]));
  return rows.flatMap((m) => {
    const request = byId.get(m.requestPostId), offer = byId.get(m.offerPostId);
    if (!request || !offer) return [];
    const myRole = me && request.authorId === me.id ? "requester" : me && offer.authorId === me.id ? "offerer" : null;
    return [{ ...m, request, offer, requester: publicUser(userById.get(request.authorId ?? "")), offerer: publicUser(userById.get(offer.authorId ?? "")), myRole, conversationId: convByMatch.get(m.id) ?? null }];
  });
}

export async function getMatchView(id: string, me: User | null, db: Pick<DB, "select"> = getDb()): Promise<MatchView | null> {
  const row = (await db.select().from(schema.matches).where(eq(schema.matches.id, id)).limit(1))[0];
  return row ? (await hydrate([row], me, db))[0] ?? null : null;
}

/** Matches involving any of the user's posts. */
export async function listMyMatches(me: User): Promise<MatchView[]> {
  const db = getDb();
  const mine = db.select({ id: schema.posts.id }).from(schema.posts).where(eq(schema.posts.authorId, me.id));
  const rows = (await db.select().from(schema.matches)
    .where(or(inArray(schema.matches.requestPostId, mine), inArray(schema.matches.offerPostId, mine)))
    .orderBy(desc(schema.matches.updatedAt)));
  return (await hydrate(rows, me));
}

export async function listRecentMatches(limit = 20, me: User | null = null): Promise<MatchView[]> {
  const rows = (await getDb().select().from(schema.matches).orderBy(desc(schema.matches.createdAt)).limit(limit));
  return (await hydrate(rows, me));
}

export async function respondToMatch(me: User, matchId: string, action: "accept" | "decline", now = Date.now()): Promise<MatchView> {
  const result = await getDb().transaction(async (db) => {
    const initial = (await db.select().from(schema.matches).where(eq(schema.matches.id, matchId)).limit(1))[0];
    if (!initial) throw new ApiError(404, "Match not found");
    // Lock shared posts in a stable order before the match. Competing matches for one
    // offer serialize too, so accepting one cannot also accept a second suggestion.
    const posts = await db.select().from(schema.posts).where(inArray(schema.posts.id, [initial.requestPostId, initial.offerPostId])).orderBy(schema.posts.id).for("update");
    const row = (await db.select().from(schema.matches).where(eq(schema.matches.id, matchId)).for("update"))[0];
    const view = row ? (await hydrate([row], me, db))[0] : null;
    if (!view) throw new ApiError(404, "Match not found");
    if (!view.myRole) throw new ApiError(403, "You are not part of this match");
    if (!["suggested", "accepted"].includes(view.status)) throw new ApiError(409, `Match is already ${view.status}`);
    if (view.status === "accepted") {
      if (action === "accept") return view; // repeated clicks are idempotent
      throw new ApiError(409, "This match is accepted. Leave the connection instead.");
    }
    if (action === "accept" && posts.some((p) => p.status !== "open" || (p.expiresAt && p.expiresAt.getTime() <= now))) throw new ApiError(409, "A post is no longer available");
    const otherId = view.myRole === "requester" ? view.offer.authorId : view.request.authorId;

    if (action === "decline") {
      (await db.update(schema.matches).set({ status: "declined", updatedAt: new Date(now) }).where(eq(schema.matches.id, matchId)));
      if (otherId) (await notify(otherId, { type: "match_declined", title: "Match declined", body: `${me.displayName} passed on "${view.myRole === "requester" ? view.offer.title : view.request.title}".`, href: "/connect", dedupeKey: `declined:${matchId}` }, db));
      return (await getMatchView(matchId, me, db))!;
    }

    const patch: Partial<Match> = { updatedAt: new Date(now) };
    if (view.myRole === "requester") patch.requesterAccepted = true; else patch.offererAccepted = true;
    const both = (view.myRole === "requester" ? view.offererAccepted : view.requesterAccepted) === true;
    if (both) patch.status = "accepted";
    (await db.update(schema.matches).set(patch).where(eq(schema.matches.id, matchId)));

    if (both) {
      // Open the conversation exactly once, with both participants.
      let conv = (await db.select().from(schema.conversations).where(eq(schema.conversations.matchId, matchId)).limit(1))[0];
      if (!conv) {
        conv = { id: newId("c"), matchId, createdAt: new Date(now), updatedAt: new Date(now) };
        (await db.insert(schema.conversations).values(conv));
        for (const uid of [view.request.authorId, view.offer.authorId]) {
          if (uid) (await db.insert(schema.conversationParticipants).values({ conversationId: conv.id, userId: uid, lastReadAt: null }).onConflictDoNothing());
        }
      }
      (await db.update(schema.posts).set({ status: "matched", updatedAt: new Date(now) }).where(inArray(schema.posts.id, [view.requestPostId, view.offerPostId])));
      // Other suggestions for these posts are no longer relevant.
      (await db.update(schema.matches).set({ status: "cancelled", updatedAt: new Date(now) }).where(and(
        eq(schema.matches.status, "suggested"),
        or(eq(schema.matches.requestPostId, view.requestPostId), eq(schema.matches.offerPostId, view.offerPostId)),
      )));
      for (const uid of [view.request.authorId, view.offer.authorId]) {
        if (uid) (await notify(uid, { type: "match_accepted", title: "You're connected", body: `Both of you accepted. Say hi in Messages.`, href: `/messages/${conv.id}`, dedupeKey: `connected:${matchId}` }, db));
      }
    } else if (otherId) {
      (await notify(otherId, { type: "match_accepted", title: `${me.displayName} accepted a match`, body: `Accept too to open a conversation about "${view.request.title}".`, href: `/connect?match=${matchId}`, dedupeKey: `accepted:${matchId}:${me.id}` }, db));
    }
    return (await getMatchView(matchId, me, db))!;
  });
  bump("matches"); bump("posts"); bump("messages"); bump("notifications");
  return result;
}

export async function completeMatch(me: User, matchId: string, now = Date.now()): Promise<MatchView> {
  const db = getDb();
  const view = (await getMatchView(matchId, me));
  if (!view) throw new ApiError(404, "Match not found");
  if (!view.myRole) throw new ApiError(403, "You are not part of this match");
  if (view.status === "completed") return view; // repeated completions are idempotent
  if (view.status !== "accepted") throw new ApiError(409, "Only accepted matches can be completed");
  // Completion only counts while both posts are still live — an expired or deleted post ends the exchange.
  for (const p of [view.request, view.offer]) {
    if (!["matched", "in_progress"].includes(p.status)) throw new ApiError(409, "A post is no longer active");
    if (p.expiresAt && p.expiresAt.getTime() <= now) throw new ApiError(409, "A post has expired");
  }
  (await db.update(schema.matches).set({ status: "completed", updatedAt: new Date(now) }).where(eq(schema.matches.id, matchId)));
  (await db.update(schema.posts).set({ status: "fulfilled", updatedAt: new Date(now) }).where(eq(schema.posts.id, view.requestPostId)));
  (await db.update(schema.posts).set({ status: "resolved", updatedAt: new Date(now) }).where(eq(schema.posts.id, view.offerPostId)));
  const otherId = view.myRole === "requester" ? view.offer.authorId : view.request.authorId;
  if (otherId) (await notify(otherId, { type: "request_fulfilled", title: "Connection completed", body: `${me.displayName} marked "${view.request.title}" as done. Nice work.`, href: "/connect", dedupeKey: `completed:${matchId}` }));
  bump("matches");
  bump("posts");
  return (await getMatchView(matchId, me))!;
}

export async function leaveMatch(me: User, matchId: string, now = Date.now()): Promise<MatchView> {
  const db = getDb();
  const view = (await getMatchView(matchId, me));
  if (!view) throw new ApiError(404, "Match not found");
  if (!view.myRole) throw new ApiError(403, "You are not part of this match");
  (await db.update(schema.matches).set({ status: "cancelled", updatedAt: new Date(now) }).where(eq(schema.matches.id, matchId)));
  (await db.update(schema.posts).set({ status: "open", updatedAt: new Date(now) }).where(and(inArray(schema.posts.id, [view.requestPostId, view.offerPostId]), eq(schema.posts.status, "matched"))));
  bump("matches");
  bump("posts");
  return (await getMatchView(matchId, me))!;
}


/**
 * Claim an open offer directly (giveaways, free food): creates a lightweight request for the claimer and a match
 * the claimer has already accepted, so only the giver needs to say yes. Chat opens on their accept.
 */
export async function claimOffer(me: User, offerId: string, now = Date.now()): Promise<MatchView> {
  const db = getDb();
  const offer = (await db.select().from(schema.posts).where(eq(schema.posts.id, offerId)).limit(1))[0];
  if (!offer || offer.status === "deleted") throw new ApiError(404, "Post not found");
  if (offer.type !== "offer") throw new ApiError(400, "Only offers can be claimed");
  if (offer.status !== "open") throw new ApiError(409, "This one has already been claimed");
  if (offer.authorId === me.id) throw new ApiError(400, "That's your own post");
  if (offer.isDemo !== me.isDemo) throw new ApiError(400, "That post belongs to a different community board");
  if (offer.expiresAt && offer.expiresAt.getTime() <= now) throw new ApiError(409, "This offer has expired");
  const blocked = offer.authorId ? (await db.select().from(schema.blocks).where(or(
    and(eq(schema.blocks.userId, offer.authorId), eq(schema.blocks.blockedUserId, me.id)),
    and(eq(schema.blocks.userId, me.id), eq(schema.blocks.blockedUserId, offer.authorId)),
  )).limit(1))[0] : null;
  if (blocked) throw new ApiError(403, "You can't claim this post");

  const request: Post = {
    id: newId("p"), authorId: me.id, type: "request", category: offer.category,
    title: `Wants: ${offer.attributes.item ?? offer.title}`, description: `Claimed "${offer.title}" in Aqua Static.`, summary: `Claimed: ${offer.title}`,
    locationId: offer.locationId, locationNote: null, startsAt: new Date(now), expiresAt: offer.expiresAt, urgency: "soon",
    sourceStatus: me.isDemo ? "demo" : "community", status: "open", keywords: offer.keywords, attributes: { ...offer.attributes }, isDemo: me.isDemo,
    createdAt: new Date(now), updatedAt: new Date(now),
  };
  const match: Match = {
    id: newId("m"), requestPostId: request.id, offerPostId: offer.id, score: 1,
    explanation: { total: 1, parts: [{ label: "Direct claim", weight: 1, score: 1, detail: `${me.displayName} asked for this item directly` }], reason: `${me.displayName} claimed "${offer.title}".` },
    status: "suggested", requesterAccepted: true, offererAccepted: false, createdAt: new Date(now), updatedAt: new Date(now),
  };
  (await db.insert(schema.posts).values(request));
  (await db.insert(schema.matches).values(match));
  if (offer.authorId) (await notify(offer.authorId, { type: "match_suggested", title: `${me.displayName} wants your ${offer.attributes.item ?? "item"}`, body: `Accept to open a chat and arrange pickup: ${offer.title}`, href: `/connect?match=${match.id}`, dedupeKey: `match:${match.id}`, metadata: { matchId: match.id } }));
  bump("posts"); bump("matches");
  return (await getMatchView(match.id, me))!;
}

// ---------------- conversations & messages ----------------

export type ConversationView = {
  id: string; matchId: string | null; createdAt: Date; updatedAt: Date;
  participants: NonNullable<ReturnType<typeof publicUser>>[];
  lastMessage: { content: string; senderId: string; createdAt: Date } | null;
  unread: number;
  context: { requestTitle: string; offerTitle: string; matchStatus: string } | null;
};

async function assertParticipant(conversationId: string, userId: string) {
  const row = (await getDb().select().from(schema.conversationParticipants)
    .where(and(eq(schema.conversationParticipants.conversationId, conversationId), eq(schema.conversationParticipants.userId, userId))).limit(1))[0];
  if (!row) throw new ApiError(403, "You are not in this conversation");
  return row;
}

export async function listConversations(me: User): Promise<ConversationView[]> {
  const db = getDb();
  const mine = (await db.select().from(schema.conversationParticipants).where(eq(schema.conversationParticipants.userId, me.id)));
  if (!mine.length) return [];
  const ids = mine.map((p) => p.conversationId);
  const convs = (await db.select().from(schema.conversations).where(inArray(schema.conversations.id, ids)).orderBy(desc(schema.conversations.updatedAt)));
  const parts = (await db.select().from(schema.conversationParticipants).where(inArray(schema.conversationParticipants.conversationId, ids)));
  const userIds = Array.from(new Set(parts.map((p) => p.userId)));
  const users = (await db.select().from(schema.users).where(inArray(schema.users.id, userIds)));
  const userById = new Map(users.map((u) => [u.id, u]));
  const matchIds = convs.map((c) => c.matchId).filter(Boolean) as string[];
  const mv = matchIds.length ? (await hydrate((await db.select().from(schema.matches).where(inArray(schema.matches.id, matchIds))), me)) : [];
  const mvById = new Map(mv.map((m) => [m.id, m]));
  return Promise.all(convs.map(async (c) => {
    const last = (await db.select().from(schema.messages).where(eq(schema.messages.conversationId, c.id)).orderBy(desc(schema.messages.createdAt)).limit(1))[0];
    const myPart = mine.find((p) => p.conversationId === c.id)!;
    const unread = (await db.select({ c: sql<number>`count(*)::int` }).from(schema.messages).where(and(
      eq(schema.messages.conversationId, c.id), sql`${schema.messages.senderId} != ${me.id}`,
      myPart.lastReadAt ? sql`${schema.messages.createdAt} > ${myPart.lastReadAt.toISOString()}::timestamptz` : sql`1=1`,
    )).limit(1))[0]?.c ?? 0;
    const m = c.matchId ? mvById.get(c.matchId) : null;
    return {
      id: c.id, matchId: c.matchId, createdAt: c.createdAt, updatedAt: c.updatedAt,
      participants: parts.filter((p) => p.conversationId === c.id).map((p) => publicUser(userById.get(p.userId))!).filter(Boolean),
      lastMessage: last ? { content: last.content, senderId: last.senderId, createdAt: last.createdAt } : null,
      unread,
      context: m ? { requestTitle: m.request.title, offerTitle: m.offer.title, matchStatus: m.status } : null,
    };
  }));
}

export async function getConversation(me: User, id: string) {
  (await assertParticipant(id, me.id));
  const all = (await listConversations(me));
  return all.find((c) => c.id === id) ?? null;
}

export async function listMessages(me: User, conversationId: string, limit = 200) {
  (await assertParticipant(conversationId, me.id));
  const db = getDb();
  const rows = (await db.select().from(schema.messages).where(eq(schema.messages.conversationId, conversationId))
    .orderBy(desc(schema.messages.createdAt), desc(schema.messages.id)).limit(limit)).reverse();
  // Mark only the messages actually returned, so concurrent arrivals remain unread.
  if (rows.length) (await db.update(schema.conversationParticipants).set({ lastReadAt: rows[rows.length - 1].createdAt })
    .where(and(eq(schema.conversationParticipants.conversationId, conversationId), eq(schema.conversationParticipants.userId, me.id))));
  return rows;
}

export async function sendMessage(me: User, conversationId: string, content: string, now = Date.now()) {
  (await assertParticipant(conversationId, me.id));
  const db = getDb();
  const text = content.trim();
  if (!text || text.length > 2000) throw new ApiError(400, "Message must be 1-2000 characters");
  const others = (await db.select().from(schema.conversationParticipants)
    .where(and(eq(schema.conversationParticipants.conversationId, conversationId), sql`${schema.conversationParticipants.userId} != ${me.id}`)));
  for (const o of others) {
    const blocked = (await db.select().from(schema.blocks).where(or(
      and(eq(schema.blocks.userId, o.userId), eq(schema.blocks.blockedUserId, me.id)),
      and(eq(schema.blocks.userId, me.id), eq(schema.blocks.blockedUserId, o.userId)),
    )).limit(1))[0];
    if (blocked) throw new ApiError(403, "Messaging is blocked between these users");
  }
  const msg = { id: newId("msg"), conversationId, senderId: me.id, content: text, createdAt: new Date(now) };
  (await db.insert(schema.messages).values(msg));
  (await db.update(schema.conversations).set({ updatedAt: new Date(now) }).where(eq(schema.conversations.id, conversationId)));
  (await db.update(schema.conversationParticipants).set({ lastReadAt: new Date(now) })
    .where(and(eq(schema.conversationParticipants.conversationId, conversationId), eq(schema.conversationParticipants.userId, me.id))));
  for (const o of others) {
    (await notify(o.userId, { type: "new_message", title: `New message from ${me.displayName}`, body: text.slice(0, 120), href: `/messages/${conversationId}`, dedupeKey: `msg:${msg.id}` }));
  }
  bump("messages");
  return msg;
}

export async function blockUser(me: User, blockedUserId: string) {
  if (blockedUserId === me.id) throw new ApiError(400, "Cannot block yourself");
  (await getDb().insert(schema.blocks).values({ userId: me.id, blockedUserId, createdAt: new Date() }).onConflictDoNothing());
}

export async function reportItem(me: User, itemType: "post" | "user" | "message", itemId: string, reason: string) {
  (await getDb().insert(schema.reports).values({ id: newId("r"), reporterId: me.id, itemType, itemId, reason: reason.slice(0, 500), status: "open", createdAt: new Date() }));
}
