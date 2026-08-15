import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { x as extractTar } from "tar";
import { parseFrontmatter } from "./frontmatter";

/**
 * Native GitHub source fetching for skills.
 *
 * Primary install path: resolve `owner/repo` (or a GitHub URL) to the
 * default-branch tarball on codeload.github.com (no API key needed for
 * public repos), extract it, then discover SKILL.md packages using the same
 * layout walk as the `npx skills` CLI (`--full-depth` semantics).
 */

export interface GithubRepoRef {
  kind: "github";
  owner: string;
  repo: string;
  /** Normalised external address, e.g. `vercel-labs/agent-skills`. */
  source: string;
  /** Display name, e.g. `vercel-labs/agent-skills`. */
  displayName: string;
}

/** A discovered skill package inside an extracted repo. */
export interface DiscoveredSkill {
  /** Frontmatter `name`. */
  name: string;
  /** Frontmatter `description`. */
  description: string;
  /** Absolute path of the skill folder (the one containing SKILL.md). */
  dir: string;
  /** Relative path of the skill folder inside the repo (for display). */
  relDir: string;
  internal: boolean;
}

const GITHUB_URL_RE =
  /^https?:\/\/github\.com\/([^/]+)\/([^/?#]+?)(?:\.git)?(?:\/|$)/i;

const OWNER_REPO_RE = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/;

/**
 * Normalise an input string into a GitHub repo reference, or null when the
 * source type isn't native-GitHub (GitLab, git URLs, direct download URLs,
 * local paths — those fall back to the `npx skills` CLI).
 */
export function resolveGithubSource(input: string): GithubRepoRef | null {
  const trimmed = input.trim();

  const urlMatch = GITHUB_URL_RE.exec(trimmed);
  if (urlMatch) {
    const [, owner, repo] = urlMatch;
    if (owner && repo) {
      return {
        kind: "github",
        owner,
        repo,
        source: `${owner}/${repo}`,
        displayName: `${owner}/${repo}`,
      };
    }
    return null;
  }

  const shorthand = OWNER_REPO_RE.exec(trimmed);
  if (shorthand && !trimmed.startsWith("http")) {
    const [, owner, repo] = shorthand;
    return {
      kind: "github",
      owner,
      repo,
      source: `${owner}/${repo}`,
      displayName: `${owner}/${repo}`,
    };
  }

  return null;
}

/** GitHub API request with a short timeout and a basic user agent. */
async function githubFetch(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    return await fetch(url, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "RemiAI/2.3 (+https://remiai.crickdevs.com)",
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

/** Resolve the default branch name (falls back to `HEAD` on failure). */
export async function resolveDefaultBranch(ref: GithubRepoRef): Promise<string> {
  try {
    const res = await githubFetch(
      `https://api.github.com/repos/${ref.owner}/${ref.repo}`,
    );
    if (res.ok) {
      const data = (await res.json()) as { default_branch?: string };
      if (data.default_branch) return data.default_branch;
    }
  } catch {
    // Fall through to HEAD.
  }
  return "HEAD";
}

/**
 * Download the default-branch tarball of a repo into a fresh temp dir and
 * extract it. Returns the extraction root. Caller is responsible for
 * cleaning it up.
 */
export async function fetchRepoToTemp(ref: GithubRepoRef): Promise<string> {
  const branch = await resolveDefaultBranch(ref);
  // codeload accepts `refs/heads/{branch}` and the magic `HEAD` ref.
  const url =
    branch === "HEAD"
      ? `https://codeload.github.com/${ref.owner}/${ref.repo}/tar.gz/HEAD`
      : `https://codeload.github.com/${ref.owner}/${ref.repo}/tar.gz/refs/heads/${branch}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": "RemiAI/2.3 (+https://remiai.crickdevs.com)" },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    throw new Error(
      `Failed to download ${ref.displayName}: HTTP ${res.status} ${res.statusText}`,
    );
  }

  const tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "remiai-skills-"));
  const tarballPath = path.join(tempRoot, "repo.tar.gz");
  await fsp.writeFile(tarballPath, Buffer.from(await res.arrayBuffer()));

  const extractDir = path.join(tempRoot, "extract");
  await fsp.mkdir(extractDir, { recursive: true });

  // tar 7.x `x` returns a promise; strip the leading `<owner>-<repo>-<sha>/`
  // component that GitHub tarballs carry.
  await extractTar({ file: tarballPath, cwd: extractDir, strip: 1 });
  await fsp.rm(tarballPath, { force: true });

  return extractDir;
}

/** Clean up a temp extraction root. */
export async function cleanupTempDir(dir: string): Promise<void> {
  try {
    await fsp.rm(dir, { recursive: true, force: true });
  } catch {
    // Best-effort.
  }
}

/**
 * Discovery paths for SKILL.md packages, matching the `npx skills` CLI's
 * `--full-depth` walk: root, then standard skill folders, then category
 * subfolders up to 3 levels deep. A shallower SKILL.md shadows nested ones
 * (only the shallowest occurrence of each skill is kept).
 */
function discoveryCandidates(repoRoot: string): string[] {
  const candidates: string[] = [];
  const push = (p: string) => candidates.push(p);

  push(path.join(repoRoot, "SKILL.md"));

  const baseDirs = [
    "skills",
    "skills/.curated",
    ".agents/skills",
    ".claude/skills",
  ];

  const walk = (dir: string, depth: number) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const child = path.join(dir, entry.name);
        push(path.join(child, "SKILL.md"));
        // Category subfolders — up to 3 levels deep from the base dirs.
        if (depth < 3) walk(child, depth + 1);
      }
    }
  };

  for (const base of baseDirs) {
    const baseDir = path.join(repoRoot, base);
    push(path.join(baseDir, "SKILL.md"));
    walk(baseDir, 1);
  }

  return candidates;
}

/**
 * Discover all valid skills in an extracted repo.
 *
 * Each SKILL.md is parsed for frontmatter; skills missing `name` or
 * `description` are rejected (ecosystem rule). When multiple SKILL.md files
 * share a name, the shallowest one wins.
 */
export function discoverSkillsInRepo(repoRoot: string): DiscoveredSkill[] {
  const byName = new Map<string, DiscoveredSkill>();
  const candidates = discoveryCandidates(repoRoot);

  for (const skillMd of candidates) {
    let content: string;
    try {
      content = fs.readFileSync(skillMd, "utf8");
    } catch {
      continue; // Not every candidate exists.
    }
    const fm = parseFrontmatter(content);
    if (!fm) continue;

    const dir = path.dirname(skillMd);
    const existing = byName.get(fm.name);
    // Shallower shadows deeper — compare relative path depth.
    if (existing) {
      const newDepth = path.relative(repoRoot, dir).split(path.sep).length;
      const oldDepth = path
        .relative(repoRoot, existing.dir)
        .split(path.sep).length;
      if (newDepth >= oldDepth) continue;
    }

    byName.set(fm.name, {
      name: fm.name,
      description: fm.description,
      dir,
      relDir: path.relative(repoRoot, dir).split(path.sep).join("/"),
      internal: fm.internal,
    });
  }

  return Array.from(byName.values());
}

/**
 * Hash the content of a skill folder (SKILL.md + supporting files), used for
 * update detection. Paths are sorted so re-extraction is stable.
 */
export async function hashSkillFolder(dir: string): Promise<string> {
  const hash = crypto.createHash("sha256");
  const files: string[] = [];

  async function walk(current: string): Promise<void> {
    const entries = await fsp.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) files.push(full);
    }
  }
  await walk(dir);
  files.sort();

  for (const file of files) {
    const rel = path.relative(dir, file).split(path.sep).join("/");
    const content = await fsp.readFile(file);
    hash.update(rel);
    hash.update("\u0000");
    hash.update(content);
  }
  return hash.digest("hex");
}

/** List the files inside a skill folder (relative paths, `/` separators). */
export async function listSkillFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  async function walk(current: string): Promise<void> {
    const entries = await fsp.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) files.push(full);
    }
  }
  await walk(dir);
  return files
    .map((f) => path.relative(dir, f).split(path.sep).join("/"))
    .sort();
}
