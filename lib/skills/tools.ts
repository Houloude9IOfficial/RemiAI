import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { SKILLS_DIR } from "@/lib/paths";
import { findSkill, listSkills } from "./manager";
import { listSkillFiles } from "./github";

/**
 * Chat tools for skills — both always available (core).
 *
 * - `list_skills` — full catalog of installed skills (name, description,
 *   repo, enabled), so the model can discover skills beyond the
 *   system-prompt cap of 10.
 * - `load_skill` — returns the full SKILL.md (+ supporting file list) for a
 *   skill, capped to protect context. Refuses disabled skills.
 */

/** Content cap for load_skill — protects context (~4-6k chars per spec). */
const MAX_SKILL_CONTENT_CHARS = 6_000;

export function buildListSkillsTool() {
  return {
    description:
      "List all installed agent skills (name, description, source repo, enabled state). Skills extend your behavior with specialized instructions — use this to discover skills beyond those already listed in the system prompt, then call load_skill to load one.",
    inputSchema: z.object({}),
    execute: async () => {
      const rows = await listSkills();
      if (rows.length === 0) {
        return {
          skills: [],
          note: "No skills are installed. The user can install skills from Settings > Skills.",
        };
      }
      // Enabled first, then install order.
      const sorted = [...rows].sort(
        (a, b) => Number(b.enabled) - Number(a.enabled),
      );
      return {
        skills: sorted.map((s) => ({
          id: s.id,
          name: s.name,
          repo: s.repoSource,
          enabled: s.enabled,
          description: s.description,
        })),
        note: "Call load_skill({ skill: \"<name>@<repo>\" }) to load a skill's full instructions.",
      };
    },
  };
}

export function buildLoadSkillTool() {
  return {
    description:
      "Load the full instructions of an installed agent skill by its id (\"<name>@<repo>\" or a numeric skill id). The listed skills in the system prompt are always relevant to their topic — load the matching one when the request fits, then follow its instructions.",
    inputSchema: z.object({
      skill: z
        .string()
        .min(1)
        .describe('Skill reference: "name@repo" (e.g. "react-best-practices@vercel-labs/agent-skills") or a numeric skill id'),
    }),
    execute: async ({ skill }: { skill: string }) => {
      const row = await findSkill(skill);
      if (!row) {
        return {
          error: `Skill "${skill}" was not found. Call list_skills to see installed skills.`,
        };
      }
      if (!row.enabled) {
        return {
          error: `Skill "${row.name}" is disabled (inactive) — it is not available. Enable it in Settings > Skills to use it.`,
        };
      }

      const skillDir = path.resolve(SKILLS_DIR, row.diskPath);
      const skillMd = path.join(skillDir, "SKILL.md");
      let content: string;
      try {
        content = await fs.readFile(skillMd, "utf8");
      } catch {
        return {
          error: `Skill "${row.name}" is installed but its files are missing on disk (${row.diskPath}). Reinstall it from Settings > Skills.`,
        };
      }

      const truncated = content.length > MAX_SKILL_CONTENT_CHARS;
      const returned = truncated
        ? content.slice(0, MAX_SKILL_CONTENT_CHARS)
        : content;

      const files = await listSkillFiles(skillDir).catch(() => []);

      return {
        id: row.id,
        name: row.name,
        repo: row.repoSource,
        description: row.description,
        content: returned,
        truncated,
        truncatedNote: truncated
          ? `Content was truncated at ${MAX_SKILL_CONTENT_CHARS} characters. ${content.length - MAX_SKILL_CONTENT_CHARS} more characters were omitted.`
          : undefined,
        supportingFiles: files.filter((f) => f !== "SKILL.md"),
        usage: `Follow the instructions above. The skill may reference its supporting files (${files.length} file(s) in the skill folder).`,
      };
    },
  };
}

/** Both tools merged — added to the chat route tool set. */
export function buildSkillsToolSet(): Record<string, unknown> {
  return {
    list_skills: buildListSkillsTool(),
    load_skill: buildLoadSkillTool(),
  };
}
