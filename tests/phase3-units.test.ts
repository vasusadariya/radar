import { test } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL ??= "postgresql://unused";

test("parseAgeHours handles LinkedIn/X relative times and ISO dates", async () => {
  const { parseAgeHours } = await import("../src/lib/capture");
  const now = new Date("2026-11-22T12:00:00Z");
  assert.equal(parseAgeHours("3h • Edited •", "", now), 3);
  assert.equal(parseAgeHours("1d •", "", now), 24);
  assert.equal(parseAgeHours("2w", "", now), 336);
  assert.equal(parseAgeHours("5m", "", now), 0);
  assert.equal(parseAgeHours("1mo", "", now), 720);
  assert.equal(parseAgeHours("3 months ago", "", now), 2160);
  assert.equal(parseAgeHours("Just now", "", now), 0);
  assert.equal(parseAgeHours("", "2026-11-22T07:00:00.000Z", now), 5);
  assert.equal(parseAgeHours("", "", now), null);
  assert.equal(parseAgeHours("Promoted", "", now), null);
});

test("parseLikes", async () => {
  const { parseLikes } = await import("../src/lib/capture");
  assert.equal(parseLikes("87"), 87);
  assert.equal(parseLikes("1,234 reactions"), 1234);
  assert.equal(parseLikes("1.2K Likes. Like"), 1200);
  assert.equal(parseLikes(""), null);
});

test("scorePost rewards fresh, quiet posts", async () => {
  const { scorePost } = await import("../src/lib/capture");
  assert.equal(scorePost(70, 5, 40), 85);
  assert.equal(scorePost(70, 100, 900), 45);
  assert.equal(scorePost(70, null, null), 70);
  assert.equal(scorePost(99, 1, 1), 100);
});

test("bookmarklet is valid JavaScript and points at the given origin", async () => {
  const { bookmarkletSource } = await import("../src/lib/bookmarklet");
  const src = bookmarkletSource("https://radar.example.app");
  assert.ok(src.startsWith("javascript:"));
  const code = decodeURIComponent(src.slice("javascript:".length));
  assert.doesNotThrow(() => new Function(code), "parses");
  assert.match(code, /https:\/\/radar\.example\.app/);
  assert.match(code, /\/capture#/);
  assert.ok(!/fetch\(|XMLHttpRequest/.test(code), "never makes network requests from LinkedIn/X");
});

test("bookmarklet extracts an X post and opens /capture with it", async () => {
  const { bookmarkletSource } = await import("../src/lib/bookmarklet");
  const code = decodeURIComponent(bookmarkletSource("https://r.app").slice("javascript:".length));
  // Minimal fake DOM for an X timeline post.
  const el = (o: Record<string, unknown>) => o;
  const time = el({ getAttribute: () => "2026-11-22T10:00:00.000Z", closest: () => ({ href: "https://x.com/acme/status/123" }) });
  const article = el({
    innerText: "We're hiring backend interns at Acme! DM-free: email jobs@acme.ai",
    querySelector: (s: string) =>
      s.includes("time") ? time
      : s.includes("User-Name") ? { innerText: "Priya Rao\n@priya" }
      : s.includes("like") ? { getAttribute: () => "42 Likes. Like", innerText: "42" }
      : null,
  });
  let opened = "";
  const g = {
    getSelection: () => ({ toString: () => "", anchorNode: { nodeType: 1, closest: () => article } }),
    location: { hostname: "x.com", pathname: "/home", href: "https://x.com/home" },
    document: { querySelector: () => null },
    open: (u: string) => (opened = u),
    alert: () => assert.fail("should not alert"),
  };
  new Function("window", "location", "document", "alert", code.replace(/window\.open/g, "window.open"))(
    { getSelection: g.getSelection, open: g.open },
    g.location,
    g.document,
    g.alert,
  );
  assert.ok(opened.startsWith("https://r.app/capture#"));
  const d = JSON.parse(decodeURIComponent(opened.split("#")[1]));
  assert.equal(d.u, "https://x.com/acme/status/123");
  assert.equal(d.a, "Priya Rao");
  assert.equal(d.pa, "2026-11-22T10:00:00.000Z");
  assert.equal(d.l, "42 Likes. Like");
  assert.equal(d.s, "x");
  assert.match(d.t, /hiring backend interns/);
});

test("buildMime adds In-Reply-To/References for follow-ups", async () => {
  const { buildMime } = await import("../src/lib/gmail");
  const raw = Buffer.from(buildMime({ to: "a@b.co", subject: "Re: Hi", body: "x", inReplyTo: "<abc@mail.gmail.com>" }), "base64url").toString();
  assert.match(raw, /In-Reply-To: <abc@mail\.gmail\.com>\r\nReferences: <abc@mail\.gmail\.com>/);
});
