import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db, companies, contacts, leads, messages } from "@/db";
import { timeAgo } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function OutreachPage() {
  const rows = await db
    .select({
      id: messages.id,
      subject: messages.subject,
      sentAt: messages.sentAt,
      createdAt: messages.createdAt,
      direction: messages.direction,
      isFollowUp: messages.isFollowUp,
      leadId: leads.id,
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

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Outreach</h1>
        <p className="text-sm text-zinc-500">Every email drafted or sent, who it went to, and whether they replied.</p>
      </div>
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
