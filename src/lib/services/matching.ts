// Deterministic, explainable matching. Pure scoring function + a DB runner.
// Weights are configurable; hard rejects happen before any scoring.

import { and, eq, inArray, or } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { distanceMeters, getLocation } from "@/lib/locations";
import { newId } from "@/lib/ids";
import { bump } from "@/lib/realtime";
import { notify } from "./notifications";
import type { Match, MatchExplanation, Post } from "@/lib/db/schema";

export const WEIGHTS = { category: 0.4, availability: 0.25, location: 0.2, semantic: 0.15 };
export const MATCH_THRESHOLD = 0.55;

const tokens = (s: string | null | undefined) => new Set((s ?? "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2));
const jaccard = (a: Set<string>, b: Set<string>) => {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
};

export type ScoreResult = { ok: true; score: number; explanation: MatchExplanation } | { ok: false; reason: string };

export function scoreMatch(request: Post, offer: Post, now = Date.now()): ScoreResult {
  // ---- hard rejects ----
  if (request.type !== "request" || offer.type !== "offer") return { ok: false, reason: "not a request/offer pair" };
  if (request.id === offer.id) return { ok: false, reason: "same post" };
  if (request.authorId && request.authorId === offer.authorId) return { ok: false, reason: "same author" };
  for (const p of [request, offer]) {
    if (p.status !== "open") return { ok: false, reason: `${p.type} is ${p.status}` };
    if (p.expiresAt && p.expiresAt.getTime() <= now) return { ok: false, reason: `${p.type} expired` };
  }
  if (request.category !== offer.category) return { ok: false, reason: "different categories" };
  if (request.category === "lost_found") {
    if (request.attributes.lostOrFound === offer.attributes.lostOrFound) return { ok: false, reason: "both lost or both found" };
  }
  const ra = request.attributes, oa = offer.attributes;
  // A phone cable cannot satisfy a laptop charger request.
  if (ra.powerClass === "laptop" && oa.powerClass && oa.powerClass !== "laptop") return { ok: false, reason: "offer cannot power a laptop" };

  // ---- category / item (40%) ----
  let itemScore = 0.6; // same category baseline
  let itemDetail = `Both are ${request.category.replace("_", " & ")}`;
  const ri = ra.item ?? ra.subject ?? ra.destination, oi = oa.item ?? oa.subject ?? oa.destination;
  if (ri && oi) {
    const sim = jaccard(tokens(ri), tokens(oi));
    const exact = ri.toLowerCase() === oi.toLowerCase();
    const samePower = !!(ra.powerClass && oa.powerClass && ra.powerClass === oa.powerClass);
    // Both sides name what they mean and the names share nothing: a calculator is not a charger.
    if (!exact && sim === 0 && !samePower) return { ok: false, reason: `different items (${ri} vs ${oi})` };
    itemScore = exact ? 1 : sim >= 0.5 ? 0.9 : sim > 0 ? 0.75 : 0.6;
    itemDetail = exact ? `Same item: ${ri}` : sim > 0 ? `${ri} ≈ ${oi}` : `${ri} vs ${oi}`;
    if (ra.powerClass && oa.powerClass && ra.powerClass === oa.powerClass) itemScore = Math.max(itemScore, 0.95);
  } else if (ri || oi) {
    itemScore = 0.55;
    itemDetail = `Only one side names the item (${ri ?? oi})`;
  }

  // ---- availability overlap (25%) ----
  const rs = request.startsAt?.getTime() ?? now, re = request.expiresAt?.getTime() ?? now + 3 * 3600_000;
  const os = offer.startsAt?.getTime() ?? now, oe = offer.expiresAt?.getTime() ?? now + 3 * 3600_000;
  const overlap = Math.min(re, oe) - Math.max(rs, os);
  const need = Math.max(1, re - rs);
  let availScore = 0;
  let availDetail = "No overlapping time window";
  if (overlap > 0) {
    availScore = Math.min(1, overlap / Math.min(need, 2 * 3600_000));
    availScore = Math.max(availScore, 0.5); // any real overlap is useful
    availDetail = `Windows overlap for ~${Math.round(overlap / 60000)} min`;
  }

  // ---- location (20%) ----
  let locScore = 0.5;
  let locDetail = "Location unknown on one side";
  const rl = getLocation(request.locationId), ol = getLocation(offer.locationId);
  if (rl && ol) {
    if (rl.id === ol.id) { locScore = 1; locDetail = `Both at ${rl.name}`; }
    else {
      const d = distanceMeters(rl.lat, rl.lng, ol.lat, ol.lng);
      locScore = d < 250 ? 0.85 : d < 600 ? 0.6 : d < 1200 ? 0.35 : 0.1;
      locDetail = `${Math.round(d)} m apart (${rl.name} ↔ ${ol.name})`;
    }
  }

  // ---- semantic / keywords (15%) ----
  const semScore = Math.min(1, jaccard(new Set(request.keywords), new Set(offer.keywords)) * 2.5 + (ra.subject && oa.subject && ra.subject === oa.subject ? 0.5 : 0));
  const semDetail = semScore > 0 ? "Shared keywords" : "Few shared keywords";

  const parts = [
    { label: "Item & category", weight: WEIGHTS.category, score: itemScore, detail: itemDetail },
    { label: "Availability", weight: WEIGHTS.availability, score: availScore, detail: availDetail },
    { label: "Location", weight: WEIGHTS.location, score: locScore, detail: locDetail },
    { label: "Keywords", weight: WEIGHTS.semantic, score: semScore, detail: semDetail },
  ];
  const total = parts.reduce((s, p) => s + p.weight * p.score, 0);
  if (overlap <= 0) return { ok: false, reason: "availability windows do not overlap" };
  const reason = `${itemDetail}. ${locDetail}. ${availDetail}.`;
  return { ok: true, score: Math.round(total * 100) / 100, explanation: { total, parts, reason } };
}

/** Find and persist matches for a freshly created/updated post. Returns created match rows. */
export async function runMatching(postId: string, now = Date.now()): Promise<Match[]> {
  const db = getDb();
  const post = (await db.select().from(schema.posts).where(eq(schema.posts.id, postId)).limit(1))[0];
  if (!post || (post.type !== "request" && post.type !== "offer") || post.status !== "open") return [];
  const wantType = post.type === "request" ? "offer" : "request";
  const candidates = (await db.select().from(schema.posts)
    .where(and(eq(schema.posts.type, wantType), eq(schema.posts.status, "open"), eq(schema.posts.category, post.category))));
  if (!candidates.length) return [];

  // Blocks in either direction remove the candidate.
  const blockRows = post.authorId
    ? (await db.select().from(schema.blocks).where(or(eq(schema.blocks.userId, post.authorId), eq(schema.blocks.blockedUserId, post.authorId))))
    : [];
  const blocked = new Set(blockRows.flatMap((b) => [b.userId, b.blockedUserId]));

  // Existing match rows (declined pairs are never re-suggested).
  const existing = (await db.select().from(schema.matches)
    .where(post.type === "request" ? eq(schema.matches.requestPostId, post.id) : eq(schema.matches.offerPostId, post.id)));
  const existingByOther = new Map(existing.map((m) => [post.type === "request" ? m.offerPostId : m.requestPostId, m]));

  const created: Match[] = [];
  for (const c of candidates) {
    if (c.authorId && blocked.has(c.authorId)) continue;
    if (existingByOther.has(c.id)) continue;
    const request = post.type === "request" ? post : c;
    const offer = post.type === "offer" ? post : c;
    const r = scoreMatch(request, offer, now);
    if (!r.ok || r.score < MATCH_THRESHOLD) continue;
    const row: Match = {
      id: newId("m"), requestPostId: request.id, offerPostId: offer.id, score: r.score, explanation: r.explanation,
      status: "suggested", requesterAccepted: false, offererAccepted: false, createdAt: new Date(now), updatedAt: new Date(now),
    };
    (await db.insert(schema.matches).values(row));
    created.push(row);
    const authors = (await db.select().from(schema.users).where(inArray(schema.users.id, [request.authorId, offer.authorId].filter(Boolean) as string[])));
    const nameOf = (id: string | null) => authors.find((a) => a.id === id)?.displayName ?? "A student";
    if (request.authorId) {
      (await notify(request.authorId, {
        type: "match_suggested", title: "Potential match found",
        body: `${nameOf(offer.authorId)} may have what you're looking for: ${offer.title}`,
        href: `/connect?match=${row.id}`, dedupeKey: `match:${row.id}`, metadata: { matchId: row.id, postId: request.id },
      }));
    }
    if (offer.authorId) {
      (await notify(offer.authorId, {
        type: "match_suggested", title: "Someone needs what you offered",
        body: `${nameOf(request.authorId)} posted: ${request.title}`,
        href: `/connect?match=${row.id}`, dedupeKey: `match:${row.id}`, metadata: { matchId: row.id, postId: offer.id },
      }));
    }
  }
  if (created.length) bump("matches");
  return created;
}
