CREATE TABLE "integrations" (
	"provider" text PRIMARY KEY NOT NULL,
	"account_email" text,
	"refresh_token_enc" text NOT NULL,
	"scopes" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "found_via" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "run_state" text DEFAULT 'idle' NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "run_step" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "run_error" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "run_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "integrations" ENABLE ROW LEVEL SECURITY;
