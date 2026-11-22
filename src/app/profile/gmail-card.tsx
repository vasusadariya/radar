import { disconnectGmailAction } from "@/app/outreach-actions";

const MESSAGES: Record<string, { text: string; ok: boolean }> = {
  connected: { text: "Gmail connected.", ok: true },
  denied: { text: "You declined access on Google's screen.", ok: false },
  bad_state: { text: "That sign-in link expired. Try again.", ok: false },
  error: { text: "Google returned an error.", ok: false },
};

export function GmailCard({
  account,
  configured,
  status,
  detail,
}: {
  account: { email: string | null } | null;
  configured: boolean;
  status?: string;
  detail?: string;
}) {
  const msg = status ? MESSAGES[status] : null;
  return (
    <section className="card space-y-3 p-5">
      <div>
        <h2 className="font-semibold">Gmail</h2>
        <p className="text-sm text-zinc-500">
          Easy Apply puts each email in your Gmail drafts with the resume attached. Sending only happens when you click
          Send, capped at 15 a day to protect your inbox reputation.
        </p>
      </div>
      {msg && (
        <p className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>
          {msg.text}
          {detail ? ` ${detail}` : ""}
        </p>
      )}
      {!configured ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Set <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> to enable this (see README).
        </p>
      ) : account ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="chip bg-emerald-100 text-emerald-800">Connected</span>
          <span className="text-sm">{account.email ?? "your Google account"}</span>
          <form action={disconnectGmailAction} className="ml-auto">
            <button className="btn-ghost">Disconnect</button>
          </form>
        </div>
      ) : (
        <a href="/api/google/connect" className="btn-primary">
          Connect Gmail
        </a>
      )}
    </section>
  );
}
