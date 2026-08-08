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
 * 2. The build script uses `next build --webpack` (NOT Turbopack) because
 *    Vercel's Next.js builder fails to package Turbopack builds of a
 *    subdirectory project: it looks for the build marker at
 *    `<repo root>/.next/package.json` (which never exists there) and aborts
 *    with `ENOENT ... lstat '/vercel/path0/.next/package.json'`. Webpack
 *    emits the marker where Vercel expects it.
 */
const nextConfig: NextConfig = {
  outputFileTracingRoot: process.cwd(),
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
