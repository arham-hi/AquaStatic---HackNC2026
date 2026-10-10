// Unified feed: community posts + ingested external items, one shape for the map, Discover, assistant and radio.

import { inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { getLocation, distanceMeters } from "@/lib/locations";
import { startOfCampusDay, endOfCampusDay, HOUR } from "@/lib/time";
import { listPosts, sweepExpirations } from "./posts";
import { listExternalItems, refreshIfStale } from "./sources";
import { SOURCE_DEFS } from "@/lib/sources/adapters";
import type { ExternalItem, Post, PostCategory } from "@/lib/db/schema";

export type FeedItem = {
  id: string; // "post:<id>" | "ext:<id>"
  kind: "post" | "external";
  refId: string;
  type: string; // request | offer | event | news | alert | notice
  category: PostCategory;
  title: string;
  summary: string;
  sourceLabel: string; // "Maya (demo)" | "UNC Events Calendar"
  sourceStatus: "community" | "user_event" | "official" | "demo";
  trust: "official" | "community" | "demo"; // what the badge says
  url: string | null;
  href: string; // in-app link
  locationId: string | null;
  locationName: string | null;
  lat: number | null;
  lng: number | null;
  at: number; // primary sort time
  startsAt: number | null;
  endsAt: number | null;
  expiresAt: number | null;
  status: string;
  urgency: "low" | "soon" | "urgent";
  isDemo: boolean;
  authorId: string | null;
  authorName: string | null;
  authorAvatar: string | null;
  imageUrl: string | null;
  createdAt: number;
};

export function postToFeed(p: Post, author?: { displayName: string; avatar: string; isDemo: boolean } | null): FeedItem {
  const loc = getLocation(p.locationId);
  return {
    id: `post:${p.id}`, kind: "post", refId: p.id, type: p.type, category: p.category, title: p.title, summary: p.summary,
    sourceLabel: author ? `${author.displayName}${author.isDemo ? " (demo)" : ""}` : "Community",
    sourceStatus: p.sourceStatus, trust: p.isDemo ? "demo" : "community",
    url: null, href: `/connect?post=${p.id}`, locationId: p.locationId, locationName: loc?.name ?? null, lat: loc?.lat ?? null, lng: loc?.lng ?? null,
    at: p.createdAt.getTime(), startsAt: p.startsAt?.getTime() ?? null, endsAt: null, expiresAt: p.expiresAt?.getTime() ?? null,
    status: p.status, urgency: p.urgency, isDemo: p.isDemo, authorId: p.authorId, authorName: author?.displayName ?? null, authorAvatar: author?.avatar ?? null,
    imageUrl: null, createdAt: p.createdAt.getTime(),
  };
}

export function externalToFeed(e: ExternalItem): FeedItem {
  const src = SOURCE_DEFS.find((s) => s.id === e.sourceId);
  const loc = getLocation(e.locationId);
  const at = e.type === "event" ? (e.startsAt?.getTime() ?? e.createdAt.getTime()) : (e.publishedAt?.getTime() ?? e.createdAt.getTime());
  return {
    id: `ext:${e.id}`, kind: "external", refId: e.id, type: e.type, category: e.category, title: e.title, summary: e.summary,
    sourceLabel: src?.name ?? e.sourceId, sourceStatus: "official", trust: "official",
    url: e.url, href: `/discover?item=${encodeURIComponent(e.id)}`, locationId: e.locationId, locationName: e.locationName ?? loc?.name ?? null,
    lat: e.lat ?? loc?.lat ?? null, lng: e.lng ?? loc?.lng ?? null,
    at, startsAt: e.startsAt?.getTime() ?? null, endsAt: e.endsAt?.getTime() ?? null, expiresAt: e.endsAt?.getTime() ?? null,
    status: "open", urgency: e.type === "alert" && !/normal conditions|all clear|resolved/i.test(e.title) ? "urgent" : "low", isDemo: false, authorId: null, authorName: null, authorAvatar: null,
    imageUrl: e.imageUrl, createdAt: e.createdAt.getTime(),
  };
}

export const FEED_FILTERS = ["all", "events", "news", "requests", "offers", "lost_found", "alerts", "transit", "food"] as const;
export type FeedFilter = (typeof FEED_FILTERS)[number];
export const FEED_WINDOWS = ["recent", "today", "upcoming", "all"] as const;
export type FeedWindow = (typeof FEED_WINDOWS)[number];

export type FeedQuery = {
  filter?: FeedFilter; window?: FeedWindow; q?: string; locationId?: string;
  near?: { lat: number; lng: number; meters: number }; limit?: number; offset?: number; includeExternal?: boolean;
};

function authorsFor(posts: Post[]) {
  const ids = Array.from(new Set(posts.map((p) => p.authorId).filter(Boolean) as string[]));
  if (!ids.length) return new Map<string, { displayName: string; avatar: string; isDemo: boolean }>();
  const rows = getDb().select({ id: schema.users.id, displayName: schema.users.displayName, avatar: schema.users.avatar, isDemo: schema.users.isDemo }).from(schema.users).where(inArray(schema.users.id, ids)).all();
  return new Map(rows.map((r) => [r.id, r]));
}

export function listFeed(qy: FeedQuery = {}, now = Date.now()): { items: FeedItem[]; total: number } {
  sweepExpirations(now);
  if (qy.includeExternal !== false) refreshIfStale(now);
  const filter = qy.filter ?? "all";
  const win = qy.window ?? "recent";

  const posts = listPosts({ status: ["open", "matched", "in_progress"], q: qy.q, locationId: qy.locationId, limit: 400 }, now);
  const authors = authorsFor(posts);
  let items: FeedItem[] = posts.map((p) => postToFeed(p, authors.get(p.authorId ?? "")));
  if (qy.includeExternal !== false) {
    const ext = [
      ...listExternalItems({ type: "event", upcomingOnly: true, q: qy.q, locationId: qy.locationId, limit: 150 }, now),
      ...listExternalItems({ type: "news", sinceMs: now - 7 * 24 * HOUR, q: qy.q, limit: 60 }, now),
      ...listExternalItems({ type: "alert", sinceMs: now - 14 * 24 * HOUR, q: qy.q, limit: 20 }, now),
    ];
    items.push(...ext.map(externalToFeed));
  }

  items = items.filter((it) => {
    switch (filter) {
      case "events": return it.type === "event" || it.category === "event";
      case "news": return it.type === "news";
      case "requests": return it.type === "request";
      case "offers": return it.type === "offer";
      case "lost_found": return it.category === "lost_found";
      case "alerts": return it.type === "alert" || it.category === "alert";
      case "transit": return it.category === "transit" || it.type === "notice";
      case "food": return it.category === "free_food";
      default: return true;
    }
  });

  const sod = startOfCampusDay(now), eod = endOfCampusDay(now);
  items = items.filter((it) => {
    const t = it.startsAt ?? it.at;
    switch (win) {
      case "today": return (it.kind === "post" && it.createdAt >= sod) || (t >= sod && t <= eod) || (it.startsAt != null && it.startsAt <= eod && (it.endsAt ?? it.startsAt) >= sod);
      case "upcoming": return it.startsAt != null && it.startsAt > now;
      case "recent": return it.kind === "post" || it.type === "alert" || (it.type === "news" && it.at > now - 3 * 24 * HOUR) || (it.startsAt != null && it.startsAt < now + 3 * 24 * HOUR);
      default: return true;
    }
  });

  if (qy.near) {
    const n = qy.near;
    items = items.filter((it) => it.lat != null && it.lng != null && distanceMeters(n.lat, n.lng, it.lat, it.lng) <= n.meters);
  }

  // Sort: urgent alerts first, then community posts by recency interleaved with soonest events.
  const rank = (it: FeedItem) => (it.type === "alert" ? 0 : it.kind === "post" ? 1 : 2);
  items.sort((a, b) => rank(a) - rank(b) || (a.kind === "external" && a.type === "event" && b.kind === "external" && b.type === "event" ? a.at - b.at : b.at - a.at));

  const total = items.length;
  const offset = qy.offset ?? 0;
  return { items: items.slice(offset, offset + (qy.limit ?? 60)), total };
}

/** Everything with coordinates, for the map. */
export function mapMarkers(now = Date.now()): FeedItem[] {
  return listFeed({ filter: "all", window: "recent", limit: 500 }, now).items.filter((i) => i.lat != null && i.lng != null);
}
