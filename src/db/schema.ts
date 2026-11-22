import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const leadSource = pgEnum("lead_source", ["POST", "FUNDING", "MANUAL"]);

import { LEAD_STATUSES } from "../lib/statuses";
export { LEAD_STATUSES, type LeadStatus } from "../lib/statuses";
export const leadStatus = pgEnum("lead_status", LEAD_STATUSES);

export const emailSource = pgEnum("email_source", [
  "PATTERN",
  "APOLLO",
  "HUNTER",
  "PROSPEO",
  "SIGNALHIRE",
  "MANUAL",
]);
export const direction = pgEnum("direction", ["OUT", "IN"]);
export const attachMode = pgEnum("attach_mode", ["ATTACH", "LINK", "NONE"]);

const createdAt = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date());

export const companies = pgTable("companies", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  // lowercased, punctuation-stripped name used for dedupe across feeds
  nameKey: text("name_key").notNull().unique(),
  domain: text("domain"),
  description: text("description"),
  sector: text("sector"),
  geo: text("geo"),
  fundingRound: text("funding_round"),
  fundingAmount: text("funding_amount"),
  investors: text("investors"),
  fundingDate: timestamp("funding_date", { withTimezone: true }),
  sourceUrl: text("source_url"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const leads = pgTable(
  "leads",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    source: leadSource("source").notNull(),
    title: text("title").notNull(), // one-line headline shown on the card
    roleGuess: text("role_guess"),
    postUrl: text("post_url"),
    postAuthor: text("post_author"),
    postAgeAtCapture: integer("post_age_hours"),
    likesAtCapture: integer("likes_at_capture"),
    score: integer("score").default(0).notNull(),
    scoreReason: text("score_reason"),
    status: leadStatus("status").default("NEW").notNull(),
    brief: text("brief"),
    notes: text("notes"),
    // Easy Apply run state: idle | running | done | error. runStep is the human-readable current step.
    runState: text("run_state").default("idle").notNull(),
    runStep: text("run_step"),
    runError: text("run_error"),
    runStartedAt: timestamp("run_started_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("leads_status_idx").on(t.status), index("leads_created_idx").on(t.createdAt)],
);

export const contacts = pgTable("contacts", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  title: text("title"),
  linkedinUrl: text("linkedin_url"),
  email: text("email"),
  emailSource: emailSource("email_source"),
  emailVerified: boolean("email_verified").default(false).notNull(),
  foundVia: text("found_via"), // where the person was found (article, post, website)
  createdAt: createdAt(),
});

// Small key/value store for app state (e.g. when replies were last checked).
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value"),
  updatedAt: updatedAt(),
});

// OAuth connections (one row per provider). Tokens are AES-GCM encrypted with AUTH_SECRET.
export const integrations = pgTable("integrations", {
  provider: text("provider").primaryKey(), // "google"
  accountEmail: text("account_email"),
  refreshTokenEnc: text("refresh_token_enc").notNull(),
  scopes: text("scopes"),
  updatedAt: updatedAt(),
});

export const resumes = pgTable("resumes", {
  id: uuid("id").defaultRandom().primaryKey(),
  label: text("label").notNull(),
  storagePath: text("storage_path").notNull(), // path in the Supabase Storage "resumes" bucket
  fileName: text("file_name").notNull(),
  targetRoles: text("target_roles").array().default([]).notNull(),
  isDefault: boolean("is_default").default(false).notNull(),
  createdAt: createdAt(),
});

export const messages = pgTable("messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  leadId: uuid("lead_id")
    .notNull()
    .references(() => leads.id, { onDelete: "cascade" }),
  contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
  direction: direction("direction").default("OUT").notNull(),
  gmailThreadId: text("gmail_thread_id"),
  gmailDraftId: text("gmail_draft_id"),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  resumeId: uuid("resume_id").references(() => resumes.id, { onDelete: "set null" }),
  attachOrLink: attachMode("attach_or_link").default("ATTACH").notNull(),
  isFollowUp: boolean("is_follow_up").default(false).notNull(),
  // RFC 822 Message-ID this message replies to (keeps follow-ups in the same Gmail thread).
  inReplyTo: text("in_reply_to"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const events = pgTable(
  "events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    // CAPTURED | SCORED | STATUS_CHANGED | RESEARCHED | EMAIL_FOUND | DRAFTED | SENT | REPLIED ...
    type: text("type").notNull(),
    meta: jsonb("meta"),
    at: timestamp("at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("events_lead_idx").on(t.leadId, t.at), index("events_type_idx").on(t.type, t.at)],
);

// Every RSS item ever seen, so the worker never pays for an LLM call on the same link twice.
export const feedItems = pgTable("feed_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  url: text("url").notNull().unique(),
  feed: text("feed").notNull(),
  title: text("title").notNull(),
  isFunding: boolean("is_funding").default(false).notNull(),
  createdAt: createdAt(),
});

// Singleton row (id = "me"): who you are and what you're looking for.
// Read by the scorer and (Phase 2) the email drafter on every run.
export const profile = pgTable("profile", {
  id: text("id").primaryKey().default("me"),
  fullName: text("full_name").default("").notNull(),
  headline: text("headline").default("").notNull(),
  bio: text("bio").default("").notNull(),
  proofPoints: text("proof_points").default("").notNull(), // one per line
  targetRoles: text("target_roles").array().default([]).notNull(),
  primaryRole: text("primary_role").default("").notNull(),
  employmentTypes: text("employment_types").array().default([]).notNull(), // INTERNSHIP_6M | FULL_TIME
  leadWith: text("lead_with").default("").notNull(),
  earliestStart: text("earliest_start").default("").notNull(),
  locations: text("locations").default("").notNull(),
  remoteOk: boolean("remote_ok").default(true).notNull(),
  stages: text("stages").array().default([]).notNull(), // PRE_SEED | SEED | SERIES_A | SERIES_B_PLUS | PUBLIC
  skipSectors: text("skip_sectors").default("").notNull(),
  stackStrengths: text("stack_strengths").default("").notNull(),
  compFloor: text("comp_floor").default("").notNull(), // used only to skip leads, never written into an email
  githubUrl: text("github_url").default("").notNull(),
  portfolioUrl: text("portfolio_url").default("").notNull(),
  linkedinUrl: text("linkedin_url").default("").notNull(),
  emailTone: text("email_tone").default("").notNull(),
  exampleEmails: text("example_emails").default("").notNull(),
  updatedAt: updatedAt(),
});

export const companiesRelations = relations(companies, ({ many }) => ({
  leads: many(leads),
  contacts: many(contacts),
}));
export const leadsRelations = relations(leads, ({ one, many }) => ({
  company: one(companies, { fields: [leads.companyId], references: [companies.id] }),
  events: many(events),
  messages: many(messages),
}));
export const contactsRelations = relations(contacts, ({ one, many }) => ({
  company: one(companies, { fields: [contacts.companyId], references: [companies.id] }),
  messages: many(messages),
}));
export const messagesRelations = relations(messages, ({ one }) => ({
  lead: one(leads, { fields: [messages.leadId], references: [leads.id] }),
  contact: one(contacts, { fields: [messages.contactId], references: [contacts.id] }),
  resume: one(resumes, { fields: [messages.resumeId], references: [resumes.id] }),
}));
export const eventsRelations = relations(events, ({ one }) => ({
  lead: one(leads, { fields: [events.leadId], references: [leads.id] }),
}));

export type Company = typeof companies.$inferSelect;
export type Lead = typeof leads.$inferSelect;
export type Profile = typeof profile.$inferSelect;
export type Resume = typeof resumes.$inferSelect;
