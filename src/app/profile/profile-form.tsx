"use client";

import { useActionState } from "react";
import { saveProfile } from "@/app/actions";
import type { Profile } from "@/db/schema";
import { EMPLOYMENT_OPTIONS, ROLE_OPTIONS, STAGE_OPTIONS } from "./options";

function Checks({
  name,
  options,
  selected,
}: {
  name: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  selected: string[];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <label
          key={o.value}
          className="flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm has-[:checked]:border-zinc-900 has-[:checked]:bg-zinc-900 has-[:checked]:text-white"
        >
          <input type="checkbox" name={name} value={o.value} defaultChecked={selected.includes(o.value)} className="sr-only" />
          {o.label}
        </label>
      ))}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="label">{label}</span>
      {children}
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

export function ProfileForm({ profile: p }: { profile: Profile }) {
  const [state, action, pending] = useActionState(saveProfile, {});
  const roles = ROLE_OPTIONS.map((r) => ({ value: r, label: r }));

  return (
    <form action={action} className="space-y-6">
      <section className="card space-y-4 p-5">
        <h2 className="font-semibold">What you&apos;re looking for</h2>
        <Field label="Roles in scope">
          <Checks name="targetRoles" options={roles} selected={p.targetRoles} />
        </Field>
        <Field label="Pitch this role when a post is ambiguous">
          <select name="primaryRole" defaultValue={p.primaryRole} className="input">
            <option value="">No preference</option>
            {ROLE_OPTIONS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </Field>
        <Field label="Open to">
          <Checks name="employmentTypes" options={EMPLOYMENT_OPTIONS} selected={p.employmentTypes} />
        </Field>
        <Field label="Which to lead with, by company type" hint='e.g. "Full-time for seed startups, 6-month internship for big tech"'>
          <input name="leadWith" defaultValue={p.leadWith} className="input" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Earliest start date">
            <input name="earliestStart" defaultValue={p.earliestStart} className="input" placeholder="January 2027" />
          </Field>
          <Field label="Locations / relocation">
            <input name="locations" defaultValue={p.locations} className="input" placeholder="Bengaluru, Pune, Surat" />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="remoteOk" defaultChecked={p.remoteOk} /> Open to remote
        </label>
        <Field label="Company stages" hint="Leads outside these stages get a lower score">
          <Checks name="stages" options={STAGE_OPTIONS} selected={p.stages} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Sectors to skip">
            <input name="skipSectors" defaultValue={p.skipSectors} className="input" placeholder="crypto, gambling" />
          </Field>
          <Field label="Compensation floor" hint="Only used to skip leads — never written into an email">
            <input name="compFloor" defaultValue={p.compFloor} className="input" placeholder="₹12 LPA / ₹40k per month" />
          </Field>
        </div>
      </section>

      <section className="card space-y-4 p-5">
        <h2 className="font-semibold">About you</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name">
            <input name="fullName" defaultValue={p.fullName} className="input" />
          </Field>
          <Field label="One-line headline">
            <input name="headline" defaultValue={p.headline} className="input" placeholder="Backend + AI engineer, final-year at NIT Surat" />
          </Field>
        </div>
        <Field label="Short bio">
          <textarea name="bio" defaultValue={p.bio} rows={3} className="input" />
        </Field>
        <Field label="Stack strengths to lead with">
          <input name="stackStrengths" defaultValue={p.stackStrengths} className="input" placeholder="TypeScript, NestJS, Postgres, LLM pipelines" />
        </Field>
        <Field label="Proof points" hint="One per line — shipped work with a number or link. The drafter picks the 1–2 that fit each company.">
          <textarea name="proofPoints" defaultValue={p.proofPoints} rows={5} className="input" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="GitHub">
            <input name="githubUrl" defaultValue={p.githubUrl} className="input" />
          </Field>
          <Field label="Portfolio">
            <input name="portfolioUrl" defaultValue={p.portfolioUrl} className="input" />
          </Field>
          <Field label="LinkedIn">
            <input name="linkedinUrl" defaultValue={p.linkedinUrl} className="input" />
          </Field>
        </div>
      </section>

      <section className="card space-y-4 p-5">
        <h2 className="font-semibold">Email voice</h2>
        <Field label="Tone rules" hint='e.g. "Under 5 lines. No flattery. One specific line about their product. Ask for 15 minutes."'>
          <textarea name="emailTone" defaultValue={p.emailTone} rows={3} className="input" />
        </Field>
        <Field label="2–3 of your best past emails" hint="The drafter imitates these. Separate with a line of ---">
          <textarea name="exampleEmails" defaultValue={p.exampleEmails} rows={8} className="input font-mono text-xs" />
        </Field>
      </section>

      <div className="sticky bottom-4 flex items-center justify-end gap-3">
        {state.ok && !pending && <span className="text-sm text-emerald-700">Saved</span>}
        {state.error && <span className="text-sm text-red-600">{state.error}</span>}
        <button className="btn-primary shadow-lg" disabled={pending}>
          {pending ? "Saving…" : "Save profile"}
        </button>
      </div>
    </form>
  );
}
