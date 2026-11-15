CREATE TYPE "public"."attach_mode" AS ENUM('ATTACH', 'LINK', 'NONE');--> statement-breakpoint
CREATE TYPE "public"."direction" AS ENUM('OUT', 'IN');--> statement-breakpoint
CREATE TYPE "public"."email_source" AS ENUM('PATTERN', 'APOLLO', 'HUNTER', 'PROSPEO', 'SIGNALHIRE', 'MANUAL');--> statement-breakpoint
CREATE TYPE "public"."lead_source" AS ENUM('POST', 'FUNDING', 'MANUAL');--> statement-breakpoint
CREATE TYPE "public"."lead_status" AS ENUM('NEW', 'RESEARCHED', 'CONTACTS_FOUND', 'DRAFTED', 'SENT', 'REPLIED', 'INTERVIEW', 'OFFER', 'DEAD');--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"name_key" text NOT NULL,
	"domain" text,
	"description" text,
	"sector" text,
	"geo" text,
	"funding_round" text,
	"funding_amount" text,
	"investors" text,
	"funding_date" timestamp with time zone,
	"source_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "companies_name_key_unique" UNIQUE("name_key")
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"title" text,
	"linkedin_url" text,
	"email" text,
	"email_source" "email_source",
	"email_verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"type" text NOT NULL,
	"meta" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feed_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"url" text NOT NULL,
	"feed" text NOT NULL,
	"title" text NOT NULL,
	"is_funding" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feed_items_url_unique" UNIQUE("url")
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"source" "lead_source" NOT NULL,
	"title" text NOT NULL,
	"role_guess" text,
	"post_url" text,
	"post_author" text,
	"post_age_hours" integer,
	"likes_at_capture" integer,
	"score" integer DEFAULT 0 NOT NULL,
	"score_reason" text,
	"status" "lead_status" DEFAULT 'NEW' NOT NULL,
	"brief" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"contact_id" uuid,
	"direction" "direction" DEFAULT 'OUT' NOT NULL,
	"gmail_thread_id" text,
	"gmail_draft_id" text,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"resume_id" uuid,
	"attach_or_link" "attach_mode" DEFAULT 'ATTACH' NOT NULL,
	"is_follow_up" boolean DEFAULT false NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile" (
	"id" text PRIMARY KEY DEFAULT 'me' NOT NULL,
	"full_name" text DEFAULT '' NOT NULL,
	"headline" text DEFAULT '' NOT NULL,
	"bio" text DEFAULT '' NOT NULL,
	"proof_points" text DEFAULT '' NOT NULL,
	"target_roles" text[] DEFAULT '{}' NOT NULL,
	"primary_role" text DEFAULT '' NOT NULL,
	"employment_types" text[] DEFAULT '{}' NOT NULL,
	"lead_with" text DEFAULT '' NOT NULL,
	"earliest_start" text DEFAULT '' NOT NULL,
	"locations" text DEFAULT '' NOT NULL,
	"remote_ok" boolean DEFAULT true NOT NULL,
	"stages" text[] DEFAULT '{}' NOT NULL,
	"skip_sectors" text DEFAULT '' NOT NULL,
	"stack_strengths" text DEFAULT '' NOT NULL,
	"comp_floor" text DEFAULT '' NOT NULL,
	"github_url" text DEFAULT '' NOT NULL,
	"portfolio_url" text DEFAULT '' NOT NULL,
	"linkedin_url" text DEFAULT '' NOT NULL,
	"email_tone" text DEFAULT '' NOT NULL,
	"example_emails" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resumes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"storage_path" text NOT NULL,
	"file_name" text NOT NULL,
	"target_roles" text[] DEFAULT '{}' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_resume_id_resumes_id_fk" FOREIGN KEY ("resume_id") REFERENCES "public"."resumes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_lead_idx" ON "events" USING btree ("lead_id","at");--> statement-breakpoint
CREATE INDEX "events_type_idx" ON "events" USING btree ("type","at");--> statement-breakpoint
CREATE INDEX "leads_status_idx" ON "leads" USING btree ("status");--> statement-breakpoint
CREATE INDEX "leads_created_idx" ON "leads" USING btree ("created_at");