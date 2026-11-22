"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import {
  addContact,
  discardDraft,
  draftForContact,
  saveDraft,
  sendMessage,
  updateContactEmail,
} from "@/app/outreach-actions";

type Contact = {
  id: string;
  name: string;
  title: string | null;
  email: string | null;
  emailSource: string | null;
  emailVerified: boolean;
  foundVia: string | null;
  hasDraft: boolean;
};

const SOURCE_BADGE: Record<string, { label: string; cls: string }> = {
  HUNTER: { label: "Hunter", cls: "bg-emerald-100 text-emerald-800" },
  APOLLO: { label: "Apollo", cls: "bg-emerald-100 text-emerald-800" },
  MANUAL: { label: "Added by you", cls: "bg-zinc-100 text-zinc-700" },
  PATTERN: { label: "Guessed", cls: "bg-amber-100 text-amber-800" },
};

function ContactRow({ c, leadId }: { c: Contact; leadId: string }) {
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [email, setEmail] = useState(c.email ?? "");
  const [error, setError] = useState<string | null>(null);
  const badge = c.emailSource ? SOURCE_BADGE[c.emailSource] : null;

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{c.name}</span>
        {c.title && <span className="text-sm text-zinc-500">{c.title}</span>}
        {badge && <span className={`chip ${badge.cls}`}>{badge.label}{c.emailVerified ? " · verified" : ""}</span>}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
        {editing ? (
          <>
            <input value={email} onChange={(e) => setEmail(e.target.value)} className="input max-w-xs py-1" placeholder="name@company.com" />
            <button
              className="btn-ghost px-2 py-1 text-xs"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await updateContactEmail(c.id, leadId, email);
                  if (r.error) setError(r.error);
                  else setEditing(false);
                })
              }
            >
              Save
            </button>
          </>
        ) : (
          <>
            <span className={c.email ? "font-mono text-zinc-800" : "text-zinc-500"}>{c.email ?? "No email found"}</span>
            <button className="text-xs text-zinc-500 underline" onClick={() => setEditing(true)}>
              {c.email ? "Edit" : "Add email"}
            </button>
          </>
        )}
        {c.email && !c.hasDraft && !editing && (
          <button
            className="btn-ghost ml-auto px-2 py-1 text-xs"
            disabled={pending}
            onClick={() =>
              start(async () => {
                setError(null);
                const r = await draftForContact(leadId, c.id);
                if (r.error) setError(r.error);
              })
            }
          >
            {pending ? "Drafting…" : "Draft email"}
          </button>
        )}
      </div>
      {c.foundVia && <p className="mt-1 text-xs text-zinc-500">{c.foundVia}</p>}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </li>
  );
}

export function ContactsPanel({ leadId, contacts }: { leadId: string; contacts: Contact[] }) {
  const [state, action, pending] = useActionState(addContact.bind(null, leadId), {});
  const [open, setOpen] = useState(false);
  return (
    <section className="card p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">People</h2>
        <button className="text-sm text-zinc-600 underline" onClick={() => setOpen((o) => !o)}>
          {open ? "Cancel" : "+ Add person"}
        </button>
      </div>
      {contacts.length === 0 && !open && <p className="mt-1 text-sm text-zinc-600">No one yet. Run Easy Apply, or add someone you found yourself.</p>}
      {contacts.length > 0 && (
        <ul className="divide-y divide-zinc-100">
          {contacts.map((c) => (
            <ContactRow key={c.id} c={c} leadId={leadId} />
          ))}
        </ul>
      )}
      {open && (
        <form action={action} className="mt-3 grid gap-2 rounded-lg bg-zinc-50 p-3 sm:grid-cols-3">
          <input name="name" required placeholder="Name" className="input" />
          <input name="title" placeholder="Title (e.g. CTO)" className="input" />
          <input name="email" type="email" required placeholder="Email" className="input" />
          <div className="flex items-center gap-3 sm:col-span-3">
            <button className="btn-primary" disabled={pending}>
              Add
            </button>
            {state.error && <span className="text-sm text-red-600">{state.error}</span>}
            {state.ok && <span className="text-sm text-emerald-700">Added</span>}
          </div>
        </form>
      )}
    </section>
  );
}

type Draft = {
  id: string;
  to: string;
  toName: string;
  subject: string;
  body: string;
  resumeId: string | null;
  inGmail: boolean;
  guessed: boolean;
};

export function DraftCard({
  d,
  resumes,
  gmailConnected,
}: {
  d: Draft;
  resumes: { id: string; label: string }[];
  gmailConnected: boolean;
}) {
  const [state, action, saving] = useActionState(saveDraft.bind(null, d.id), {});
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={action} className="card space-y-2 p-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">To {d.toName}</span>
        {d.inGmail && <span className="chip bg-sky-100 text-sky-800">In Gmail drafts</span>}
        {d.guessed && <span className="chip bg-amber-100 text-amber-800">Email is a guess — check it</span>}
      </div>
      <input name="to" defaultValue={d.to} className="input font-mono" aria-label="To" />
      <input name="subject" defaultValue={d.subject} className="input font-medium" aria-label="Subject" />
      <textarea name="body" defaultValue={d.body} rows={9} className="input text-sm leading-relaxed" aria-label="Body" />
      <div className="flex flex-wrap items-center gap-2">
        <select name="resumeId" defaultValue={d.resumeId ?? ""} className="input w-auto py-1.5 text-sm" aria-label="Resume">
          <option value="">No attachment</option>
          {resumes.map((r) => (
            <option key={r.id} value={r.id}>
              Attach: {r.label}
            </option>
          ))}
        </select>
        <button className="btn-ghost" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          className="btn-ghost"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await discardDraft(d.id);
              if (r.error) setError(r.error);
            })
          }
        >
          Discard
        </button>
        <div className="ml-auto flex items-center gap-2">
          {confirming ? (
            <>
              <span className="text-sm text-zinc-600">Send to {d.to}?</span>
              <button type="button" className="btn-ghost" onClick={() => setConfirming(false)}>
                No
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    setError(null);
                    // Save what's on screen first, so the edited version is what goes out.
                    const saved = await saveDraft(d.id, null, new FormData(formRef.current!));
                    const r = saved.error ? saved : await sendMessage(d.id);
                    if (r.error) setError(r.error);
                    setConfirming(false);
                  })
                }
              >
                {pending ? "Sending…" : "Yes, send"}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn-primary"
              disabled={!gmailConnected}
              title={gmailConnected ? "Sends exactly what's shown above" : "Connect Gmail on the Profile page"}
              onClick={() => setConfirming(true)}
            >
              Send
            </button>
          )}
        </div>
      </div>
      {state.ok && !saving && <p className="text-xs text-emerald-700">Saved{d.inGmail ? " (Gmail draft updated)" : ""}</p>}
      {(state.error || error) && <p className="text-sm text-red-600">{state.error ?? error}</p>}
    </form>
  );
}
