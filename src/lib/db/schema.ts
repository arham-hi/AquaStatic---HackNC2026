import { sqliteTable, text, integer, real, primaryKey, index, uniqueIndex } from "drizzle-orm/sqlite-core";

const ts = (name: string) => integer(name, { mode: "timestamp_ms" });
const json = <T>(name: string) => text(name, { mode: "json" }).$type<T>();

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  displayName: text("display_name").notNull(),
  avatar: text("avatar").notNull().default("🐏"), // emoji avatar; no uploads needed for the hackathon
  interests: json<string[]>("interests").notNull().default([]),
  helpSubjects: json<string[]>("help_subjects").notNull().default([]),
  preferredArea: text("preferred_area"), // location id
  notificationPrefs: json<Record<string, boolean>>("notification_prefs").notNull().default({}),
  isDemo: integer("is_demo", { mode: "boolean" }).notNull().default(false),
  createdAt: ts("created_at").notNull(),
});

export const locations = sqliteTable("locations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  aliases: json<string[]>("aliases").notNull().default([]),
  lat: real("lat").notNull(),
  lng: real("lng").notNull(),
  category: text("category").notNull(), // library, dining, landmark, academic, athletics, residence, street, transit
});

export const POST_TYPES = ["request", "offer", "event", "news", "alert", "notice"] as const;
export const POST_CATEGORIES = [
  "borrowing", "giveaway", "tutoring", "study", "lost_found", "free_food", "ride", "event", "news", "alert", "transit", "other",
] as const;
export const URGENCIES = ["low", "soon", "urgent"] as const;
export const SOURCE_STATUSES = ["community", "user_event", "official", "demo"] as const;
export const POST_STATUSES = ["open", "matched", "in_progress", "fulfilled", "resolved", "expired", "deleted"] as const;

export type PostType = (typeof POST_TYPES)[number];
export type PostCategory = (typeof POST_CATEGORIES)[number];
export type Urgency = (typeof URGENCIES)[number];
export type SourceStatus = (typeof SOURCE_STATUSES)[number];
export type PostStatus = (typeof POST_STATUSES)[number];

export type PostAttributes = {
  item?: string | null; // "USB-C laptop charger"
  subject?: string | null; // "calculus"
  powerClass?: "laptop" | "phone" | "cable" | null;
  durationMinutes?: number | null;
  lostOrFound?: "lost" | "found" | null;
};

export const posts = sqliteTable(
  "posts",
  {
    id: text("id").primaryKey(),
    authorId: text("author_id").references(() => users.id),
    type: text("type").$type<PostType>().notNull(),
    category: text("category").$type<PostCategory>().notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(), // original text, as typed
    summary: text("summary").notNull(), // normalized one-liner
    locationId: text("location_id").references(() => locations.id),
    locationNote: text("location_note"), // "3rd floor", "near the entrance"
    startsAt: ts("starts_at"),
    expiresAt: ts("expires_at"),
    urgency: text("urgency").$type<Urgency>().notNull().default("low"),
    sourceStatus: text("source_status").$type<SourceStatus>().notNull().default("community"),
    status: text("status").$type<PostStatus>().notNull().default("open"),
    keywords: json<string[]>("keywords").notNull().default([]),
    attributes: json<PostAttributes>("attributes").notNull().default({}),
    isDemo: integer("is_demo", { mode: "boolean" }).notNull().default(false),
    createdAt: ts("created_at").notNull(),
    updatedAt: ts("updated_at").notNull(),
  },
  (t) => [index("posts_status_idx").on(t.status, t.type), index("posts_created_idx").on(t.createdAt), index("posts_expires_idx").on(t.expiresAt)],
);

export const MATCH_STATUSES = ["suggested", "accepted", "declined", "completed", "cancelled"] as const;
export type MatchStatus = (typeof MATCH_STATUSES)[number];
export type MatchExplanation = {
  total: number;
  parts: { label: string; weight: number; score: number; detail: string }[];
  reason: string;
};

export const matches = sqliteTable(
  "matches",
  {
    id: text("id").primaryKey(),
    requestPostId: text("request_post_id").notNull().references(() => posts.id),
    offerPostId: text("offer_post_id").notNull().references(() => posts.id),
    score: real("score").notNull(),
    explanation: json<MatchExplanation>("explanation").notNull(),
    status: text("status").$type<MatchStatus>().notNull().default("suggested"),
    requesterAccepted: integer("requester_accepted", { mode: "boolean" }).notNull().default(false),
    offererAccepted: integer("offerer_accepted", { mode: "boolean" }).notNull().default(false),
    createdAt: ts("created_at").notNull(),
    updatedAt: ts("updated_at").notNull(),
  },
  (t) => [uniqueIndex("matches_pair_idx").on(t.requestPostId, t.offerPostId)],
);

export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  matchId: text("match_id").references(() => matches.id),
  createdAt: ts("created_at").notNull(),
  updatedAt: ts("updated_at").notNull(),
});

export const conversationParticipants = sqliteTable(
  "conversation_participants",
  {
    conversationId: text("conversation_id").notNull().references(() => conversations.id),
    userId: text("user_id").notNull().references(() => users.id),
    lastReadAt: ts("last_read_at"),
  },
  (t) => [primaryKey({ columns: [t.conversationId, t.userId] })],
);

export const messages = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id").notNull().references(() => conversations.id),
    senderId: text("sender_id").notNull().references(() => users.id),
    content: text("content").notNull(),
    createdAt: ts("created_at").notNull(),
  },
  (t) => [index("messages_conv_idx").on(t.conversationId, t.createdAt)],
);

export const NOTIFICATION_TYPES = [
  "match_suggested", "match_accepted", "match_declined", "new_message", "request_fulfilled", "post_expiring", "relevant_event", "source_update",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const notifications = sqliteTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    type: text("type").$type<NotificationType>().notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    href: text("href"),
    metadata: json<Record<string, unknown>>("metadata").notNull().default({}),
    dedupeKey: text("dedupe_key").notNull(),
    readAt: ts("read_at"),
    createdAt: ts("created_at").notNull(),
  },
  (t) => [uniqueIndex("notifications_dedupe_idx").on(t.userId, t.dedupeKey), index("notifications_user_idx").on(t.userId, t.createdAt)],
);

export const externalSources = sqliteTable("external_sources", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  url: text("url").notNull(),
  adapter: text("adapter").notNull(), // localist | engage | rss
  kind: text("kind").notNull(), // events | news | alerts
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  lastFetchedAt: ts("last_fetched_at"),
  lastError: text("last_error"),
  lastCount: integer("last_count").notNull().default(0),
});

export const externalItems = sqliteTable(
  "external_items",
  {
    id: text("id").primaryKey(), // `${sourceId}:${providerId}`
    sourceId: text("source_id").notNull().references(() => externalSources.id),
    providerId: text("provider_id").notNull(),
    type: text("type").notNull(), // event | news | alert
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    url: text("url").notNull(),
    imageUrl: text("image_url"),
    publishedAt: ts("published_at"),
    startsAt: ts("starts_at"),
    endsAt: ts("ends_at"),
    locationName: text("location_name"),
    lat: real("lat"),
    lng: real("lng"),
    locationId: text("location_id").references(() => locations.id),
    category: text("category").$type<PostCategory>().notNull().default("other"),
    dedupeKey: text("dedupe_key").notNull(),
    createdAt: ts("created_at").notNull(),
  },
  (t) => [uniqueIndex("external_dedupe_idx").on(t.dedupeKey), index("external_starts_idx").on(t.startsAt), index("external_published_idx").on(t.publishedAt)],
);

export const BRIEFING_FORMATS = ["flash", "radio", "podcast", "digest", "letter"] as const;
export type BriefingFormat = (typeof BRIEFING_FORMATS)[number];
export type BriefingSegment = { title: string; text: string; refs: string[] };
export type BriefingSourceRef = { kind: "post" | "external" | "transit"; id: string; title: string; href: string; at: number | null; isDemo: boolean };

export const briefings = sqliteTable("briefings", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id),
  format: text("format").$type<BriefingFormat>().notNull(),
  title: text("title").notNull(),
  script: text("script").notNull(),
  segments: json<BriefingSegment[]>("segments").notNull().default([]),
  sources: json<BriefingSourceRef[]>("sources").notNull().default([]),
  interests: json<string[]>("interests").notNull().default([]),
  length: text("length").notNull().default("medium"),
  includesDemo: integer("includes_demo", { mode: "boolean" }).notNull().default(false),
  provider: text("provider").notNull(), // gemini | local
  audioProvider: text("audio_provider").notNull().default("browser"), // browser | elevenlabs
  audioRef: text("audio_ref"), // file path under data/audio when cached
  wordCount: integer("word_count").notNull().default(0),
  createdAt: ts("created_at").notNull(),
});

export const bookmarks = sqliteTable(
  "bookmarks",
  {
    userId: text("user_id").notNull().references(() => users.id),
    itemType: text("item_type").notNull(), // post | external
    itemId: text("item_id").notNull(),
    createdAt: ts("created_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.itemType, t.itemId] })],
);

export const reports = sqliteTable("reports", {
  id: text("id").primaryKey(),
  reporterId: text("reporter_id").notNull().references(() => users.id),
  itemType: text("item_type").notNull(), // post | user | message
  itemId: text("item_id").notNull(),
  reason: text("reason").notNull(),
  status: text("status").notNull().default("open"),
  createdAt: ts("created_at").notNull(),
});

export const blocks = sqliteTable(
  "blocks",
  { userId: text("user_id").notNull(), blockedUserId: text("blocked_user_id").notNull(), createdAt: ts("created_at").notNull() },
  (t) => [primaryKey({ columns: [t.userId, t.blockedUserId] })],
);

export const integrationState = sqliteTable("integration_state", {
  provider: text("provider").primaryKey(), // gemini | elevenlabs | photon | sources | transit
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  healthy: integer("healthy", { mode: "boolean" }).notNull().default(false),
  detail: text("detail").notNull().default(""),
  lastSuccessAt: ts("last_success_at"),
  lastCheckedAt: ts("last_checked_at"),
});

// Photon account linking: one-time expiring code typed into iMessage.
export const linkCodes = sqliteTable("link_codes", {
  code: text("code").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  expiresAt: ts("expires_at").notNull(),
  usedAt: ts("used_at"),
});

export const channelLinks = sqliteTable("channel_links", {
  handle: text("handle").primaryKey(), // "imessage:+1555..." (never exposed publicly)
  userId: text("user_id").notNull().references(() => users.id),
  createdAt: ts("created_at").notNull(),
});

export type User = typeof users.$inferSelect;
export type Location = typeof locations.$inferSelect;
export type Post = typeof posts.$inferSelect;
export type NewPost = typeof posts.$inferInsert;
export type Match = typeof matches.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type ExternalItem = typeof externalItems.$inferSelect;
export type ExternalSource = typeof externalSources.$inferSelect;
export type Briefing = typeof briefings.$inferSelect;
