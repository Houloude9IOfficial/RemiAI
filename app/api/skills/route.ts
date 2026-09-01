import { NextResponse } from "next/server";
import { isDemoMode, demoBlockedResponse } from "@/lib/demo-policy";
import { listSkills } from "@/lib/skills/manager";

/** GET /api/skills — installed skills with config + update flags. */
export async function GET() {
  if (isDemoMode()) return NextResponse.json([]);
  const skills = await listSkills();
  return NextResponse.json(
    skills.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      repoId: s.repoId,
      repoSource: s.repoSource,
      repoName: s.repoName,
      enabled: s.enabled,
      updateAvailable: s.updateAvailable,
      installedAt: s.installedAt,
      updatedAt: s.updatedAt,
    })),
  );
}
