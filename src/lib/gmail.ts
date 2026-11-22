import { eq } from "drizzle-orm";
import { db, integrations } from "@/db";
import { decrypt, encrypt } from "./crypto";

/**
 * Gmail over plain REST. Scopes: compose (create drafts + send) and readonly
 * (read threads for reply detection in Phase 3). Nothing is sent without an
 * explicit Send click in the app.
 */
export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/gmail.readonly",
];

export function googleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function redirectUri(origin: string): string {
  return `${process.env.APP_URL?.replace(/\/$/, "") || origin}/api/google/callback`;
}

export function consentUrl(origin: string, state: string): string {
  const q = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(origin),
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent", // always return a refresh token
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

type TokenResponse = { access_token: string; expires_in: number; refresh_token?: string; scope?: string; id_token?: string };

async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      ...params,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const data = await res.json();
  if (!res.ok) throw new GmailError(`Google token error: ${data.error_description ?? data.error ?? res.status}`, res.status);
  return data;
}

function emailFromIdToken(idToken?: string): string | null {
  if (!idToken) return null;
  try {
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString("utf8"));
    return typeof payload.email === "string" ? payload.email : null;
  } catch {
    return null;
  }
}

export async function exchangeCode(code: string, origin: string): Promise<{ email: string | null }> {
  const t = await tokenRequest({ code, grant_type: "authorization_code", redirect_uri: redirectUri(origin) });
  if (!t.refresh_token) throw new GmailError("Google returned no refresh token — remove Radar's access at myaccount.google.com/permissions and connect again", 400);
  const email = emailFromIdToken(t.id_token);
  const row = { provider: "google", accountEmail: email, refreshTokenEnc: encrypt(t.refresh_token), scopes: t.scope ?? null };
  await db.insert(integrations).values(row).onConflictDoUpdate({ target: integrations.provider, set: row });
  cached = { token: t.access_token, expires: Date.now() + (t.expires_in - 60) * 1000 };
  return { email };
}

export async function gmailAccount(): Promise<{ email: string | null } | null> {
  const [row] = await db.select().from(integrations).where(eq(integrations.provider, "google"));
  return row ? { email: row.accountEmail } : null;
}

export async function disconnectGmail() {
  await db.delete(integrations).where(eq(integrations.provider, "google"));
  cached = null;
}

let cached: { token: string; expires: number } | null = null;

async function accessToken(): Promise<string> {
  if (cached && cached.expires > Date.now()) return cached.token;
  const [row] = await db.select().from(integrations).where(eq(integrations.provider, "google"));
  if (!row) throw new GmailError("Gmail is not connected — connect it on the Profile page", 400);
  try {
    const t = await tokenRequest({ refresh_token: decrypt(row.refreshTokenEnc), grant_type: "refresh_token" });
    cached = { token: t.access_token, expires: Date.now() + (t.expires_in - 60) * 1000 };
    return t.access_token;
  } catch (err) {
    if (err instanceof GmailError && err.status === 400) {
      throw new GmailError("Gmail access expired or was revoked — reconnect it on the Profile page", 401);
    }
    throw err;
  }
}

export class GmailError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function gmail<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    ...init,
    headers: { authorization: `Bearer ${await accessToken()}`, "content-type": "application/json", ...init.headers },
    signal: AbortSignal.timeout(30_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new GmailError(`Gmail ${res.status}: ${data?.error?.message ?? "request failed"}`, res.status);
  return data as T;
}

export type Attachment = { filename: string; contentType: string; data: Buffer };

/** RFC 2822 message, base64url-encoded as Gmail expects. Exported for tests. */
export type DraftInput = {
  to: string;
  subject: string;
  body: string;
  attachment?: Attachment | null;
  /** Reply inside an existing thread (follow-ups). */
  threadId?: string | null;
  inReplyTo?: string | null;
};

export function buildMime(opts: DraftInput): string {
  const encodeHeader = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s).toString("base64")}?=`);
  const headers = [`To: ${opts.to}`, `Subject: ${encodeHeader(opts.subject)}`, "MIME-Version: 1.0"];
  if (opts.inReplyTo) headers.push(`In-Reply-To: ${opts.inReplyTo}`, `References: ${opts.inReplyTo}`);
  const text = Buffer.from(opts.body.replace(/\r?\n/g, "\r\n")).toString("base64");
  let raw: string;
  if (!opts.attachment) {
    raw = [...headers, 'Content-Type: text/plain; charset="UTF-8"', "Content-Transfer-Encoding: base64", "", text].join("\r\n");
  } else {
    const boundary = `radar_${Math.random().toString(36).slice(2)}`;
    const wrap = (b64: string) => b64.replace(/.{1,76}/g, "$&\r\n").trimEnd();
    raw = [
      ...headers,
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
      "",
      wrap(text),
      `--${boundary}`,
      `Content-Type: ${opts.attachment.contentType}; name="${opts.attachment.filename}"`,
      `Content-Disposition: attachment; filename="${opts.attachment.filename}"`,
      "Content-Transfer-Encoding: base64",
      "",
      wrap(opts.attachment.data.toString("base64")),
      `--${boundary}--`,
      "",
    ].join("\r\n");
  }
  return Buffer.from(raw).toString("base64url");
}

const draftMessage = (opts: DraftInput) => ({ raw: buildMime(opts), ...(opts.threadId ? { threadId: opts.threadId } : {}) });

export async function createDraft(opts: DraftInput) {
  const d = await gmail<{ id: string; message: { id: string; threadId: string } }>("drafts", {
    method: "POST",
    body: JSON.stringify({ message: draftMessage(opts) }),
  });
  return { draftId: d.id, threadId: d.message.threadId };
}

export async function updateDraft(draftId: string, opts: DraftInput) {
  const d = await gmail<{ id: string; message: { threadId: string } }>(`drafts/${draftId}`, {
    method: "PUT",
    body: JSON.stringify({ id: draftId, message: draftMessage(opts) }),
  });
  return { draftId: d.id, threadId: d.message.threadId };
}

export async function sendDraft(draftId: string) {
  const m = await gmail<{ id: string; threadId: string }>("drafts/send", { method: "POST", body: JSON.stringify({ id: draftId }) });
  return { messageId: m.id, threadId: m.threadId };
}

export async function deleteDraft(draftId: string) {
  await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/drafts/${draftId}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${await accessToken()}` },
  });
}

export type ThreadMessage = {
  id: string;
  internalDate: number;
  labelIds: string[];
  snippet: string;
  from: string;
  subject: string;
  messageId: string | null;
};

/** Thread headers + snippets only (no bodies), enough to spot replies and thread follow-ups. */
export async function getThread(threadId: string): Promise<ThreadMessage[]> {
  const q = ["From", "Subject", "Message-ID"].map((h) => `metadataHeaders=${h}`).join("&");
  const t = await gmail<{
    messages?: Array<{ id: string; internalDate: string; labelIds?: string[]; snippet?: string; payload?: { headers?: Array<{ name: string; value: string }> } }>;
  }>(`threads/${threadId}?format=metadata&${q}`);
  return (t.messages ?? []).map((m) => {
    const h = (n: string) => m.payload?.headers?.find((x) => x.name.toLowerCase() === n.toLowerCase())?.value ?? "";
    return {
      id: m.id,
      internalDate: Number(m.internalDate),
      labelIds: m.labelIds ?? [],
      snippet: decodeEntities(m.snippet ?? ""),
      from: h("From"),
      subject: h("Subject"),
      messageId: h("Message-ID") || null,
    };
  });
}

function decodeEntities(s: string) {
  return s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}
