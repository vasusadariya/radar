/**
 * Final lead score = LLM role-fit (0–100) adjusted for stage and freshness.
 * Kept pure so it's easy to tune and test.
 */

export type Stage = "PRE_SEED" | "SEED" | "SERIES_A" | "SERIES_B_PLUS" | "PUBLIC" | "UNKNOWN";

export function normalizeStage(round: string | null | undefined): Stage {
  const r = (round ?? "").toLowerCase();
  if (!r) return "UNKNOWN";
  if (/pre[-\s]?seed|angel/.test(r)) return "PRE_SEED";
  if (/seed/.test(r)) return "SEED";
  if (/series\s*a\b/.test(r)) return "SERIES_A";
  if (/series\s*[b-z]\b|growth|late|pre[-\s]?ipo/.test(r)) return "SERIES_B_PLUS";
  if (/ipo|public/.test(r)) return "PUBLIC";
  return "UNKNOWN";
}

// Founders still hire themselves at pre-seed/seed, so those rank higher.
const STAGE_BONUS: Record<Stage, number> = {
  PRE_SEED: 10,
  SEED: 10,
  SERIES_A: 0,
  SERIES_B_PLUS: -15,
  PUBLIC: -25,
  UNKNOWN: 0,
};

export function scoreFundingLead(input: {
  fit: number;
  round: string | null | undefined;
  publishedAt: Date | null;
  wantedStages: string[];
  now?: Date;
}): { score: number; stage: Stage } {
  const stage = normalizeStage(input.round);
  let score = Math.max(0, Math.min(100, Math.round(input.fit)));
  score += STAGE_BONUS[stage];
  if (input.wantedStages.length > 0 && stage !== "UNKNOWN" && !input.wantedStages.includes(stage)) {
    score -= 20;
  }
  if (input.publishedAt) {
    const ageDays = ((input.now ?? new Date()).getTime() - input.publishedAt.getTime()) / 86_400_000;
    if (ageDays > 3) score -= 10;
    if (ageDays > 10) score -= 15;
  }
  return { score: Math.max(0, Math.min(100, score)), stage };
}

/** Dedupe key for a company name: "Acme, Inc." and "acme inc" collapse together. */
export function companyKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(inc|llc|ltd|limited|pvt|private|corp|corporation|co|technologies|technology|labs|ai)\b\.?/g, " ")
    .replace(/[^a-z0-9]+/g, "")
    .trim() || name.toLowerCase().replace(/\s+/g, "");
}

export function domainFrom(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}
