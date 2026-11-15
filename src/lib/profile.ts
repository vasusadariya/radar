import { eq } from "drizzle-orm";
import { db, profile, type Profile } from "@/db";

export async function getProfile(): Promise<Profile> {
  const [row] = await db.select().from(profile).where(eq(profile.id, "me"));
  if (row) return row;
  const [created] = await db.insert(profile).values({ id: "me" }).onConflictDoNothing().returning();
  return created ?? (await db.select().from(profile).where(eq(profile.id, "me")))[0];
}

/** Compact text the LLM reads to judge fit. Never includes the comp floor. */
export function profileForPrompt(p: Profile): string {
  const lines = [
    p.fullName && `Name: ${p.fullName}`,
    p.headline && `Headline: ${p.headline}`,
    p.targetRoles.length && `Target roles: ${p.targetRoles.join(", ")}${p.primaryRole ? ` (primary: ${p.primaryRole})` : ""}`,
    p.employmentTypes.length && `Looking for: ${p.employmentTypes.map(labelEmployment).join(" and ")}`,
    p.leadWith && `Pitching preference: ${p.leadWith}`,
    p.earliestStart && `Earliest start: ${p.earliestStart}`,
    (p.locations || p.remoteOk) && `Locations: ${p.locations || "any"}${p.remoteOk ? " (remote OK)" : ""}`,
    p.stages.length && `Preferred company stages: ${p.stages.join(", ")}`,
    p.skipSectors && `Sectors to skip: ${p.skipSectors}`,
    p.stackStrengths && `Stack strengths: ${p.stackStrengths}`,
    p.bio && `Bio: ${p.bio}`,
  ].filter(Boolean);
  return lines.length
    ? lines.join("\n")
    : "Profile not filled in yet. Assume a final-year engineering student seeking backend / AI / full-stack SDE roles (6-month internship or full-time).";
}

export function labelEmployment(t: string): string {
  return t === "INTERNSHIP_6M" ? "6-month internship" : t === "FULL_TIME" ? "full-time" : t;
}
