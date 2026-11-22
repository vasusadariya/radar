/**
 * Funding-news RSS feeds. Global + India-focused. Override at runtime with
 * FUNDING_FEEDS="name|url,name|url". A feed that fails is logged and skipped.
 */
export type Feed = { name: string; url: string };

export const DEFAULT_FEEDS: Feed[] = [
  { name: "TechCrunch Venture", url: "https://techcrunch.com/category/venture/feed/" },
  // Finsmes is not included: it refuses automated feed readers (HTTP 403).
  { name: "Inc42", url: "https://inc42.com/feed/" },
  { name: "Entrackr", url: "https://entrackr.com/rss" },
  { name: "YourStory", url: "https://yourstory.com/feed" },
];

export function feedsFromEnv(): Feed[] {
  const raw = process.env.FUNDING_FEEDS?.trim();
  if (!raw) return DEFAULT_FEEDS;
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const [name, url] = entry.includes("|") ? entry.split("|") : [new URL(entry).hostname, entry];
      return { name: name.trim(), url: url.trim() };
    });
}

// Cheap title prefilter so the LLM only sees likely funding stories.
export const FUNDING_HINT =
  /\b(rais(e|es|ed|ing)|fund(ing|ed|s)?|seed|pre-?seed|series [a-e]|secures?|bags?|closes?|nets?|lands?|snags?|backed|round|investment|invests?|led by|rs\.?\s?\d|\d+\s?(mn|million|cr|crore|bn|billion))\b|[$₹€£]\s?\d/i;
