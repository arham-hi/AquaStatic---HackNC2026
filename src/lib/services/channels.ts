// Messaging-channel glue shared by the web app, the Photon worker and the dev simulator.
// One command handler; no business logic lives in the worker.

import { and, eq, gt, isNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { linkCode } from "@/lib/ids";
import { env } from "@/lib/env";
import { MINUTE } from "@/lib/time";
import { ask } from "./assistant";
import { createPost } from "./posts";
import { getUser } from "./users";
import { rateLimit } from "@/lib/rate-limit";
import type { ParseResult } from "@/lib/ai/types";
import type { User } from "@/lib/db/schema";

export async function createLinkCode(userId: string) {
  const db = getDb();
  const code = linkCode();
  const expiresAt = new Date(Date.now() + 10 * MINUTE);
  (await db.insert(schema.linkCodes).values({ code, userId, expiresAt, usedAt: null }));
  return { code, expiresAt: expiresAt.getTime(), instructions: `Text "LINK ${code}" to the Aqua Static iMessage line within 10 minutes.` };
}

export async function resolveHandle(handle: string): Promise<User | null> {
  const row = (await getDb().select().from(schema.channelLinks).where(eq(schema.channelLinks.handle, handle)).limit(1))[0];
  return row ? (await getUser(row.userId)) : null;
}

async function consumeLinkCode(handle: string, code: string): Promise<User | null> {
  const db = getDb();
  const row = (await db.select().from(schema.linkCodes).where(and(eq(schema.linkCodes.code, code), isNull(schema.linkCodes.usedAt), gt(schema.linkCodes.expiresAt, new Date()))).limit(1))[0];
  if (!row) return null;
  (await db.update(schema.linkCodes).set({ usedAt: new Date() }).where(eq(schema.linkCodes.code, code)));
  (await db.insert(schema.channelLinks).values({ handle, userId: row.userId, createdAt: new Date() })
    .onConflictDoUpdate({ target: schema.channelLinks.handle, set: { userId: row.userId } }));
  return (await getUser(row.userId));
}

// Pending drafts awaiting a YES, keyed by handle. ponytail: in-memory, fine for one worker process.
const pending = new Map<string, { draft: ParseResult; text: string; at: number }>();

export type ChannelReply = { text: string };

/**
 * Handle one inbound text from any channel. `handle` is an opaque, channel-prefixed id such as "imessage:+1555...".
 * Returns the reply text. Never publishes a post without an explicit YES.
 */
export async function handleChannelMessage(handle: string, text: string): Promise<ChannelReply> {
  const rl = rateLimit(`channel:${handle}`, 20, 60_000);
  if (!rl.ok) return { text: "You're sending messages quickly — give it a few seconds." };
  const t = text.trim();
  const base = env.appBaseUrl.replace(/\/$/, "");

  const link = /^link\s+(\d{6})$/i.exec(t);
  if (link) {
    const u = (await consumeLinkCode(handle, link[1]));
    return { text: u ? `Linked! You're ${u.displayName} on Aqua Static. Ask me what's happening, or tell me what you need.` : "That code is invalid or expired. Get a fresh one from your Profile page." };
  }
  if (/^(help|\?)$/i.test(t)) {
    return { text: `Aqua Static — your campus in real time.\n• "What's happening near Davis?"\n• "Any free food?"\n• "I need a charger at the UL"\n• "LINK 123456" to connect your account\nMap: ${base}` };
  }

  const user = (await resolveHandle(handle));
  const pend = pending.get(handle);
  if (pend && /^(yes|y|post it|confirm)$/i.test(t)) {
    pending.delete(handle);
    if (!user) return { text: `To post, first link your account: open ${base}/profile, tap "Link iMessage", then text me LINK <code>.` };
    const d = pend.draft;
    if (!d.locationId) return { text: "I still need a campus location. Reply with the message again including a place (e.g. \"at Davis Library\")." };
    const { post, matches } = await createPost(user, {
      description: pend.text, type: d.type, category: d.category, title: d.title, summary: d.summary, locationId: d.locationId, locationNote: d.locationNote,
      urgency: d.urgency, expiry: d.durationMinutes && d.durationMinutes <= 30 ? "30m" : d.durationMinutes && d.durationMinutes > 90 ? "3h" : "1h", keywords: d.keywords,
      attributes: { item: d.item, subject: d.subject, powerClass: d.powerClass, durationMinutes: d.durationMinutes, destination: d.destination, lostOrFound: d.lostOrFound },
    });
    return { text: `Posted: "${post.title}". ${matches.length ? `I already found ${matches.length} possible match${matches.length > 1 ? "es" : ""} — ` : ""}See it at ${base}/connect?post=${post.id}` };
  }
  if (pend && /^(no|n|cancel)$/i.test(t)) { pending.delete(handle); return { text: "Okay, discarded." }; }

  const reply = await ask(user, t);
  if (reply.draft) {
    pending.set(handle, { draft: reply.draft, text: t, at: Date.now() });
    const d = reply.draft;
    const loc = d.locationId ? ` at ${d.locationId.replace(/-/g, " ")}` : " (no location yet — include one)";
    return { text: `Got it. Post this ${d.type}?\n"${d.title}"${loc}, ${d.urgency} priority.\nReply YES to publish or NO to discard.` };
  }
  const links = reply.sources.slice(0, 3).map((s) => (s.href.startsWith("http") ? s.href : base + s.href));
  return { text: `${reply.answer}${links.length ? `\n\n${links.join("\n")}` : ""}` };
}
