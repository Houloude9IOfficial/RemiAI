import { initializeApp } from "./db";
import { cleanupExpiredBackupDownloads } from "./lib/backup/download";

/**
 * Node-only startup work for the Next.js instrumentation hook.
 *
 * Keep native/server-only imports out of instrumentation.ts itself. Next.js
 * also analyzes the root instrumentation module while building development
 * browser fallback assets, and imports such as `tar` require Node built-ins
 * (`zlib`) that cannot be bundled for the browser.
 */
export async function registerNodeRuntime(): Promise<void> {
  await initializeApp();
  await cleanupExpiredBackupDownloads();
}
