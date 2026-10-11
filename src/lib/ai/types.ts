import { z } from "zod";
import { POST_CATEGORIES, URGENCIES } from "@/lib/db/schema";

// Structured output contracts. Gemini output is validated against these before anything is saved.

export const ParsedPostSchema = z.object({
  type: z.enum(["request", "offer", "event", "news", "alert", "notice"]),
  category: z.enum(POST_CATEGORIES),
  title: z.string().min(3).max(80),
  summary: z.string().min(3).max(200),
  keywords: z.array(z.string().min(1).max(30)).max(12),
  locationId: z.string().nullable(),
  locationNote: z.string().max(80).nullable(),
  item: z.string().max(60).nullable(),
  subject: z.string().max(60).nullable(),
  powerClass: z.enum(["laptop", "phone", "cable"]).nullable(),
  lostOrFound: z.enum(["lost", "found"]).nullable(),
  durationMinutes: z.number().int().min(5).max(24 * 60).nullable(),
  destination: z.string().max(60).nullable(),
  startsInMinutes: z.number().int().min(0).max(14 * 24 * 60).nullable(),
  urgency: z.enum(URGENCIES),
  confidence: z.number().min(0).max(1),
  missing: z.array(z.enum(["location", "time", "item"])),
});
export type ParsedPost = z.infer<typeof ParsedPostSchema>;

export type ParseResult = ParsedPost & { provider: "gemini" | "local" };

export const QueryIntentSchema = z.object({
  intent: z.enum(["whats_happening", "find_help", "find_offers", "events", "food", "transit", "news", "alerts", "near_location", "create_post", "unknown"]),
  locationId: z.string().nullable(),
  category: z.enum(POST_CATEGORIES).nullable(),
  timeframe: z.enum(["now", "today", "tonight", "week", "any"]),
  keywords: z.array(z.string()).max(8),
});
export type QueryIntent = z.infer<typeof QueryIntentSchema>;

export const AssistantAnswerSchema = z.object({
  answer: z.string().min(1).max(1500),
  citedIds: z.array(z.string()).max(12),
});

export const BriefingScriptSchema = z.object({
  title: z.string().min(3).max(90),
  segments: z.array(z.object({ title: z.string().min(1).max(60), text: z.string().min(1).max(2500), refs: z.array(z.string()).max(12) })).min(1).max(8),
});
export type BriefingScript = z.infer<typeof BriefingScriptSchema>;

export const CallReplySchema = z.object({
  reply: z.string().min(1).max(600),
  cardIds: z.array(z.string()).max(6).default([]),
  callerName: z.string().max(40).nullable().default(null),
  endCall: z.boolean().default(false),
});
export type CallReply = z.infer<typeof CallReplySchema>;

export const ExternalClassificationSchema = z.object({
  category: z.enum(POST_CATEGORIES),
  summary: z.string().min(3).max(240),
  locationId: z.string().nullable(),
});
