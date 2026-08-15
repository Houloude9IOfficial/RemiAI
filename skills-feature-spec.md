# Skills Feature — Specification

> Status: **Draft for review** · Product: RemiAI · Target version: v2.3.0 (unreleased)
> Scope: This document captures the full feature request + interview decisions. **No code has been written yet.**

---

## 1. Overview

Add an **Agent Skills** section to RemiAI. Skills are markdown instruction packages
(`SKILL.md` folders with YAML frontmatter) that extend the AI with specialized
behaviors — sourced from the open agent-skills ecosystem (the `npx skills` CLI /
skills.sh ecosystem from Vercel, Anthropic, Microsoft, and the community).

The feature has three parts:

1. **Skills settings section** with tabs (like the Tools section):
   - **Library** — installed skills, toggle Active/Inactive, update, view, uninstall.
   - **Repositories** — a list of skill source repos (predefined + user-added), from
     which skills can be installed.
   - **Discover** — featured skills (live skills.sh leaderboard) + search, with
     one-click install.
2. **Dynamic application to chats** — enabled skills' name + description are injected
   into every chat's system prompt; full instructions are loaded on demand via a
   `load_skill` tool (mirrors the app's existing token-optimization philosophy).
3. **New chat tools** — `list_skills` and `load_skill`, always available (core).

---

## 2. Interview decisions (final answers)

| Topic | Decision |
|---|---|
| **Skill loading in chats** | **Hybrid**: enabled skills' name+description always listed in the system prompt; a `load_skill` tool fetches the full `SKILL.md` mid-chat when relevant. |
| **Install engine** | **Hybrid**: native GitHub fetch for `owner/repo` + full URLs; fall back to the `npx skills` CLI for other source types (GitLab, direct download URLs, local paths, git URLs). |
| **Storage** | App-managed directory under the app data dir: `DATA_DIR/skills/`. |
| **Discovery source** | **Live skills.sh leaderboard** for Featured; search via the ecosystem. (skills.sh's official API needs Vercel OIDC auth — see §8 risk.) |
| **Preloaded repos** | `vercel-labs/agent-skills`, `anthropics/skills`, `vercel-labs/skills`, `microsoft/skills`. |
| **Custom repo input** | `owner/repo` shorthand **and** full URLs (GitHub URLs, git URLs, direct SKILL.md/archive download URLs, local paths accepted by the CLI fallback). |
| **Library toggle semantics** | Active = listed in system prompt **and** `load_skill` can load it. Inactive = fully hidden from the model; stays installed on disk. |
| **Updates** | **Auto-check on app boot** (shows "Update available" badges); actual update happens on user action. |
| **Security** | One-time "I understand" confirmation when **installing/enabling from a repo not in the curated/preloaded set**. Known repos install silently. |
| **Token cap** | List at most **10** enabled skills. If more are enabled, the prompt explicitly tells the model more exist and that it can use `list_skills` to see all and `load_skill` to load one. |
| **Low-capability models** | **Shortened listing**: active skills only, name + one-line description. |
| **Backup** | Installed skills **included** in Backup & Restore (files + config tables). |
| **Sidebar placement** | Under the collapsible **"More"** expander. |
| **Discover install flow** | **One-click**: click Install on a search/featured result → repo added to Repositories + skill installed + enabled in one step. |
| **Uninstall behavior** | Removing a skill **only disables it** (repo stays). An explicit "Remove repo" action deletes everything, with a confirmation dialog. |
| **Chat UI** | A small **header chip** (e.g. `⚡ 3 skills`) that opens `/settings/skills` when clicked. |

---

## 3. Terminology

- **Skill** — a folder containing a `SKILL.md` (YAML frontmatter: `name`, `description`;
  optional `metadata.internal`, `license`, `allowed-tools`). A skill may ship supporting
  files (scripts, templates) referenced by its instructions.
- **Repo** — a git repository (GitHub `owner/repo` shorthand or a full URL) containing
  one or more skills under standard discovery paths (root, `skills/`, `.agents/skills/`,
  `.claude/skills/`, category subfolders up to 3 levels).
- **Library** — the user's installed skills with per-skill Active toggles.
- **Curated/preloaded set** — the 4 default repos (§2). Installs from any other repo
  trigger the security confirmation.
- **Source spec** — how a skill is addressed externally: `owner/repo` or `owner/repo@skill`
  or a full URL.

---

## 4. Data model & disk layout

### 4.1 Disk layout

```
DATA_DIR/
  skills/
    <repo-slug>/                      # e.g. vercel-labs-agent-skills, custom-repo
      source.json                     # { source, repoName, addedAt, preloaded, lastFetchedAt }
      <skill-name>/                   # e.g. react-best-practices
        SKILL.md                      # full instructions (canonical, from upstream)
        ... (supporting files from the repo)
```

- `repo-slug` = sanitized source string (owner + repo), forward-slash-safe.
- Skills are **copies** from the source (not symlinks — the app manages its own
  canonical copy under its own data dir).
- Adding `skills/` to `DATA_DIR` means Electron packaging, `prune-standalone.mjs`, and
  the `turbopackIgnore` comment pattern in `lib/paths.ts` must be respected (same
  treatment as `uploads/`, `session-files/`, `avatars/`).

### 4.2 New DB tables (Drizzle, `db/schema.ts` + one new migration)

**`skill_repos`**
| Column | Type | Notes |
|---|---|---|
| `id` | integer PK autoincrement | |
| `source` | text not null unique | Normalized `owner/repo` or full URL string |
| `name` | text not null | Display name (e.g. `vercel-labs/agent-skills`) |
| `isPreloaded` | boolean default false | From the curated set |
| `lastCheckedAt` | text (ISO) | Last update-check timestamp |
| `createdAt` / `updatedAt` | text (ISO) | |

**`skills`**
| Column | Type | Notes |
|---|---|---|
| `id` | integer PK autoincrement | |
| `repoId` | integer FK → skill_repos (cascade) | |
| `name` | text not null | SKILL.md frontmatter `name` |
| `description` | text not null | SKILL.md frontmatter `description` |
| `diskPath` | text not null | Relative path under `DATA_DIR/skills/` |
| `enabled` | boolean default false | The Library Active toggle |
| `contentHash` | text | Hash of fetched content, for update detection |
| `installedAt` / `updatedAt` | text (ISO) | |

Unique constraint: `(repoId, name)` — a skill name is unique within its repo. Skill
names can repeat across repos; the system prompt disambiguates with `name@repo` (§6.3).

> Migration file `db/migrations/0029_skills.sql` — remember each statement separated by
> `--> statement-breakpoint` (AGENTS.md pitfall #2).

### 4.3 Backup integration

- Backup tables are auto-discovered via `sqlite_master` (`lib/backup/schema.ts`), so
  `skill_repos` + `skills` are included automatically.
- File backup (`lib/backup/types.ts` / `export.ts` / `import.ts`): add a **`skills`**
  bucket to `BackupFiles` (`collectFiles(DATA_DIR/skills)`, restore to the same dir,
  plus counts in `backup_history` UI). Mirror the existing `uploads`/`avatars` pattern.

---

## 5. Installation engine

### 5.1 Native GitHub path (primary)

- Resolve `owner/repo` (or GitHub URL) → fetch the default-branch tarball from
  `https://codeload.github.com/{owner}/{repo}/tar.gz/refs/heads/{defaultBranch}` (or
  `.../HEAD`). No API key required for public repos. Default branch resolved via the
  GitHub API (`https://api.github.com/repos/{owner}/{repo}`) with a fallback to `HEAD`.
- Extract to a temp dir (use the `tar` package — already present as a transitive dep
  via package.json overrides — or `fflate` + manual tar parsing; decision during
  implementation), then run **SKILL.md discovery**:
  - root `SKILL.md`, then `skills/`, `skills/.curated/`, `.agents/skills/`,
    `.claude/skills/`, and category subfolders up to 3 levels deep (same walk as the
    CLI's `--full-depth` semantics; a shallower `SKILL.md` shadows nested ones).
- Parse each discovered `SKILL.md` frontmatter (name, description). Reject skills
  missing either field (ecosystem rule).
- Copy discovered skill folders into `DATA_DIR/skills/<slug>/<name>/`, write
  `source.json`, upsert DB rows, compute `contentHash`.

### 5.2 CLI fallback

- For source types the native path doesn't cover (GitLab, direct download/archive URLs,
  local paths, git URLs), shell out to:
  `npx skills add <source> -y` (scoped to write into a temp dir or directly into
  `DATA_DIR/skills/<slug>/` — implementation detail; the CLI supports `--copy` and can
  target a directory). Prefer `--list` first to preview available skills.
- Use `node_modules/.bin` fallback / `npx --yes skills` on Windows (AGENTS.md pitfall #6).
- Parse stdout/exit codes for errors; surface them in the UI toast.

### 5.3 Install flow (Library / Repositories)

- **From Repositories tab**: select repo → "List skills" (`--list` / native discovery)
  → pick skills → Install. Installed skills are **enabled by default** (per the
  one-click Discover flow decision, installs enable the skill).
- **From Discover tab**: one-click → resolve repo → install the specific skill → enable.
- **Security gate**: if the repo is **not** in the curated preloaded set, show the
  "Install from unverified repo?" confirmation dialog (reuse the 
  `Dialog` + "I understand" pattern from `ToolList.tsx` code-execution confirmation)
  before anything is written to disk.

### 5.4 Uninstall / removal

- **Remove skill** (Library) → sets `enabled = false` + deletes that skill's folder.
  The repo row stays. (Per interview: "removing a skill only disables it" — keep the
  folder deletion optional in UI wording; the important part is it no longer loads.)
- **Remove repo** (Repositories) → confirmation dialog listing how many skills it owns
  → deletes repo folder + all its skills + repo row (cascade).

---

## 6. Applying skills to chats (dynamic application)

### 6.1 New always-on tools

Add two tools to `CORE_TOOLS` in `lib/chat/tool-groups.ts` (always loaded — they are
cheap):

- **`list_skills`** — returns the full catalog of **installed** skills (name,
  description, repo, enabled). Purpose: the model can discover skills beyond the
  system-prompt cap of 10.
- **`load_skill`** — takes a skill id (`name@repo` or DB id) and returns the **full
  `SKILL.md` content** (+ list of supporting files). Purpose: pull full instructions
  mid-chat when the current task needs them. Content is capped (e.g. 4–6k chars) to
  protect context; returns a note when truncated.

Both built in a new `lib/skills/tools.ts` and merged into the tool set in
`app/api/chat/route.ts` (alongside `builtinToolSet`), with input schemas via Zod
(`z.coerce.number()`/strings per AGENTS.md pitfall #7 — no bare numbers from the model).

### 6.2 System prompt section (dynamic part)

Injected into `dynamicSystemPromptBase` in `app/api/chat/route.ts` (AFTER the static
prompt / prompt-cache breakpoint — it must not invalidate the cached prefix):

```
## Active skills
The user has skills installed that extend your behavior. Their name + short
description are listed. To use one, call load_skill({ skill: "<name@repo>" })
and follow its instructions. The listed skills are ALWAYS relevant to their
topic; load the relevant one when the request matches.

- react-best-practices@vercel-labs/agent-skills — Guidelines for performant React
- pdf-processing@anthropics/skills — Create, inspect, and edit PDFs

(3 more skills are enabled but not listed to save tokens. Call list_skills to see
all installed skills, then load_skill to use one.)
```

Rules:
- List **enabled** skills only, capped at **10** (list order: enabled, then install
  order). If more than 10 are enabled, append the "(N more skills…)" note.
- For **low-capability models** (the existing `isLowCapability` branch in
  `app/api/chat/route.ts`): list only active skills, name + one-line description
  (truncated), and skip the "(N more)" enumeration.
- Description truncated to ~140 chars; name rendered as `name@repo` to disambiguate
  collisions.
- **Disabling a skill removes it from this section and makes `load_skill` refuse it**
  (toggle semantics, §2). `list_skills` may still show it as installed-but-inactive
  (the model doesn't need to know; keep it simple: list_skills lists enabled first).
- Skills are **global** (single local user, like every other setting — no per-user or
  per-chat scoping; the interview did not request per-chat overrides).

### 6.3 Why this hybrid

Full-injection of all enabled skills would add hundreds of tokens to every request and
re-invalidate the Anthropic cache on every toggle. Listing 10 name+description pairs
(~200 tokens) + lazy `load_skill` keeps overhead flat and cache-friendly, consistent
with the app's `load_tool_groups` design.

---

## 7. UI

### 7.1 Navigation

- `components/sidebar/AppSidebar.tsx`: add to `moreLinks`:
  `{ href: "/settings/skills", label: "Skills", icon: Sparkles }` (or `BookMarked`).

### 7.2 Page & tabs — `/settings/skills`

New page `app/settings/skills/page.tsx` (CenteredLayout, matching
`app/settings/tools/page.tsx`), title "Skills", subtitle explaining skills.

Inner tab bar (reuse `Tabs`/`TabsList`/`TabsTrigger` from `components/ui/tabs`):

1. **Library** (`SkillLibrary.tsx`)
   - List of installed skills as cards/rows: name, repo badge, description
     (line-clamped), status badge (Active), "Update available" badge, actions:
     - **Active switch** (calls `PATCH /api/skills/:id`)
     - **View** (read-only dialog rendering the SKILL.md — markdown-to-jsx is already a
       dependency)
     - **Update** (if update available)
     - **Remove** (confirmation → disable + delete folder, repo stays)
   - Header: "X of Y skills active".
   - Empty state → link to Discover/Repositories tabs.

2. **Repositories** (`SkillRepos.tsx`)
   - Predefined repos listed with badges (Preloaded). Each row: name, source, skill
     count, "List skills" (expands into selectable skill list → Install), last
     checked, Remove repo (confirmation, cascades).
   - **Add custom repo** form: single text input accepting `owner/repo` or a full URL
     → validate → resolves repo, shows available skills, install flow. Unknown repo
     triggers the security dialog (§5.3).
   - Repos list persisted in `skill_repos`; preloaded ones re-seeded on first boot if
     the table is empty.

3. **Discover** (`SkillDiscover.tsx`)
   - **Featured** row/grid: live skills.sh leaderboard (see §8 for data source risk;
     fallback = curated static list from the preloaded repos + known popular skills).
   - **Search** input → ecosystem search (CLI `npx skills find <query>` non-interactive,
     or skills.sh mirror).
   - Each result: skill name, description, installs, source repo, Install button →
     **one-click install + enable** (adds repo if needed).
   - Loading / offline states; errors as toasts.

### 7.3 Chat header chip

`components/chat/ChatHeader.tsx`: add a small chip (e.g. `Sparkles` icon + "3") before
the usage meter, showing the number of **enabled** skills (from `/api/skills`),
clickable → `/settings/skills`. Show only when count > 0. Mobile chat header exists
separately — out of scope unless trivial; note in §11.

### 7.4 API client

`lib/api/skills.ts` following the `lib/api/tools.ts` pattern (`unwrap` + typed methods).

---

## 8. Discovery data source (skills.sh) — risk & fallback

- The official skills.sh API requires a **Vercel OIDC token** (project-bound) — not
  usable for a self-hosted local app.
- Planned primary: run `npx skills find <query>` in **non-interactive** mode
  (keyword form, no TTY) and parse its stdout (it prints result tables/JSON in
  non-interactive contexts — must be verified during implementation).
- Featured/leaderboard: attempt the same CLI's registry endpoint if reachable; else a
  **curated fallback list** (top skills from the preloaded repos + community-known
  popular skills such as `vercel-labs/agent-skills`, `anthropics/skills`, and the
  skills.sh leaderboard top-10 mirrored in a static JSON shipped with the app, refreshed
  periodically in code).
- Decision to confirm in implementation; the UI contract (list of
  `{ name, description, repo, installs?, url }`) is stable regardless.

---

## 9. Server-side operations

- **`initializeApp()`** (`db/index.ts` / `instrumentation.ts`): after migrations, in a
  non-blocking background task:
  - Seed the 4 preloaded repos if `skill_repos` is empty.
  - **Auto-check for updates** (only if last check > 24h old to avoid hammering GitHub):
    for each repo, native-fetch or `git ls-remote`-style HEAD compare → mark skills
    with `contentHash` mismatch as "update available" in the DB (no content change until
    user clicks Update). Never run this during `next build` (already guarded by
    `initializeApp` semantics).
- **New API routes** (all server-side, DB + disk):
  - `GET /api/skills` — installed skills with config + update flags + counts.
  - `PATCH /api/skills/:id` — toggle `enabled`.
  - `DELETE /api/skills/:id` — remove skill (disable + delete folder).
  - `GET|POST /api/skills/repos` — list repos / add repo (+ its skills).
  - `DELETE /api/skills/repos/:id` — remove repo + cascade.
  - `POST /api/skills/repos/:id/update` — check + apply updates.
  - `GET /api/skills/discover?q=` — featured / search results.
  - `POST /api/skills/install` — `{ repo, skill? }` one-click install + enable.
- New module `lib/skills/`:
  - `manager.ts` — install/uninstall/update/list, repo seeding, update-check logic.
  - `github.ts` — tarball fetch + SKILL.md discovery + frontmatter parsing.
  - `cli.ts` — `npx skills` wrapper (find/list/add/update) with error parsing.
  - `discovery.ts` — featured/search data assembly.
  - `tools.ts` — `list_skills` / `load_skill` tool builders.
  - `system-prompt.ts` — builds the `## Active skills` section (§6.2) from the DB.

---

## 10. Edge cases & constraints

- **Offline**: install/update/discover require network; all fail gracefully with toasts.
  Installed + enabled skills keep working offline (local reads).
- **Name collisions**: same skill name from two repos → `name@repo` everywhere in the
  prompt and tools.
- **Large SKILL.md**: `load_skill` caps returned content; update-check ignores file
  size changes beyond hash.
- **Broken/malformed SKILL.md** (missing frontmatter fields): skill is listed as
  "Invalid — update or remove" in Library; never injected into the prompt.
- **Repo moved/deleted**: install/update surfaces the error; existing local copies stay
  usable.
- **`metadata.internal: true` skills**: skip from discovery/listing (they're not meant
  for end users).
- **Security of prompt injection**: enabling any skill is opt-in; the unknown-repo
  warning covers the risky case. Also note in the confirmation that skills are
  instructions that steer the AI.
- **Prompt cache**: the skills section lives in the dynamic prompt; it only changes
  when toggles change, so the static cached prefix is untouched.
- **Windows**: all paths normalized to `/` for anything exposed to tools; `npx` via
  full path fallback; `DATA_DIR` already resolves per-OS.
- **prune-standalone.mjs**: the standalone server needs the skills dir + any tar
  dependency at runtime — keep the whitelist in sync if new top-level runtime files are
  needed.
- **Backup size**: skills are markdown (small); include them by default (§4.3).

---

## 11. Open questions / to verify during implementation

1. Non-interactive output format of `npx skills find <query>` (parseable? JSON vs table).
2. Whether to bundle `tar` explicitly as a direct dependency for tarball extraction
   (currently only a transitive dep via overrides) or use `fflate`.
3. `npx skills add <source>` headless behavior in the standalone/Electron environment
   (path to npx, first-run download time) — mitigate with `npx --yes`.
4. Mobile chat header skills chip — include or defer.
5. Exact curated "Featured" fallback list contents.

---

## 12. Implementation phases

1. **Data layer**: migration `0029_skills.sql`, `db/schema.ts` tables, `lib/skills/manager.ts`
   core (CRUD + seeding), `lib/skills/github.ts` (fetch + discover + parse).
2. **API layer**: routes in §9 + `lib/api/skills.ts` client.
3. **Settings UI**: page + Library + Repositories tabs (toggles, view, remove, add repo,
   install, update badges).
4. **Discover tab**: featured/search + one-click install (with §8 fallback).
5. **Chat integration**: `list_skills`/`load_skill` tools (CORE_TOOLS), system-prompt
   section (§6.2), low-capability branch, `initializeApp` update-check + seeding.
6. **Chat header chip** + sidebar entry.
7. **Backup integration** (§4.3).
8. **Verification**: typecheck (`npx tsc --noEmit`), `npm test`, build (`npm run build`),
   manual pass of install→enable→chat-load→disable→uninstall; follow CHECKS.md for
   release-relevant checks.

---

## 13. Files touched (map)

| Area | Files |
|---|---|
| DB | `db/schema.ts`, `db/migrations/0029_skills.sql` |
| Skills core | `lib/skills/{manager,github,cli,discovery,tools,system-prompt}.ts`, `lib/paths.ts` (SKILLS_DIR) |
| Chat | `app/api/chat/route.ts` (tools + prompt section + low-cap branch), `lib/chat/tool-groups.ts` (CORE_TOOLS), `lib/chat/system-prompt.ts` (optional section constant) |
| Settings UI | `app/settings/skills/page.tsx`, `components/settings/skills/*`, `components/sidebar/AppSidebar.tsx` |
| Chat UI | `components/chat/ChatHeader.tsx` (chip) |
| API | `app/api/skills/**`, `lib/api/skills.ts` |
| Backup | `lib/backup/{types,export,import}.ts` |
| Boot | `db/index.ts` (seeding + update-check in `initializeApp`) |
| Build | `scripts/prune-standalone.mjs` (if needed) |

---

## 14. Out of scope (this iteration)

- Creating/authoring skills from within RemiAI (`npx skills init` UI).
- Per-conversation skill overrides (global toggles only).
- Skill→tool binding (skills are prompt-only; they do not register their own callable
  tools in this iteration).
