/**
 * Shared types and helpers for the in-app update checker.
 *
 * The checker polls the GitHub releases API (via `/api/updates`) and compares
 * the latest published release against the version bundled in `package.json`.
 * If the release is newer, the sidebar shows an update icon that opens a modal
 * with the changelog and download links.
 */

export interface ReleaseAsset {
  name: string;
  /** Direct download URL for the asset (GitHub `browser_download_url`). */
  url: string;
  size: number;
}

export interface LatestRelease {
  /** GitHub tag, e.g. `v2.4.0`. */
  tagName: string;
  /** Tag with the leading `v` stripped, e.g. `2.4.0`. */
  version: string;
  /** Release title. */
  name: string;
  /** Release body (changelog), markdown. */
  body: string;
  /** ISO timestamp of when the release was published. */
  publishedAt: string;
  /** GitHub release page URL. */
  htmlUrl: string;
  /** Uploaded installers/binaries. */
  assets: ReleaseAsset[];
}

/** How often to re-check GitHub for a new release (6 hours). */
export const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** localStorage key holding the last successful check (release + timestamp). */
export const UPDATE_CHECK_STORAGE_KEY = "remiai:update-check";

export interface CachedUpdateCheck {
  lastCheckedAt: number;
  release: LatestRelease | null;
}

/**
 * Compare two semver-ish version strings (optionally `v`-prefixed, may carry a
 * prerelease suffix like `-beta.1`). Returns -1 when `a < b`, 1 when `a > b`,
 * 0 when equal. A release without a prerelease suffix sorts newer than the
 * same core version with one (e.g. `2.4.0` > `2.4.0-rc.1`).
 */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => {
    const clean = v.trim().replace(/^v/i, "");
    const [core = "0", pre = ""] = clean.split("-", 2);
    const parts = core.split(".").map((p) => {
      const n = Number.parseInt(p, 10);
      return Number.isNaN(n) ? 0 : n;
    });
    return { parts, pre };
  };

  const A = parse(a);
  const B = parse(b);

  for (let i = 0; i < 3; i++) {
    const x = A.parts[i] ?? 0;
    const y = B.parts[i] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }

  // Same core version — compare prerelease suffixes. A release without a
  // prerelease suffix sorts newer than the same core with one.
  if (A.pre === B.pre) return 0;
  if (!A.pre) return 1;
  if (!B.pre) return -1;

  // Numeric-aware comparison of dot-separated prerelease identifiers, so
  // `beta.10` sorts after `beta.2` rather than alphabetically before it.
  const aPre = A.pre.split(".");
  const bPre = B.pre.split(".");
  for (let i = 0; i < Math.max(aPre.length, bPre.length); i++) {
    const x = aPre[i];
    const y = bPre[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (x === y) continue;
    const xNum = /^\d+$/.test(x) ? Number(x) : NaN;
    const yNum = /^\d+$/.test(y) ? Number(y) : NaN;
    if (!Number.isNaN(xNum) && !Number.isNaN(yNum)) {
      return xNum < yNum ? -1 : 1;
    }
    return x < y ? -1 : 1;
  }
  return 0;
}

/** True when the `latest` version is newer than the installed `current` one. */
export function isUpdateAvailable(current: string, latest: string): boolean {
  return compareVersions(latest, current) > 0;
}
