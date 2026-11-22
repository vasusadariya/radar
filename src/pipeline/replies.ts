import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db, contacts, events, leads, messages, settings, type Profile } from "@/db";
import type { DraftInput, ThreadMessage } from "@/lib/gmail";
import type { LlmJson } from "@/lib/llm";
import { cleanBody } from "./easy-apply";

/**
 * Reply tracking + follow-ups. For every thread we sent into:
 *  - a message from someone else = a reply -> log it, lead -> REPLIED, drop any pending follow-up
 *  - no reply after FOLLOW_UP_DAYS -> draft ONE short follow-up in the same thread (never sent automatically)
 */
export const FOLLOW_UP_DAYS = Number(process.env.FOLLOW_UP_DAYS) || 3;
const MAX_FOLLOW_UPS_PER_RUN = 5;
const LAST_CHECK_KEY = "replies.lastCheck";

export type ReplyDeps = {
  getThread: (threadId: string) => Promise<ThreadMessage[]>;
  createDraft: (o: DraftInput) => Promise<{ draftId: string; threadId: string }>;
  deleteDraft: (draftId: string) => Promise<void>;
  llm: LlmJson;
  profile: Profile;
  now?: Date;
};

export type ReplyStats = { threads: number; replies: number; followUps: number; errors: string[] };

const OURS = new Set(["SENT", "DRAFT"]);
const isOurs = (m: ThreadMessage) => m.labelIds.some((l) => OURS.has(l));

const FollowUp = z.object({ body: z.string().min(10) });

export async function lastReplyCheck(): Promise<Date | null> {
  const [row] = await db.select().from(settings).where(eq(settings.key, LAST_CHECK_KEY));
  return row ? row.updatedAt : null;
}

export async function checkReplies(deps: ReplyDeps): Promise<ReplyStats> {
  const now = deps.now ?? new Date();
  const stats: ReplyStats = { threads: 0, replies: 0, followUps: 0, errors: [] };

  // Our first outgoing email in each thread, for leads still waiting on an answer.
  const sent = await db
    .select({ msg: messages, leadStatus: leads.status })
    .from(messages)
    .innerJoin(leads, eq(messages.leadId, leads.id))
    .where(
      and(
        eq(messages.direction, "OUT"),
        eq(messages.isFollowUp, false),
        isNotNull(messages.sentAt),
        isNotNull(messages.gmailThreadId),
        inArray(leads.status, ["SENT", "DRAFTED", "CONTACTS_FOUND", "RESEARCHED", "NEW"]),
      ),
    )
    .orderBy(desc(messages.sentAt));

  const threadIds = [...new Set(sent.map((s) => s.msg.gmailThreadId!))];
  const inThread = threadIds.length
    ? await db.select().from(messages).where(inArray(messages.gmailThreadId, threadIds))
    : [];

  for (const threadId of threadIds) {
    const first = sent.find((s) => s.msg.gmailThreadId === threadId)!.msg;
    const known = inThread.filter((m) => m.gmailThreadId === threadId);
    if (known.some((m) => m.direction === "IN")) continue; // reply already logged
    stats.threads++;

    let thread: ThreadMessage[];
    try {
      thread = await deps.getThread(threadId);
    } catch (err) {
      stats.errors.push(`${threadId}: ${(err as Error).message}`);
      continue;
    }

    const reply = thread.find((m) => !isOurs(m) && m.internalDate > (first.sentAt?.getTime() ?? 0));
    if (reply) {
      await recordReply(first, reply);
      for (const fu of known.filter((m) => m.isFollowUp && !m.sentAt)) {
        if (fu.gmailDraftId) await deps.deleteDraft(fu.gmailDraftId).catch(() => {});
        await db.delete(messages).where(eq(messages.id, fu.id));
      }
      stats.replies++;
      continue;
    }

    const due = first.sentAt && now.getTime() - first.sentAt.getTime() >= FOLLOW_UP_DAYS * 86_400_000;
    const hasFollowUp = known.some((m) => m.isFollowUp);
    const leadStatus = sent.find((s) => s.msg.id === first.id)!.leadStatus;
    if (due && !hasFollowUp && leadStatus === "SENT" && stats.followUps < MAX_FOLLOW_UPS_PER_RUN) {
      try {
        await draftFollowUp(first, thread, deps);
        stats.followUps++;
      } catch (err) {
        stats.errors.push(`follow-up ${threadId}: ${(err as Error).message.slice(0, 200)}`);
      }
    }
  }

  await db
    .insert(settings)
    .values({ key: LAST_CHECK_KEY, value: stats })
    .onConflictDoUpdate({ target: settings.key, set: { value: stats, updatedAt: now } });
  return stats;
}

async function recordReply(first: typeof messages.$inferSelect, reply: ThreadMessage) {
  await db.transaction(async (tx) => {
    await tx.insert(messages).values({
      leadId: first.leadId,
      contactId: first.contactId,
      direction: "IN",
      gmailThreadId: first.gmailThreadId,
      subject: reply.subject || `Re: ${first.subject}`,
      body: reply.snippet,
      attachOrLink: "NONE",
      sentAt: new Date(reply.internalDate),
    });
    await tx.insert(events).values({ leadId: first.leadId, type: "REPLIED", meta: { from: reply.from } });
    const [lead] = await tx.select({ status: leads.status }).from(leads).where(eq(leads.id, first.leadId));
    if (lead && !["REPLIED", "INTERVIEW", "OFFER"].includes(lead.status)) {
      await tx.update(leads).set({ status: "REPLIED" }).where(eq(leads.id, first.leadId));
      await tx.insert(events).values({ leadId: first.leadId, type: "STATUS_CHANGED", meta: { from: lead.status, to: "REPLIED", via: "reply" } });
    }
  });
}

async function draftFollowUp(first: typeof messages.$inferSelect, thread: ThreadMessage[], deps: ReplyDeps) {
  const [c] = first.contactId ? await db.select().from(contacts).where(eq(contacts.id, first.contactId)) : [];
  if (!c?.email) throw new Error("no recipient email");
  const ours = thread.filter(isOurs);
  const inReplyTo = ours.at(-1)?.messageId ?? thread.at(-1)?.messageId ?? null;
  const firstName = c.name.split(/\s+/)[0];

  const out = await deps.llm(
    `Write a short follow-up to a cold email that got no reply after ${FOLLOW_UP_DAYS} days.

ORIGINAL EMAIL (to ${c.name}${c.title ? `, ${c.title}` : ""}):
Subject: ${first.subject}
${first.body}

RULES: 2-3 short lines. Polite, no guilt-tripping, no "just bumping this". Add one small new angle or make the ask easier (e.g. "happy to do a quick async test task instead"). Start with "Hi ${firstName},". No sign-off. Put each line on its own line.
Return JSON {"body": "..."}`,
    FollowUp,
  );
  const sig = [deps.profile.fullName, deps.profile.portfolioUrl, deps.profile.githubUrl, deps.profile.linkedinUrl].filter(Boolean).join("\n");
  const body = `${cleanBody(out.body)}${sig ? `\n\n${sig}` : ""}`;
  const subject = /^re:/i.test(first.subject) ? first.subject : `Re: ${first.subject}`;

  const g = await deps.createDraft({ to: c.email, subject, body, threadId: first.gmailThreadId, inReplyTo });
  await db.insert(messages).values({
    leadId: first.leadId,
    contactId: first.contactId,
    direction: "OUT",
    subject,
    body,
    isFollowUp: true,
    attachOrLink: "NONE",
    gmailDraftId: g.draftId,
    gmailThreadId: g.threadId,
    inReplyTo,
  });
  await db.insert(events).values({ leadId: first.leadId, type: "FOLLOWUP_DRAFTED", meta: { to: c.name } });
}

/** Pending follow-up drafts + recent replies, for the Outreach page. */
export async function followUpQueueCount(): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(messages)
    .where(and(eq(messages.isFollowUp, true), sql`${messages.sentAt} is null`));
  return r?.n ?? 0;
}
