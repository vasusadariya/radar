import Link from "next/link";
import { and, count, desc, eq, gte, max, ne, type SQL } from "drizzle-orm";
import { db, companies, feedItems, leads } from "@/db";
import { LeadCard } from "@/components/lead-card";
import { timeAgo } from "@/lib/format";

export const dynamic = "force-dynamic";

const VIEWS = {
  inbox: { label: "Inbox", hint: "New leads you haven't acted on" },
  active: { label: "All active", hint: "Everything not dead" },
  all: { label: "All", hint: "Including dismissed" },
} as const;
const SOURCES = { any: "Any source", FUNDING: "Funding", POST: "Hiring posts", MANUAL: "Manual" } as const;

type View = keyof typeof VIEWS;
type Source = keyof typeof SOURCES;

export default async function RadarPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; source?: string }>;
}) {
  const sp = await searchParams;
  const view: View = sp.view && sp.view in VIEWS ? (sp.view as View) : "inbox";
  const source: Source = sp.source && sp.source in SOURCES ? (sp.source as Source) : "any";

  const where: SQL[] = [];
  if (view === "inbox") where.push(eq(leads.status, "NEW"));
  if (view === "active") where.push(ne(leads.status, "DEAD"));
  if (source !== "any") where.push(eq(leads.source, source));

  const dayAgo = new Date(Date.now() - 86_400_000);
  const [rows, [today], [lastIngest]] = await Promise.all([
    db
      .select({ lead: leads, company: companies })
      .from(leads)
      .innerJoin(companies, eq(leads.companyId, companies.id))
      .where(where.length ? and(...where) : undefined)
      .orderBy(desc(leads.score), desc(leads.createdAt))
      .limit(200),
    db.select({ n: count() }).from(leads).where(gte(leads.createdAt, dayAgo)),
    db.select({ at: max(feedItems.createdAt) }).from(feedItems),
  ]);

  const href = (v: View, s: Source) => {
    const q = new URLSearchParams();
    if (v !== "inbox") q.set("view", v);
    if (s !== "any") q.set("source", s);
    const qs = q.toString();
    return qs ? `/?${qs}` : "/";
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Radar</h1>
          <p className="text-sm text-zinc-500">
            {today.n} new in the last 24h · funding feed last checked {timeAgo(lastIngest?.at ?? null)}
          </p>
        </div>
        <Link href="/leads/new" className="btn-primary sm:hidden">
          + Add lead
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-zinc-200 bg-white p-0.5">
          {(Object.keys(VIEWS) as View[]).map((v) => (
            <Link
              key={v}
              href={href(v, source)}
              title={VIEWS[v].hint}
              className={`rounded-md px-3 py-1 text-sm ${view === v ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100"}`}
            >
              {VIEWS[v].label}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap gap-1">
          {(Object.keys(SOURCES) as Source[]).map((s) => (
            <Link
              key={s}
              href={href(view, s)}
              className={`rounded-full border px-3 py-1 text-xs ${source === s ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-100"}`}
            >
              {SOURCES[s]}
            </Link>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="font-medium">Nothing here yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-zinc-500">
            Funding leads appear after the ingest job runs (every 3 hours via GitHub Actions, or{" "}
            <code className="rounded bg-zinc-100 px-1">npm run ingest:funding</code> locally). You can also add a
            lead by hand.
          </p>
          <Link href="/leads/new" className="btn-primary mt-4">
            + Add lead
          </Link>
        </div>
      ) : (
        <div className="grid gap-3">
          {rows.map(({ lead, company }) => (
            <LeadCard key={lead.id} lead={lead} company={company} />
          ))}
        </div>
      )}
    </div>
  );
}
