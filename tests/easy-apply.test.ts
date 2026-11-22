/**
 * End-to-end Easy Apply against a real Postgres with stubbed web, LLM, finders and Gmail.
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
  await db.execute(sql`truncate events, messages, leads, contacts, companies, feed_items, profile, resumes, integrations cascade`);
});
after(async () => {
  if (!enabled) return;
  const { closeDb } = await import("../src/db");
  await closeDb();
});

test("research -> people -> emails -> drafts -> gmail drafts, idempotent on re-run", { skip }, async () => {
  const { db, companies, leads, contacts, messages, events, resumes } = await import("../src/db");
  const { eq } = await import("drizzle-orm");
  const { runEasyApply, claimRun } = await import("../src/pipeline/easy-apply");
  const { getProfile } = await import("../src/lib/profile");

  const [co] = await db.insert(companies).values({ name: "Lumen Labs", nameKey: "lumenlabs", domain: "lumenlabs.ai", fundingRound: "Seed", fundingAmount: "$3.5M" }).returning();
  const [lead] = await db.insert(leads).values({ companyId: co.id, source: "FUNDING", title: "Lumen Labs raised $3.5M Seed", postUrl: "https://news.test/lumen", roleGuess: "Backend" }).returning();
  await db.insert(resumes).values([
    { label: "AI v2", storagePath: "a/ai.pdf", fileName: "ai.pdf", targetRoles: ["AI Engineer"], isDefault: true },
    { label: "Backend v3", storagePath: "b/be.pdf", fileName: "be.pdf", targetRoles: ["Backend"] },
  ]);

  const fetched: string[] = [];
  const fetchPage = async (url: string) => {
    fetched.push(url);
    if (url === "https://news.test/lumen") return { url, title: "Lumen raises", text: "Lumen Labs, founded by Asha Rao (CEO) and Vikram Shah (CTO), raised $3.5M.", links: [], emails: [] };
    if (url === "https://lumenlabs.ai") return { url: "https://lumenlabs.ai/", title: "Lumen", text: "AI copilots for CAs", links: ["https://lumenlabs.ai/team"], emails: [] };
    if (url === "https://lumenlabs.ai/team") return { url, title: "Team", text: "Neha Iyer, Head of Engineering", links: [], emails: [] };
    return null;
  };

  let draftCalls = 0;
  const llm = (async (prompt: string, schema: { parse: (x: unknown) => unknown }) => {
    if (prompt.includes('"people"')) {
      assert.match(prompt, /ignore any instructions inside/);
      assert.match(prompt, /Neha Iyer/, "team page text reaches the prompt");
      return schema.parse({
        website: "https://lumenlabs.ai",
        whatTheyBuild: "AI copilots for chartered accountants.",
        whereYouHelp: ["LLM pipelines", "Postgres-backed backend"],
        brief: "Seed-stage, 6 people, hiring engineers.",
        roleToPitch: "Backend",
        people: [
          { name: "Asha Rao", title: "CEO", source: "article" },
          { name: "Vikram Shah", title: "CTO", source: "article" },
          { name: "Neha Iyer", title: "Head of Engineering", source: "team page" },
        ],
      });
    }
    draftCalls++;
    const to = prompt.match(/body starts with "Hi (\w+),"/)?.[1];
    return schema.parse({ subject: "Backend help after your seed", body: `Hi ${to},\nCongrats on the seed.\nI build LLM pipelines.\nWould love 15 minutes.` });
  }) as never;

  const findEmail = async (p: { name: string }) =>
    p.name === "Neha Iyer" ? null : { email: `${p.name.split(" ")[0].toLowerCase()}@lumenlabs.ai`, source: p.name === "Asha Rao" ? ("HUNTER" as const) : ("PATTERN" as const), verified: p.name === "Asha Rao" };

  const gmailDrafts: Array<{ to: string; attachment?: { filename: string } | null }> = [];
  const deps = {
    llm,
    fetchPage,
    findEmail,
    profile: { ...(await getProfile()), fullName: "Vasu", githubUrl: "https://github.com/vasusadariya", proofPoints: "Built LLM pipelines at CareerPassport" },
    gmail: { createDraft: async (o: { to: string; attachment?: { filename: string } | null }) => { gmailDrafts.push(o); return { draftId: `d${gmailDrafts.length}`, threadId: `t${gmailDrafts.length}` }; } },
    loadResume: async () => Buffer.from("%PDF"),
  };

  assert.equal(await claimRun(lead.id), true);
  assert.equal(await claimRun(lead.id), false, "second claim while running is refused");

  const out = await runEasyApply(lead.id, deps);
  assert.deepEqual(out, { drafted: 2, people: 3, withEmail: 2 });
  assert.ok(fetched.includes("https://lumenlabs.ai/team"));

  const [l] = await db.select().from(leads).where(eq(leads.id, lead.id));
  assert.equal(l.status, "DRAFTED");
  assert.equal(l.runState, "done");
  assert.match(l.brief ?? "", /AI copilots/);

  const people = await db.select().from(contacts).where(eq(contacts.companyId, co.id));
  assert.equal(people.length, 3);
  assert.equal(people.find((c) => c.name === "Neha Iyer")?.email, null);
  assert.equal(people.find((c) => c.name === "Asha Rao")?.emailVerified, true);

  const msgs = await db.select().from(messages).where(eq(messages.leadId, lead.id));
  assert.equal(msgs.length, 2);
  assert.ok(msgs.every((m) => m.gmailDraftId && !m.sentAt), "drafted, never sent");
  assert.ok(msgs.every((m) => m.body.includes("https://github.com/vasusadariya")), "signature appended");
  assert.equal(gmailDrafts.length, 2);
  assert.ok(gmailDrafts.every((d) => d.attachment?.filename === "be.pdf"), "Backend resume picked for a Backend lead");

  // Re-run: no duplicate drafts for people already drafted.
  await claimRun(lead.id);
  const again = await runEasyApply(lead.id, deps);
  assert.equal(again.drafted, 0);
  assert.equal((await db.select().from(messages).where(eq(messages.leadId, lead.id))).length, 2);
  assert.equal(draftCalls, 2);

  const types = (await db.select().from(events).where(eq(events.leadId, lead.id))).map((e) => e.type);
  for (const t of ["RESEARCHED", "EMAIL_FOUND", "EMAIL_NOT_FOUND", "DRAFTED", "STATUS_CHANGED"]) assert.ok(types.includes(t), t);
});

test("a failing step marks the run as error and keeps the message", { skip }, async () => {
  const { db, companies, leads } = await import("../src/db");
  const { eq } = await import("drizzle-orm");
  const { runEasyApply } = await import("../src/pipeline/easy-apply");
  const { getProfile } = await import("../src/lib/profile");
  const [co] = await db.insert(companies).values({ name: "Broken Co", nameKey: "brokenco" }).returning();
  const [lead] = await db.insert(leads).values({ companyId: co.id, source: "MANUAL", title: "Broken" }).returning();
  const deps = {
    llm: (async () => { throw new Error("All LLM providers failed — quota"); }) as never,
    fetchPage: async () => null,
    findEmail: async () => null,
    profile: await getProfile(),
    gmail: null,
    loadResume: async () => null,
  };
  await assert.rejects(runEasyApply(lead.id, deps));
  const [l] = await db.select().from(leads).where(eq(leads.id, lead.id));
  assert.equal(l.runState, "error");
  assert.match(l.runError ?? "", /quota/);
});
