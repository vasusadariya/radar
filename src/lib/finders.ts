import { resolveMx } from "node:dns/promises";

/**
 * Email waterfall: free-tier finder APIs first (each only if its key is set),
 * then pattern guesses on a domain that accepts mail. Guesses are marked
 * unverified so the UI can say so before you send.
 */
export type FoundEmail = {
  email: string;
  /** The company domain the finder resolved (useful when we only had a name). */
  domain?: string;
  source: "HUNTER" | "APOLLO" | "PATTERN";
  verified: boolean;
  note?: string;
  alternatives?: string[];
};

/** domain may be null: Hunter and Apollo can both search by company name. */
export type Finder = (p: { first: string; last: string; domain: string | null; company: string }) => Promise<FoundEmail | null>;

export function splitName(full: string): { first: string; last: string } {
  const parts = full
    .replace(/\(.*?\)/g, " ")
    .replace(/\b(dr|mr|ms|mrs)\.?\s+/gi, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return { first: parts[0] ?? "", last: parts.length > 1 ? parts[parts.length - 1] : "" };
}

const ascii = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");

/** Most common startup formats first: founders at small companies are very often first@. */
export function patternGuesses(first: string, last: string, domain: string): string[] {
  const f = ascii(first);
  const l = ascii(last);
  if (!f) return [];
  const local = [f, l && `${f}.${l}`, l && `${f}${l}`, l && `${f[0]}${l}`, l && `${f}${l[0]}`, l && `${f}_${l}`].filter(
    Boolean,
  ) as string[];
  return [...new Set(local)].map((x) => `${x}@${domain}`);
}

export const hunter: Finder = async ({ first, last, domain, company }) => {
  const key = process.env.HUNTER_API_KEY;
  if (!key || !last) return null;
  const q = new URLSearchParams({ first_name: first, last_name: last, api_key: key });
  if (domain) q.set("domain", domain);
  else q.set("company", company);
  const res = await fetch(`https://api.hunter.io/v2/email-finder?${q}`, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) return null; // out of credits, unknown domain, etc. — fall through
  const d = (await res.json())?.data;
  if (!d?.email) return null;
  const status = d.verification?.status;
  return {
    email: String(d.email).toLowerCase(),
    domain: d.domain ? String(d.domain).toLowerCase() : undefined,
    source: "HUNTER",
    verified: status === "valid",
    note: `Hunter score ${d.score ?? "?"}${status ? `, ${status}` : ""}`,
  };
};

export const apollo: Finder = async ({ first, last, domain, company }) => {
  const key = process.env.APOLLO_API_KEY;
  if (!key) return null;
  const res = await fetch("https://api.apollo.io/api/v1/people/match", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "cache-control": "no-cache" },
    body: JSON.stringify({ first_name: first, last_name: last, ...(domain ? { domain } : {}), organization_name: company }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return null;
  const p = (await res.json())?.person;
  const email = p?.email && !String(p.email).startsWith("email_not_unlocked") ? String(p.email).toLowerCase() : null;
  if (!email) return null;
  return {
    email,
    domain: p.organization?.primary_domain ? String(p.organization.primary_domain).toLowerCase() : undefined,
    source: "APOLLO",
    verified: p.email_status === "verified",
    note: `Apollo ${p.email_status ?? ""}`.trim(),
  };
};

export async function domainAcceptsMail(domain: string): Promise<boolean> {
  try {
    const mx = await resolveMx(domain);
    return mx.length > 0;
  } catch {
    return false;
  }
}

export async function findEmail(
  person: { name: string },
  company: { name: string; domain: string | null },
  opts: { finders?: Finder[]; mxCheck?: (d: string) => Promise<boolean> } = {},
): Promise<FoundEmail | null> {
  const domain = company.domain;
  const { first, last } = splitName(person.name);
  if (!first) return null;
  for (const finder of opts.finders ?? [hunter, apollo]) {
    try {
      const hit = await finder({ first, last, domain, company: company.name });
      if (hit) return hit;
    } catch {
      // A finder failing must never stop the run.
    }
  }
  // Guessing needs a domain we trust.
  if (!domain || !(await (opts.mxCheck ?? domainAcceptsMail)(domain))) return null;
  const guesses = patternGuesses(first, last, domain);
  if (!guesses.length) return null;
  return {
    email: guesses[0],
    source: "PATTERN",
    verified: false,
    note: "Guessed from common formats — not verified",
    alternatives: guesses.slice(1, 4),
  };
}
