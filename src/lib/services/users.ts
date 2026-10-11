import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db/client";
import { getLocation } from "@/lib/locations";
import { ApiError } from "@/lib/api";
import { INTERESTS } from "./briefings";
import type { User } from "@/lib/db/schema";

export const ProfileSchema = z.object({
  displayName: z.string().trim().min(2).max(40).optional(),
  avatar: z.string().trim().min(1).max(8).optional(),
  interests: z.array(z.enum(INTERESTS)).max(9).optional(),
  helpSubjects: z.array(z.string().trim().min(1).max(40)).max(12).optional(),
  preferredArea: z.string().nullable().optional(),
  notificationPrefs: z.record(z.string(), z.boolean()).optional(),
});

export async function updateProfile(user: User, patch: z.infer<typeof ProfileSchema>): Promise<User> {
  if (patch.preferredArea && !getLocation(patch.preferredArea)) throw new ApiError(400, "Unknown campus location");
  const db = getDb();
  (await db.update(schema.users).set({
    ...(patch.displayName ? { displayName: patch.displayName } : {}),
    ...(patch.avatar ? { avatar: patch.avatar } : {}),
    ...(patch.interests ? { interests: patch.interests } : {}),
    ...(patch.helpSubjects ? { helpSubjects: patch.helpSubjects } : {}),
    ...(patch.preferredArea !== undefined ? { preferredArea: patch.preferredArea } : {}),
    ...(patch.notificationPrefs ? { notificationPrefs: { ...user.notificationPrefs, ...patch.notificationPrefs } } : {}),
  }).where(eq(schema.users.id, user.id)));
  return (await db.select().from(schema.users).where(eq(schema.users.id, user.id)).limit(1))[0]!;
}

export async function getUser(id: string): Promise<User | null> {
  return (await getDb().select().from(schema.users).where(eq(schema.users.id, id)).limit(1))[0] ?? null;
}

export async function toggleBookmark(user: User, itemType: "post" | "external", itemId: string): Promise<boolean> {
  const db = getDb();
  const existing = (await db.select().from(schema.bookmarks)
    .where(and(eq(schema.bookmarks.userId, user.id), eq(schema.bookmarks.itemType, itemType), eq(schema.bookmarks.itemId, itemId))).limit(1))[0];
  if (existing) {
    (await db.delete(schema.bookmarks).where(and(eq(schema.bookmarks.userId, user.id), eq(schema.bookmarks.itemType, itemType), eq(schema.bookmarks.itemId, itemId))));
    return false;
  }
  (await db.insert(schema.bookmarks).values({ userId: user.id, itemType, itemId, createdAt: new Date() }));
  return true;
}

export async function listBookmarks(user: User) {
  return (await getDb().select().from(schema.bookmarks).where(eq(schema.bookmarks.userId, user.id)));
}
