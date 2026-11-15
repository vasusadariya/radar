/**
 * End-to-end worker test against a real Postgres (DATABASE_URL), a local fixture
 * RSS server and a stub LLM. Skips when no database is configured.
 * WARNING: truncates tables — point DATABASE_URL at a throwaway database.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";

for (const f of [".env.test", ".env.local"]) {
  try {
    process.loadEnvFile(f);
  } catch {}
}
const enabled = Boolean(process.env.DATABASE_URL) && process.env.RUN_DB_TESTS === "1";

const now = new Date();
const iso = (hoursAgo: number) => new Date(now.getTime() - hoursAgo * 3_600_000).toUTCString();
const rss = (items: string) =>
  `<?xml version="1.0"?><rss version="2.0"><channel><title>Fixture</title>${items}</channel></rss>`;
const item = (title: string, link: string, hoursAgo: number, desc = "") =>
  `<item><title>${title}</title><link>${link}</link><pubDate>${iso(hoursAgo)}</pubDate><description>${desc}</description></item>`;

const FEED_A = rss(
  item("Acme AI raises $4M seed to automate invoices", "https://news.test/acme", 2, "Acme AI, a Bengaluru startup, raised a $4M seed led by Accel.") +
    item("10 tips for better standups", "https://news.test/tips", 3) +
    item("Old news: Foo raises Series A", "https://news.test/old", 24 * 9) +
    item("Bigcorp acquires Tiny Labs in $50M deal", "https://news.test/acq", 5),
);
// Same company, different outlet and spelling — must not create a second lead.
const FEED_B = rss(item("Acme, Inc. bags $4 million in seed funding", "https://other.test/acme", 1));

let server: http.Server;
let base = "";
let llmCalls = 0;
const stubLlm = async (prompt: string) => {
  llmCalls++;
  const indexes = [...prompt.matchAll(/^\[(\d+)\] TITLE: (.*)$/gm)].map((m) => ({ i: Number(m[1]), title: m[2] }));
  return {
    items: indexes.map(({ i, title }) =>
      /acme/i.test(title)
        ? { index: i, isFunding: true, company: /inc/i.test(title) ? "Acme, Inc." : "Acme AI", website: "https://acme.ai", round: "Seed", amount: "$4M", investors: "Accel", sector: "Fintech", geo: "Bengaluru", whatTheyDo: "Automates invoices.", fit: 70, fitReason: "Software-heavy, hiring engineers." }
        : { index: i, isFunding: false },
    ),
  };
};

before(async () => {
  if (!enabled) return;
  server = http.createServer((req, res) => {
    res.setHeader("content-type", "application/rss+xml");
    res.end(req.url === "/a" ? FEED_A : req.url === "/b" ? FEED_B : (res.statusCode = 500, "boom"));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const { db } = await import("../src/db");
  const { sql } = await import("drizzle-orm");
  await db.execute(sql`truncate events, messages, leads, contacts, companies, feed_items, profile cascade`);
});

after(async () => {
  if (!enabled) return;
  server.close();
  const { closeDb } = await import("../src/db");
  await closeDb();
});

test("ingests, dedupes across feeds, and is idempotent", { skip: !enabled && "set RUN_DB_TESTS=1 with a throwaway DATABASE_URL" }, async () => {
  const { db, leads, feedItems, events } = await import("../src/db");
  const { ingestFunding } = await import("../src/worker/funding");
  const { getProfile } = await import("../src/lib/profile");
  const profile = await getProfile();
  const feeds = [
    { name: "A", url: `${base}/a` },
    { name: "B", url: `${base}/b` },
    { name: "Broken", url: `${base}/broken` },
  ];

  const first = await ingestFunding({ feeds, llm: stubLlm as never, profile, now });
  assert.equal(first.feedsOk, 2);
  assert.equal(first.feedsFailed.length, 1);
  assert.equal(first.seen, 4); // old item filtered by age
  assert.equal(first.sentToLlm, 3); // tips skipped by prefilter
  assert.equal(first.fundingFound, 2);
  assert.equal(first.leadsCreated, 1);
  assert.equal(first.duplicates, 1);

  const allLeads = await db.select().from(leads);
  assert.equal(allLeads.length, 1);
  assert.equal(allLeads[0].source, "FUNDING");
  assert.equal(allLeads[0].score, 80); // fit 70 + seed bonus 10
  assert.match(allLeads[0].title, /Acme/);
  assert.equal((await db.select().from(events)).length, 2);
  assert.equal((await db.select().from(feedItems)).length, 4);

  const callsBefore = llmCalls;
  const second = await ingestFunding({ feeds, llm: stubLlm as never, profile, now });
  assert.equal(second.newItems, 0);
  assert.equal(llmCalls, callsBefore, "no LLM calls for already-seen items");
  assert.equal((await db.select().from(leads)).length, 1);
});
