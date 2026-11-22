import Link from "next/link";
import { after } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db, companies, contacts, leads, messages } from "@/db";
import { timeAgo } from "@/lib/format";
import { CheckRepliesButton } from "@/components/check-replies";
import { FOLLOW_UP_DAYS, lastReplyCheck } from "@/pipeline/replies";
import { runReplyCheck } from "@/pipeline/reply-check";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export default async function OutreachPage() {
  // Opening this page checks Gmail for replies in the background (at most every 20 minutes).
  after(() => runReplyCheck().catch((err) => console.error("reply check failed", err)));
  const lastCheck = await lastReplyCheck();
  const rows = await db
    .select({
      id: messages.id,
      subject: messages.subject,
      sentAt: messages.sentAt,
      createdAt: messages.createdAt,
      direction: messages.direction,
      isFollowUp: messages.isFollowUp,
      leadId: leads.id,
      body: messages.body,
      leadStatus: leads.status,
      company: companies.name,
      contact: contacts.name,
      email: contacts.email,
    })
    .from(messages)
    .innerJoin(leads, eq(messages.leadId, leads.id))
    .innerJoin(companies, eq(leads.companyId, companies.id))
    .leftJoin(contacts, eq(messages.contactId, contacts.id))
    .orderBy(desc(messages.createdAt))
    .limit(300);

  const replies = rows.filter((r) => r.direction === "IN").slice(0, 10);
  const followUps = rows.filter((r) => r.isFollowUp && !r.sentAt);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Outreach</h1>
          <p className="text-sm text-zinc-500">
            Every email drafted or sent, who it went to, and whether they replied. Replies are checked when you open this
            page (every 20 min at most) and daily{lastCheck ? ` · last checked ${timeAgo(lastCheck)}` : ""}.
          </p>
        </div>
        <CheckRepliesButton />
      </div>

      {replies.length > 0 && (
        <section className="card p-4">
          <h2 className="font-semibold">Replies</h2>
          <ul className="mt-2 divide-y divide-zinc-100 text-sm">
            {replies.map((r) => (
              <li key={r.id} className="py-2">
                <Link href={`/leads/${r.leadId}`} className="font-medium hover:underline">
                  {r.company}
                </Link>{" "}
                <span className="text-zinc-500">· {r.contact ?? "contact"} · {timeAgo(r.sentAt)}</span>
                <p className="mt-0.5 text-zinc-700">{r.body}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {followUps.length > 0 && (
        <section className="card p-4">
          <h2 className="font-semibold">Follow-ups to review ({followUps.length})</h2>
          <p className="text-sm text-zinc-500">
            No reply after {FOLLOW_UP_DAYS} days, so a short follow-up is waiting in the same Gmail thread. Review and send it
            from the lead page.
          </p>
          <ul className="mt-2 divide-y divide-zinc-100 text-sm">
            {followUps.map((r) => (
              <li key={r.id} className="py-2">
                <Link href={`/leads/${r.leadId}`} className="font-medium hover:underline">
                  {r.company}
                </Link>{" "}
                <span className="text-zinc-500">· to {r.contact ?? "contact"}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {rows.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="font-medium">No emails yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-zinc-500">
            Phase 2 connects Gmail: Easy Apply drafts each email with your resume attached, you review and send, and
            replies plus 3-day follow-ups show up here.
          </p>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-2">Company</th>
                <th className="px-4 py-2">To</th>
                <th className="px-4 py-2">Subject</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2">
                    <Link href={`/leads/${r.leadId}`} className="font-medium hover:underline">
                      {r.company}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-zinc-600">{r.contact ?? r.email ?? "—"}</td>
                  <td className="px-4 py-2">
                    {r.isFollowUp && <span className="chip mr-1 bg-amber-100 text-amber-800">Follow-up</span>}
                    {r.subject}
                  </td>
                  <td className="px-4 py-2 text-zinc-600">
                    {r.direction === "IN" ? "Reply received" : r.sentAt ? "Sent" : "Draft"}
                  </td>
                  <td className="px-4 py-2 text-zinc-500">{timeAgo(r.sentAt ?? r.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
