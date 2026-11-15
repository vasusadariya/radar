"use client";

import { useTransition } from "react";
import { setLeadStatus } from "@/app/actions";
import { LEAD_STATUSES, STATUS_LABEL, type LeadStatus } from "@/lib/statuses";

export function StatusSelect({ leadId, status }: { leadId: string; status: LeadStatus }) {
  const [pending, start] = useTransition();
  return (
    <select
      aria-label="Status"
      defaultValue={status}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value;
        start(() => setLeadStatus(leadId, next));
      }}
      className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-700 disabled:opacity-50"
    >
      {LEAD_STATUSES.map((s) => (
        <option key={s} value={s}>
          {STATUS_LABEL[s]}
        </option>
      ))}
    </select>
  );
}

export function DismissButton({ leadId }: { leadId: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="btn-ghost px-2 py-1 text-xs"
      disabled={pending}
      onClick={() => start(() => setLeadStatus(leadId, "DEAD"))}
    >
      Dismiss
    </button>
  );
}
