import fs from "node:fs/promises";
import path from "node:path";
import { SKILLS_DIR } from "@/lib/paths";
import { findSkill } from "./manager";

/**
 * @skill tagging — when the user tags a skill with an `@skill` marker (the
 * `/skill` slash command inserts `@skill <name>@<repo>`), the tagged skill's
 * FULL instructions are injected into the dynamic system prompt so the model
 * follows them for this request — no discovery via list_skills/load_skill
 * needed. Mirrors how the app handles `@tool` / `@mcp` markers, but stronger:
 * the content itself travels with the request.
 */

/** Same content cap as load_skill — protects context (~4-6k chars per spec). */
const MAX_SKILL_CONTENT_CHARS = 6_000;

/** Cap on how many tagged skills are honored in one request. */
const MAX_TAGGED_SKILLS = 3;

/** Max description length shown in the section header. */
const MAX_DESC_CHARS = 160;

/**
 * Extract `@skill <ref>` tags from a message. A ref is one token: a bare
 * skill name, `name@repo`, or a numeric skill id. Repeated tags are deduped,
 * order preserved.
 */
export function extractSkillRefs(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const re = /@skill\s+([^\s,;]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const ref = m[1].trim();
    if (!ref || seen.has(ref.toLowerCase())) continue;
    seen.add(ref.toLowerCase());
    out.push(ref);
  }
  return out;
}

/**
 * Build the `## Tagged skill` dynamic-prompt section for a request.
 *
 * Resolves every `@skill` tag in the user's message to an installed, ENABLED
 * skill and inlines its SKILL.md so the model is guaranteed to follow it.
 * Returns "" when nothing is tagged (or nothing resolvable) so ordinary
 * requests pay zero overhead.
 */
export async function buildTaggedSkillsSection(
  userText: string,
): Promise<string> {
  const refs = extractSkillRefs(userText);
  if (refs.length === 0) return "";

  const resolved: Array<{
    ref: string;
    name: string;
    repoSource: string;
    description: string;
    content: string;
    truncated: boolean;
  }> = [];
  const unresolved: string[] = [];
  const skipped: string[] = [];

  for (const ref of refs) {
    if (resolved.length >= MAX_TAGGED_SKILLS) {
      skipped.push(ref);
      continue;
    }
    const skill = await findSkill(ref).catch(() => undefined);
    if (!skill || !skill.enabled) {
      unresolved.push(ref);
      continue;
    }

    // Read the full instruction file from disk (same location load_skill uses).
    const skillMd = path.join(path.resolve(SKILLS_DIR, skill.diskPath), "SKILL.md");
    let content: string;
    try {
      content = await fs.readFile(skillMd, "utf8");
    } catch {
      unresolved.push(ref);
      continue;
    }
    const truncated = content.length > MAX_SKILL_CONTENT_CHARS;
    resolved.push({
      ref,
      name: skill.name,
      repoSource: skill.repoSource,
      description: skill.description,
      content: truncated
        ? content.slice(0, MAX_SKILL_CONTENT_CHARS)
        : content,
      truncated,
    });
  }  const parts: string[] = [];
  for (const skill of resolved) {
    const single = skill.description.replace(/\s+/g, " ").trim();
    const desc =
      single.length > MAX_DESC_CHARS
        ? single.slice(0, MAX_DESC_CHARS - 1).trimEnd() + "…"
        : single;
    parts.push(
      `## Tagged skill: ${skill.name} (${skill.repoSource})`,
      `The user explicitly tagged this skill with @skill — follow its instructions EXACTLY for this request and every step needed to complete it. The full instruction file is inlined below; do not re-discover it with load_skill unless you need to read its supporting files. ${desc ? `About: ${desc}` : ""}`,
      `<instructions>\n${skill.content}\n</instructions>${skill.truncated
        ? `\n(Instructions truncated at ${MAX_SKILL_CONTENT_CHARS} characters — call load_skill({ skill: "${skill.ref}" }) to re-read the full file.)`
        : ""}`,
    );
  }

  if (unresolved.length > 0) {
    parts.push(
      `Note: the tagged skill${unresolved.length > 1 ? "s" : ""} ${unresolved
        .map((r) => `"${r}"`)
        .join(", ")} ${unresolved.length > 1 ? "were" : "was"} not found or is disabled — tell the user it isn't available and how to enable it (Settings > Skills).`,
    );
  }
  if (skipped.length > 0) {
    parts.push(
      `Note: ${skipped.length} further tagged skill${skipped.length > 1 ? "s were" : " was"} skipped — at most ${MAX_TAGGED_SKILLS} skills can be tagged per request.`,
    );
  }

  // A tag that resolves to nothing still needs to reach the model so it can
  // tell the user (instead of silently ignoring the tag). Only when there are
  // no refs at all does the section cost zero tokens.
  if (resolved.length === 0 && parts.length === 0) return "";
  return `\n\n${parts.join("\n\n")}\n`;
}
