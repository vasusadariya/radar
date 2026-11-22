"use client";

import { useState, useTransition } from "react";
import { checkRepliesNow } from "@/app/outreach-actions";

export function CheckRepliesButton() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button className="btn-ghost" disabled={pending} onClick={() => start(async () => setMsg((await checkRepliesNow()).message))}>
        {pending ? "Checking Gmail…" : "Check replies now"}
      </button>
      {msg && <span className="text-sm text-zinc-600">{msg}</span>}
    </div>
  );
}
