"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, contacts, events, leads, messages, resumes } from "@/db";
import { GmailError, createDraft, deleteDraft, disconnectGmail, gmailAccount, sendDraft, updateDraft } from "@/lib/gmail";
import { claimRun, draftFor, runEasyApply, sentToday } from "@/pipeline/easy-apply";
import { loadResume, realDeps } from "@/pipeline/deps";
import { runReplyCheck } from "@/pipeline/reply-check";

// "use server" files may only export async functions, so this stays module-private.
const DAILY_SEND_CAP = Number(process.env.DAILY_SEND_CAP) || 15;

const refresh = (leadId?: string) => {
  for (const p of ["/", "/pipeline", "/outreach", "/stats"]) revalidatePath(p);
  if (leadId) revalidatePath(`/leads/${leadId}`);
};

/** Starts Easy Apply in the background; the lead page polls run_state for progress. */
export async function runLead(leadId: string): Promise<{ error?: string }> {
  if (!(await claimRun(leadId))) return { error: "Already running" };
  after(async () => {
    try {
      await runEasyApply(leadId, await realDeps());
    } catch (err) {
      console.error("easy-apply failed", leadId, err);
    } finally {
      refresh(leadId);
    }
  });
  refresh(leadId);
  return {};
}

const NewContact = z.object({
  name: z.string().min(1, "Name is required"),
  title: z.string().optional(),
  email: z.string().email("Enter a valid email"),
});

export async function addContact(leadId: string, _: unknown, fd: FormData): Promise<{ error?: string; ok?: boolean }> {
  const parsed = NewContact.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues.map((i) => i.message).join(", ") };
  const [lead] = await db.select({ companyId: leads.companyId }).from(leads).where(eq(leads.id, leadId));
  if (!lead) return { error: "Lead not found" };
  await db.insert(contacts).values({
    companyId: lead.companyId,
    name: parsed.data.name,
    title: parsed.data.title || null,
    email: parsed.data.email.toLowerCase(),
    emailSource: "MANUAL",
    emailVerified: false,
    foundVia: "added by you",
  });
  refresh(leadId);
  return { ok: true };
}

export async function updateContactEmail(contactId: string, leadId: string, email: string): Promise<{ error?: string }> {
  const ok = z.string().email().safeParse(email.trim());
  if (!ok.success) return { error: "Enter a valid email" };
  await db.update(contacts).set({ email: ok.data.toLowerCase(), emailSource: "MANUAL", emailVerified: false }).where(eq(contacts.id, contactId));
  refresh(leadId);
  return {};
}

export async function draftForContact(leadId: string, contactId: string): Promise<{ error?: string }> {
  const [c] = await db.select().from(contacts).where(eq(contacts.id, contactId));
  if (!c?.email) return { error: "This contact has no email yet" };
  try {
    await draftFor(leadId, c, await realDeps());
  } catch (err) {
    return { error: (err as Error).message };
  }
  refresh(leadId);
  return {};
}

async function attachmentFor(resumeId: string | null) {
  if (!resumeId) return null;
  const [r] = await db.select().from(resumes).where(eq(resumes.id, resumeId));
  if (!r) return null;
  const data = await loadResume(r);
  return data ? { filename: r.fileName, contentType: "application/pdf", data } : null;
}

const DraftEdit = z.object({ subject: z.string().min(1), body: z.string().min(1), to: z.string().email() });

export async function saveDraft(messageId: string, _: unknown, fd: FormData): Promise<{ error?: string; ok?: boolean }> {
  const parsed = DraftEdit.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues.map((i) => i.message).join(", ") };
  const [m] = await db.select().from(messages).where(eq(messages.id, messageId));
  if (!m || m.sentAt) return { error: "Draft not found or already sent" };
  const resumeId = fd.get("resumeId") ? String(fd.get("resumeId")) || null : m.resumeId;
  await db.update(messages).set({ subject: parsed.data.subject, body: parsed.data.body, resumeId, attachOrLink: resumeId ? "ATTACH" : "NONE" }).where(eq(messages.id, messageId));
  if (m.contactId) await db.update(contacts).set({ email: parsed.data.to.toLowerCase() }).where(eq(contacts.id, m.contactId));
  if (m.gmailDraftId) {
    try {
      await updateDraft(m.gmailDraftId, {
        ...parsed.data,
        attachment: await attachmentFor(resumeId),
        threadId: m.isFollowUp ? m.gmailThreadId : null,
        inReplyTo: m.inReplyTo,
      });
    } catch (err) {
      return { error: `Saved here, but Gmail draft not updated: ${(err as Error).message}` };
    }
  }
  refresh(m.leadId);
  return { ok: true };
}

/** Sends one reviewed draft through Gmail. The only path in the app that sends email. */
export async function sendMessage(messageId: string): Promise<{ error?: string }> {
  const [m] = await db.select().from(messages).where(eq(messages.id, messageId));
  if (!m) return { error: "Draft not found" };
  if (m.sentAt) return { error: "Already sent" };
  if (!(await gmailAccount())) return { error: "Connect Gmail on the Profile page first" };
  if ((await sentToday()) >= DAILY_SEND_CAP) {
    return { error: `Daily cap of ${DAILY_SEND_CAP} emails reached — protects your Gmail deliverability. Try tomorrow.` };
  }
  const [c] = m.contactId ? await db.select().from(contacts).where(eq(contacts.id, m.contactId)) : [];
  if (!c?.email) return { error: "No recipient email" };

  try {
    let draftId = m.gmailDraftId;
    if (!draftId) {
      draftId = (
        await createDraft({
          to: c.email,
          subject: m.subject,
          body: m.body,
          attachment: await attachmentFor(m.resumeId),
          threadId: m.isFollowUp ? m.gmailThreadId : null,
          inReplyTo: m.inReplyTo,
        })
      ).draftId;
    }
    const sent = await sendDraft(draftId);
    await db.update(messages).set({ sentAt: new Date(), gmailThreadId: sent.threadId, gmailDraftId: null }).where(eq(messages.id, m.id));
    await db.insert(events).values({ leadId: m.leadId, type: "SENT", meta: { to: c.name, email: c.email } });
    const [lead] = await db.select({ status: leads.status }).from(leads).where(eq(leads.id, m.leadId));
    if (!m.isFollowUp && lead && ["NEW", "RESEARCHED", "CONTACTS_FOUND", "DRAFTED"].includes(lead.status)) {
      await db.update(leads).set({ status: "SENT" }).where(eq(leads.id, m.leadId));
      await db.insert(events).values({ leadId: m.leadId, type: "STATUS_CHANGED", meta: { from: lead.status, to: "SENT", via: "send" } });
    }
  } catch (err) {
    return { error: err instanceof GmailError ? err.message : `Send failed: ${(err as Error).message}` };
  }
  refresh(m.leadId);
  return {};
}

export async function discardDraft(messageId: string): Promise<{ error?: string }> {
  const [m] = await db.select().from(messages).where(and(eq(messages.id, messageId)));
  if (!m || m.sentAt) return { error: "Nothing to discard" };
  if (m.gmailDraftId) await deleteDraft(m.gmailDraftId).catch(() => {});
  await db.delete(messages).where(eq(messages.id, messageId));
  refresh(m.leadId);
  return {};
}

export async function disconnectGmailAction() {
  await disconnectGmail();
  revalidatePath("/profile");
}

export async function checkRepliesNow(): Promise<{ message: string }> {
  try {
    const r = await runReplyCheck(true);
    refresh();
    if ("skipped" in r) return { message: r.skipped === "gmail not connected" ? "Connect Gmail on the Profile page first." : "Checked recently." };
    const parts = [`Checked ${r.threads} thread${r.threads === 1 ? "" : "s"}`, `${r.replies} new repl${r.replies === 1 ? "y" : "ies"}`, `${r.followUps} follow-up draft${r.followUps === 1 ? "" : "s"}`];
    return { message: parts.join(" · ") + (r.errors.length ? ` · ${r.errors.length} error(s): ${r.errors[0]}` : "") };
  } catch (err) {
    return { message: `Check failed: ${(err as Error).message.slice(0, 200)}` };
  }
}
