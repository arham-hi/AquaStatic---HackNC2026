import { and, desc, eq, gt, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { getDb, schema } from "@/lib/db/client";
import { newId } from "@/lib/ids";
import { bump } from "@/lib/realtime";
import { getLocation } from "@/lib/locations";
import { REUSE_CATEGORIES } from "@/lib/categories";
import { endOfCampusDay, HOUR, MINUTE } from "@/lib/time";
import { ApiError } from "@/lib/api";
import { POST_CATEGORIES, POST_TYPES, URGENCIES, type Post, type PostStatus, type User } from "@/lib/db/schema";
import { runMatching } from "./matching";
import { notify } from "./notifications";

export const EXPIRY_PRESETS = ["30m", "1h", "3h", "today", "custom"] as const;

export const CreatePostSchema = z.object({
  description: z.string().trim().min(3).max(500),
  type: z.enum(POST_TYPES),
  category: z.enum(POST_CATEGORIES),
  title: z.string().trim().min(3).max(80),
  summary: z.string().trim().min(3).max(200).optional(),
  locationId: z.string().nullable(),
  locationNote: z.string().trim().max(80).nullable().optional(),
  urgency: z.enum(URGENCIES).default("low"),
  expiry: z.enum(EXPIRY_PRESETS).default("1h"),
  expiresAt: z.number().int().positive().optional(), // custom, epoch ms
  startsAt: z.number().int().positive().nullable().optional(),
  keywords: z.array(z.string().trim().min(1).max(30)).max(12).default([]),
  attributes: z.object({
    item: z.string().max(60).nullable().optional(),
    subject: z.string().max(60).nullable().optional(),
    powerClass: z.enum(["laptop", "phone", "cable"]).nullable().optional(),
    durationMinutes: z.number().int().nullable().optional(),
    destination: z.string().max(60).nullable().optional(),
    lostOrFound: z.enum(["lost", "found"]).nullable().optional(),
  }).default({}),
  isDemo: z.boolean().optional(),
});
export type CreatePostInput = z.infer<typeof CreatePostSchema>;

export const UpdatePostSchema = CreatePostSchema.partial().extend({
  status: z.enum(["open", "in_progress", "fulfilled", "resolved"]).optional(),
});

export function resolveExpiry(input: Pick<CreatePostInput, "expiry" | "expiresAt">, now = Date.now()): Date {
  switch (input.expiry) {
    case "30m": return new Date(now + 30 * MINUTE);
    case "1h": return new Date(now + HOUR);
    case "3h": return new Date(now + 3 * HOUR);
    case "today": return new Date(endOfCampusDay(now));
    case "custom": {
      if (!input.expiresAt || input.expiresAt <= now) throw new ApiError(400, "Custom expiry must be in the future");
      return new Date(Math.min(input.expiresAt, now + 14 * 24 * HOUR));
    }
  }
}

export async function createPost(author: User | null, input: CreatePostInput, now = Date.now()): Promise<{ post: Post; matches: Awaited<ReturnType<typeof runMatching>> }> {
  if (input.locationId && !getLocation(input.locationId)) throw new ApiError(400, "Unknown campus location");
  const db = getDb();
  const post: Post = {
    id: newId("p"),
    authorId: author?.id ?? null,
    type: input.type,
    category: input.category,
    title: input.title,
    description: input.description,
    summary: input.summary ?? input.description.slice(0, 200),
    locationId: input.locationId,
    locationNote: input.locationNote ?? null,
    startsAt: input.startsAt ? new Date(input.startsAt) : new Date(now),
    expiresAt: resolveExpiry(input, now),
    urgency: input.urgency,
    sourceStatus: input.isDemo ? "demo" : input.type === "event" ? "user_event" : "community",
    status: "open",
    keywords: input.keywords,
    attributes: {
      item: input.attributes.item ?? null, subject: input.attributes.subject ?? null, powerClass: input.attributes.powerClass ?? null,
      durationMinutes: input.attributes.durationMinutes ?? null, destination: input.attributes.destination ?? null, lostOrFound: input.attributes.lostOrFound ?? null,
    },
    isDemo: !!input.isDemo || !!author?.isDemo,
    createdAt: new Date(now),
    updatedAt: new Date(now),
  };
  (await db.insert(schema.posts).values(post));
  bump("posts");
  const matches = await runMatching(post.id, now);
  return { post, matches };
}

export async function getPost(id: string): Promise<Post | null> {
  return (await getDb().select().from(schema.posts).where(eq(schema.posts.id, id)).limit(1))[0] ?? null;
}

export type PostFilters = {
  type?: Post["type"] | Post["type"][];
  category?: Post["category"];
  status?: PostStatus[];
  authorId?: string;
  locationId?: string;
  sinceMs?: number;
  includeExpired?: boolean;
  q?: string;
  limit?: number;
};

/** Live posts, newest first. Expired posts are excluded unless asked for. */
export async function listPosts(f: PostFilters = {}, now = Date.now()): Promise<Post[]> {
  const db = getDb();
  const conds = [ne(schema.posts.status, "deleted")];
  if (f.type) conds.push(Array.isArray(f.type) ? inArray(schema.posts.type, f.type) : eq(schema.posts.type, f.type));
  if (f.category) conds.push(eq(schema.posts.category, f.category));
  if (f.status) conds.push(inArray(schema.posts.status, f.status));
  if (f.authorId) conds.push(eq(schema.posts.authorId, f.authorId));
  if (f.locationId) conds.push(eq(schema.posts.locationId, f.locationId));
  if (f.sinceMs) conds.push(gt(schema.posts.createdAt, new Date(f.sinceMs)));
  if (!f.includeExpired) conds.push(or(isNull(schema.posts.expiresAt), gt(schema.posts.expiresAt, new Date(now)))!);
  if (f.q) {
    const like = `%${f.q.toLowerCase()}%`;
    conds.push(or(sql`lower(${schema.posts.title}) like ${like}`, sql`lower(${schema.posts.description}) like ${like}`, sql`lower(${schema.posts.keywords}::text) like ${like}`)!);
  }
  return (await db.select().from(schema.posts).where(and(...conds)).orderBy(desc(schema.posts.createdAt)).limit(f.limit ?? 200));
}

export async function updatePost(user: User, id: string, patch: z.infer<typeof UpdatePostSchema>, now = Date.now()): Promise<Post> {
  const db = getDb();
  const post = (await getPost(id));
  if (!post || post.status === "deleted") throw new ApiError(404, "Post not found");
  if (post.authorId !== user.id) throw new ApiError(403, "Only the author can edit this post");
  const next: Partial<Post> = { updatedAt: new Date(now) };
  if (patch.title) next.title = patch.title;
  if (patch.description) next.description = patch.description;
  if (patch.summary) next.summary = patch.summary;
  if (patch.category) next.category = patch.category;
  if (patch.type) next.type = patch.type;
  if (patch.urgency) next.urgency = patch.urgency;
  if (patch.locationId !== undefined) {
    if (patch.locationId && !getLocation(patch.locationId)) throw new ApiError(400, "Unknown campus location");
    next.locationId = patch.locationId;
  }
  if (patch.locationNote !== undefined) next.locationNote = patch.locationNote ?? null;
  if (patch.keywords) next.keywords = patch.keywords;
  if (patch.attributes) next.attributes = { ...post.attributes, ...patch.attributes };
  if (patch.expiry) next.expiresAt = resolveExpiry({ expiry: patch.expiry, expiresAt: patch.expiresAt }, now);
  if (patch.status) next.status = patch.status;
  (await db.update(schema.posts).set(next).where(eq(schema.posts.id, id)));
  bump("posts");
  const updated = (await getPost(id))!;
  if (updated.status === "open") void (await runMatching(id, now));
  return updated;
}

export async function deletePost(user: User, id: string) {
  const db = getDb();
  const post = (await getPost(id));
  if (!post || post.status === "deleted") throw new ApiError(404, "Post not found");
  if (post.authorId !== user.id) throw new ApiError(403, "Only the author can delete this post");
  (await db.update(schema.posts).set({ status: "deleted", updatedAt: new Date() }).where(eq(schema.posts.id, id)));
  (await db.update(schema.matches).set({ status: "cancelled", updatedAt: new Date() })
    .where(and(or(eq(schema.matches.requestPostId, id), eq(schema.matches.offerPostId, id)), inArray(schema.matches.status, ["suggested", "accepted"]))));
  bump("posts");
  bump("matches");
}

/** Mark overdue posts expired and warn authors shortly before. Cheap; called from read paths and the sync route. */
export async function sweepExpirations(now = Date.now()) {
  const db = getDb();
  const soon = (await db.select().from(schema.posts)
    .where(and(inArray(schema.posts.status, ["open", "matched"]), lte(schema.posts.expiresAt, new Date(now + 15 * MINUTE)), gt(schema.posts.expiresAt, new Date(now)))));
  for (const p of soon) {
    if (p.authorId) (await notify(p.authorId, { type: "post_expiring", title: "Post expiring soon", body: `"${p.title}" expires in about ${Math.max(1, Math.round((p.expiresAt!.getTime() - now) / MINUTE))} minutes.`, href: `/connect?post=${p.id}`, dedupeKey: `expiring:${p.id}` }));
  }
  const res = (await db.update(schema.posts).set({ status: "expired", updatedAt: new Date(now) })
    .where(and(inArray(schema.posts.status, ["open", "matched"]), lte(schema.posts.expiresAt, new Date(now)))));
  if (res.count > 0) {
    (await db.update(schema.matches).set({ status: "cancelled", updatedAt: new Date(now) }).where(and(eq(schema.matches.status, "suggested"),
      or(inArray(schema.matches.requestPostId, db.select({ id: schema.posts.id }).from(schema.posts).where(eq(schema.posts.status, "expired"))),
        inArray(schema.matches.offerPostId, db.select({ id: schema.posts.id }).from(schema.posts).where(eq(schema.posts.status, "expired")))))));
    bump("posts");
  }
  return res.count;
}

export { REUSE_CATEGORIES };

/** Completed connections that kept an existing item in use (borrowed, returned, shared, eaten instead of binned). A count, never a savings claim. */
export type SharedBreakdown = { total: number; borrowed: number; rehomed: number; returned: number; rides: number; food: number };

export async function sharedBreakdown(): Promise<SharedBreakdown> {
  const db = getDb();
  const rows = (await db.select({ category: schema.posts.category, c: sql<number>`count(*)::int` }).from(schema.matches)
    .innerJoin(schema.posts, eq(schema.posts.id, schema.matches.requestPostId))
    .where(and(eq(schema.matches.status, "completed"), inArray(schema.posts.category, [...REUSE_CATEGORIES])))
    .groupBy(schema.posts.category));
  const by = Object.fromEntries(rows.map((r) => [r.category, r.c])) as Partial<Record<string, number>>;
  const b = { borrowed: by.borrowing ?? 0, rehomed: by.giveaway ?? 0, returned: by.lost_found ?? 0, rides: by.ride ?? 0, food: by.free_food ?? 0 };
  return { total: b.borrowed + b.rehomed + b.returned + b.rides + b.food, ...b };
}

export const sharedCount = async () => (await sharedBreakdown()).total;

/** AquaImpact: what the community board has actually done. Only counts COMPLETED matches —
 *  an open offer or an accepted-but-unfinished match is never counted as an exchange. */
export type ImpactStats = {
  completed: number;        // exchanges marked complete by a participant
  resolvedRequests: number; // request posts that reached "fulfilled"
  peopleHelped: number;     // distinct request authors in completed matches
  demoCompleted: number;    // completed exchanges where a side was demo content (shown separately)
  breakdown: SharedBreakdown;
};

export async function impactStats(): Promise<ImpactStats> {
  const db = getDb();
  const req = alias(schema.posts, "impact_req");
  const off = alias(schema.posts, "impact_off");
  const rows = (await db.select({ requester: req.authorId, reqDemo: req.isDemo, offDemo: off.isDemo })
    .from(schema.matches)
    .innerJoin(req, eq(req.id, schema.matches.requestPostId))
    .innerJoin(off, eq(off.id, schema.matches.offerPostId))
    .where(eq(schema.matches.status, "completed")));
  const fulfilled = (await db.select({ c: sql<number>`count(*)::int` }).from(schema.posts)
    .where(and(eq(schema.posts.type, "request"), inArray(schema.posts.status, ["fulfilled", "resolved"]))))[0]?.c ?? 0;
  return {
    completed: rows.length,
    resolvedRequests: fulfilled,
    peopleHelped: new Set(rows.map((r) => r.requester).filter((x): x is string => !!x)).size,
    demoCompleted: rows.filter((r) => r.reqDemo || r.offDemo).length,
    breakdown: (await sharedBreakdown()),
  };
}

/** Human sentence for the tally, e.g. "4 borrowed · 2 rehomed · 1 ride shared". Empty when nothing yet. */
export function sharedSummary(b: SharedBreakdown): string {
  const parts = [
    b.borrowed && `${b.borrowed} borrowed`, b.rehomed && `${b.rehomed} rehomed`, b.returned && `${b.returned} returned to owners`,
    b.rides && `${b.rides} ride${b.rides === 1 ? "" : "s"} shared`, b.food && `${b.food} food pickup${b.food === 1 ? "" : "s"}`,
  ].filter(Boolean) as string[];
  return parts.join(" · ");
}

export async function activityCounts(now = Date.now()) {
  const live = (await listPosts({ status: ["open", "matched", "in_progress"] }, now));
  const since = now - 24 * HOUR;
  return {
    shared: (await sharedCount()),
    sharedBreakdown: (await sharedBreakdown()),
    impact: (await impactStats()),
    live: live.length,
    requests: live.filter((p) => p.type === "request").length,
    offers: live.filter((p) => p.type === "offer").length,
    alerts: live.filter((p) => p.type === "alert").length,
    last24h: live.filter((p) => p.createdAt.getTime() > since).length,
  };
}
