// Unified feed: community posts + ingested external items, one shape for the map, Discover, assistant and radio.

import { inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { getLocation, distanceMeters } from "@/lib/locations";
import { startOfCampusDay, endOfCampusDay, HOUR, DAY } from "@/lib/time";
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
  filter?: FeedFilter; window?: FeedWindow; q?: string; locationId?: string; interests?: string[];
  near?: { lat: number; lng: number; meters: number }; limit?: number; offset?: number; includeExternal?: boolean;
};

/** Does an item match the user's stated interests? Shared by the feed ranker and radio briefings. */
export function matchesInterest(it: FeedItem, interests: string[]): boolean {
  if (!interests.length) return true;
  const t = `${it.title} ${it.summary}`.toLowerCase();
  return interests.some((i) => {
    switch (i) {
      case "academics": return ["tutoring", "study"].includes(it.category) || /\blecture\b|\bseminar\b|\bresearch\b|\bexam\b/.test(t);
      case "social": return it.type === "event" && !/\bcareer\b|\blecture\b/.test(t);
      case "free_food": return it.category === "free_food" || /\bfood\b|\bpizza\b/.test(t);
      case "sports": return /\bgame\b|\bbasketball\b|\bfootball\b|\bsoccer\b|\btar heels\b|\bathletic/.test(t);
      case "career": return /\bcareer\b|\binternship\b|\bjob\b|\bhiring\b|\bresume\b|\bnetworking\b/.test(t);
      case "community": return it.type === "request" || it.type === "offer" || it.category === "lost_found";
      case "transit": return it.category === "transit" || it.type === "notice";
      case "news": return it.type === "news";
      case "culture": return /\bart\b|\bmusic\b|\bconcert\b|\btheat|\bperformance\b|\bfilm\b|\bmuseum\b/.test(t);
      default: return false;
    }
  });
}

async function authorsFor(posts: Post[]) {
  const ids = Array.from(new Set(posts.map((p) => p.authorId).filter(Boolean) as string[]));
  if (!ids.length) return new Map<string, { displayName: string; avatar: string; isDemo: boolean }>();
  const rows = (await getDb().select({ id: schema.users.id, displayName: schema.users.displayName, avatar: schema.users.avatar, isDemo: schema.users.isDemo }).from(schema.users).where(inArray(schema.users.id, ids)));
  return new Map(rows.map((r) => [r.id, r]));
}

export async function listFeed(qy: FeedQuery = {}, now = Date.now()): Promise<{ items: FeedItem[]; total: number }> {
  (await sweepExpirations(now));
  if (qy.includeExternal !== false) (await refreshIfStale(now));
  const filter = qy.filter ?? "all";
  const win = qy.window ?? "recent";

  const posts = (await listPosts({ status: ["open", "matched", "in_progress"], q: qy.q, locationId: qy.locationId, limit: 400 }, now));
  const authors = (await authorsFor(posts));
  let items: FeedItem[] = posts.map((p) => postToFeed(p, authors.get(p.authorId ?? "")));
  if (qy.includeExternal !== false) {
    const ext = [
      ...(await listExternalItems({ type: "event", upcomingOnly: true, q: qy.q, locationId: qy.locationId, limit: 150 }, now)),
      ...(await listExternalItems({ type: "news", sinceMs: now - 7 * 24 * HOUR, q: qy.q, limit: 60 }, now)),
      ...(await listExternalItems({ type: "alert", sinceMs: now - 14 * 24 * HOUR, q: qy.q, limit: 20 }, now)),
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
  // Fresh alerts first, then community posts, then everything else. Old alerts fall back into the stream.
  const rank = (it: FeedItem) => (it.type === "alert" && it.at > now - 2 * DAY ? 0 : it.kind === "post" ? 1 : 2);
  const interests = qy.interests ?? [];
  // Personalization is a tiebreak inside each rank bucket — it never hides or suppresses anything.
  const pref = (it: FeedItem) => (interests.length && matchesInterest(it, interests) ? 0 : 1);
  items.sort((a, b) => rank(a) - rank(b) || pref(a) - pref(b) || (a.kind === "external" && a.type === "event" && b.kind === "external" && b.type === "event" ? a.at - b.at : b.at - a.at));

  const total = items.length;
  const offset = qy.offset ?? 0;
  return { items: items.slice(offset, offset + (qy.limit ?? 60)), total };
}

/** Everything with coordinates, for the map. */
export async function mapMarkers(now = Date.now()): Promise<FeedItem[]> {
  return (await listFeed({ filter: "all", window: "recent", limit: 500 }, now)).items.filter((i) => i.lat != null && i.lng != null);
}
