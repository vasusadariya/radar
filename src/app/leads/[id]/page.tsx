import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db, companies, events, leads, messages } from "@/db";
import { deleteLead, saveLeadNotes } from "@/app/actions";
import { ScoreBadge } from "@/components/lead-card";
import { StatusSelect } from "@/components/status-select";
import { SOURCE_LABEL, SOURCE_STYLE, STATUS_LABEL, timeAgo } from "@/lib/format";
import type { LeadStatus } from "@/lib/statuses";

export const dynamic = "force-dynamic";

function describeEvent(type: string, meta: unknown): string {
  const m = (meta ?? {}) as Record<string, unknown>;
  switch (type) {
    case "CAPTURED":
      return m.feed ? `Captured from ${m.feed}` : "Added manually";
    case "SCORED":
      return `Scored ${m.score}${m.stage && m.stage !== "UNKNOWN" ? ` (stage: ${String(m.stage).toLowerCase().replace("_", " ")})` : ""}`;
    case "STATUS_CHANGED":
      return `Moved ${STATUS_LABEL[m.from as LeadStatus] ?? m.from} → ${STATUS_LABEL[m.to as LeadStatus] ?? m.to}`;
    default:
      return type.toLowerCase().replace(/_/g, " ");
  }
}

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const [row] = await db
    .select({ lead: leads, company: companies })
    .from(leads)
    .innerJoin(companies, eq(leads.companyId, companies.id))
    .where(eq(leads.id, id));
  if (!row) notFound();
  const { lead, company } = row;

  const [timeline, sent] = await Promise.all([
    db.select().from(events).where(eq(events.leadId, id)).orderBy(desc(events.at)),
    db.select().from(messages).where(eq(messages.leadId, id)).orderBy(desc(messages.createdAt)),
  ]);

  const facts: Array<[string, string | null]> = [
    ["Round", company.fundingRound],
    ["Amount", company.fundingAmount],
    ["Investors", company.investors],
    ["Sector", company.sector],
    ["Location", company.geo],
    ["Role", lead.roleGuess],
    ["Posted by", lead.postAuthor],
  ];

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <div className="space-y-5">
        <div>
          <Link href="/" className="text-sm text-zinc-500 hover:underline">
            ← Radar
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{company.name}</h1>
            <ScoreBadge score={lead.score} />
            <span className={`chip ${SOURCE_STYLE[lead.source]}`}>{SOURCE_LABEL[lead.source]}</span>
          </div>
          <p className="mt-1 text-zinc-700">{lead.title}</p>
          {company.description && <p className="mt-2 text-sm text-zinc-600">{company.description}</p>}
          {lead.scoreReason && <p className="mt-2 text-sm italic text-zinc-500">Why it scored: {lead.scoreReason}</p>}
        </div>

        <section className="card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-primary" disabled title="Arrives in Phase 2">
              Run Easy Apply
            </button>
            <span className="text-xs text-zinc-500">
              Phase 2: research → find 3 people → find emails → draft in Gmail with your resume
            </span>
          </div>
        </section>

        <section className="card p-4">
          <h2 className="font-semibold">Research brief</h2>
          <p className="mt-1 text-sm text-zinc-600">
            {lead.brief ?? "Not researched yet. The Phase 2 pipeline writes what they build and where you'd help here."}
          </p>
        </section>

        <section className="card p-4">
          <h2 className="font-semibold">Emails</h2>
          {sent.length === 0 ? (
            <p className="mt-1 text-sm text-zinc-600">No emails yet.</p>
          ) : (
            <ul className="mt-2 divide-y divide-zinc-100 text-sm">
              {sent.map((m) => (
                <li key={m.id} className="py-2">
                  <span className="font-medium">{m.subject}</span>{" "}
                  <span className="text-zinc-500">· {m.sentAt ? `sent ${timeAgo(m.sentAt)}` : "draft"}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-4">
          <h2 className="font-semibold">Notes</h2>
          <form action={saveLeadNotes.bind(null, lead.id)} className="mt-2 space-y-2">
            <textarea name="notes" defaultValue={lead.notes ?? ""} rows={4} className="input" placeholder="Anything worth remembering…" />
            <button className="btn-ghost">Save notes</button>
          </form>
        </section>
      </div>

      <aside className="space-y-4">
        <section className="card space-y-3 p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Status</span>
            <StatusSelect leadId={lead.id} status={lead.status} />
          </div>
          <dl className="space-y-1.5 text-sm">
            {facts
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k} className="flex gap-2">
                  <dt className="w-20 shrink-0 text-zinc-500">{k}</dt>
                  <dd className="text-zinc-800">{v}</dd>
                </div>
              ))}
          </dl>
          <div className="flex flex-wrap gap-2">
            {lead.postUrl && (
              <a href={lead.postUrl} target="_blank" rel="noreferrer" className="btn-ghost text-xs">
                Source ↗
              </a>
            )}
            {company.domain && (
              <a href={`https://${company.domain}`} target="_blank" rel="noreferrer" className="btn-ghost text-xs">
                {company.domain} ↗
              </a>
            )}
          </div>
        </section>

        <section className="card p-4">
          <h2 className="text-sm font-semibold">Timeline</h2>
          <ol className="mt-2 space-y-2">
            {timeline.map((e) => (
              <li key={e.id} className="flex gap-2 text-sm">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-400" />
                <span className="flex-1 text-zinc-700">{describeEvent(e.type, e.meta)}</span>
                <span className="shrink-0 text-xs text-zinc-500">{timeAgo(e.at)}</span>
              </li>
            ))}
          </ol>
        </section>

        <form action={deleteLead.bind(null, lead.id)}>
          <button className="btn-danger w-full">Delete lead</button>
        </form>
      </aside>
    </div>
  );
}
