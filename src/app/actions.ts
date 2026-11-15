"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, companies, events, leads, profile, resumes, LEAD_STATUSES } from "@/db";
import { SESSION_COOKIE, safeEqual, sessionToken, tokenFor } from "@/lib/auth";
import { getProfile } from "@/lib/profile";
import { companyKey, domainFrom } from "@/lib/scoring";
import { RESUME_BUCKET, ensureResumeBucket, storage } from "@/lib/storage";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const list = (fd: FormData, k: string) => fd.getAll(k).map(String).filter(Boolean);

function revalidateLeads() {
  for (const p of ["/", "/pipeline", "/stats"]) revalidatePath(p);
}

// ---------- auth ----------

export async function login(_: unknown, fd: FormData): Promise<{ error?: string }> {
  const expected = await sessionToken();
  if (!expected) redirect("/");
  const got = await tokenFor(str(fd, "password"));
  if (!safeEqual(got, expected)) return { error: "Wrong password" };
  (await cookies()).set(SESSION_COOKIE, expected, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 60,
  });
  const next = str(fd, "next");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}

// ---------- leads ----------

const StatusSchema = z.enum(LEAD_STATUSES);

export async function setLeadStatus(leadId: string, status: string) {
  const next = StatusSchema.parse(status);
  const [current] = await db.select({ status: leads.status }).from(leads).where(eq(leads.id, leadId));
  if (!current || current.status === next) return;
  await db.transaction(async (tx) => {
    await tx.update(leads).set({ status: next }).where(eq(leads.id, leadId));
    await tx.insert(events).values({ leadId, type: "STATUS_CHANGED", meta: { from: current.status, to: next } });
  });
  revalidateLeads();
  revalidatePath(`/leads/${leadId}`);
}

export async function saveLeadNotes(leadId: string, fd: FormData) {
  await db.update(leads).set({ notes: str(fd, "notes") || null }).where(eq(leads.id, leadId));
  revalidatePath(`/leads/${leadId}`);
}

export async function deleteLead(leadId: string) {
  await db.delete(leads).where(eq(leads.id, leadId));
  revalidateLeads();
  redirect("/");
}

const NewLead = z.object({
  company: z.string().min(1, "Company is required"),
  website: z.string().optional(),
  source: z.enum(["MANUAL", "POST"]),
  title: z.string().optional(),
  roleGuess: z.string().optional(),
  postUrl: z.string().url().optional().or(z.literal("")),
  postAuthor: z.string().optional(),
  description: z.string().optional(),
  notes: z.string().optional(),
});

export async function createLead(_: unknown, fd: FormData): Promise<{ error?: string }> {
  const parsed = NewLead.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues.map((i) => i.message).join(", ") };
  const v = parsed.data;

  const leadId = await db.transaction(async (tx) => {
    const [company] = await tx
      .insert(companies)
      .values({
        name: v.company,
        nameKey: companyKey(v.company),
        domain: domainFrom(v.website),
        description: v.description || null,
      })
      .onConflictDoUpdate({ target: companies.nameKey, set: { updatedAt: new Date() } })
      .returning({ id: companies.id });
    const [lead] = await tx
      .insert(leads)
      .values({
        companyId: company.id,
        source: v.source,
        title: v.title || (v.roleGuess ? `${v.roleGuess} at ${v.company}` : v.company),
        roleGuess: v.roleGuess || null,
        postUrl: v.postUrl || null,
        postAuthor: v.postAuthor || null,
        notes: v.notes || null,
        score: 50,
      })
      .returning({ id: leads.id });
    await tx.insert(events).values({ leadId: lead.id, type: "CAPTURED", meta: { via: "manual" } });
    return lead.id;
  });

  revalidateLeads();
  redirect(`/leads/${leadId}`);
}

// ---------- profile ----------

export async function saveProfile(_: unknown, fd: FormData): Promise<{ ok?: boolean; error?: string }> {
  await getProfile(); // ensure the row exists
  await db
    .update(profile)
    .set({
      fullName: str(fd, "fullName"),
      headline: str(fd, "headline"),
      bio: str(fd, "bio"),
      proofPoints: str(fd, "proofPoints"),
      targetRoles: list(fd, "targetRoles"),
      primaryRole: str(fd, "primaryRole"),
      employmentTypes: list(fd, "employmentTypes"),
      leadWith: str(fd, "leadWith"),
      earliestStart: str(fd, "earliestStart"),
      locations: str(fd, "locations"),
      remoteOk: fd.get("remoteOk") === "on",
      stages: list(fd, "stages"),
      skipSectors: str(fd, "skipSectors"),
      stackStrengths: str(fd, "stackStrengths"),
      compFloor: str(fd, "compFloor"),
      githubUrl: str(fd, "githubUrl"),
      portfolioUrl: str(fd, "portfolioUrl"),
      linkedinUrl: str(fd, "linkedinUrl"),
      emailTone: str(fd, "emailTone"),
      exampleEmails: str(fd, "exampleEmails"),
    })
    .where(eq(profile.id, "me"));
  revalidatePath("/profile");
  return { ok: true };
}

// ---------- resumes ----------

const MAX_RESUME_BYTES = 5 * 1024 * 1024;

export async function uploadResume(_: unknown, fd: FormData): Promise<{ ok?: boolean; error?: string }> {
  const s = storage();
  if (!s) return { error: "Storage not configured — set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY." };
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a PDF to upload." };
  if (file.type !== "application/pdf") return { error: "Resume must be a PDF." };
  if (file.size > MAX_RESUME_BYTES) return { error: "PDF must be under 5 MB." };

  const label = str(fd, "label") || file.name.replace(/\.pdf$/i, "");
  const targetRoles = list(fd, "targetRoles");
  const safeName = file.name.replace(/[^\w.-]+/g, "_");
  const storagePath = `${crypto.randomUUID()}/${safeName}`;

  try {
    await ensureResumeBucket(s);
    const { error } = await s.storage
      .from(RESUME_BUCKET)
      .upload(storagePath, Buffer.from(await file.arrayBuffer()), { contentType: "application/pdf" });
    if (error) return { error: `Upload failed: ${error.message}` };
  } catch (err) {
    return { error: `Upload failed: ${(err as Error).message}` };
  }

  const existing = await db.select({ id: resumes.id }).from(resumes).limit(1);
  const makeDefault = fd.get("isDefault") === "on" || existing.length === 0;
  await db.transaction(async (tx) => {
    if (makeDefault) await tx.update(resumes).set({ isDefault: false });
    await tx.insert(resumes).values({ label, storagePath, fileName: file.name, targetRoles, isDefault: makeDefault });
  });
  revalidatePath("/profile");
  return { ok: true };
}

export async function setDefaultResume(id: string) {
  await db.transaction(async (tx) => {
    await tx.update(resumes).set({ isDefault: false });
    await tx.update(resumes).set({ isDefault: true }).where(eq(resumes.id, id));
  });
  revalidatePath("/profile");
}

export async function deleteResume(id: string) {
  const [row] = await db.delete(resumes).where(eq(resumes.id, id)).returning();
  if (row) await storage()?.storage.from(RESUME_BUCKET).remove([row.storagePath]);
  // Keep exactly one default if any resumes remain.
  if (row?.isDefault) {
    const [first] = await db.select({ id: resumes.id }).from(resumes).limit(1);
    if (first) await db.update(resumes).set({ isDefault: true }).where(eq(resumes.id, first.id));
  }
  revalidatePath("/profile");
}
