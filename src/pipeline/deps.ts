import type { Resume } from "@/db";
import { findEmail } from "@/lib/finders";
import { createDraft, gmailAccount } from "@/lib/gmail";
import { llmJson } from "@/lib/llm";
import { getProfile } from "@/lib/profile";
import { RESUME_BUCKET, storage } from "@/lib/storage";
import { fetchPage } from "@/lib/web";
import type { Deps } from "./easy-apply";

export async function loadResume(r: Resume): Promise<Buffer | null> {
  const s = storage();
  if (!s) return null;
  const { data } = await s.storage.from(RESUME_BUCKET).download(r.storagePath);
  return data ? Buffer.from(await data.arrayBuffer()) : null;
}

export async function realDeps(): Promise<Deps> {
  return {
    llm: llmJson,
    fetchPage: (url) => fetchPage(url),
    findEmail: (person, company) => findEmail(person, company),
    profile: await getProfile(),
    gmail: (await gmailAccount()) ? { createDraft } : null,
    loadResume,
  };
}

export async function realReplyDeps() {
  const { getThread, createDraft, deleteDraft } = await import("@/lib/gmail");
  return { getThread, createDraft, deleteDraft, llm: llmJson, profile: await getProfile() };
}
