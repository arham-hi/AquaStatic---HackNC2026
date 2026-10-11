CREATE TABLE "blocks" (
	"user_id" text NOT NULL,
	"blocked_user_id" text NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "blocks_user_id_blocked_user_id_pk" PRIMARY KEY("user_id","blocked_user_id")
);
--> statement-breakpoint
CREATE TABLE "bookmarks" (
	"user_id" text NOT NULL,
	"item_type" text NOT NULL,
	"item_id" text NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "bookmarks_user_id_item_type_item_id_pk" PRIMARY KEY("user_id","item_type","item_id")
);
--> statement-breakpoint
CREATE TABLE "briefings" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"format" text NOT NULL,
	"title" text NOT NULL,
	"script" text NOT NULL,
	"segments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"interests" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"length" text DEFAULT 'medium' NOT NULL,
	"includes_demo" boolean DEFAULT false NOT NULL,
	"provider" text NOT NULL,
	"audio_provider" text DEFAULT 'browser' NOT NULL,
	"audio_ref" text,
	"word_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channel_links" (
	"handle" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_participants" (
	"conversation_id" text NOT NULL,
	"user_id" text NOT NULL,
	"last_read_at" timestamp (3) with time zone,
	CONSTRAINT "conversation_participants_conversation_id_user_id_pk" PRIMARY KEY("conversation_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"match_id" text,
	"created_at" timestamp (3) with time zone NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "external_items" (
	"id" text PRIMARY KEY NOT NULL,
	"source_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"url" text NOT NULL,
	"image_url" text,
	"published_at" timestamp (3) with time zone,
	"starts_at" timestamp (3) with time zone,
	"ends_at" timestamp (3) with time zone,
	"location_name" text,
	"lat" double precision,
	"lng" double precision,
	"location_id" text,
	"category" text DEFAULT 'other' NOT NULL,
	"dedupe_key" text NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "external_sources" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"adapter" text NOT NULL,
	"kind" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_fetched_at" timestamp (3) with time zone,
	"last_error" text,
	"last_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration_state" (
	"provider" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"healthy" boolean DEFAULT false NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"last_success_at" timestamp (3) with time zone,
	"last_checked_at" timestamp (3) with time zone
);
--> statement-breakpoint
CREATE TABLE "link_codes" (
	"code" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp (3) with time zone NOT NULL,
	"used_at" timestamp (3) with time zone
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"category" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" text PRIMARY KEY NOT NULL,
	"request_post_id" text NOT NULL,
	"offer_post_id" text NOT NULL,
	"score" double precision NOT NULL,
	"explanation" jsonb NOT NULL,
	"status" text DEFAULT 'suggested' NOT NULL,
	"requester_accepted" boolean DEFAULT false NOT NULL,
	"offerer_accepted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"sender_id" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"href" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"dedupe_key" text NOT NULL,
	"read_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" text PRIMARY KEY NOT NULL,
	"author_id" text,
	"type" text NOT NULL,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"summary" text NOT NULL,
	"location_id" text,
	"location_note" text,
	"starts_at" timestamp (3) with time zone,
	"expires_at" timestamp (3) with time zone,
	"urgency" text DEFAULT 'low' NOT NULL,
	"source_status" text DEFAULT 'community' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" text PRIMARY KEY NOT NULL,
	"reporter_id" text NOT NULL,
	"item_type" text NOT NULL,
	"item_id" text NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"avatar" text DEFAULT '🐏' NOT NULL,
	"interests" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"help_subjects" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"preferred_area" text,
	"notification_prefs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "briefings" ADD CONSTRAINT "briefings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_links" ADD CONSTRAINT "channel_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_items" ADD CONSTRAINT "external_items_source_id_external_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."external_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_items" ADD CONSTRAINT "external_items_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "link_codes" ADD CONSTRAINT "link_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_request_post_id_posts_id_fk" FOREIGN KEY ("request_post_id") REFERENCES "public"."posts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_offer_post_id_posts_id_fk" FOREIGN KEY ("offer_post_id") REFERENCES "public"."posts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "external_dedupe_idx" ON "external_items" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "external_starts_idx" ON "external_items" USING btree ("starts_at");--> statement-breakpoint
CREATE INDEX "external_published_idx" ON "external_items" USING btree ("published_at");--> statement-breakpoint
CREATE UNIQUE INDEX "matches_pair_idx" ON "matches" USING btree ("request_post_id","offer_post_id");--> statement-breakpoint
CREATE INDEX "messages_conv_idx" ON "messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_dedupe_idx" ON "notifications" USING btree ("user_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "posts_status_idx" ON "posts" USING btree ("status","type");--> statement-breakpoint
CREATE INDEX "posts_created_idx" ON "posts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "posts_expires_idx" ON "posts" USING btree ("expires_at");