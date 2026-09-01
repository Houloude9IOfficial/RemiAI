import { NextResponse } from "next/server";
import { z } from "zod";
import {
  installSkill,
  isPreloadedSource,
  resolveRepoSkills,
} from "@/lib/skills/manager";
import { demoBlockedResponse, isDemoMode } from "@/lib/demo-policy";

const installSchema = z.object({
  /** `owner/repo`, full URL, or `owner/repo@skill`. */
  source: z.string().min(1).max(500),
  /** Optional explicit skill name (one-click install of a single skill). */
  skill: z.string().min(1).max(200).optional(),
  /** Set when the user accepted the unknown-repo security confirmation. */
  confirmed: z.boolean().optional().default(false),
});

/**
 * POST /api/skills/install — one-click install + enable.
 *
 * Security gate: repos outside the curated preloaded set require
 * `confirmed: true` (the client shows the "I understand" dialog first).
 * Nothing is written to disk before that gate passes.
 */
export async function POST(req: Request) {
  if (isDemoMode()) return demoBlockedResponse();
  const body = installSchema.parse(await req.json());

  // Determine the repo part (strip `@skill` shorthand) for the gate.
  const at = body.source.lastIndexOf("@");
  const repoPart =
    at > 0 && !/^\d+$/.test(body.source.slice(at + 1))
      ? body.source.slice(0, at)
      : body.source;

  let preloaded = isPreloadedSource(repoPart);
  if (!preloaded) {
    // Non-shorthand source: resolve canonical form to detect GitHub URLs that
    // point at a preloaded repo.
    try {
      const resolved = await resolveRepoSkills(repoPart);
      preloaded = resolved.preloaded;
    } catch {
      // Resolution failures surface during install; keep gate open.
    }
  }

  if (!preloaded && !body.confirmed) {
    return NextResponse.json(
      {
        error:
          "Installing from an unverified repository. Skills are instructions that steer the AI — only install from sources you trust.",
        needsConfirmation: true,
      },
      { status: 403 },
    );
  }

  try {
    const installed = await installSkill(body.source);
    return NextResponse.json({ ok: true, skill: installed });
  } catch (err) {
    return NextResponse.json(
      {
        error: `Install failed: ${
          err instanceof Error ? err.message : "unknown error"
        }`,
      },
      { status: 400 },
    );
  }
}
