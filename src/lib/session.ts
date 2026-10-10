import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { env } from "@/lib/env";
import { getDb, schema } from "@/lib/db/client";
import { newId } from "@/lib/ids";
import type { User } from "@/lib/db/schema";

export const SESSION_COOKIE = "aqua_session";
const MAX_AGE_S = 60 * 60 * 24 * 90;

type Payload = { uid: string; iat: number };

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64url");
const unb64 = (s: string) => Buffer.from(s, "base64url").toString("utf8");
const sign = (data: string) => createHmac("sha256", env.authSecret).update(data).digest("base64url");

export function encodeSession(uid: string): string {
  const data = b64(JSON.stringify({ uid, iat: Date.now() } satisfies Payload));
  return `${data}.${sign(data)}`;
}

export function decodeSession(token: string | undefined | null): Payload | null {
  if (!token) return null;
  const [data, sig] = token.split(".");
  if (!data || !sig) return null;
  const expected = sign(data);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(unb64(data)) as Payload;
    return typeof p.uid === "string" ? p : null;
  } catch {
    return null;
  }
}

export async function setSessionCookie(uid: string) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, encodeSession(uid), {
    httpOnly: true, sameSite: "lax", secure: env.isProd, path: "/", maxAge: MAX_AGE_S,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

/** The signed-in user, or null for anonymous viewers. Never trusts a client-supplied id. */
export async function currentUser(): Promise<User | null> {
  const jar = await cookies();
  const p = decodeSession(jar.get(SESSION_COOKIE)?.value);
  if (!p) return null;
  const db = getDb();
  return db.select().from(schema.users).where(eq(schema.users.id, p.uid)).get() ?? null;
}

const GUEST_NAMES = ["Tar Heel", "Ram", "Heel", "Carolina Student"];

/** Get the current user or create a guest profile and sign them in. Used by write endpoints. */
export async function requireUser(): Promise<User> {
  const existing = await currentUser();
  if (existing) return existing;
  const db = getDb();
  const user: User = {
    id: newId("u"),
    displayName: `${GUEST_NAMES[Math.floor(Math.random() * GUEST_NAMES.length)]} ${Math.floor(1000 + Math.random() * 9000)}`,
    avatar: "🐏",
    interests: [],
    helpSubjects: [],
    preferredArea: null,
    notificationPrefs: { matches: true, messages: true, events: true, browser: false },
    isDemo: false,
    createdAt: new Date(),
  };
  db.insert(schema.users).values(user).run();
  await setSessionCookie(user.id);
  return user;
}

/** Public-safe projection of a user (no prefs, no identity internals). */
export function publicUser(u: User | null | undefined) {
  if (!u) return null;
  return { id: u.id, displayName: u.displayName, avatar: u.avatar, isDemo: u.isDemo };
}
