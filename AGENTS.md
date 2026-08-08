<!-- BEGIN:git-discipline -->
# ⛔ NEVER commit or push

This repository is managed by the owner's own version-control workflow. When
working here, NEVER run `git commit`, `git push`, `git tag`, `git rebase`,
`git reset`, `git add`, or anything else that mutates repository history or
remote state — **unless the owner explicitly asks you to in the same message**.
Produce changes and report results; the owner handles all version-control
operations (including commits, pushes, tags, and releases).
<!-- END:git-discipline -->

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:common-pitfalls -->
# Common Pitfalls & Fixes

## 1. Base UI compound components & nested `<button>`

Components from `@base-ui/react` (e.g. `DialogTrigger`) render their own
`<button>` element internally. **Never** put another `<button>` inside them,
as this produces invalid HTML nesting (`<button> > <button>`) and causes a
React hydration error:

```
<button> cannot be a descendant of <button>
```

**✅ Correct — pass `className` and `aria-label` directly to the trigger:**
```tsx
<DialogTrigger className="..." aria-label="About">
  <Info className="h-4 w-4" />
</DialogTrigger>
```

**❌ Wrong — inner `<button>` creates nesting:**
```tsx
<DialogTrigger>
  <button className="..." aria-label="About">   {/* BAD */}
    <Info className="h-4 w-4" />
  </button>
</DialogTrigger>
```

This applies to all Base UI compound components that render a `<button>`:
- `DialogTrigger`, `DialogClose`
- `SelectTrigger`, `DropdownMenuTrigger`
- Any `*Trigger` or `*Close` component

## 2. Drizzle SQLite migration files must use `--> statement-breakpoint`

Drizzle ORM's SQLite migrator splits migration `.sql` files on the marker
`--> statement-breakpoint` and passes each chunk individually to
`better-sqlite3.exec()`, which only accepts **one statement per call**.

If you have multiple SQL statements in a single migration file, each must
be separated by `--> statement-breakpoint`:

```sql
ALTER TABLE `conversations` ADD `total_input_tokens` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `conversations` ADD `total_output_tokens` integer DEFAULT 0 NOT NULL;
```

**❌ Missing separator causes:**
```
RangeError: The supplied SQL string contains more than one statement
```

The same rule applies to any multi-statement DDL/DML in migration files.

## 3. Base UI `render` prop instead of Radix `asChild`

Base UI does **not** have an `asChild` prop (that's Radix UI). To customise
the root element rendered by a Base UI component, use the `render` prop.
This is already used in the project (e.g. `DialogClose` in
`components/ui/dialog.tsx`):

```tsx
<DialogPrimitive.Close
  data-slot="dialog-close"
  render={
    <Button variant="ghost" className="absolute top-2 right-2" size="icon-sm" />
  }
>
  <XIcon />
  <span className="sr-only">Close</span>
</DialogPrimitive.Close>
```

**`render={<div />}` makes the trigger render a `<div>` instead of a `<button>`:**
```tsx
<TooltipTrigger
  render={
    <div className="aspect-square rounded-sm cursor-pointer hover:ring-2 ..." />
  }
>
  <span>Cell content</span>
</TooltipTrigger>
```

**❌ Wrong — `asChild` doesn't exist on Base UI components:**
```tsx
<TooltipTrigger asChild>    {/* TypeScript error: Property 'asChild' does not exist */}
  <div>...</div>
</TooltipTrigger>
```

## 4. Drizzle ORM — migrations run at server boot, not at module scope

SQLite databases tracked in Drizzle ORM (`better-sqlite3`) require migrations
to create tables. Running `npm run dev` without them produces
`SqliteError: no such table: <name>`.

**Current approach — run startup side effects from `instrumentation.ts`, never
at module scope in `db/index.ts`:**

```ts
// instrumentation.ts — runs exactly once when the Next.js server boots
// (dev / `next start` / the standalone server used by Electron)
export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;
  const { initializeApp } = await import("./db");
  await initializeApp(); // migrations + orphaned-task cleanup + watcher + scheduler
}
```

`db/index.ts` must NOT run `migrate()` (or any DB write) at module scope:
during `next build`, parallel worker processes import route modules — and thus
`db` — so concurrent writers crash the build with `SqliteError: database is
locked` (SQLITE_BUSY). Read the doc comments in `db/index.ts` and
`instrumentation.ts` before touching this area.

A `postinstall` script in `package.json` runs migrations early for fresh clones:
```json
"postinstall": "drizzle-kit migrate || echo '(Migration skipped - it will run on app startup)'"
```

## 5. Turbopack root warning (multiple lockfiles)

Next.js may warn "Next.js inferred your workspace root, but it may not be
correct" when it detects multiple lockfiles. Add `turbopack.root` to
`next.config.ts`:

```ts
const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
};
```

## 6. Windows path & command compatibility

When running terminal commands on Windows:
- Use `dir` instead of `ls`
- Use `move` instead of `mv`, `copy` instead of `cp`, `del` instead of `rm`
- Prefer `powershell -Command "..."` for complex operations
- The native `cmd.exe` shell may not have Node.js in PATH — use full path
  `"C:\Program Files\nodejs\node.exe"` if needed
- `npx` commands might fail silently; try `node node_modules/.bin/<tool>` or
  the direct `node_modules/<tool>/bin.cjs` path as a fallback

## 7. Windows cross-platform compatibility

### Zod schema — coerce numeric IDs from strings

AI models sometimes serialise numbers as strings (`"1"` instead of `1`).
Always use `z.coerce.number()` instead of `z.number()` for IDs that
come from the AI:

```ts
// ✅ Works with both `1` and `"1"`
rootId: z.coerce.number().int().positive()

// ❌ Rejects `"1"` (Zod validation error)
rootId: z.number().int().positive()
```

### File paths — always normalise to forward slashes

On Windows, `path.join()` and Node glob return backslashes (`\\`). Always
normalise paths returned to the AI so they use `/` everywhere:

```ts
function normalizePath(fp: string): string {
  return fp.replace(/\\/g, "/");
}
```

Apply this to:
- Glob file results (`globFiles`, `discoverFiles`)
- `buildMediaUrl` input
- Any path returned from a tool

### URL building — handle Windows backslashes

When building URLs from file paths, normalise `\\` to `/` first:

```ts
const normalized = relativePath.replace(/\\/g, "/");
const segments = normalized.split("/").map(encodeURIComponent);
```

### Path containment — trailing separator

On Windows, `path.normalize("C:\\Users")` produces `"C:\\Users"` (no
 trailing `\\`). Always add the separator explicitly when checking
 containment to avoid false positives like `"C:\\Users-evil"` matching
 `"C:\\Users"`:

```ts
const withSep = normalizedRoot.endsWith(path.sep)
  ? normalizedRoot
  : normalizedRoot + path.sep;
return normalizedTarget.startsWith(withSep);
```

### System prompt — guide the AI for Windows

Tell the AI to:
- Use numeric `rootId` values, never strings
- Always use forward slashes (`/`) in `relativePath`
- Never use backslashes in paths

## 8. Dynamic tool loading — register new tools in `lib/chat/tool-groups.ts`

RemiAI does NOT send every tool on every request (that would cost ~7k input
tokens of static overhead per agentic step). `lib/chat/tool-groups.ts` splits
tools into groups that are loaded on demand:

- `CORE_TOOLS` — always available (time/device details, memory, file reads,
  builtins like `web_fetch`, `ask_questions`, `suggest_followups`).
- `CONDITIONAL_GROUPS` — loaded only when a deterministic intent classifier,
  usage recency, or the model's own `load_tool_groups` request activates them.

**When adding a tool:**
1. Implement it in `lib/tools/` (export a builder).
2. Register it in `lib/tools/catalog.ts` (Settings toggles, API-key storage).
3. **Add it to `lib/chat/tool-groups.ts`** — `CORE_TOOLS` if it must always be
   present, or a `CONDITIONAL_GROUPS` entry (including `keywords` for the
   classifier) if it should load on demand.

Note: a tool not in any group is **never filtered** — it always loads (like
MCP tools), so to gate a tool behind intent/recency it must be in a
`CONDITIONAL_GROUPS` entry. Verify with `npx tsx scripts/smoke-dynamic-tools.mjs`.

## 9. Scripts, Node version, and native modules

- Node.js >= 20 required (`engines`, `.nvmrc` = 22).
- `npm run build` = `next build` **+** `node scripts/prune-standalone.mjs`
  (whitelist-prunes `.next/standalone`; keep the whitelist in sync if the
  standalone server needs new top-level files at runtime).
- `npm test` = `scripts/test-chat-reconstruction.ts` (chat history logic).
- `npm run build:electron` = type-check the Electron main process.
- `npm run playwright:install` (dev Chromium) / `npm run playwright:browsers`
  (stages Chromium into `build/playwright-browsers` for installers).
- `better-sqlite3` is a native module — run `npm run rebuild:node` (or
  `rebuild:electron`) after switching Node or Electron versions.

## 10. Release checks

Before a release, run the checks in [`CHECKS.md`](./CHECKS.md) (a local
runbook) and report pass/fail. Never commit, push, or tag as part of that —
see the notice at the top of this file.
<!-- END:common-pitfalls -->
