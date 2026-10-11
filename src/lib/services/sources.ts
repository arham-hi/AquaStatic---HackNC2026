import { and, desc, eq, gt, inArray, lt, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { bump } from "@/lib/realtime";
import { findLocationInText, nearestLocation } from "@/lib/locations";
import { SOURCE_DEFS, fetchSource, type RawItem, type SourceDef } from "@/lib/sources/adapters";
import { classifyExternal } from "@/lib/ai";
import { env, hasGemini } from "@/lib/env";
import { HOUR, MINUTE } from "@/lib/time";
import type { ExternalItem, PostCategory } from "@/lib/db/schema";

const REFRESH_TTL = 15 * MINUTE;
const CAMPUS_BOUNDS = { minLat: 35.88, maxLat: 35.94, minLng: -79.09, maxLng: -79.0 };

export async function ensureSources() {
  const db = getDb();
  for (const d of SOURCE_DEFS) {
    (await db.insert(schema.externalSources).values({ id: d.id, name: d.name, url: d.url, adapter: d.adapter, kind: d.kind, enabled: true, lastFetchedAt: null, lastError: null, lastCount: 0 })
      .onConflictDoUpdate({ target: schema.externalSources.id, set: { name: d.name, url: d.url, adapter: d.adapter, kind: d.kind } }));
  }
}

export async function listSources() {
  (await ensureSources());
  const rows = (await getDb().select().from(schema.externalSources));
  return rows.map((r) => ({ ...r, homepage: SOURCE_DEFS.find((d) => d.id === r.id)?.homepage ?? r.url }));
}

function localCategory(def: SourceDef, item: RawItem): PostCategory {
  if (def.kind === "alerts") return "alert";
  if (def.kind === "news") return "news";
  const t = `${item.title} ${item.summary}`.toLowerCase();
  if (/\bfree (food|pizza|lunch|dinner|breakfast|snacks|boba|donuts|bagels|coffee|cookies)\b|\bfood provided\b|\bfree food\b/.test(t)) return "free_food";
  if (/\bstudy (session|group|hall)\b|\btutoring\b|\boffice hours\b/.test(t)) return "study";
  return "event";
}

function placeFor(item: RawItem) {
  const inBounds = item.lat != null && item.lng != null && item.lat > CAMPUS_BOUNDS.minLat && item.lat < CAMPUS_BOUNDS.maxLat && item.lng > CAMPUS_BOUNDS.minLng && item.lng < CAMPUS_BOUNDS.maxLng;
  const byText = item.locationName ? findLocationInText(item.locationName) : null;
  const byCoord = inBounds ? nearestLocation(item.lat!, item.lng!, 120) : null;
  const loc = byText ?? byCoord;
  return { locationId: loc?.id ?? null, lat: inBounds ? item.lat : loc?.lat ?? null, lng: inBounds ? item.lng : loc?.lng ?? null };
}

export async function refreshSource(id: string, now = Date.now()): Promise<{ id: string; ok: boolean; count: number; error?: string }> {
  const def = SOURCE_DEFS.find((d) => d.id === id);
  if (!def) return { id, ok: false, count: 0, error: "Unknown source (not allowlisted)" };
  const db = getDb();
  (await ensureSources());
  try {
    const items = await fetchSource(def, now);
    let inserted = 0;
    // Gemini classification of feed items is off by default: on the free tier (20 requests/day) it would eat the
    // whole budget on ingestion. Set SOURCES_USE_GEMINI=true to spend up to 6 calls per refresh on new events.
    let aiBudget = hasGemini() && process.env.SOURCES_USE_GEMINI === "true" ? 6 : 0;
    for (const it of items) {
      const dedupeKey = `${def.id}:${(it.url || it.providerId).toLowerCase().replace(/[#?].*$/, "")}`;
      const exists = (await db.select({ id: schema.externalItems.id }).from(schema.externalItems).where(eq(schema.externalItems.dedupeKey, dedupeKey)).limit(1))[0];
      if (exists) continue;
      const place = placeFor(it);
      let category = localCategory(def, it);
      let summary = it.summary;
      let locationId = place.locationId;
      if (aiBudget > 0 && def.kind === "events") {
        aiBudget--;
        const ai = await classifyExternal(it.title, it.summary, it.locationName);
        if (ai) {
          // AI may refine category/summary; it may only fill a location that the source left empty.
          if (["event", "free_food", "study", "other"].includes(ai.category)) category = ai.category;
          if (ai.summary) summary = ai.summary;
          if (!locationId && ai.locationId) locationId = ai.locationId;
        }
      }
      (await db.insert(schema.externalItems).values({
        id: `${def.id}:${it.providerId}`.slice(0, 200), sourceId: def.id, providerId: it.providerId.slice(0, 180),
        type: def.kind === "events" ? "event" : def.kind === "alerts" ? "alert" : "news",
        title: it.title.slice(0, 200), summary, url: it.url, imageUrl: it.imageUrl, publishedAt: it.publishedAt ? new Date(it.publishedAt) : null,
        startsAt: it.startsAt ? new Date(it.startsAt) : null, endsAt: it.endsAt ? new Date(it.endsAt) : null,
        locationName: it.locationName, lat: place.lat, lng: place.lng, locationId, category, dedupeKey, createdAt: new Date(now),
      }).onConflictDoNothing());
      inserted++;
    }
    (await db.update(schema.externalSources).set({ lastFetchedAt: new Date(now), lastError: null, lastCount: items.length }).where(eq(schema.externalSources.id, id)));
    if (inserted) bump("sources");
    return { id, ok: true, count: items.length };
  } catch (e) {
    const msg = (e as Error).name === "AbortError" ? "Timed out" : (e as Error).message;
    (await db.update(schema.externalSources).set({ lastFetchedAt: new Date(now), lastError: msg }).where(eq(schema.externalSources.id, id)));
    console.warn(`[sources] ${id} failed: ${msg}`);
    return { id, ok: false, count: 0, error: msg };
  }
}

export async function refreshAllSources(opts: { force?: boolean } = {}, now = Date.now()) {
  (await ensureSources());
  const rows = (await getDb().select().from(schema.externalSources).where(eq(schema.externalSources.enabled, true)));
  const due = rows.filter((r) => opts.force || !r.lastFetchedAt || now - r.lastFetchedAt.getTime() > REFRESH_TTL);
  return Promise.all(due.map(async (r) => (await refreshSource(r.id, now))));
}

let refreshing: Promise<unknown> | null = null;
/** Fire-and-forget refresh when data is stale. Readers never wait on the network. */
export async function refreshIfStale(now = Date.now()) {
  if (!env.sourceAutoRefresh) return;
  if (refreshing) return;
  const rows = (await getDb().select().from(schema.externalSources));
  const stale = !rows.length || rows.some((r) => r.enabled && (!r.lastFetchedAt || now - r.lastFetchedAt.getTime() > REFRESH_TTL));
  if (!stale) return;
  refreshing = refreshAllSources({}, now).catch((error) => { console.warn("[sources] Background refresh failed:", error instanceof Error ? error.name : "unknown"); }).finally(() => { refreshing = null; });
}

export type ExternalFilters = { type?: "event" | "news" | "alert"; upcomingOnly?: boolean; sinceMs?: number; q?: string; locationId?: string; limit?: number };

export async function listExternalItems(f: ExternalFilters = {}, now = Date.now()): Promise<ExternalItem[]> {
  const db = getDb();
  const conds = [];
  if (f.type) conds.push(eq(schema.externalItems.type, f.type));
  if (f.locationId) conds.push(eq(schema.externalItems.locationId, f.locationId));
  if (f.upcomingOnly) conds.push(or(gt(schema.externalItems.endsAt, new Date(now)), and(sql`${schema.externalItems.endsAt} is null`, gt(schema.externalItems.startsAt, new Date(now - 2 * HOUR))))!);
  if (f.sinceMs) conds.push(or(gt(schema.externalItems.publishedAt, new Date(f.sinceMs)), gt(schema.externalItems.startsAt, new Date(f.sinceMs)))!);
  if (f.q) {
    const like = `%${f.q.toLowerCase()}%`;
    conds.push(or(sql`lower(${schema.externalItems.title}) like ${like}`, sql`lower(${schema.externalItems.summary}) like ${like}`, sql`lower(coalesce(${schema.externalItems.locationName}, '')) like ${like}`)!);
  }
  // Events sort by start time ascending (what's next); news/alerts by publish time descending.
  const q = db.select().from(schema.externalItems).where(conds.length ? and(...conds) : undefined);
  const rows = f.type === "event"
    ? (await q.orderBy(schema.externalItems.startsAt).limit(f.limit ?? 200))
    : (await q.orderBy(desc(sql`coalesce(${schema.externalItems.publishedAt}, ${schema.externalItems.startsAt}, ${schema.externalItems.createdAt})`)).limit(f.limit ?? 200));
  return rows;
}

export async function getExternalItem(id: string): Promise<ExternalItem | null> {
  return (await getDb().select().from(schema.externalItems).where(eq(schema.externalItems.id, id)).limit(1))[0] ?? null;
}

export async function getExternalItems(ids: string[]): Promise<ExternalItem[]> {
  if (!ids.length) return [];
  return (await getDb().select().from(schema.externalItems).where(inArray(schema.externalItems.id, ids)));
}

/** Drop stale items so the table does not grow forever (events long past, news older than 30 days). */
export async function pruneExternal(now = Date.now()) {
  const db = getDb();
  (await db.delete(schema.externalItems).where(and(eq(schema.externalItems.type, "event"), lt(schema.externalItems.endsAt, new Date(now - 2 * 24 * HOUR)))));
  (await db.delete(schema.externalItems).where(and(sql`${schema.externalItems.type} != 'event'`, lt(schema.externalItems.publishedAt, new Date(now - 30 * 24 * HOUR)))));
}
