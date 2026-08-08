import type { NextConfig } from "next";

/**
 * Vercel deployment notes — read before changing anything here.
 *
 * 1. `outputFileTracingRoot` (and `turbopack.root`) MUST point at THIS app's
 *    directory (`process.cwd()`), never at the monorepo root.
 *
 *    Vercel sets `NEXT_PRIVATE_OUTPUT_TRACE_ROOT` to the *git repo root*
 *    (e.g. `/vercel/path0`) because this project lives in the `website/`
 *    subdirectory. That env var becomes the default `outputFileTracingRoot`,
 *    which Next.js also forces onto `turbopack.root`. Pointed at the repo
 *    root, Turbopack treats the whole repository as the project and picks up
 *    the *main app's* `instrumentation.ts` → `db/index.ts`, whose imports
 *    (`better-sqlite3`, `drizzle-orm`, `@/lib/...`) do not exist here — the
 *    build dies with a cascade of "Module not found" errors.
 *
 *    Setting `outputFileTracingRoot` explicitly overrides the Vercel env var
 *    and keeps both roots pinned to this self-contained site.
 *
 * 2. Vercel's deploy step looks for the Next.js build markers at the *git
 *    repo root* (`/vercel/path0/.next/package.json`) and aborts with
 *    `ENOENT ... lstat` when they are not there, even though the build
 *    succeeds. Because this app is in the `website/` subdirectory, the
 *    markers are emitted at `website/.next/` regardless of bundler
 *    (Turbopack OR webpack) — so switching bundlers does NOT fix it.
 *
 *    The build script therefore ends with `node scripts/vercel-fix-output.mjs`
 *    (see that file), which symlinks the repo-root `.next` to this app's
 *    real build output during Vercel builds so the deploy step finds the
 *    markers it expects.
 */
const nextConfig: NextConfig = {
  outputFileTracingRoot: process.cwd(),
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
