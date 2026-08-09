CREATE TABLE "history" (
	"id" text PRIMARY KEY NOT NULL,
	"message_id" text NOT NULL,
	"message_text" text DEFAULT '' NOT NULL,
	"has_media" boolean DEFAULT false NOT NULL,
	"targets" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sent_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"media_data_url" text,
	"media_name" text,
	"media_type" text,
	"send_once" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text DEFAULT '' NOT NULL
);
