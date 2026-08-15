/**
 * Minimal YAML frontmatter parser for SKILL.md files.
 *
 * The agent-skills ecosystem defines frontmatter with a handful of simple
 * fields (`name`, `description`, optional `metadata.internal`, `license`,
 * `allowed-tools`). Writing a tiny parser for exactly those shapes avoids
 * depending on a YAML library for a single, controlled file format — but it
 * must still tolerate the quirks real-world SKILL.md files have:
 * quoted values, colons inside values, lists, and nested `metadata:` blocks.
 */

export interface SkillFrontmatter {
  /** Skill name (kebab-case). Required by the ecosystem. */
  name: string;
  /** One-line description. Required by the ecosystem. */
  description: string;
  /** `metadata.internal: true` — internal skills are hidden from users. */
  internal: boolean;
  license?: string;
  allowedTools?: string[];
  /** Raw extra fields (unused for now, kept for forward compatibility). */
  raw: Record<string, unknown>;
}

const FRONTMATTER_RE = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/** Strip the frontmatter block, returning the remaining markdown body. */
export function stripFrontmatter(content: string): string {
  const match = FRONTMATTER_RE.exec(content);
  if (!match) return content;
  return content.slice(match[0].length);
}

/** Unquote a scalar YAML value (`"..."`, `'...'`, bare). */
function unquote(raw: string): string {
  const value = raw.trim();
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

/**
 * Parse the frontmatter of a SKILL.md file.
 *
 * Returns null when there is no frontmatter block or the required
 * `name`/`description` fields are missing (ecosystem rule: such skills are
 * rejected from discovery).
 */
export function parseFrontmatter(content: string): SkillFrontmatter | null {
  const match = FRONTMATTER_RE.exec(content);
  if (!match) return null;

  const block = match[1];
  const lines = block.split(/\r?\n/);

  let name = "";
  let description = "";
  let internal = false;
  let license: string | undefined;
  let allowedTools: string[] | undefined;
  const raw: Record<string, unknown> = {};

  // Tracks the current indented block (e.g. `metadata:` → `  internal: true`).
  let listContext: string | null = null;

  for (const line of lines) {
    if (line.trim() === "" || line.trim().startsWith("#")) continue;

    // List items (`- foo` / `- "foo"`) under a known list key.
    if (listContext && /^\s*-\s+/.test(line)) {
      if (listContext === "allowed-tools") {
        allowedTools = allowedTools ?? [];
        allowedTools.push(unquote(line.replace(/^\s*-\s+/, "")));
      }
      continue;
    }
    listContext = null;

    const colon = line.indexOf(":");
    if (colon === -1) continue;

    const key = line.slice(0, colon).trim();
    const valueRaw = line.slice(colon + 1).trim();

    // Nested blocks: remember the parent key for indented children.
    if (valueRaw === "" || valueRaw.startsWith("|") || valueRaw.startsWith(">")) {
      if (key === "metadata" || key === "allowed-tools") listContext = key;
      continue;
    }

    switch (key) {
      case "name":
        name = unquote(valueRaw);
        raw[key] = name;
        break;
      case "description":
        description = unquote(valueRaw);
        raw[key] = description;
        break;
      case "license":
        license = unquote(valueRaw);
        raw[key] = license;
        break;
      case "allowed-tools":
        // Inline list form: `allowed-tools: [a, b]` or a comma-separated string.
        if (valueRaw.startsWith("[")) {
          allowedTools = valueRaw
            .replace(/^\[|\]$/g, "")
            .split(",")
            .map((s) => unquote(s))
            .filter(Boolean);
        } else if (valueRaw) {
          allowedTools = valueRaw.split(",").map((s) => unquote(s)).filter(Boolean);
        } else {
          listContext = "allowed-tools";
        }
        raw[key] = allowedTools;
        break;
      case "internal":
        // Nested under `metadata:` — key appears without indentation here.
        internal = valueRaw.toLowerCase() === "true";
        raw[key] = internal;
        break;
      default: {
        // `metadata:` block child — capture known booleans/strings.
        if (key === "internal") {
          internal = valueRaw.toLowerCase() === "true";
        }
        raw[key] = unquote(valueRaw);
      }
    }
  }

  if (!name || !description) return null;
  return { name, description, internal, license, allowedTools, raw };
}
