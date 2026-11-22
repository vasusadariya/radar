"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { runLead } from "@/app/outreach-actions";

/** Starts Easy Apply. On the lead page it also polls while the run is in progress. */
export function RunButton({
  leadId,
  runState,
  runStep,
  runError,
  compact = false,
}: {
  leadId: string;
  runState: string;
  runStep?: string | null;
  runError?: string | null;
  compact?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const running = runState === "running";

  useEffect(() => {
    if (!running || compact) return;
    const t = setInterval(() => router.refresh(), 2500);
    return () => clearInterval(t);
  }, [running, compact, router]);

  const click = () =>
    start(async () => {
      setError(null);
      const res = await runLead(leadId);
      if (res.error && res.error !== "Already running") setError(res.error);
      if (compact) router.push(`/leads/${leadId}`);
      else router.refresh();
    });

  if (compact) {
    return (
      <button
        type="button"
        onClick={click}
        disabled={pending || running}
        className="btn-primary px-2.5 py-1 text-xs"
        title="Research → find people → find emails → draft (never sends on its own)"
      >
        {running ? "Running…" : runState === "done" ? "Run again" : "Run"}
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" onClick={click} disabled={pending || running} className="btn-primary">
        {running ? "Running…" : runState === "done" ? "Run Easy Apply again" : "Run Easy Apply"}
      </button>
      {running && (
        <span className="flex items-center gap-2 text-sm text-zinc-600">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900" />
          {runStep ?? "Working…"}
        </span>
      )}
      {!running && runState === "done" && runStep && <span className="text-sm text-amber-700">{runStep}</span>}
      {!running && runState === "done" && !runStep && <span className="text-sm text-emerald-700">Done — review the drafts below.</span>}
      {!running && runState === "error" && <span className="text-sm text-red-600">Failed: {runError}</span>}
      {error && <span className="text-sm text-red-600">{error}</span>}
      {runState === "idle" && (
        <span className="text-xs text-zinc-500">Research → find up to 3 people → find emails → draft each email. Nothing is sent until you click Send.</span>
      )}
    </div>
  );
}
