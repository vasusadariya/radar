import { test } from "node:test";
import assert from "node:assert/strict";
import { companyKey, domainFrom, normalizeStage, scoreFundingLead } from "../src/lib/scoring";
import { FUNDING_HINT } from "../src/worker/feeds";

test("normalizeStage", () => {
  assert.equal(normalizeStage("Pre-Seed"), "PRE_SEED");
  assert.equal(normalizeStage("seed round"), "SEED");
  assert.equal(normalizeStage("Series A"), "SERIES_A");
  assert.equal(normalizeStage("Series C extension"), "SERIES_B_PLUS");
  assert.equal(normalizeStage(null), "UNKNOWN");
});

test("seed beats series B at equal fit; stale and unwanted stages are penalised", () => {
  const now = new Date("2026-11-15T00:00:00Z");
  const fresh = new Date("2026-11-14T00:00:00Z");
  const seed = scoreFundingLead({ fit: 70, round: "Seed", publishedAt: fresh, wantedStages: [], now });
  const b = scoreFundingLead({ fit: 70, round: "Series B", publishedAt: fresh, wantedStages: [], now });
  assert.equal(seed.score, 80);
  assert.equal(b.score, 55);
  const stale = scoreFundingLead({ fit: 70, round: "Seed", publishedAt: new Date("2026-11-01"), wantedStages: [], now });
  assert.equal(stale.score, 55);
  const unwanted = scoreFundingLead({ fit: 70, round: "Series A", publishedAt: fresh, wantedStages: ["SEED"], now });
  assert.equal(unwanted.score, 50);
  assert.equal(scoreFundingLead({ fit: 99, round: "Seed", publishedAt: fresh, wantedStages: [], now }).score, 100);
});

test("companyKey collapses legal suffixes and punctuation", () => {
  assert.equal(companyKey("Acme, Inc."), companyKey("acme inc"));
  assert.equal(companyKey("Sarvam AI"), companyKey("Sarvam"));
  assert.notEqual(companyKey("Acme"), companyKey("Acmes"));
  assert.ok(companyKey("AI").length > 0);
});

test("domainFrom", () => {
  assert.equal(domainFrom("https://www.acme.dev/about"), "acme.dev");
  assert.equal(domainFrom("acme.io"), "acme.io");
  assert.equal(domainFrom(null), null);
});

test("FUNDING_HINT prefilter", () => {
  assert.ok(FUNDING_HINT.test("Acme raises $4M seed round led by Accel"));
  assert.ok(FUNDING_HINT.test("Bengaluru startup bags Rs 25 Cr in pre-Series A"));
  assert.ok(FUNDING_HINT.test("Zeta gets ₹120 crore"));
  assert.ok(!FUNDING_HINT.test("How to write a better README"));
});
