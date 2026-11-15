import { desc } from "drizzle-orm";
import { db, resumes } from "@/db";
import { getProfile } from "@/lib/profile";
import { storageConfigured } from "@/lib/storage";
import { ProfileForm } from "./profile-form";
import { ResumeManager } from "./resume-manager";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const [profile, resumeRows] = await Promise.all([
    getProfile(),
    db.select().from(resumes).orderBy(desc(resumes.isDefault), desc(resumes.createdAt)),
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
      <ResumeManager resumes={resumeRows} storageReady={storageConfigured()} />
      <ProfileForm profile={profile} />
    </div>
  );
}
