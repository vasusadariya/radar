import { count, gte, sql } from "drizzle-orm";
import { db, events, leads } from "@/db";
import { LEAD_STATUSES, STATUS_LABEL, type LeadStatus } from "@/lib/statuses";
import { SOURCE_LABEL } from "@/lib/format";

export const dynamic = "force-dynamic";

const CONTACTED: LeadStatus[] = ["SENT", "REPLIED", "INTERVIEW", "OFFER"];
const RESPONDED: LeadStatus[] = ["REPLIED", "INTERVIEW", "OFFER"];

export default async function StatsPage() {
  const since = new Date(Date.now() - 13 * 86_400_000);
  since.setHours(0, 0, 0, 0);

  const [bySourceStatus, perDay, statusMoves] = await Promise.all([
    db
      .select({ source: leads.source, status: leads.status, n: count() })
      .from(leads)
      .groupBy(leads.source, leads.status),
    db
      .select({ day: sql<string>`to_char(${leads.createdAt} at time zone 'Asia/Kolkata', 'YYYY-MM-DD')`, n: count() })
      .from(leads)
      .where(gte(leads.createdAt, since))
      .groupBy(sql`1`),
    db.select({ n: count() }).from(events).where(gte(events.at, since)),
  ]);

  const total = bySourceStatus.reduce((a, r) => a + r.n, 0);
  const byStatus = Object.fromEntries(LEAD_STATUSES.map((s) => [s, 0])) as Record<LeadStatus, number>;
  for (const r of bySourceStatus) byStatus[r.status] += r.n;

  const sources = (["FUNDING", "POST", "MANUAL"] as const).map((src) => {
    const rows = bySourceStatus.filter((r) => r.source === src);
    const sum = (set: LeadStatus[]) => rows.filter((r) => set.includes(r.status)).reduce((a, r) => a + r.n, 0);
    const contacted = sum(CONTACTED);
    const responded = sum(RESPONDED);
    return {
      src,
      total: rows.reduce((a, r) => a + r.n, 0),
      contacted,
      responded,
      rate: contacted ? Math.round((responded / contacted) * 100) : null,
    };
  });

  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(since.getTime() + i * 86_400_000);
    const key = d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    return { key, label: d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }), n: perDay.find((p) => p.day === key)?.n ?? 0 };
  });
  const peak = Math.max(1, ...days.map((d) => d.n));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Stats</h1>
        <p className="text-sm text-zinc-500">
          {total} leads tracked · {statusMoves[0].n} pipeline events in the last 14 days
        </p>
      </div>

      <section className="card p-4">
        <h2 className="font-semibold">Which channel converts</h2>
        <p className="text-sm text-zinc-500">Reply rate = replied, interviewing or offer ÷ contacted.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {sources.map((s) => (
            <div key={s.src} className="rounded-lg border border-zinc-200 p-3">
              <p className="text-sm text-zinc-500">{SOURCE_LABEL[s.src]}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{s.rate === null ? "—" : `${s.rate}%`}</p>
              <p className="text-xs text-zinc-500">
                {s.responded} replied of {s.contacted} contacted · {s.total} leads
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="card p-4">
        <h2 className="font-semibold">New leads per day</h2>
        <div className="mt-4 flex h-36 items-end gap-1.5">
          {days.map((d) => (
            <div key={d.key} className="flex flex-1 flex-col items-center gap-1" title={`${d.label}: ${d.n}`}>
              <span className="text-[10px] tabular-nums text-zinc-500">{d.n || ""}</span>
              <div className="w-full rounded-t bg-zinc-800" style={{ height: `${(d.n / peak) * 100}px` }} />
              <span className="text-[10px] text-zinc-500">{d.label.split(" ")[0]}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="card p-4">
        <h2 className="font-semibold">Pipeline</h2>
        <div className="mt-3 space-y-1.5">
          {LEAD_STATUSES.map((s) => (
            <div key={s} className="flex items-center gap-3 text-sm">
              <span className="w-32 shrink-0 text-zinc-600">{STATUS_LABEL[s]}</span>
              <div className="h-2 flex-1 rounded-full bg-zinc-100">
                <div
                  className={`h-2 rounded-full ${s === "DEAD" ? "bg-zinc-300" : "bg-zinc-800"}`}
                  style={{ width: `${total ? (byStatus[s] / total) * 100 : 0}%` }}
                />
              </div>
              <span className="w-10 text-right tabular-nums text-zinc-700">{byStatus[s]}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
