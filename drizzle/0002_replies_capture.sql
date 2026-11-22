CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "in_reply_to" text;--> statement-breakpoint
ALTER TABLE "settings" ENABLE ROW LEVEL SECURITY;
