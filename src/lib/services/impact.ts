// AquaImpact dashboard: every number is derived from completed matches in the database.
// Nothing here is projected, estimated, or converted into dollars/CO2 — only events
// the backend actually confirmed. Demo records are counted separately and labeled.

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb, schema } from "@/lib/db/client";
import { getLocation } from "@/lib/locations";
import { HOUR } from "@/lib/time";
import { sharedBreakdown, REUSE_CATEGORIES, type SharedBreakdown } from "./posts";
import type { PostCategory } from "@/lib/db/schema";

/** A metric with its demo-content share separated, so seeded records never masquerade as real impact. */
export type ImpactMetric = { total: number; demo: number };

export type ImpactEvent = {
  id: string;
  at: number; // completion time (match.updatedAt)
  category: PostCategory;
  requestTitle: string;
  offerTitle: string;
  requestLocation: string | null;
  offerLocation: string | null;
  isDemo: boolean;
};

export type ImpactDashboard = {
  /** Completed matches whose request was a genuine share category (borrow, giveaway, lost&found, ride, food). */
  resourcesShared: ImpactMetric;
  /** Subset of resourcesShared where a physical item stayed in circulation (borrow / giveaway / lost&found). */
  reuseActions: ImpactMetric;
  /** Request posts that reached fulfilled/resolved (the same source as the Connect card). */
  helpResolved: ImpactMetric;
  /** Distinct request authors in completed matches. */
  peopleHelped: ImpactMetric;
  /** Distinct participant pairs in completed matches. */
  connections: ImpactMetric;
  completed: number;
  breakdown: SharedBreakdown;
  /** Hourly completion counts for the last 24 hours (epoch ms bucket start → count). */
  series: { t: number; count: number }[];
  recent: ImpactEvent[];
};

const ITEM_CATEGORIES = new Set<PostCategory>(["borrowing", "giveaway", "lost_found"]);

export async function impactDashboard(now = Date.now()): Promise<ImpactDashboard> {
  const db = getDb();
  const req = alias(schema.posts, "impact_req");
  const off = alias(schema.posts, "impact_off");
  const rows = await db.select({
    id: schema.matches.id,
    at: schema.matches.updatedAt,
    reqCategory: req.category,
    reqDemo: req.isDemo,
    offDemo: off.isDemo,
    requester: req.authorId,
    offerer: off.authorId,
    reqTitle: req.title,
    offTitle: off.title,
    reqLoc: req.locationId,
    offLoc: off.locationId,
  })
    .from(schema.matches)
    .innerJoin(req, eq(req.id, schema.matches.requestPostId))
    .innerJoin(off, eq(off.id, schema.matches.offerPostId))
    .where(eq(schema.matches.status, "completed"))
    .orderBy(desc(schema.matches.updatedAt));

  const metric = () => ({ total: 0, demo: 0 });
  const resourcesShared = metric();
  const reuseActions = metric();
  const peopleHelped = metric();
  const connections = metric();
  const helpedIds = new Set<string>();
  const helpedDemoIds = new Set<string>();
  const pairs = new Set<string>();
  const demoPairs = new Set<string>();
  const reuseSet = new Set<string>(REUSE_CATEGORIES);

  for (const r of rows) {
    const demo = r.reqDemo || r.offDemo;
    const bump = (m: ImpactMetric) => { m.total += 1; if (demo) m.demo += 1; };
    if (reuseSet.has(r.reqCategory)) bump(resourcesShared);
    if (ITEM_CATEGORIES.has(r.reqCategory)) bump(reuseActions);
    if (r.requester) {
      if (!helpedIds.has(r.requester)) helpedIds.add(r.requester);
      if (demo) helpedDemoIds.add(r.requester);
    }
    if (r.requester && r.offerer && r.requester !== r.offerer) {
      const key = [r.requester, r.offerer].sort().join("|");
      if (!pairs.has(key)) {
        pairs.add(key);
        if (demo) demoPairs.add(key);
      }
    }
  }
  peopleHelped.total = helpedIds.size;
  peopleHelped.demo = helpedDemoIds.size;
  connections.total = pairs.size;
  connections.demo = demoPairs.size;

  // Help requests resolved: all request posts marked fulfilled/resolved (matches the Connect card's source).
  const resolved = await db.select({ demo: schema.posts.isDemo, c: sql<number>`count(*)::int` })
    .from(schema.posts)
    .where(and(eq(schema.posts.type, "request"), inArray(schema.posts.status, ["fulfilled", "resolved"])))
    .groupBy(schema.posts.isDemo);
  const helpResolved = metric();
  for (const r of resolved) { helpResolved.total += r.c; if (r.demo) helpResolved.demo += r.c; }

  // Hourly buckets over the last 24h.
  const firstBucket = Math.floor(now / HOUR) * HOUR - 23 * HOUR;
  const counts = new Map<number, number>();
  for (const r of rows) {
    const b = Math.floor(r.at.getTime() / HOUR) * HOUR;
    if (b >= firstBucket) counts.set(b, (counts.get(b) ?? 0) + 1);
  }
  const series = Array.from({ length: 24 }, (_, i) => {
    const t = firstBucket + i * HOUR;
    return { t, count: counts.get(t) ?? 0 };
  });

  const recent: ImpactEvent[] = rows.slice(0, 10).map((r) => ({
    id: r.id,
    at: r.at.getTime(),
    category: r.reqCategory,
    requestTitle: r.reqTitle,
    offerTitle: r.offTitle,
    requestLocation: getLocation(r.reqLoc)?.name ?? null,
    offerLocation: getLocation(r.offLoc)?.name ?? null,
    isDemo: r.reqDemo || r.offDemo,
  }));

  return {
    resourcesShared, reuseActions, helpResolved, peopleHelped, connections,
    completed: rows.length,
    breakdown: await sharedBreakdown(),
    series, recent,
  };
}
