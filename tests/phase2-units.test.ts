import { test } from "node:test";
import assert from "node:assert/strict";
import { findEmail, patternGuesses, splitName } from "../src/lib/finders";
import { htmlToText, pickTeamPages } from "../src/lib/web";

process.env.AUTH_SECRET ??= "test-secret-long-enough-123";

test("splitName handles titles, middle names and parentheses", () => {
  assert.deepEqual(splitName("Dr. Priya K. Sharma"), { first: "Priya", last: "Sharma" });
  assert.deepEqual(splitName("Arjun (AJ) Mehta"), { first: "Arjun", last: "Mehta" });
  assert.deepEqual(splitName("Madonna"), { first: "Madonna", last: "" });
});

test("patternGuesses: first@ leads, accents stripped, no duplicates", () => {
  const g = patternGuesses("José", "Núñez", "acme.ai");
  assert.equal(g[0], "jose@acme.ai");
  assert.ok(g.includes("jose.nunez@acme.ai"));
  assert.equal(new Set(g).size, g.length);
  assert.deepEqual(patternGuesses("Sam", "", "x.io"), ["sam@x.io"]);
});

test("findEmail waterfall: finder hit wins, else pattern on a mail domain, else null", async () => {
  const hit = await findEmail({ name: "Priya Sharma" }, { name: "Acme", domain: "acme.ai" }, {
    finders: [async () => null, async () => ({ email: "priya@acme.ai", source: "HUNTER", verified: true })],
    mxCheck: async () => true,
  });
  assert.equal(hit?.source, "HUNTER");

  const guess = await findEmail({ name: "Priya Sharma" }, { name: "Acme", domain: "acme.ai" }, {
    finders: [async () => { throw new Error("quota"); }],
    mxCheck: async () => true,
  });
  assert.equal(guess?.source, "PATTERN");
  assert.equal(guess?.verified, false);
  assert.equal(guess?.email, "priya@acme.ai");

  assert.equal(await findEmail({ name: "Priya Sharma" }, { name: "Acme", domain: "acme.ai" }, { finders: [], mxCheck: async () => false }), null);
  assert.equal(await findEmail({ name: "Priya Sharma" }, { name: "Acme", domain: null }), null);
});

test("htmlToText strips scripts/tags and pickTeamPages finds team/about links", () => {
  const { title, text } = htmlToText("<title>Acme</title><script>evil()</script><p>Hi&amp;bye</p><div>Team</div>");
  assert.equal(title, "Acme");
  assert.ok(!text.includes("evil"));
  assert.ok(text.includes("Hi&bye"));
  const pages = pickTeamPages({ url: "https://acme.ai/", title: "", text: "", emails: [], links: ["https://acme.ai/about", "https://acme.ai/team", "https://other.com/team", "https://acme.ai/careers", "https://acme.ai/blog"] });
  assert.deepEqual(pages, ["https://acme.ai/about", "https://acme.ai/team"]);
});

test("crypto round-trips and rejects tampering", async () => {
  const { encrypt, decrypt } = await import("../src/lib/crypto");
  const enc = encrypt("refresh-token-123");
  assert.notEqual(enc, "refresh-token-123");
  assert.equal(decrypt(enc), "refresh-token-123");
  const parts = enc.split(".");
  parts[3] = Buffer.from("tampered").toString("base64url");
  assert.throws(() => decrypt(parts.join(".")));
});

test("buildMime: plain and with a PDF attachment, unicode subject", async () => {
  process.env.DATABASE_URL ??= "postgresql://unused";
  const { buildMime } = await import("../src/lib/gmail");
  const plain = Buffer.from(buildMime({ to: "a@b.co", subject: "Hello", body: "Hi\nthere" }), "base64url").toString();
  assert.match(plain, /^To: a@b.co\r\nSubject: Hello\r\n/);
  assert.equal(Buffer.from(plain.split("\r\n\r\n")[1], "base64").toString(), "Hi\r\nthere");

  const withPdf = Buffer.from(
    buildMime({ to: "a@b.co", subject: "Résumé — Vasu", body: "Hi", attachment: { filename: "cv.pdf", contentType: "application/pdf", data: Buffer.from("%PDF-1.4 test") } }),
    "base64url",
  ).toString();
  assert.match(withPdf, /Subject: =\?UTF-8\?B\?/);
  assert.match(withPdf, /multipart\/mixed/);
  assert.match(withPdf, /filename="cv.pdf"/);
  const pdfPart = withPdf.split('filename="cv.pdf"')[1].split("\r\n\r\n")[1].split("\r\n--")[0];
  assert.equal(Buffer.from(pdfPart.replace(/\r\n/g, ""), "base64").toString(), "%PDF-1.4 test");
});

test("startOfDayIST", async () => {
  process.env.DATABASE_URL ??= "postgresql://unused";
  const { startOfDayIST } = await import("../src/pipeline/easy-apply");
  // 2026-11-22 01:00 IST = 2026-11-21 19:30 UTC -> day starts 2026-11-21 18:30 UTC
  assert.equal(startOfDayIST(new Date("2026-11-21T19:30:00Z")).toISOString(), "2026-11-21T18:30:00.000Z");
  assert.equal(startOfDayIST(new Date("2026-11-22T10:00:00Z")).toISOString(), "2026-11-21T18:30:00.000Z");
});

test("cleanBody strips model-added sign-offs", async () => {
  process.env.DATABASE_URL ??= "postgresql://unused";
  const { cleanBody } = await import("../src/pipeline/easy-apply");
  assert.equal(cleanBody("Hi Rahul,\nLine two.\nOpen to a chat?\n\nBest,\nVasu"), "Hi Rahul,\nLine two.\nOpen to a chat?");
  assert.equal(cleanBody("Hi Rahul, congrats. Let's chat. Best, Engineer."), "Hi Rahul, congrats. Let's chat.");
  assert.equal(cleanBody("Hi Rahul,\nThanks for building this.\nChat?"), "Hi Rahul,\nThanks for building this.\nChat?");
});

test("LLM schema: every field required, defaults stripped, issues readable", async () => {
  process.env.DATABASE_URL ??= "postgresql://unused";
  const { jsonSchemaFor, describeIssues } = await import("../src/lib/llm");
  const { Research } = await import("../src/pipeline/easy-apply");
  const js = jsonSchemaFor(Research) as { required: string[]; properties: Record<string, { default?: unknown }> };
  assert.deepEqual(js.required.sort(), ["brief", "people", "roleToPitch", "website", "whatTheyBuild", "whereYouHelp"]);
  assert.ok(!("default" in js.properties.whereYouHelp));
  const bad = Research.safeParse({ whatTheyBuild: 1, people: [{ title: "CEO" }] });
  assert.ok(!bad.success);
  assert.match(describeIssues(bad.error), /people\.0\.name/);
  const ok = Research.parse({ whatTheyBuild: "x", brief: "y", whereYouHelp: ["a", "b", "c", "d", "e"], people: [] });
  assert.equal(ok.whereYouHelp.length, 3, "oversized lists are trimmed, not rejected");
});
