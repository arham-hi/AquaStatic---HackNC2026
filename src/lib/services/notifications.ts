import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { newId } from "@/lib/ids";
import { bump } from "@/lib/realtime";
import type { NotificationType } from "@/lib/db/schema";

export type NotifyInput = {
  type: NotificationType; title: string; body: string; href?: string | null; dedupeKey: string; metadata?: Record<string, unknown>;
};

/** Insert a notification unless the same (user, dedupeKey) already exists. */
export async function notify(userId: string, n: NotifyInput): Promise<boolean> {
  const db = getDb();
  const res = (await db.insert(schema.notifications).values({
    id: newId("n"), userId, type: n.type, title: n.title, body: n.body, href: n.href ?? null,
    metadata: n.metadata ?? {}, dedupeKey: n.dedupeKey, readAt: null, createdAt: new Date(),
  }).onConflictDoNothing());
  const created = res.count > 0;
  if (created) bump("notifications");
  return created;
}

export async function listNotifications(userId: string, limit = 50) {
  const db = getDb();
  return (await db.select().from(schema.notifications).where(eq(schema.notifications.userId, userId)).orderBy(desc(schema.notifications.createdAt)).limit(limit));
}

export async function unreadCount(userId: string): Promise<number> {
  const db = getDb();
  const row = (await db.select({ c: sql<number>`count(*)::int` }).from(schema.notifications)
    .where(and(eq(schema.notifications.userId, userId), isNull(schema.notifications.readAt))).limit(1))[0];
  return row?.c ?? 0;
}

export async function markRead(userId: string, id: string) {
  const db = getDb();
  (await db.update(schema.notifications).set({ readAt: new Date() })
    .where(and(eq(schema.notifications.userId, userId), eq(schema.notifications.id, id), isNull(schema.notifications.readAt))));
  bump("notifications");
}

export async function markAllRead(userId: string) {
  const db = getDb();
  (await db.update(schema.notifications).set({ readAt: new Date() })
    .where(and(eq(schema.notifications.userId, userId), isNull(schema.notifications.readAt))));
  bump("notifications");
}
