import { NextResponse } from "next/server";
import { z } from "zod";
import {
  applyRepoUpdates,
  checkRepoForUpdates,
  removeRepo,
} from "@/lib/skills/manager";
import { demoBlockedResponse, isDemoMode } from "@/lib/demo-policy";

const paramsSchema = z.object({ id: z.coerce.number().int().positive() });

/** DELETE /api/skills/repos/:id — remove repo + cascade its skills. */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (isDemoMode()) return demoBlockedResponse();
  const { id } = paramsSchema.parse(await params);
  const removed = await removeRepo(id);
  return NextResponse.json({ ok: true, removedSkills: removed });
}

/** POST /api/skills/repos/:id — check + apply updates. */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (isDemoMode()) return demoBlockedResponse();
  const { id } = paramsSchema.parse(await params);

  let applied: number;
  try {
    // Re-check and apply in one step: check marks what changed, apply
    // re-installs. For the manual Update action both run back to back.
    await checkRepoForUpdates(id);
    applied = await applyRepoUpdates(id);
  } catch (err) {
    return NextResponse.json(
      {
        error: `Update failed: ${
          err instanceof Error ? err.message : "unknown error"
        }`,
      },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true, updated: applied });
}
