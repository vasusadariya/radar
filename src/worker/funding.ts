import Parser from "rss-parser";
import { and, eq, gte, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, companies, events, feedItems, leads, type Profile } from "@/db";
import type { LlmJson } from "@/lib/llm";
import { profileForPrompt } from "@/lib/profile";
import { companyKey, domainFrom, scoreFundingLead } from "@/lib/scoring";
import { FUNDING_HINT, type Feed } from "./feeds";

const BATCH_SIZE = 8; // items per LLM call — keeps us well inside free-tier RPM
const MAX_AGE_DAYS = 4; // ignore older feed items entirely
const DEDUPE_WINDOW_DAYS = 30; // same company funded again within this window = same lead

export type RawItem = {
  feed: string;
  url: string;
  title: string;
  snippet: string;
  publishedAt: Date | null;
};

const Extraction = z.object({
  items: z.array(
    z.object({
      index: z.number().int(),
      isFunding: z.boolean(),
      company: z.string().nullish(),
      website: z.string().nullish(),
      round: z.string().nullish(),
      amount: z.string().nullish(),
      investors: z.string().nullish(),
      sector: z.string().nullish(),
      geo: z.string().nullish(),
      whatTheyDo: z.string().nullish(),
      fit: z.number().nullish(),
      fitReason: z.string().nullish(),
    }),
  ),
});
type Extracted = z.infer<typeof Extraction>["items"][number];

export type IngestStats = {
  feedsOk: number;
  feedsFailed: string[];
  seen: number;
  newItems: number;
  sentToLlm: number;
  fundingFound: number;
  leadsCreated: number;
  duplicates: number;
};

export async function fetchFeeds(feeds: Feed[]): Promise<{ items: RawItem[]; failed: string[]; ok: number }> {
  const parser = new Parser({ timeout: 20_000, headers: { "user-agent": "JobRadar/0.1 (+personal RSS reader)" } });
  const cutoff = Date.now() - MAX_AGE_DAYS * 86_400_000;
  const items: RawItem[] = [];
  const failed: string[] = [];
  let ok = 0;
  const results = await Promise.allSettled(feeds.map((f) => parser.parseURL(f.url).then((r) => ({ f, r }))));
  results.forEach((res, i) => {
    if (res.status === "rejected") {
      failed.push(`${feeds[i].name}: ${(res.reason as Error)?.message ?? res.reason}`);
      return;
    }
    ok++;
    for (const it of res.value.r.items ?? []) {
      const url = it.link?.trim();
      if (!url || !it.title) continue;
      const publishedAt = it.isoDate ? new Date(it.isoDate) : it.pubDate ? new Date(it.pubDate) : null;
      if (publishedAt && !isNaN(+publishedAt) && +publishedAt < cutoff) continue;
      items.push({
        feed: res.value.f.name,
        url,
        title: it.title.trim(),
        snippet: (it.contentSnippet ?? it.content ?? "").replace(/\s+/g, " ").slice(0, 600),
        publishedAt: publishedAt && !isNaN(+publishedAt) ? publishedAt : null,
      });
    }
  });
  return { items, failed, ok };
}

function buildPrompt(profileText: string, batch: RawItem[]): string {
  const list = batch
    .map((it, i) => `[${i}] TITLE: ${it.title}\nSOURCE: ${it.feed}\nSNIPPET: ${it.snippet || "(none)"}`)
    .join("\n\n");
  return `You triage startup news for a job seeker who emails founders of freshly funded startups.

JOB SEEKER:
${profileText}

For EACH news item below decide whether it announces a specific company raising a private funding round (pre-seed, seed, Series A/B/..., or an undisclosed round). Acquisitions, IPOs, QIPs and other public-market raises by listed companies, fund launches by VCs, layoffs, opinion pieces and roundups are NOT funding announcements.

For funding items extract: company (the startup that raised, not the investor), website (only if stated), round, amount (with currency as written), investors (comma-separated, lead first), sector, geo (HQ city/country), whatTheyDo (one plain sentence), fit (0-100: how likely this company needs someone like the job seeker soon — weigh tech/AI/software-heavy products and engineering hiring high, non-software businesses low, and respect "sectors to skip"), fitReason (one short sentence).
For non-funding items return only index and isFunding=false.

Return JSON: {"items":[{"index":0,"isFunding":true,"company":"...","website":null,"round":"Seed","amount":"$3M","investors":"...","sector":"...","geo":"...","whatTheyDo":"...","fit":72,"fitReason":"..."}]}
Include every index exactly once. Do not invent facts that are not in the text; use null when unknown.

NEWS ITEMS:
${list}`;
}

export async function ingestFunding(opts: {
  feeds: Feed[];
  llm: LlmJson;
  profile: Profile;
  log?: (msg: string) => void;
  now?: Date;
  budgetMs?: number;
}): Promise<IngestStats> {
  const log = opts.log ?? (() => {});
  const stats: IngestStats = {
    feedsOk: 0,
    feedsFailed: [],
    seen: 0,
    newItems: 0,
    sentToLlm: 0,
    fundingFound: 0,
    leadsCreated: 0,
    duplicates: 0,
  };

  const { items, failed, ok } = await fetchFeeds(opts.feeds);
  stats.feedsOk = ok;
  stats.feedsFailed = failed;
  failed.forEach((f) => log(`feed failed — ${f}`));

  // Same link can appear in two feeds within one run.
  const unique = [...new Map(items.map((it) => [it.url, it])).values()];
  stats.seen = unique.length;
  if (unique.length === 0) return stats;

  const known = await db
    .select({ url: feedItems.url })
    .from(feedItems)
    .where(inArray(feedItems.url, unique.map((i) => i.url)));
  const knownSet = new Set(known.map((k) => k.url));
  const fresh = unique.filter((i) => !knownSet.has(i.url));
  stats.newItems = fresh.length;

  const candidates = fresh.filter((i) => FUNDING_HINT.test(`${i.title} ${i.snippet.slice(0, 200)}`));
  const skipped = fresh.filter((i) => !candidates.includes(i));
  if (skipped.length) {
    await db
      .insert(feedItems)
      .values(skipped.map((i) => ({ url: i.url, feed: i.feed, title: i.title, isFunding: false })))
      .onConflictDoNothing();
  }

  const profileText = profileForPrompt(opts.profile);
  const batches = Math.ceil(candidates.length / BATCH_SIZE);
  log(`${stats.seen} items, ${stats.newItems} new, ${candidates.length} look like funding news -> ${batches} LLM batch(es)`);
  const deadline = Date.now() + (opts.budgetMs ?? 10 * 60_000);
  for (let start = 0; start < candidates.length; start += BATCH_SIZE) {
    if (Date.now() > deadline) {
      log(`time budget reached; ${candidates.length - start} items left for the next run`);
      break;
    }
    log(`batch ${start / BATCH_SIZE + 1}/${batches}...`);
    const batch = candidates.slice(start, start + BATCH_SIZE);
    stats.sentToLlm += batch.length;
    let extracted: Extracted[];
    try {
      extracted = (await opts.llm(buildPrompt(profileText, batch), Extraction)).items;
    } catch (err) {
      // Leave these unrecorded so the next run retries them.
      log(`LLM batch failed, will retry next run — ${(err as Error).message}`);
      continue;
    }
    const byIndex = new Map(extracted.map((e) => [e.index, e]));

    for (const [i, item] of batch.entries()) {
      const ex = byIndex.get(i);
      const isFunding = Boolean(ex?.isFunding && ex.company?.trim());
      await db
        .insert(feedItems)
        .values({ url: item.url, feed: item.feed, title: item.title, isFunding })
        .onConflictDoNothing();
      if (!isFunding || !ex) continue;
      stats.fundingFound++;
      const created = await saveFundingLead(item, ex, opts.profile, opts.now);
      if (created) {
        stats.leadsCreated++;
        log(`+ ${ex.company} — ${ex.round ?? "round?"} ${ex.amount ?? ""}`.trim());
      } else {
        stats.duplicates++;
      }
    }
  }
  return stats;
}

async function saveFundingLead(item: RawItem, ex: Extracted, profile: Profile, now?: Date): Promise<boolean> {
  const name = ex.company!.trim();
  const key = companyKey(name);
  const { score, stage } = scoreFundingLead({
    fit: ex.fit ?? 50,
    round: ex.round,
    publishedAt: item.publishedAt,
    wantedStages: profile.stages,
    now,
  });

  return db.transaction(async (tx) => {
    const fields = {
      name,
      domain: domainFrom(ex.website),
      description: ex.whatTheyDo ?? null,
      sector: ex.sector ?? null,
      geo: ex.geo ?? null,
      fundingRound: ex.round ?? null,
      fundingAmount: ex.amount ?? null,
      investors: ex.investors ?? null,
      fundingDate: item.publishedAt,
      sourceUrl: item.url,
    };
    const [company] = await tx
      .insert(companies)
      .values({ ...fields, nameKey: key })
      .onConflictDoUpdate({
        target: companies.nameKey,
        // Keep the richer of the two records: only fill fields we didn't have.
        set: { updatedAt: new Date() },
      })
      .returning();

    // Fill blanks on an existing company from this (possibly better) article.
    const patch = Object.fromEntries(
      Object.entries(fields).filter(([k, v]) => v != null && company[k as keyof typeof company] == null),
    );
    if (Object.keys(patch).length) await tx.update(companies).set(patch).where(eq(companies.id, company.id));

    const windowStart = new Date((now ?? new Date()).getTime() - DEDUPE_WINDOW_DAYS * 86_400_000);
    const existing = await tx
      .select({ id: leads.id })
      .from(leads)
      .where(and(eq(leads.companyId, company.id), eq(leads.source, "FUNDING"), gte(leads.createdAt, windowStart)))
      .limit(1);
    if (existing.length) return false;

    const title = [`${name} raised`, ex.amount, ex.round].filter(Boolean).join(" ");
    const [lead] = await tx
      .insert(leads)
      .values({
        companyId: company.id,
        source: "FUNDING",
        title,
        postUrl: item.url,
        score,
        scoreReason: ex.fitReason ?? null,
      })
      .returning({ id: leads.id });
    await tx.insert(events).values([
      { leadId: lead.id, type: "CAPTURED", meta: { feed: item.feed, url: item.url } },
      { leadId: lead.id, type: "SCORED", meta: { fit: ex.fit ?? null, stage, score } },
    ]);
    return true;
  });
}
