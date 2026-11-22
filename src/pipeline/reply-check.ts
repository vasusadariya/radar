import { gmailAccount } from "@/lib/gmail";
import { checkReplies, lastReplyCheck, type ReplyStats } from "./replies";
import { realReplyDeps } from "./deps";

const AUTO_INTERVAL_MS = 20 * 60_000;

/** Runs a reply check if Gmail is connected; `force` skips the 20-minute throttle. */
export async function runReplyCheck(force = false): Promise<ReplyStats | { skipped: string }> {
  if (!(await gmailAccount())) return { skipped: "gmail not connected" };
  if (!force) {
    const last = await lastReplyCheck();
    if (last && Date.now() - last.getTime() < AUTO_INTERVAL_MS) return { skipped: "checked recently" };
  }
  return checkReplies(await realReplyDeps());
}
