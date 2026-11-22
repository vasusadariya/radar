"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { runLead } from "@/app/outreach-actions";

type Run = { runState: string; runStep?: string | null; runError?: string | null };

/**
 * Starts Easy Apply. While a run is in progress it polls a tiny status endpoint —
 * one request at a time, never overlapping — and refreshes the page only when the
 * step changes or the run finishes.
 */
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
  const [live, setLive] = useState<Run>({ runState, runStep, runError });
  const lastKey = useRef(`${runState}|${runStep ?? ""}`);

  // Server props win when they change (e.g. after a refresh).
  useEffect(() => {
    setLive({ runState, runStep, runError });
    lastKey.current = `${runState}|${runStep ?? ""}`;
  }, [runState, runStep, runError]);

  const running = live.runState === "running";

  useEffect(() => {
    if (!running || compact) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const res = await fetch(`/api/leads/${leadId}/status`, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
        if (res.ok) {
          const s = (await res.json()) as Run;
          if (stopped) return;
          setLive(s);
          const key = `${s.runState}|${s.runStep ?? ""}`;
          if (key !== lastKey.current) {
            lastKey.current = key;
            router.refresh(); // new step or finished: pull the new people/drafts
          }
          if (s.runState !== "running") return;
        }
      } catch {
        // transient network error: just try again
      }
      if (!stopped) timer = setTimeout(tick, 3000);
    };
    timer = setTimeout(tick, 2000);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [running, compact, leadId, router]);

  const click = () =>
    start(async () => {
      setError(null);
      const res = await runLead(leadId);
      if (res.error && res.error !== "Already running") setError(res.error);
      else setLive({ runState: "running", runStep: "Starting", runError: null });
      if (compact) router.push(`/leads/${leadId}`);
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
        {running ? "Running…" : live.runState === "done" ? "Run again" : "Run"}
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" onClick={click} disabled={pending || running} className="btn-primary">
        {running ? "Running…" : live.runState === "done" ? "Run Easy Apply again" : "Run Easy Apply"}
      </button>
      {running && (
        <span className="flex items-center gap-2 text-sm text-zinc-600">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900" />
          {live.runStep ?? "Working…"}
        </span>
      )}
      {!running && live.runState === "done" && live.runStep && <span className="text-sm text-amber-700">{live.runStep}</span>}
      {!running && live.runState === "done" && !live.runStep && (
        <span className="text-sm text-emerald-700">Done — review the drafts below.</span>
      )}
      {!running && live.runState === "error" && <span className="text-sm text-red-600">Failed: {live.runError}</span>}
      {error && <span className="text-sm text-red-600">{error}</span>}
      {live.runState === "idle" && (
        <span className="text-xs text-zinc-500">
          Research → find up to 3 people → find emails → draft each email. Nothing is sent until you click Send.
        </span>
      )}
    </div>
  );
}
