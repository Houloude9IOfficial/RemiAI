import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { z } from "zod";
import { SKILLS_DIR } from "@/lib/paths";
import {
  findSkill,
  listSkills,
  removeSkill,
  setSkillEnabled,
} from "@/lib/skills/manager";
import { listSkillFiles } from "@/lib/skills/github";
import { demoBlockedResponse, isDemoMode } from "@/lib/demo-policy";

// Ids must be numeric — anything else (e.g. a deleted route path that falls
// through to [id]) is a clean 404, never a 500.
const paramsSchema = z.object({
  id: z.string().regex(/^\d+$/, "Invalid skill id"),
});

async function parseId(params: { id: string }): Promise<number | null> {
  const parsed = paramsSchema.safeParse(params);
  return parsed.success ? Number(parsed.data.id) : null;
}

/** GET /api/skills/:id — full details incl. SKILL.md content (for View). */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (isDemoMode()) return demoBlockedResponse();
  const id = await parseId(await params);
  if (id === null) {
    return NextResponse.json({ error: "Skill not found" }, { status: 404 });
  }
  const row = await findSkill(String(id));
  if (!row) {
    return NextResponse.json({ error: "Skill not found" }, { status: 404 });
  }

  let content = "";
  let supportingFiles: string[] = [];
  const skillDir = path.resolve(SKILLS_DIR, row.diskPath);
  try {
    content = await fs.readFile(path.join(skillDir, "SKILL.md"), "utf8");
    supportingFiles = (await listSkillFiles(skillDir)).filter(
      (f) => f !== "SKILL.md",
    );
  } catch {
    // Files missing on disk — surface as-is.
  }

  return NextResponse.json({
    id: row.id,
    name: row.name,
    description: row.description,
    repoId: row.repoId,
    repoSource: row.repoSource,
    repoName: row.repoName,
    enabled: row.enabled,
    updateAvailable: row.updateAvailable,
    diskPath: row.diskPath,
    content,
    supportingFiles,
  });
}

const patchSchema = z.object({ enabled: z.boolean() });

/** PATCH /api/skills/:id — toggle enabled. */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (isDemoMode()) return demoBlockedResponse();
  const id = await parseId(await params);
  if (id === null) {
    return NextResponse.json({ error: "Skill not found" }, { status: 404 });
  }
  const body = patchSchema.parse(await req.json());

  const all = await listSkills();
  if (!all.some((s) => s.id === id)) {
    return NextResponse.json({ error: "Skill not found" }, { status: 404 });
  }

  await setSkillEnabled(id, body.enabled);
  return NextResponse.json({ ok: true, enabled: body.enabled });
}

/** DELETE /api/skills/:id — remove skill (disable + delete folder, repo stays). */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (isDemoMode()) return demoBlockedResponse();
  const id = await parseId(await params);
  if (id === null) {
    return NextResponse.json({ error: "Skill not found" }, { status: 404 });
  }
  await removeSkill(id);
  return NextResponse.json({ ok: true });
}
