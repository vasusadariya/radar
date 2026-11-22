import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db, companies, contacts, events, leads, messages, resumes } from "@/db";
import { deleteLead, saveLeadNotes } from "@/app/actions";
import { ScoreBadge } from "@/components/lead-card";
import { StatusSelect } from "@/components/status-select";
import { RunButton } from "@/components/run-button";
import { ContactsPanel, DraftCard } from "@/components/outreach";
import { gmailAccount } from "@/lib/gmail";
import { SOURCE_LABEL, SOURCE_STYLE, STATUS_LABEL, timeAgo } from "@/lib/format";
import type { LeadStatus } from "@/lib/statuses";

export const dynamic = "force-dynamic";
// Easy Apply runs in the background after the Run action returns; give it room.
export const maxDuration = 300;

function describeEvent(type: string, meta: unknown): string {
  const m = (meta ?? {}) as Record<string, unknown>;
  switch (type) {
    case "CAPTURED":
      return m.feed ? `Captured from ${m.feed}` : "Added manually";
    case "SCORED":
      return `Scored ${m.score}${m.stage && m.stage !== "UNKNOWN" ? ` (stage: ${String(m.stage).toLowerCase().replace("_", " ")})` : ""}`;
    case "RESEARCHED":
      return `Researched${Array.isArray(m.people) && m.people.length ? ` — found ${m.people.length} people` : ""}`;
    case "EMAIL_FOUND":
      return `Email found for ${m.name} (${String(m.source).toLowerCase()}${m.verified ? ", verified" : ""})`;
    case "EMAIL_NOT_FOUND":
      return `No email found for ${m.name}`;
    case "DRAFTED":
      return `Drafted email to ${m.to}${m.gmail ? " (in Gmail)" : ""}`;
    case "SENT":
      return `Sent to ${m.to}`;
    case "REPLIED":
      return `Reply received${m.from ? ` from ${String(m.from).replace(/<.*>/, "").trim()}` : ""}`;
    case "FOLLOWUP_DRAFTED":
      return `Follow-up drafted for ${m.to}`;
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

  const [timeline, msgs, people, resumeRows, gmail] = await Promise.all([
    db.select().from(events).where(eq(events.leadId, id)).orderBy(desc(events.at)),
    db.select().from(messages).where(eq(messages.leadId, id)).orderBy(desc(messages.createdAt)),
    db.select().from(contacts).where(eq(contacts.companyId, company.id)).orderBy(contacts.createdAt),
    db.select({ id: resumes.id, label: resumes.label }).from(resumes).orderBy(desc(resumes.isDefault)),
    gmailAccount(),
  ]);
  const byContact = new Map(people.map((c) => [c.id, c]));
  const drafts = msgs.filter((m) => !m.sentAt && m.direction === "OUT");
  const sent = msgs.filter((m) => m.sentAt);
  const hasReply = msgs.some((m) => m.direction === "IN");

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
          <RunButton leadId={lead.id} runState={lead.runState} runStep={lead.runStep} runError={lead.runError} />
          {!gmail && (
            <p className="mt-2 text-xs text-zinc-500">
              Gmail isn&apos;t connected, so drafts stay here. <Link href="/profile" className="underline">Connect it</Link> to get them in your Gmail drafts and send from here.
            </p>
          )}
        </section>

        <section className="card p-4">
          <h2 className="font-semibold">Research brief</h2>
          <p className="mt-1 whitespace-pre-line text-sm text-zinc-700">
            {lead.brief ?? "Not researched yet. Run Easy Apply to fill this in."}
          </p>
        </section>

        <ContactsPanel
          leadId={lead.id}
          contacts={people.map((c) => ({
            id: c.id,
            name: c.name,
            title: c.title,
            email: c.email,
            emailSource: c.emailSource,
            emailVerified: c.emailVerified,
            foundVia: c.foundVia,
            hasDraft: msgs.some((m) => m.contactId === c.id),
          }))}
        />

        {drafts.length > 0 && (
          <section className="space-y-3">
            <h2 className="font-semibold">Drafts to review ({drafts.length})</h2>
            {drafts.map((m) => {
              const c = m.contactId ? byContact.get(m.contactId) : undefined;
              return (
                <DraftCard
                  key={m.id}
                  d={{
                    id: m.id,
                    to: c?.email ?? "",
                    toName: c?.name ?? "contact",
                    subject: m.subject,
                    body: m.body,
                    resumeId: m.resumeId,
                    inGmail: Boolean(m.gmailDraftId),
                    guessed: c?.emailSource === "PATTERN",
                    followUp: m.isFollowUp,
                  }}
                  resumes={resumeRows}
                  gmailConnected={Boolean(gmail)}
                />
              );
            })}
          </section>
        )}

        {sent.length > 0 && (
          <section className="card p-4">
            <h2 className="font-semibold">{hasReply ? "Conversation" : "Sent"}</h2>
            <ul className="mt-2 divide-y divide-zinc-100 text-sm">
              {sent.map((m) => {
                const who = m.contactId ? byContact.get(m.contactId)?.name ?? "contact" : "contact";
                return (
                  <li key={m.id} className="py-2">
                    {m.direction === "IN" && <span className="chip mr-1 bg-emerald-100 text-emerald-800">Reply</span>}
                    {m.isFollowUp && <span className="chip mr-1 bg-amber-100 text-amber-800">Follow-up</span>}
                    <span className="font-medium">{m.subject}</span>{" "}
                    <span className="text-zinc-500">
                      · {m.direction === "IN" ? `from ${who}` : `to ${who}`} · {timeAgo(m.sentAt)}
                    </span>
                    {m.direction === "IN" && <p className="mt-1 text-zinc-700">{m.body}</p>}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

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
