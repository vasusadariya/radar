/**
 * Capture save + reply tracking + follow-ups against a real Postgres with a stubbed Gmail.
 * WARNING: truncates tables — RUN_DB_TESTS=1 with a throwaway DATABASE_URL only.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

for (const f of [".env.test", ".env.local"]) {
  try {
    process.loadEnvFile(f);
  } catch {}
}
const enabled = Boolean(process.env.DATABASE_URL) && process.env.RUN_DB_TESTS === "1";
const skip = !enabled && "set RUN_DB_TESTS=1 with a throwaway DATABASE_URL";

before(async () => {
  if (!enabled) return;
  const { db } = await import("../src/db");
  const { sql } = await import("drizzle-orm");
  await db.execute(sql`truncate events, messages, leads, contacts, companies, feed_items, profile, resumes, integrations, settings cascade`);
});
after(async () => {
  if (!enabled) return;
  const { closeDb } = await import("../src/db");
  await closeDb();
});

test("saveCapturedPost creates a POST lead with freshness data and dedupes by URL", { skip }, async () => {
  const { saveCapturedPost } = await import("../src/lib/capture");
  const { db, leads, events } = await import("../src/db");
  const { eq } = await import("drizzle-orm");
  const payload = { u: "https://www.linkedin.com/feed/update/urn:li:activity:1/", t: "We're hiring!", a: "Priya Rao", at: "CTO at Acme", tt: "3h •", pa: "", l: "42", s: "linkedin" as const };
  const now = new Date();
  const first = await saveCapturedPost({ payload, company: "Acme AI", website: "https://acme.ai", role: "Backend Intern", fit: 70, now });
  assert.equal(first.created, true);
  const again = await saveCapturedPost({ payload, company: "Acme AI", fit: 70, now });
  assert.deepEqual(again, { leadId: first.leadId, created: false });
  const [l] = await db.select().from(leads).where(eq(leads.id, first.leadId));
  assert.equal(l.source, "POST");
  assert.equal(l.postAuthor, "Priya Rao, CTO at Acme");
  assert.equal(l.postAgeAtCapture, 3);
  assert.equal(l.likesAtCapture, 42);
  assert.equal(l.score, 85); // 70 + fresh 10 + quiet 5
  assert.equal(l.title, "Backend Intern at Acme AI");
  assert.equal((await db.select().from(events).where(eq(events.leadId, l.id))).length, 2);
});

test("replies: detected -> REPLIED; no reply after 3 days -> one threaded follow-up draft", { skip }, async () => {
  const { db, companies, contacts, leads, messages } = await import("../src/db");
  const { eq } = await import("drizzle-orm");
  const { checkReplies } = await import("../src/pipeline/replies");
  const { getProfile } = await import("../src/lib/profile");

  const day = 86_400_000;
  const now = new Date("2026-11-30T12:00:00Z");
  const [co] = await db.insert(companies).values({ name: "Lumen", nameKey: "lumen-r" }).returning();
  const mk = async (name: string, email: string, sentDaysAgo: number, thread: string) => {
    const [c] = await db.insert(contacts).values({ companyId: co.id, name, email }).returning();
    const [l] = await db.insert(leads).values({ companyId: co.id, source: "FUNDING", title: `lead ${name}`, status: "SENT" }).returning();
    const [m] = await db.insert(messages).values({ leadId: l.id, contactId: c.id, subject: "Backend help", body: "Hi", sentAt: new Date(now.getTime() - sentDaysAgo * day), gmailThreadId: thread }).returning();
    return { lead: l, msg: m };
  };
  const replied = await mk("Asha Rao", "asha@lumen.ai", 1, "t-replied");
  const silent = await mk("Vikram Shah", "vikram@lumen.ai", 4, "t-silent");
  const recent = await mk("Neha Iyer", "neha@lumen.ai", 1, "t-recent");

  const ours = (id: string, at: number) => ({ id, internalDate: at, labelIds: ["SENT"], snippet: "Hi", from: "me@gmail.com", subject: "Backend help", messageId: `<${id}@mail.gmail.com>` });
  const threads: Record<string, ReturnType<typeof ours>[]> = {
    "t-replied": [ours("r1", replied.msg.sentAt!.getTime()), { id: "r2", internalDate: now.getTime() - 3600_000, labelIds: ["INBOX", "UNREAD"], snippet: "Thanks Vasu — free Thursday?", from: "Asha Rao <asha@lumen.ai>", subject: "Re: Backend help", messageId: "<r2@lumen.ai>" }],
    "t-silent": [ours("s1", silent.msg.sentAt!.getTime())],
    "t-recent": [ours("n1", recent.msg.sentAt!.getTime())],
  };
  const drafts: Array<{ to: string; threadId?: string | null; inReplyTo?: string | null; subject: string }> = [];
  const deleted: string[] = [];
  const deps = {
    getThread: async (id: string) => threads[id],
    createDraft: async (o: { to: string; subject: string; threadId?: string | null; inReplyTo?: string | null }) => { drafts.push(o); return { draftId: `d${drafts.length}`, threadId: o.threadId ?? "new" }; },
    deleteDraft: async (id: string) => { deleted.push(id); },
    llm: (async (_p: string, schema: { parse: (x: unknown) => unknown }) => schema.parse({ body: "Hi Vikram,\nQuick follow-up on my note.\nHappy to do a small test task.\n\nBest,\nVasu" })) as never,
    profile: { ...(await getProfile()), fullName: "Vasu" },
    now,
  };

  const s1 = await checkReplies(deps);
  assert.deepEqual({ threads: s1.threads, replies: s1.replies, followUps: s1.followUps, errors: s1.errors }, { threads: 3, replies: 1, followUps: 1, errors: [] });
  assert.equal((await db.select().from(leads).where(eq(leads.id, replied.lead.id)))[0].status, "REPLIED");
  const inbound = (await db.select().from(messages).where(eq(messages.leadId, replied.lead.id))).find((m) => m.direction === "IN");
  assert.equal(inbound?.body, "Thanks Vasu — free Thursday?");

  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].to, "vikram@lumen.ai");
  assert.equal(drafts[0].threadId, "t-silent", "follow-up stays in the original thread");
  assert.equal(drafts[0].inReplyTo, "<s1@mail.gmail.com>");
  assert.equal(drafts[0].subject, "Re: Backend help");
  const fu = (await db.select().from(messages).where(eq(messages.leadId, silent.lead.id))).find((m) => m.isFollowUp)!;
  assert.ok(fu && !fu.sentAt && fu.gmailDraftId === "d1");
  assert.ok(!/Best,/.test(fu.body) && fu.body.endsWith("Vasu"), "model sign-off replaced by signature");

  // Second run: no duplicate follow-up, no duplicate reply.
  const s2 = await checkReplies(deps);
  assert.equal(s2.followUps, 0);
  assert.equal(s2.replies, 0);
  assert.equal(drafts.length, 1);

  // Vikram replies later: the pending follow-up draft is discarded.
  threads["t-silent"].push({ id: "s2", internalDate: now.getTime() + 1000, labelIds: ["INBOX"], snippet: "Let's talk", from: "vikram@lumen.ai", subject: "Re: Backend help", messageId: "<s2@x>" });
  const s3 = await checkReplies({ ...deps, now: new Date(now.getTime() + 2000) });
  assert.equal(s3.replies, 1);
  assert.deepEqual(deleted, ["d1"]);
  assert.equal((await db.select().from(messages).where(eq(messages.leadId, silent.lead.id))).filter((m) => m.isFollowUp).length, 0);
  assert.equal((await db.select().from(leads).where(eq(leads.id, silent.lead.id)))[0].status, "REPLIED");
});
