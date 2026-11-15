export function timeAgo(date: Date | string | null | undefined, now = new Date()): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  const s = Math.max(0, (now.getTime() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export { STATUS_LABEL } from "./statuses";

export const SOURCE_LABEL = { FUNDING: "Funding", POST: "Hiring post", MANUAL: "Manual" } as const;

export const SOURCE_STYLE = {
  FUNDING: "bg-violet-100 text-violet-800",
  POST: "bg-sky-100 text-sky-800",
  MANUAL: "bg-zinc-100 text-zinc-700",
} as const;

export function scoreStyle(score: number): string {
  if (score >= 75) return "bg-emerald-100 text-emerald-800";
  if (score >= 50) return "bg-amber-100 text-amber-800";
  return "bg-zinc-100 text-zinc-600";
}
