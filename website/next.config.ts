import type { NextConfig } from "next";

/**
 * IMPORTANT — do not remove `outputFileTracingRoot` (and keep it in sync with
 * `turbopack.root`).
 *
 * Vercel sets `NEXT_PRIVATE_OUTPUT_TRACE_ROOT` to the *git repo root*
 * (e.g. `/vercel/path0`) because this project lives in the `website/`
 * subdirectory of a monorepo. That env var becomes the default
 * `outputFileTracingRoot`, which Next.js then also forces onto
 * `turbopack.root`. With the root pointed at the repo root, Turbopack treats
 * the whole repository as the project: it picks up the *main app's*
 * `instrumentation.ts` → `db/index.ts`, whose imports (`better-sqlite3`,
 * `drizzle-orm`, `@/lib/...`) do not exist here, and the build dies with a
 * cascade of "Module not found" errors.
 *
 * Setting `outputFileTracingRoot` explicitly overrides the Vercel env var and
 * keeps both roots pinned to this self-contained site.
 */
const nextConfig: NextConfig = {
  outputFileTracingRoot: process.cwd(),
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
