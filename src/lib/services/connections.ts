// Matches → acceptance → conversations → messages. All authorization is checked here, server-side.

import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
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

function hydrate(rows: Match[], me: User | null): MatchView[] {
  if (!rows.length) return [];
  const db = getDb();
  const postIds = Array.from(new Set(rows.flatMap((m) => [m.requestPostId, m.offerPostId])));
  const posts = db.select().from(schema.posts).where(inArray(schema.posts.id, postIds)).all();
  const byId = new Map(posts.map((p) => [p.id, p]));
  const userIds = Array.from(new Set(posts.map((p) => p.authorId).filter(Boolean) as string[]));
  const users = userIds.length ? db.select().from(schema.users).where(inArray(schema.users.id, userIds)).all() : [];
  const userById = new Map(users.map((u) => [u.id, u]));
  const convs = db.select().from(schema.conversations).where(inArray(schema.conversations.matchId, rows.map((m) => m.id))).all();
  const convByMatch = new Map(convs.map((c) => [c.matchId, c.id]));
  return rows.flatMap((m) => {
    const request = byId.get(m.requestPostId), offer = byId.get(m.offerPostId);
    if (!request || !offer) return [];
    const myRole = me && request.authorId === me.id ? "requester" : me && offer.authorId === me.id ? "offerer" : null;
    return [{ ...m, request, offer, requester: publicUser(userById.get(request.authorId ?? "")), offerer: publicUser(userById.get(offer.authorId ?? "")), myRole, conversationId: convByMatch.get(m.id) ?? null }];
  });
}

export function getMatchView(id: string, me: User | null): MatchView | null {
  const row = getDb().select().from(schema.matches).where(eq(schema.matches.id, id)).get();
  return row ? hydrate([row], me)[0] ?? null : null;
}

/** Matches involving any of the user's posts. */
export function listMyMatches(me: User): MatchView[] {
  const db = getDb();
  const mine = db.select({ id: schema.posts.id }).from(schema.posts).where(eq(schema.posts.authorId, me.id));
  const rows = db.select().from(schema.matches)
    .where(or(inArray(schema.matches.requestPostId, mine), inArray(schema.matches.offerPostId, mine)))
    .orderBy(desc(schema.matches.updatedAt)).all();
  return hydrate(rows, me);
}

export function listRecentMatches(limit = 20, me: User | null = null): MatchView[] {
  const rows = getDb().select().from(schema.matches).orderBy(desc(schema.matches.createdAt)).limit(limit).all();
  return hydrate(rows, me);
}

export function respondToMatch(me: User, matchId: string, action: "accept" | "decline", now = Date.now()): MatchView {
  const db = getDb();
  const view = getMatchView(matchId, me);
  if (!view) throw new ApiError(404, "Match not found");
  if (!view.myRole) throw new ApiError(403, "You are not part of this match");
  if (!["suggested", "accepted"].includes(view.status)) throw new ApiError(409, `Match is already ${view.status}`);
  const otherId = view.myRole === "requester" ? view.offer.authorId : view.request.authorId;

  if (action === "decline") {
    db.update(schema.matches).set({ status: "declined", updatedAt: new Date(now) }).where(eq(schema.matches.id, matchId)).run();
    if (otherId) notify(otherId, { type: "match_declined", title: "Match declined", body: `${me.displayName} passed on "${view.myRole === "requester" ? view.offer.title : view.request.title}".`, href: "/connect", dedupeKey: `declined:${matchId}` });
    bump("matches");
    return getMatchView(matchId, me)!;
  }

  const patch: Partial<Match> = { updatedAt: new Date(now) };
  if (view.myRole === "requester") patch.requesterAccepted = true; else patch.offererAccepted = true;
  const both = (view.myRole === "requester" ? view.offererAccepted : view.requesterAccepted) === true;
  if (both) patch.status = "accepted";
  db.update(schema.matches).set(patch).where(eq(schema.matches.id, matchId)).run();

  if (both) {
    // Open the conversation exactly once, with both participants.
    let conv = db.select().from(schema.conversations).where(eq(schema.conversations.matchId, matchId)).get();
    if (!conv) {
      conv = { id: newId("c"), matchId, createdAt: new Date(now), updatedAt: new Date(now) };
      db.insert(schema.conversations).values(conv).run();
      for (const uid of [view.request.authorId, view.offer.authorId]) {
        if (uid) db.insert(schema.conversationParticipants).values({ conversationId: conv.id, userId: uid, lastReadAt: null }).onConflictDoNothing().run();
      }
    }
    db.update(schema.posts).set({ status: "matched", updatedAt: new Date(now) }).where(inArray(schema.posts.id, [view.requestPostId, view.offerPostId])).run();
    // Other suggestions for these posts are no longer relevant.
    db.update(schema.matches).set({ status: "cancelled", updatedAt: new Date(now) }).where(and(
      eq(schema.matches.status, "suggested"),
      or(eq(schema.matches.requestPostId, view.requestPostId), eq(schema.matches.offerPostId, view.offerPostId)),
    )).run();
    for (const uid of [view.request.authorId, view.offer.authorId]) {
      if (uid) notify(uid, { type: "match_accepted", title: "You're connected", body: `Both of you accepted. Say hi in Messages.`, href: `/messages/${conv.id}`, dedupeKey: `connected:${matchId}` });
    }
    bump("posts");
    bump("messages");
  } else if (otherId) {
    notify(otherId, { type: "match_accepted", title: `${me.displayName} accepted a match`, body: `Accept too to open a conversation about "${view.request.title}".`, href: `/connect?match=${matchId}`, dedupeKey: `accepted:${matchId}:${me.id}` });
  }
  bump("matches");
  return getMatchView(matchId, me)!;
}

export function completeMatch(me: User, matchId: string, now = Date.now()): MatchView {
  const db = getDb();
  const view = getMatchView(matchId, me);
  if (!view) throw new ApiError(404, "Match not found");
  if (!view.myRole) throw new ApiError(403, "You are not part of this match");
  if (view.status !== "accepted") throw new ApiError(409, "Only accepted matches can be completed");
  db.update(schema.matches).set({ status: "completed", updatedAt: new Date(now) }).where(eq(schema.matches.id, matchId)).run();
  db.update(schema.posts).set({ status: "fulfilled", updatedAt: new Date(now) }).where(eq(schema.posts.id, view.requestPostId)).run();
  db.update(schema.posts).set({ status: "resolved", updatedAt: new Date(now) }).where(eq(schema.posts.id, view.offerPostId)).run();
  const otherId = view.myRole === "requester" ? view.offer.authorId : view.request.authorId;
  if (otherId) notify(otherId, { type: "request_fulfilled", title: "Connection completed", body: `${me.displayName} marked "${view.request.title}" as done. Nice work.`, href: "/connect", dedupeKey: `completed:${matchId}` });
  bump("matches");
  bump("posts");
  return getMatchView(matchId, me)!;
}

export function leaveMatch(me: User, matchId: string, now = Date.now()): MatchView {
  const db = getDb();
  const view = getMatchView(matchId, me);
  if (!view) throw new ApiError(404, "Match not found");
  if (!view.myRole) throw new ApiError(403, "You are not part of this match");
  db.update(schema.matches).set({ status: "cancelled", updatedAt: new Date(now) }).where(eq(schema.matches.id, matchId)).run();
  db.update(schema.posts).set({ status: "open", updatedAt: new Date(now) }).where(and(inArray(schema.posts.id, [view.requestPostId, view.offerPostId]), eq(schema.posts.status, "matched"))).run();
  bump("matches");
  bump("posts");
  return getMatchView(matchId, me)!;
}

// ---------------- conversations & messages ----------------

export type ConversationView = {
  id: string; matchId: string | null; createdAt: Date; updatedAt: Date;
  participants: NonNullable<ReturnType<typeof publicUser>>[];
  lastMessage: { content: string; senderId: string; createdAt: Date } | null;
  unread: number;
  context: { requestTitle: string; offerTitle: string; matchStatus: string } | null;
};

function assertParticipant(conversationId: string, userId: string) {
  const row = getDb().select().from(schema.conversationParticipants)
    .where(and(eq(schema.conversationParticipants.conversationId, conversationId), eq(schema.conversationParticipants.userId, userId))).get();
  if (!row) throw new ApiError(403, "You are not in this conversation");
  return row;
}

export function listConversations(me: User): ConversationView[] {
  const db = getDb();
  const mine = db.select().from(schema.conversationParticipants).where(eq(schema.conversationParticipants.userId, me.id)).all();
  if (!mine.length) return [];
  const ids = mine.map((p) => p.conversationId);
  const convs = db.select().from(schema.conversations).where(inArray(schema.conversations.id, ids)).orderBy(desc(schema.conversations.updatedAt)).all();
  const parts = db.select().from(schema.conversationParticipants).where(inArray(schema.conversationParticipants.conversationId, ids)).all();
  const userIds = Array.from(new Set(parts.map((p) => p.userId)));
  const users = db.select().from(schema.users).where(inArray(schema.users.id, userIds)).all();
  const userById = new Map(users.map((u) => [u.id, u]));
  const matchIds = convs.map((c) => c.matchId).filter(Boolean) as string[];
  const mv = matchIds.length ? hydrate(db.select().from(schema.matches).where(inArray(schema.matches.id, matchIds)).all(), me) : [];
  const mvById = new Map(mv.map((m) => [m.id, m]));
  return convs.map((c) => {
    const last = db.select().from(schema.messages).where(eq(schema.messages.conversationId, c.id)).orderBy(desc(schema.messages.createdAt)).limit(1).get();
    const myPart = mine.find((p) => p.conversationId === c.id)!;
    const unread = db.select({ c: sql<number>`count(*)` }).from(schema.messages).where(and(
      eq(schema.messages.conversationId, c.id), sql`${schema.messages.senderId} != ${me.id}`,
      myPart.lastReadAt ? sql`${schema.messages.createdAt} > ${myPart.lastReadAt.getTime()}` : sql`1=1`,
    )).get()?.c ?? 0;
    const m = c.matchId ? mvById.get(c.matchId) : null;
    return {
      id: c.id, matchId: c.matchId, createdAt: c.createdAt, updatedAt: c.updatedAt,
      participants: parts.filter((p) => p.conversationId === c.id).map((p) => publicUser(userById.get(p.userId))!).filter(Boolean),
      lastMessage: last ? { content: last.content, senderId: last.senderId, createdAt: last.createdAt } : null,
      unread,
      context: m ? { requestTitle: m.request.title, offerTitle: m.offer.title, matchStatus: m.status } : null,
    };
  });
}

export function getConversation(me: User, id: string) {
  assertParticipant(id, me.id);
  const all = listConversations(me);
  return all.find((c) => c.id === id) ?? null;
}

export function listMessages(me: User, conversationId: string, limit = 200) {
  assertParticipant(conversationId, me.id);
  const db = getDb();
  const rows = db.select().from(schema.messages).where(eq(schema.messages.conversationId, conversationId)).orderBy(schema.messages.createdAt).limit(limit).all();
  db.update(schema.conversationParticipants).set({ lastReadAt: new Date() })
    .where(and(eq(schema.conversationParticipants.conversationId, conversationId), eq(schema.conversationParticipants.userId, me.id))).run();
  return rows;
}

export function sendMessage(me: User, conversationId: string, content: string, now = Date.now()) {
  assertParticipant(conversationId, me.id);
  const db = getDb();
  const text = content.trim();
  if (!text || text.length > 2000) throw new ApiError(400, "Message must be 1-2000 characters");
  const others = db.select().from(schema.conversationParticipants)
    .where(and(eq(schema.conversationParticipants.conversationId, conversationId), sql`${schema.conversationParticipants.userId} != ${me.id}`)).all();
  for (const o of others) {
    const blocked = db.select().from(schema.blocks).where(or(
      and(eq(schema.blocks.userId, o.userId), eq(schema.blocks.blockedUserId, me.id)),
      and(eq(schema.blocks.userId, me.id), eq(schema.blocks.blockedUserId, o.userId)),
    )).get();
    if (blocked) throw new ApiError(403, "Messaging is blocked between these users");
  }
  const msg = { id: newId("msg"), conversationId, senderId: me.id, content: text, createdAt: new Date(now) };
  db.insert(schema.messages).values(msg).run();
  db.update(schema.conversations).set({ updatedAt: new Date(now) }).where(eq(schema.conversations.id, conversationId)).run();
  db.update(schema.conversationParticipants).set({ lastReadAt: new Date(now) })
    .where(and(eq(schema.conversationParticipants.conversationId, conversationId), eq(schema.conversationParticipants.userId, me.id))).run();
  for (const o of others) {
    notify(o.userId, { type: "new_message", title: `New message from ${me.displayName}`, body: text.slice(0, 120), href: `/messages/${conversationId}`, dedupeKey: `msg:${msg.id}` });
  }
  bump("messages");
  return msg;
}

export function blockUser(me: User, blockedUserId: string) {
  if (blockedUserId === me.id) throw new ApiError(400, "Cannot block yourself");
  getDb().insert(schema.blocks).values({ userId: me.id, blockedUserId, createdAt: new Date() }).onConflictDoNothing().run();
}

export function reportItem(me: User, itemType: "post" | "user" | "message", itemId: string, reason: string) {
  getDb().insert(schema.reports).values({ id: newId("r"), reporterId: me.id, itemType, itemId, reason: reason.slice(0, 500), status: "open", createdAt: new Date() }).run();
}
