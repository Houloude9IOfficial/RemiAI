import path from "node:path";

/**
 * Root of the app's writable data (SQLite DB, uploads, session files,
 * avatars, backups).
 *
 * - Packaged Electron: `electron/main.ts` sets `REMI_DATA_DIR` to
 *   `<os user-data dir>/data` — the app bundle itself is read-only on macOS
 *   (/Applications) and Windows (Program Files), so data cannot live next to
 *   the app files.
 * - Dev / web / CI (`next build`): falls back to `<cwd>/data`.
 */
export const DATA_DIR = process.env.REMI_DATA_DIR
  ? path.resolve(process.env.REMI_DATA_DIR)
  : path.join(
      // turbopackIgnore: never trace the local data dir into the standalone
      // output — it contains the user's SQLite DB, uploads and files.
      /* turbopackIgnore: true */ process.cwd(),
      "data",
    );

/** User uploads (attached chat files). */
export const UPLOAD_DIR = path.join(DATA_DIR, "uploads");

/** Per-conversation sandbox for session files. */
export const SESSION_FILES_DIR = path.join(DATA_DIR, "session-files");

/** User profile avatars. */
export const AVATAR_DIR = path.join(DATA_DIR, "avatars");
