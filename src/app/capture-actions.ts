"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { CapturePayload, analyzePost, parseAgeHours, parseLikes, saveCapturedPost, type PostAnalysis } from "@/lib/capture";
import { llmJson } from "@/lib/llm";
import { getProfile } from "@/lib/profile";
import { claimRun, runEasyApply } from "@/pipeline/easy-apply";
import { realDeps } from "@/pipeline/deps";

export type Analysis = PostAnalysis & { ageHours: number | null; likes: number | null };

export async function analyzeCapture(raw: unknown): Promise<{ error?: string; analysis?: Analysis }> {
  const parsed = CapturePayload.safeParse(raw);
  if (!parsed.success) return { error: "The bookmarklet sent something unexpected — select the post text and try again." };
  const p = parsed.data;
  try {
    const a = await analyzePost(p, await getProfile(), llmJson);
    return { analysis: { ...a, ageHours: parseAgeHours(p.tt, p.pa), likes: parseLikes(p.l) } };
  } catch (err) {
    return { error: `Couldn't analyse the post: ${(err as Error).message.slice(0, 300)}` };
  }
}

const Save = z.object({
  payload: CapturePayload,
  company: z.string().trim().min(1, "Company is required"),
  website: z.string().trim().optional(),
  role: z.string().trim().optional(),
  posterName: z.string().trim().optional(),
  posterTitle: z.string().trim().optional(),
  fit: z.number().min(0).max(100),
  reason: z.string().optional(),
  run: z.boolean(),
});

export async function saveCapture(input: z.input<typeof Save>): Promise<{ error?: string; leadId?: string; created?: boolean }> {
  const parsed = Save.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues.map((i) => i.message).join(", ") };
  const v = parsed.data;
  const { leadId, created } = await saveCapturedPost({
    payload: v.payload,
    company: v.company,
    website: v.website || null,
    role: v.role || null,
    posterName: v.posterName || null,
    posterTitle: v.posterTitle || null,
    fit: v.fit,
    reason: v.reason || null,
  });
  if (v.run && (await claimRun(leadId))) {
    after(async () => {
      try {
        await runEasyApply(leadId, await realDeps());
      } catch (err) {
        console.error("easy-apply failed", leadId, err);
      }
    });
  }
  for (const p of ["/", "/pipeline", "/stats"]) revalidatePath(p);
  return { leadId, created };
}
