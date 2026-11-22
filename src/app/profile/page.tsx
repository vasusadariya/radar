import { desc } from "drizzle-orm";
import { db, resumes } from "@/db";
import { getProfile } from "@/lib/profile";
import { storageConfigured } from "@/lib/storage";
import { gmailAccount, googleConfigured } from "@/lib/gmail";
import { GmailCard } from "./gmail-card";
import { ProfileForm } from "./profile-form";
import { ResumeManager } from "./resume-manager";

export const dynamic = "force-dynamic";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ gmail?: string; detail?: string }>;
}) {
  const sp = await searchParams;
  const [profile, resumeRows, gmail] = await Promise.all([
    getProfile(),
    db.select().from(resumes).orderBy(desc(resumes.isDefault), desc(resumes.createdAt)),
    gmailAccount(),
  ]);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
        <p className="text-sm text-zinc-500">
          The scorer reads this on every lead, and the email drafter will too. Changing an answer re-tunes what Radar
          surfaces — no code changes.
        </p>
      </div>
      <GmailCard account={gmail} configured={googleConfigured()} status={sp.gmail} detail={sp.detail} />
      <ResumeManager resumes={resumeRows} storageReady={storageConfigured()} />
      <ProfileForm profile={profile} />
    </div>
  );
}
