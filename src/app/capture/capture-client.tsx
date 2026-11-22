"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { analyzeCapture, saveCapture, type Analysis } from "@/app/capture-actions";
import { bookmarkletSource } from "@/lib/bookmarklet";
import type { CapturePayload } from "@/lib/capture";

function readHash(): CapturePayload | null {
  if (typeof window === "undefined" || window.location.hash.length < 2) return null;
  try {
    return JSON.parse(decodeURIComponent(window.location.hash.slice(1)));
  } catch {
    return null;
  }
}

function ageLabel(h: number | null) {
  if (h === null) return "age unknown";
  if (h < 1) return "just now";
  if (h < 48) return `${h}h old`;
  return `${Math.round(h / 24)}d old`;
}

export function CaptureClient() {
  const [payload, setPayload] = useState<CapturePayload | null>(null);
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    const read = () => {
      setPayload(readHash());
      setChecked(true);
    };
    read();
    // Clicking the button again while this tab is open only changes the hash.
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  if (!checked) return null;
  return payload ? <Review key={payload.u + payload.t.length} payload={payload} /> : <Install />;
}

function Install() {
  const linkRef = useRef<HTMLAnchorElement>(null);
  // React refuses javascript: hrefs in JSX, so the bookmarklet is set on the DOM node directly.
  useEffect(() => {
    if (linkRef.current) linkRef.current.setAttribute("href", bookmarkletSource(window.location.origin));
  }, []);
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Capture hiring posts</h1>
        <p className="text-sm text-zinc-500">
          One click on a LinkedIn or X post saves it as a lead. Radar never logs in to or scrapes those sites; the button only
          reads the post you&apos;re looking at.
        </p>
      </div>
      <section className="card space-y-4 p-5">
        <h2 className="font-semibold">1. Install the button (once)</h2>
        <p className="text-sm text-zinc-600">
          Show your bookmarks bar (Ctrl/⌘ + Shift + B), then drag this button onto it:
        </p>
        <a
          ref={linkRef}
          onClick={(e) => e.preventDefault()}
          className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white"
          title="Drag me to your bookmarks bar"
        >
          ● Save to Radar
        </a>
      </section>
      <section className="card space-y-2 p-5">
        <h2 className="font-semibold">2. Use it</h2>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-zinc-700">
          <li>On LinkedIn, search &quot;hiring&quot; + your role, sorted by <b>Latest</b>. On X, search the same and pick <b>Latest</b>.</li>
          <li>Find a post under a day old with under 100 likes — that&apos;s the window to be early.</li>
          <li>Select a bit of the post&apos;s text (or open the post itself), then click <b>Save to Radar</b>.</li>
          <li>A Radar tab opens: check what the AI read, then <b>Save &amp; Run</b> to research the company and draft an email to the poster.</li>
        </ol>
        <p className="text-xs text-zinc-500">
          Per the playbook: don&apos;t DM and don&apos;t fill the form. Easy Apply emails the poster directly in under 5 lines.
        </p>
      </section>
    </div>
  );
}

function Review({ payload }: { payload: CapturePayload }) {
  const router = useRouter();
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, start] = useTransition();
  const [form, setForm] = useState({ company: "", website: "", role: "", posterName: "", posterTitle: "" });

  useEffect(() => {
    let cancelled = false;
    analyzeCapture(payload).then((r) => {
      if (cancelled) return;
      if (r.error || !r.analysis) return setError(r.error ?? "Analysis failed");
      const a = r.analysis;
      setAnalysis(a);
      setForm({
        company: a.company ?? "",
        website: a.companyWebsite ?? "",
        role: a.role ?? "",
        posterName: a.posterName || payload.a || "",
        posterTitle: a.posterTitle || payload.at || "",
      });
    });
    return () => {
      cancelled = true;
    };
  }, [payload]);

  const save = (run: boolean) =>
    start(async () => {
      setError(null);
      const r = await saveCapture({
        payload,
        ...form,
        fit: Math.max(0, Math.min(100, analysis?.fit ?? 50)),
        reason: analysis?.reason ?? undefined,
        run,
      });
      if (r.error || !r.leadId) return setError(r.error ?? "Save failed");
      history.replaceState(null, "", "/capture"); // don't re-save on refresh
      router.push(`/leads/${r.leadId}`);
    });

  const fresh = analysis?.ageHours !== null && analysis?.ageHours !== undefined && analysis.ageHours <= 24;
  const quiet = analysis?.likes !== null && analysis?.likes !== undefined && analysis.likes < 100;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Save hiring post</h1>
        <a href={payload.u} target="_blank" rel="noreferrer" className="text-sm text-zinc-500 underline">
          {payload.s === "linkedin" ? "LinkedIn" : payload.s === "x" ? "X" : "Source"} post ↗
        </a>
      </div>

      <blockquote className="card max-h-48 overflow-auto whitespace-pre-line p-4 text-sm text-zinc-700">{payload.t}</blockquote>

      {!analysis && !error && (
        <p className="flex items-center gap-2 text-sm text-zinc-600">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900" /> Reading the post…
        </p>
      )}

      {analysis && (
        <section className="card space-y-4 p-5">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {analysis.isHiring ? (
              <span className="chip bg-emerald-100 text-emerald-800">Hiring post</span>
            ) : (
              <span className="chip bg-amber-100 text-amber-800">Doesn&apos;t look like a hiring post</span>
            )}
            <span className={`chip ${fresh ? "bg-emerald-100 text-emerald-800" : "bg-zinc-100 text-zinc-700"}`}>
              {ageLabel(analysis.ageHours)}
            </span>
            <span className={`chip ${quiet ? "bg-emerald-100 text-emerald-800" : "bg-zinc-100 text-zinc-700"}`}>
              {analysis.likes === null ? "likes unknown" : `${analysis.likes} likes`}
            </span>
            <span className="chip bg-zinc-100 text-zinc-700">fit {analysis.fit ?? "?"}</span>
            {analysis.posterWorksThere === false && (
              <span className="chip bg-amber-100 text-amber-800">Poster may be a recruiter/reposter</span>
            )}
          </div>
          {analysis.reason && <p className="text-sm italic text-zinc-500">{analysis.reason}</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                ["company", "Company *"],
                ["website", "Website"],
                ["role", "Role"],
                ["posterName", "Posted by"],
                ["posterTitle", "Poster's title"],
              ] as const
            ).map(([k, label]) => (
              <label key={k} className={k === "role" ? "sm:col-span-2" : ""}>
                <span className="label">{label}</span>
                <input className="input" value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
              </label>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-primary" disabled={saving || !form.company} onClick={() => save(true)}>
              {saving ? "Saving…" : "Save & Run Easy Apply"}
            </button>
            <button className="btn-ghost" disabled={saving || !form.company} onClick={() => save(false)}>
              Save only
            </button>
            <Link href="/" className="ml-auto text-sm text-zinc-500 underline">
              Skip
            </Link>
          </div>
        </section>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
