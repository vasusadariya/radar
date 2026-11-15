import { eq } from "drizzle-orm";
import { db, resumes } from "@/db";
import { RESUME_BUCKET, storage } from "@/lib/storage";

export const dynamic = "force-dynamic";

// Redirects to a short-lived signed URL for the private PDF (protected by the auth middleware).
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const s = storage();
  if (!s) return new Response("Storage not configured", { status: 503 });
  const [row] = await db.select().from(resumes).where(eq(resumes.id, id));
  if (!row) return new Response("Not found", { status: 404 });
  const { data, error } = await s.storage.from(RESUME_BUCKET).createSignedUrl(row.storagePath, 60);
  if (error || !data) return new Response(error?.message ?? "Could not sign URL", { status: 502 });
  return Response.redirect(data.signedUrl, 302);
}
