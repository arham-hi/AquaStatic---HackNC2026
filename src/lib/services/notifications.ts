import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { newId } from "@/lib/ids";
import { bump } from "@/lib/realtime";
import type { NotificationType } from "@/lib/db/schema";

export type NotifyInput = {
  type: NotificationType; title: string; body: string; href?: string | null; dedupeKey: string; metadata?: Record<string, unknown>;
};

/** Insert a notification unless the same (user, dedupeKey) already exists. */
export function notify(userId: string, n: NotifyInput): boolean {
  const db = getDb();
  const res = db.insert(schema.notifications).values({
    id: newId("n"), userId, type: n.type, title: n.title, body: n.body, href: n.href ?? null,
    metadata: n.metadata ?? {}, dedupeKey: n.dedupeKey, readAt: null, createdAt: new Date(),
  }).onConflictDoNothing().run();
  const created = res.changes > 0;
  if (created) bump("notifications");
  return created;
}

export function listNotifications(userId: string, limit = 50) {
  const db = getDb();
  return db.select().from(schema.notifications).where(eq(schema.notifications.userId, userId)).orderBy(desc(schema.notifications.createdAt)).limit(limit).all();
}

export function unreadCount(userId: string): number {
  const db = getDb();
  const row = db.select({ c: sql<number>`count(*)` }).from(schema.notifications)
    .where(and(eq(schema.notifications.userId, userId), isNull(schema.notifications.readAt))).get();
  return row?.c ?? 0;
}

export function markRead(userId: string, id: string) {
  const db = getDb();
  db.update(schema.notifications).set({ readAt: new Date() })
    .where(and(eq(schema.notifications.userId, userId), eq(schema.notifications.id, id), isNull(schema.notifications.readAt))).run();
  bump("notifications");
}

export function markAllRead(userId: string) {
  const db = getDb();
  db.update(schema.notifications).set({ readAt: new Date() })
    .where(and(eq(schema.notifications.userId, userId), isNull(schema.notifications.readAt))).run();
  bump("notifications");
}
