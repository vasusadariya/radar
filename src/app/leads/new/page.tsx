"use client";

import { useActionState } from "react";
import { createLead } from "@/app/actions";

export default function NewLeadPage() {
  const [state, action, pending] = useActionState(createLead, {});
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Add a lead</h1>
        <p className="text-sm text-zinc-500">
          For anything you found yourself — a hiring post, a referral, a company you want to target.
        </p>
      </div>
      <form action={action} className="card space-y-4 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="company">Company *</label>
            <input id="company" name="company" required className="input" />
          </div>
          <div>
            <label className="label" htmlFor="website">Website</label>
            <input id="website" name="website" className="input" placeholder="acme.ai" />
          </div>
          <div>
            <label className="label" htmlFor="source">Type</label>
            <select id="source" name="source" className="input" defaultValue="POST">
              <option value="POST">Hiring post (LinkedIn / X)</option>
              <option value="MANUAL">Other</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="roleGuess">Role</label>
            <input id="roleGuess" name="roleGuess" className="input" placeholder="Backend Engineer Intern" />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="postUrl">Post or job URL</label>
            <input id="postUrl" name="postUrl" type="url" className="input" placeholder="https://www.linkedin.com/posts/…" />
          </div>
          <div>
            <label className="label" htmlFor="postAuthor">Posted by</label>
            <input id="postAuthor" name="postAuthor" className="input" placeholder="Name, title" />
          </div>
          <div>
            <label className="label" htmlFor="title">Headline (optional)</label>
            <input id="title" name="title" className="input" placeholder="Defaults to role at company" />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="description">What they do</label>
            <input id="description" name="description" className="input" />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="notes">Notes</label>
            <textarea id="notes" name="notes" rows={3} className="input" />
          </div>
        </div>
        {state.error && <p className="text-sm text-red-600">{state.error}</p>}
        <div className="flex justify-end">
          <button className="btn-primary" disabled={pending}>
            {pending ? "Saving…" : "Add lead"}
          </button>
        </div>
      </form>
    </div>
  );
}
