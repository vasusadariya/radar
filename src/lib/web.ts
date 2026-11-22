/**
 * Polite single-page fetches for research: one request per page, short timeout,
 * size cap, honest user agent. Returns readable text plus links worth following.
 */
const UA = "RadarResearch/0.2 (personal job-search assistant; one-off page reads)";
const MAX_BYTES = 1_500_000;

export type PageText = { url: string; title: string; text: string; links: string[]; emails: string[] };

export function htmlToText(html: string): { title: string; text: string } {
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").replace(/\s+/g, " ").trim();
  const text = html
    .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
  return { title, text };
}

export async function fetchPage(url: string, maxChars = 6000): Promise<PageText | null> {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml" },
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html")) return null;
    const buf = await res.arrayBuffer();
    const html = new TextDecoder().decode(buf.byteLength > MAX_BYTES ? buf.slice(0, MAX_BYTES) : buf);
    const { title, text } = htmlToText(html);
    const base = new URL(res.url || url);
    const links = [...html.matchAll(/href=["']([^"'#]+)["']/gi)]
      .map((m) => {
        try {
          return new URL(m[1], base).toString();
        } catch {
          return null;
        }
      })
      .filter((u): u is string => Boolean(u));
    const emails = [
      ...new Set(
        [...html.matchAll(/mailto:([^"'?\s]+@[^"'?\s]+)/gi)].map((m) => decodeURIComponent(m[1]).toLowerCase()),
      ),
    ];
    return { url: res.url || url, title, text: text.slice(0, maxChars), links, emails };
  } catch {
    return null;
  }
}

/** Same-site pages likely to name the team. */
export function pickTeamPages(page: PageText, max = 2): string[] {
  const host = new URL(page.url).hostname;
  const scored = [...new Set(page.links)]
    .filter((u) => {
      try {
        return new URL(u).hostname === host;
      } catch {
        return false;
      }
    })
    .map((u) => ({ u, s: /\/(team|about|about-us|company|people|founders|leadership)\/?$/i.test(new URL(u).pathname) ? 2 : /careers|jobs/i.test(u) ? 1 : 0 }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s);
  return scored.slice(0, max).map((x) => x.u);
}
