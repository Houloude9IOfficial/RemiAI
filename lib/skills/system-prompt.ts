import { listSkills } from "./manager";

/**
 * Builds the `## Active skills` section of the dynamic system prompt.
 *
 * Hybrid design (see skills-feature-spec §6): enabled skills' name +
 * description are always listed (capped at 10), full instructions load on
 * demand via `load_skill`. The section is part of the DYNAMIC prompt (after
 * the static prompt / prompt-cache breakpoint) so toggling a skill never
 * invalidates the cached prefix.
 */

/** Hard cap on how many enabled skills are enumerated. */
export const SKILLS_PROMPT_CAP = 10;

/** Max description length in the listing. */
const MAX_DESC_CHARS = 140;

/** `name@repo` — disambiguates same-named skills from different repos. */
export function skillRef(name: string, repoSource: string): string {
  return `${name}@${repoSource}`;
}

export function truncateDescription(description: string, max = MAX_DESC_CHARS): string {
  const single = description.replace(/\s+/g, " ").trim();
  if (single.length <= max) return single;
  return single.slice(0, max - 1).trimEnd() + "…";
}

const SECTION_HEADER = `## Active skills
The user has skills installed that extend your behavior. Their name + short description are listed. To use one, call load_skill({ skill: "<name@repo>" }) and follow its instructions. The listed skills are ALWAYS relevant to their topic; load the relevant one when the request matches.
`;

/**
 * Build the active-skills section for a request.
 *
 * @param lowCapability  shorter listing for low-capability models: active
 *   skills only, name + one-line description, no "(N more)" enumeration.
 */
export async function buildActiveSkillsSection(
  lowCapability = false,
): Promise<string> {
  const enabled = (await listSkills()).filter((s) => s.enabled);
  if (enabled.length === 0) return "";

  const lines: string[] = [];
  const listed = enabled.slice(0, SKILLS_PROMPT_CAP);
  for (const skill of listed) {
    const ref = skillRef(skill.name, skill.repoSource);
    const desc = truncateDescription(
      skill.description,
      lowCapability ? 100 : MAX_DESC_CHARS,
    );
    lines.push(`- ${ref} — ${desc}`);
  }

  const extra = enabled.length - listed.length;
  if (!lowCapability && extra > 0) {
    lines.push(
      `(${extra} more skills are enabled but not listed to save tokens. Call list_skills to see all installed skills, then load_skill to use one.)`,
    );
  }

  return `\n\n${SECTION_HEADER}${lines.join("\n")}\n`;
}
