import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { skillRepos } from "@/db/schema";
import {
  listRepos,
  listSkills,
  resolveRepoSkills,
  isPreloadedSource,
  seedPreloadedRepos,
} from "@/lib/skills/manager";

/**
 * GET /api/skills/repos — list repos with skill counts + installed skills.
 * Lazily seeds the preloaded repos so the Repositories tab always has
 * something to browse, even if the boot-time seeding hasn't run yet.
 */
export async function GET() {
  await seedPreloadedRepos();
  const [repos, installed] = await Promise.all([listRepos(), listSkills()]);

  return NextResponse.json(
    repos.map((repo) => ({
      id: repo.id,
      source: repo.source,
      name: repo.name,
      isPreloaded: repo.isPreloaded,
      lastCheckedAt: repo.lastCheckedAt,
      createdAt: repo.createdAt,
      updatedAt: repo.updatedAt,
      skillCount: repo.skillCount,
      skills: installed
        .filter((s) => s.repoId === repo.id)
        .map((s) => ({
          id: s.id,
          name: s.name,
          description: s.description,
          enabled: s.enabled,
          updateAvailable: s.updateAvailable,
        })),
    })),
  );
}

const addRepoSchema = z.object({
  source: z.string().min(1).max(500),
});

/**
 * POST /api/skills/repos — resolve a repo source, list the skills it ships,
 * and persist the repo in `skill_repos` so it stays in the Repositories
 * list (skills are installed separately). Unknown repos return
 * `needsConfirmation` so the client can show the security dialog before
 * installing.
 */
export async function POST(req: Request) {
  const { source } = addRepoSchema.parse(await req.json());

  let resolved;
  try {
    resolved = await resolveRepoSkills(source);
  } catch (err) {
    return NextResponse.json(
      {
        error: `Could not resolve "${source}": ${
          err instanceof Error ? err.message : "unknown error"
        }`,
      },
      { status: 400 },
    );
  }

  const preloaded = isPreloadedSource(resolved.source);
  const now = new Date().toISOString();

  // Persist the repo row (idempotent) so user-added repos survive reloads.
  try {
    await db
      .insert(skillRepos)
      .values({
        source: resolved.source,
        name: resolved.displayName,
        isPreloaded: preloaded,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: skillRepos.source,
        set: { name: resolved.displayName, updatedAt: now },
      })
      .run();
  } catch (err) {
    // Listing still works even if persisting fails (e.g. schema not ready).
    console.warn("[skills] Failed to persist repo:", err);
  }

  return NextResponse.json({
    source: resolved.source,
    displayName: resolved.displayName,
    preloaded,
    needsConfirmation: !preloaded,
    skills: resolved.skills.map((s) => ({
      name: s.name,
      description: s.description,
    })),
  });
}
