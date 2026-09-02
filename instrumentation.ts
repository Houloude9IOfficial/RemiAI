/**
 * Next.js instrumentation hook.
 *
 * `register()` is invoked once when a Next.js server instance boots — i.e.
 * for `next dev`, `next start`, and the standalone server that the Electron
 * app spawns. Next.js skips it during `next build` and never runs it in the
 * parallel worker processes used to collect page data.
 *
 * We use it to run database startup side effects (migrations, orphaned-task
 * cleanup, file watcher, scheduler). Those must NOT live at module scope in
 * `db/index.ts`: during `next build` the static-analysis workers import route
 * modules with a stripped-down environment (no `NEXT_PHASE`), so several
 * processes used to run migrations concurrently on the same SQLite file and
 * crash the build with `SqliteError: database is locked` (SQLITE_BUSY).
 */
export async function register() {
  // instrumentation.ts is also compiled for the Edge runtime, where the
  // SQLite/native modules cannot be bundled. Only initialize in Node.
  if (process.env.NEXT_RUNTIME === "edge") return;

  const [{ initializeApp }, { cleanupExpiredBackupDownloads }] = await Promise.all([
    import("./db"),
    import("./lib/backup/download"),
  ]);
  await initializeApp();
  await cleanupExpiredBackupDownloads();
}
