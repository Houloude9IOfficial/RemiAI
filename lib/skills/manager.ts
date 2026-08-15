import os from "node:os";
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { skillRepos, skills } from "@/db/schema";
import { SKILLS_DIR } from "@/lib/paths";
import {
  cleanupTempDir,
  discoverSkillsInRepo,
  fetchRepoToTemp,
  hashSkillFolder,
  resolveGithubSource,
  type DiscoveredSkill,
} from "./github";
import { runSkillsCli } from "./cli";

/**
 * App-managed skills store under `DATA_DIR/skills/`.
 *
 * Layout:
 *   DATA_DIR/skills/<repo-slug>/source.json      { source, repoName, addedAt, preloaded, lastFetchedAt }
 *   DATA_DIR/skills/<repo-slug>/<skill-name>/    SKILL.md + supporting files
 *
 * Skills are copies (not symlinks) — the app owns the canonical copy.
 */

/** Curated/preloaded skill repos (installs from these skip the security gate). */
export const PRELOADED_REPOS = [
  "vercel-labs/agent-skills",
  "anthropics/skills",
];

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24h between auto update-checks

/** Sanitize a source string into a forward-slash-safe folder name. */
export function slugifySource(source: string): string {
  const slug = source
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "repo";
}

function repoSlugDir(source: string): string {
  return path.join(SKILLS_DIR, slugifySource(source));
}

function sourceJsonPath(source: string): string {
  return path.join(repoSlugDir(source), "source.json");
}

async function writeSourceJson(
  source: string,
  displayName: string,
  preloaded: boolean,
): Promise<void> {
  const dir = repoSlugDir(source);
  await fsp.mkdir(dir, { recursive: true });
  const existing = await readSourceJson(source);
  await fsp.writeFile(
    sourceJsonPath(source),
    JSON.stringify(
      {
        source,
        repoName: displayName,
        addedAt: existing?.addedAt ?? new Date().toISOString(),
        preloaded,
        lastFetchedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
    "utf8",
  );
}

interface SourceJson {
  source: string;
  repoName: string;
  addedAt: string;
  preloaded: boolean;
  lastFetchedAt: string;
}

async function readSourceJson(source: string): Promise<SourceJson | null> {
  try {
    const raw = await fsp.readFile(sourceJsonPath(source), "utf8");
    return JSON.parse(raw) as SourceJson;
  } catch {
    return null;
  }
}

/** Whether a repo is part of the curated preloaded set. */
export function isPreloadedSource(source: string): boolean {
  const normalized = source.trim().toLowerCase();
  return PRELOADED_REPOS.some((r) => r.toLowerCase() === normalized);
}

// ── Listing ────────────────────────────────────────────────────────────────

export interface SkillRow {
  id: number;
  repoId: number;
  repoSource: string;
  repoName: string;
  name: string;
  description: string;
  diskPath: string;
  enabled: boolean;
  updateAvailable: boolean;
  installedAt: string;
  updatedAt: string;
}

export interface RepoRow {
  id: number;
  source: string;
  name: string;
  isPreloaded: boolean;
  lastCheckedAt: string | null;
  createdAt: string;
  updatedAt: string;
  skillCount: number;
}

export async function listRepos(): Promise<RepoRow[]> {
  ensureSkillsSchema();
  const rows = await db
    .select({
      id: skillRepos.id,
      source: skillRepos.source,
      name: skillRepos.name,
      isPreloaded: skillRepos.isPreloaded,
      lastCheckedAt: skillRepos.lastCheckedAt,
      createdAt: skillRepos.createdAt,
      updatedAt: skillRepos.updatedAt,
      // Correlated count. Note: drizzle renders column refs from tables that
      // are NOT in the outer FROM unqualified (`repo_id`), which would
      // resolve both sides against the inner `skills` table and always count
      // 0 — so the table-qualified names are written literally.
      skillCount: sql<number>`(SELECT COUNT(*) FROM skills WHERE skills.repo_id = skill_repos.id)`,
    })
    .from(skillRepos)
    .orderBy(skillRepos.createdAt);
  return rows;
}

export async function listSkills(enabledOnly = false): Promise<SkillRow[]> {
  ensureSkillsSchema();
  const rows = await db
    .select({
      id: skills.id,
      repoId: skills.repoId,
      repoSource: skillRepos.source,
      repoName: skillRepos.name,
      name: skills.name,
      description: skills.description,
      diskPath: skills.diskPath,
      enabled: skills.enabled,
      updateAvailable: skills.updateAvailable,
      installedAt: skills.installedAt,
      updatedAt: skills.updatedAt,
    })
    .from(skills)
    .innerJoin(skillRepos, eq(skills.repoId, skillRepos.id))
    .where(enabledOnly ? eq(skills.enabled, true) : undefined)
    .orderBy(skills.enabled, skills.installedAt);

  return rows.map((r) => ({ ...r, enabled: Boolean(r.enabled) }));
}

/** Find a skill by its `name@repo` id, numeric id, or bare name. */
export async function findSkill(
  ref: string,
): Promise<SkillRow | undefined> {
  const trimmed = ref.trim();
  if (!trimmed) return undefined;

  // Numeric DB id.
  if (/^\d+$/.test(trimmed)) {
    const row = await listSkills();
    return row.find((s) => String(s.id) === trimmed);
  }

  // `name@repo` — repo may be the display name or the normalized source.
  const at = trimmed.lastIndexOf("@");
  if (at > 0) {
    const name = trimmed.slice(0, at);
    const repo = trimmed.slice(at + 1).toLowerCase();
    const row = await listSkills();
    return row.find(
      (s) =>
        s.name === name &&
        (s.repoSource.toLowerCase() === repo ||
          s.repoName.toLowerCase() === repo),
    );
  }

  // Bare name — unique match only.
  const row = await listSkills();
  const matches = row.filter((s) => s.name === trimmed);
  return matches.length === 1 ? matches[0] : undefined;
}

// ---------------------------------------------------------------------------
// Self-healing schema (kept in sync with db/migrations/0029_skills.sql)
// ---------------------------------------------------------------------------

let schemaEnsured = false;

/** Migration-journal metadata for 0029 (must match meta/_journal.json). */
const SKILLS_MIGRATION_WHEN = 1786896000000;

const SKILLS_DDL = `
CREATE TABLE IF NOT EXISTS \`skill_repos\` (
	\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	\`source\` text NOT NULL,
	\`name\` text NOT NULL,
	\`is_preloaded\` integer DEFAULT false NOT NULL,
	\`last_checked_at\` text,
	\`created_at\` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	\`updated_at\` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS \`skill_repos_source_unique\` ON \`skill_repos\` (\`source\`);
CREATE TABLE IF NOT EXISTS \`skills\` (
	\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	\`repo_id\` integer NOT NULL,
	\`name\` text NOT NULL,
	\`description\` text NOT NULL,
	\`disk_path\` text NOT NULL,
	\`enabled\` integer DEFAULT false NOT NULL,
	\`content_hash\` text,
	\`update_available\` integer DEFAULT false NOT NULL,
	\`installed_at\` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	\`updated_at\` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (\`repo_id\`) REFERENCES \`skill_repos\`(\`id\`) ON UPDATE no action ON DELETE cascade
);
CREATE UNIQUE INDEX IF NOT EXISTS \`skills_repo_id_name_unique\` ON \`skills\` (\`repo_id\`, \`name\`);
`;

/**
 * Ensure the skills tables exist and are journal-consistent.
 *
 * The app's migration runner tolerates "already up to date" databases, which
 * means a DB created before migration 0029 can boot without the skills
 * tables (migrate() bails early) — leaving the feature silently empty.
 * This idempotent pass runs before any skills read/write (boot seeding and
 * lazy seeding alike) and creates the tables if missing. It also records
 * 0029 in `__drizzle_migrations` (hash computed exactly like drizzle does:
 * sha256 of the raw migration file) so a later `migrate()` skips it cleanly
 * instead of warning about duplicate tables.
 */
function ensureSkillsSchema(): void {
  if (schemaEnsured) return;

  const tables = db.all(
    sql`SELECT name FROM sqlite_master WHERE type='table' AND name IN ('skill_repos','skills')`,
  ) as { name: string }[];
  const existing = new Set(tables.map((t) => t.name));

  if (!existing.has("skill_repos") || !existing.has("skills")) {
    db.$client.exec(SKILLS_DDL);
  }

  // backup_history.skill_count (guarded: the table may not exist on very old
  // databases that are still mid-migration — those will get it from 0029).
  try {
    const cols = db.all(
      sql`PRAGMA table_info(backup_history)`,
    ) as { name: string }[];
    if (cols.length > 0 && !cols.some((c) => c.name === "skill_count")) {
      db.$client.exec(
        `ALTER TABLE \`backup_history\` ADD \`skill_count\` integer DEFAULT 0 NOT NULL;`,
      );
    }
  } catch {
    // Table missing entirely — the regular migration will handle it.
  }

  // Record 0029 in the drizzle journal so future migrate() runs skip it.
  try {
    const hasJournal = db.all(
      sql`SELECT name FROM sqlite_master WHERE type='table' AND name='__drizzle_migrations'`,
    ) as { name: string }[];
    if (hasJournal.length > 0) {
      const file = fs.readFileSync(
        path.join(process.cwd(), "db/migrations/0029_skills.sql"),
        "utf8",
      );
      const hash = crypto.createHash("sha256").update(file).digest("hex");
      const row = db.all(
        sql`SELECT id FROM __drizzle_migrations WHERE hash = ${hash}`,
      ) as { id: number }[];
      if (row.length === 0) {
        db.run(
          sql`INSERT INTO __drizzle_migrations (hash, created_at) VALUES (${hash}, ${SKILLS_MIGRATION_WHEN})`,
        );
      }
    }
  } catch {
    // Journal bookkeeping is best-effort.
  }

  schemaEnsured = true;
}

// ── Seeding ────────────────────────────────────────────────────────────────

/** Seed the preloaded repos if the table is empty (first boot). */
export async function seedPreloadedRepos(): Promise<void> {
  ensureSkillsSchema();
  const count = await db.select({ n: sql<number>`COUNT(*)` }).from(skillRepos);
  if ((count[0]?.n ?? 0) > 0) return;

  const now = new Date().toISOString();
  for (const source of PRELOADED_REPOS) {
    await db
      .insert(skillRepos)
      .values({
        source,
        name: source,
        isPreloaded: true,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing();
  }
}

// ── Resolve + install ──────────────────────────────────────────────────────

export interface ResolvedRepoSkills {
  source: string;
  displayName: string;
  preloaded: boolean;
  skills: DiscoveredSkill[];
}

/**
 * Resolve a source string and enumerate the skills it ships — without
 * writing anything to disk. Used by the Repositories "List skills" flow and
 * the install flow (so the security gate can fire before any writes).
 *
 * - `owner/repo` / GitHub URLs → native GitHub fetch.
 * - Anything else (GitLab, git URLs, direct download URLs, local paths) →
 *   `npx skills add <source> --list` in a temp dir.
 */
export async function resolveRepoSkills(
  input: string,
): Promise<ResolvedRepoSkills> {
  const github = resolveGithubSource(input);
  if (github) {
    const tempRoot = await fetchRepoToTemp(github);
    try {
      const discovered = discoverSkillsInRepo(tempRoot);
      return {
        source: github.source,
        displayName: github.displayName,
        preloaded: isPreloadedSource(github.source),
        skills: discovered.filter((s) => !s.internal),
      };
    } finally {
      await cleanupTempDir(tempRoot);
    }
  }

  // CLI fallback for non-GitHub source types.
  const cli = await runSkillsCli(["add", input, "--list"], {
    timeoutMs: 120_000,
    cwd: undefined,
  });
  const skills = parseCliSkillList(cli.stdout);
  return {
    source: input.trim(),
    displayName: input.trim(),
    preloaded: isPreloadedSource(input),
    skills,
  };
}

/**
 * Parse the `npx skills add <source> --list` output into skill descriptors.
 * The CLI prints a table; we tolerate JSON, table rows, and plain `- name`
 * lines so output-format changes degrade gracefully.
 */
function parseCliSkillList(stdout: string): DiscoveredSkill[] {
  const result: DiscoveredSkill[] = [];
  if (!stdout) return result;

  // Try JSON first.
  const jsonMatch = stdout.match(/\[[\s\S]*\]/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as Array<{
        name?: string;
        description?: string;
        path?: string;
      }>;
      for (const item of parsed) {
        if (!item?.name || !item.description) continue;
        result.push({
          name: item.name,
          description: item.description,
          dir: item.path ?? item.name,
          relDir: item.path ?? item.name,
          internal: false,
        });
      }
      if (result.length > 0) return result;
    } catch {
      // Fall through to line parsing.
    }
  }

  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // `- name — description` / `name  description` / `| name | description |`
    const table = /^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/.exec(trimmed);
    const dash = /^[-*]\s*([A-Za-z0-9_.-]+)\s*[—-]\s*(.+)$/.exec(trimmed);
    if (table) {
      const name = table[1].trim();
      const description = table[2].trim();
      if (name && description && name !== "name") {
        result.push({ name, description, dir: name, relDir: name, internal: false });
      }
    } else if (dash) {
      result.push({
        name: dash[1].trim(),
        description: dash[2].trim(),
        dir: dash[1].trim(),
        relDir: dash[1].trim(),
        internal: false,
      });
    }
  }
  return result;
}

/**
 * Install one skill (or a whole repo) under `DATA_DIR/skills/<slug>/`.
 * Enabled by default (one-click Discover flow semantics).
 *
 * @param input  `owner/repo` / URL, or `owner/repo@skill` shorthand.
 */
export async function installSkill(input: string): Promise<SkillRow> {
  ensureSkillsSchema();
  const { repo, skillName } = splitSourceAndSkill(input);

  // Re-fetch from the source so we always install the latest content.
  const resolved = await resolveRepoSkills(repo);
  const target = skillName
    ? resolved.skills.find(
        (s) => s.name === skillName || s.name === stripSkillSuffix(skillName),
      )
    : undefined;

  if (skillName && !target) {
    throw new Error(
      `Skill "${skillName}" was not found in ${resolved.displayName}. Available: ${resolved.skills
        .map((s) => s.name)
        .slice(0, 20)
        .join(", ")}${resolved.skills.length > 20 ? ", …" : ""}`,
    );
  }

  // If no skill name given, install every discovered skill in the repo.
  const toInstall =
    target !== undefined
      ? [target]
      : resolved.skills.filter((s) => !s.internal);

  if (toInstall.length === 0) {
    throw new Error(`No skills found in ${resolved.displayName}.`);
  }

  // GitHub path: re-extract once, install from the same tree.
  // CLI path (GitLab, direct URLs, local paths, git URLs): copy the actual
  // files via `npx skills add --copy` into a temp dir first — the `--list`
  // resolution above only enumerates names, it doesn't download content.
  let tempRoot: string | undefined;
  let cliTemp: string | undefined;
  const github = resolveGithubSource(resolved.source);
  if (github) {
    tempRoot = await fetchRepoToTemp(github);
  } else {
    cliTemp = await fsp.mkdtemp(path.join(os.tmpdir(), "remiai-skills-"));
    const addTarget = skillName
      ? `${resolved.source}@${skillName}`
      : resolved.source;
    const cli = await runSkillsCli(["add", addTarget, "--copy", cliTemp], {
      timeoutMs: 180_000,
      cwd: undefined,
    });
    if (cli.exitCode !== 0) {
      const detail = cli.stderr.trim() || cli.stdout.trim() || String(cli.exitCode);
      throw new Error(`skills CLI failed to add ${addTarget}: ${detail.slice(0, 400)}`);
    }
  }

  try {
    const now = new Date().toISOString();
    const slugDir = repoSlugDir(resolved.source);

    // Upsert the repo row.
    const repoRow = await db
      .insert(skillRepos)
      .values({
        source: resolved.source,
        name: resolved.displayName,
        isPreloaded: resolved.preloaded,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: skillRepos.source,
        set: { name: resolved.displayName, updatedAt: now },
      })
      .returning()
      .get();

    for (const skill of toInstall) {
      let srcDir: string;
      if (tempRoot) {
        srcDir = path.join(tempRoot, skill.relDir);
      } else if (cliTemp) {
        // The CLI may lay the copy out as <temp>/<skill-name>/ — locate by
        // name, falling back to a direct join.
        const inCopy = discoverSkillsInRepo(cliTemp).find(
          (s) => s.name === skill.name,
        );
        srcDir = inCopy ? path.join(cliTemp, inCopy.relDir) : path.join(cliTemp, skill.name);
      } else {
        srcDir = skill.dir;
      }
      const destDir = path.join(slugDir, skill.name);
      await fsp.rm(destDir, { recursive: true, force: true });
      await fsp.mkdir(destDir, { recursive: true });
      await fsp.cp(srcDir, destDir, { recursive: true, force: true });

      const contentHash = await hashSkillFolder(destDir);
      const diskPath = path
        .relative(SKILLS_DIR, destDir)
        .split(path.sep)
        .join("/");

      await db
        .insert(skills)
        .values({
          repoId: repoRow.id,
          name: skill.name,
          description: skill.description,
          diskPath,
          enabled: true,
          contentHash,
          updateAvailable: false,
          installedAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [skills.repoId, skills.name],
          set: {
            description: skill.description,
            diskPath,
            contentHash,
            updateAvailable: false,
            updatedAt: now,
          },
        })
        .returning()
        .get();
    }

    await writeSourceJson(
      resolved.source,
      resolved.displayName,
      resolved.preloaded,
    );

    const all = await listSkills();
    const row = all.find((s) => s.repoId === repoRow.id && s.name === target?.name);
    if (row) return row;

    // Return the first installed skill (whole-repo install).
    const first = all.find((s) => s.repoId === repoRow.id);
    if (first) return first;
    throw new Error(`Installed ${toInstall.length} skill(s), but none could be listed.`);
  } finally {
    if (tempRoot) await cleanupTempDir(tempRoot);
    if (cliTemp) await cleanupTempDir(cliTemp);
  }
}

function splitSourceAndSkill(input: string): {
  repo: string;
  skillName?: string;
} {
  // `owner/repo@skill` — the @ separates the skill (repo strings never contain @).
  const at = input.lastIndexOf("@");
  if (at > 0 && !/^\d+$/.test(input.slice(at + 1))) {
    return { repo: input.slice(0, at), skillName: input.slice(at + 1) };
  }
  return { repo: input };
}

function stripSkillSuffix(name: string): string {
  // CLI shorthand may include a path suffix; keep the last segment.
  const parts = name.split(/[\\/]/);
  return parts[parts.length - 1] ?? name;
}

// ── Remove ─────────────────────────────────────────────────────────────────

/** Remove a single skill: disable it and delete its folder (repo stays). */
export async function removeSkill(skillId: number): Promise<void> {
  const row = await db.select().from(skills).where(eq(skills.id, skillId)).get();
  if (!row) return;
  await db.update(skills).set({ enabled: false }).where(eq(skills.id, skillId));
  const disk = path.resolve(SKILLS_DIR, row.diskPath);
  if (isInsideSkillsDir(disk)) {
    await fsp.rm(disk, { recursive: true, force: true });
  }
  await db.delete(skills).where(eq(skills.id, skillId));
}

/** Remove a repo and cascade-delete all its skills (folder + rows). */
export async function removeRepo(repoId: number): Promise<number> {
  const row = await db
    .select()
    .from(skillRepos)
    .where(eq(skillRepos.id, repoId))
    .get();
  if (!row) return 0;

  const owned = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(skills)
    .where(eq(skills.repoId, repoId));
  const count = owned[0]?.count ?? 0;

  const slugDir = repoSlugDir(row.source);
  if (isInsideSkillsDir(slugDir)) {
    await fsp.rm(slugDir, { recursive: true, force: true });
  }
  await db.delete(skillRepos).where(eq(skillRepos.id, repoId));
  return count;
}

function isInsideSkillsDir(target: string): boolean {
  const root = path.resolve(SKILLS_DIR) + path.sep;
  return target.startsWith(root);
}

// ── Toggle ─────────────────────────────────────────────────────────────────

export async function setSkillEnabled(
  skillId: number,
  enabled: boolean,
): Promise<void> {
  await db
    .update(skills)
    .set({ enabled, updatedAt: new Date().toISOString() })
    .where(eq(skills.id, skillId));
}

// ── Updates ────────────────────────────────────────────────────────────────

/**
 * Check one repo for updates: fetch upstream, hash each installed skill's
 * current folder, and mark skills whose upstream hash differs as
 * `updateAvailable`. Does NOT change any content — applying is a separate
 * user action (`applyRepoUpdates`).
 */
export async function checkRepoForUpdates(repoId: number): Promise<number> {
  const repo = await db
    .select()
    .from(skillRepos)
    .where(eq(skillRepos.id, repoId))
    .get();
  if (!repo) return 0;

  const installed = await db
    .select()
    .from(skills)
    .where(eq(skills.repoId, repoId))
    .all();

  // Resolve upstream skill folders (CLI for non-GitHub sources).
  const github = resolveGithubSource(repo.source);
  let upstreamRoot: string | undefined;
  const upstreamSkills: Map<string, string> = new Map(); // name → absolute dir
  if (github) {
    upstreamRoot = await fetchRepoToTemp(github);
    for (const s of discoverSkillsInRepo(upstreamRoot)) {
      upstreamSkills.set(s.name, s.relDir);
    }
  } else {
    const cli = await runSkillsCli(["add", repo.source, "--list"], {
      timeoutMs: 120_000,
      cwd: undefined,
    });
    for (const s of parseCliSkillList(cli.stdout)) {
      upstreamSkills.set(s.name, s.dir);
    }
  }

  let updated = 0;
  try {
    for (const skill of installed) {
      if (!skill.contentHash) continue;
      const upstreamRel = upstreamSkills.get(skill.name);
      let upstreamHash = "";
      if (upstreamRoot && upstreamRel) {
        upstreamHash = await hashSkillFolder(path.join(upstreamRoot, upstreamRel));
      }
      const hasUpdate = upstreamHash !== "" && upstreamHash !== skill.contentHash;
      await db
        .update(skills)
        .set({
          updateAvailable: hasUpdate,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(skills.id, skill.id));
      if (hasUpdate) updated++;
    }
  } finally {
    if (upstreamRoot) await cleanupTempDir(upstreamRoot);
  }

  await db
    .update(skillRepos)
    .set({ lastCheckedAt: new Date().toISOString() })
    .where(eq(skillRepos.id, repoId));
  return updated;
}

/**
 * Apply pending updates for a repo: re-install every skill in it (enabled
 * state preserved) and clear the update-available flags.
 */
export async function applyRepoUpdates(repoId: number): Promise<number> {
  const repo = await db
    .select()
    .from(skillRepos)
    .where(eq(skillRepos.id, repoId))
    .get();
  if (!repo) return 0;

  const installed = await db
    .select()
    .from(skills)
    .where(eq(skills.repoId, repoId))
    .all();

  // Re-fetch + re-install all skills of the repo.
  const github = resolveGithubSource(repo.source);
  let tempRoot: string | undefined;
  if (github) tempRoot = await fetchRepoToTemp(github);

  let applied = 0;
  try {
    const now = new Date().toISOString();
    const slugDir = repoSlugDir(repo.source);
    for (const skill of installed) {
      let srcDir: string | undefined;
      if (tempRoot && github) {
        const upstream = discoverSkillsInRepo(tempRoot).find(
          (s) => s.name === skill.name,
        );
        if (upstream) srcDir = path.join(tempRoot, upstream.relDir);
      }
      if (!srcDir) continue;

      const destDir = path.join(slugDir, skill.name);
      await fsp.rm(destDir, { recursive: true, force: true });
      await fsp.mkdir(destDir, { recursive: true });
      await fsp.cp(srcDir, destDir, { recursive: true, force: true });

      const contentHash = await hashSkillFolder(destDir);
      await db
        .update(skills)
        .set({
          contentHash,
          updateAvailable: false,
          updatedAt: now,
        })
        .where(eq(skills.id, skill.id));
      applied++;
    }
  } finally {
    if (tempRoot) await cleanupTempDir(tempRoot);
  }

  await db
    .update(skillRepos)
    .set({ lastCheckedAt: new Date().toISOString() })
    .where(eq(skillRepos.id, repoId));
  return applied;
}

/**
 * Background update check for all repos — runs at app boot. Skips repos
 * checked within the last 24h. Never throws (best-effort).
 */
export async function checkAllReposForUpdates(): Promise<void> {
  const repos = await listRepos();
  const cutoff = Date.now() - CHECK_INTERVAL_MS;
  for (const repo of repos) {
    const last = repo.lastCheckedAt ? new Date(repo.lastCheckedAt).getTime() : 0;
    if (last > cutoff) continue;
    try {
      await checkRepoForUpdates(repo.id);
    } catch (err) {
      console.warn(
        `[skills] Update check failed for ${repo.name}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
}
