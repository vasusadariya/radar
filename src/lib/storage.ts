import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const RESUME_BUCKET = "resumes";

let client: SupabaseClient | null = null;

/** Server-only Supabase client (service role) used for the private resumes bucket. */
export function storage(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  client ??= createClient(url, key, { auth: { persistSession: false } });
  return client;
}

export function storageConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/** Creates the private bucket on first use; no-op if it exists. */
export async function ensureResumeBucket(s: SupabaseClient) {
  const { data } = await s.storage.getBucket(RESUME_BUCKET);
  if (!data) {
    const { error } = await s.storage.createBucket(RESUME_BUCKET, {
      public: false,
      fileSizeLimit: "5MB",
      allowedMimeTypes: ["application/pdf"],
    });
    if (error && !/already exists/i.test(error.message)) throw error;
  }
}
