"use client";

import { useActionState, useEffect, useRef, useTransition } from "react";
import { deleteResume, setDefaultResume, uploadResume } from "@/app/actions";
import type { Resume } from "@/db/schema";
import { ROLE_OPTIONS } from "./options";

export function ResumeManager({ resumes, storageReady }: { resumes: Resume[]; storageReady: boolean }) {
  const [state, action, pending] = useActionState(uploadResume, {});
  const [busy, start] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  return (
    <section className="card space-y-4 p-5">
      <div>
        <h2 className="font-semibold">Resumes</h2>
        <p className="text-sm text-zinc-500">
          Upload a variant per role. Easy Apply attaches the one whose roles match the lead, falling back to the default.
        </p>
      </div>

      {!storageReady && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Set <code>SUPABASE_URL</code> and <code>SUPABASE_SERVICE_ROLE_KEY</code> to enable uploads.
        </p>
      )}

      {resumes.length > 0 && (
        <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200">
          {resumes.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
              <a href={`/api/resumes/${r.id}`} target="_blank" rel="noreferrer" className="font-medium hover:underline">
                {r.label}
              </a>
              {r.isDefault && <span className="chip bg-emerald-100 text-emerald-800">Default</span>}
              {r.targetRoles.map((role) => (
                <span key={role} className="chip bg-zinc-100 text-zinc-700">
                  {role}
                </span>
              ))}
              <span className="text-xs text-zinc-500">{r.fileName}</span>
              <div className="ml-auto flex gap-2">
                {!r.isDefault && (
                  <button className="btn-ghost px-2 py-1 text-xs" disabled={busy} onClick={() => start(() => setDefaultResume(r.id))}>
                    Make default
                  </button>
                )}
                <button
                  className="btn-danger px-2 py-1 text-xs"
                  disabled={busy}
                  onClick={() => {
                    if (confirm(`Delete "${r.label}"?`)) start(() => deleteResume(r.id));
                  }}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form ref={formRef} action={action} className="space-y-3 rounded-lg bg-zinc-50 p-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="file">PDF (max 5 MB)</label>
            <input id="file" name="file" type="file" accept="application/pdf" required disabled={!storageReady} className="input py-1.5" />
          </div>
          <div>
            <label className="label" htmlFor="label">Label</label>
            <input id="label" name="label" className="input" placeholder="Backend v3" disabled={!storageReady} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-zinc-600">For roles:</span>
          {ROLE_OPTIONS.map((r) => (
            <label key={r} className="flex items-center gap-1.5">
              <input type="checkbox" name="targetRoles" value={r} disabled={!storageReady} /> {r}
            </label>
          ))}
          <label className="flex items-center gap-1.5">
            <input type="checkbox" name="isDefault" disabled={!storageReady} /> Make default
          </label>
        </div>
        <div className="flex items-center justify-end gap-3">
          {state.error && <span className="text-sm text-red-600">{state.error}</span>}
          {state.ok && !pending && <span className="text-sm text-emerald-700">Uploaded</span>}
          <button className="btn-primary" disabled={pending || !storageReady}>
            {pending ? "Uploading…" : "Upload resume"}
          </button>
        </div>
      </form>
    </section>
  );
}
