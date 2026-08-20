import { NextResponse } from "next/server";
import type { LatestRelease } from "@/lib/updates";

const REPO = "Houloude9IOfficial/RemiAI";
const GITHUB_API_URL = `https://api.github.com/repos/${REPO}/releases/latest`;

interface GithubRelease {
  tag_name?: string;
  name?: string | null;
  body?: string | null;
  published_at?: string | null;
  html_url?: string;
  assets?: Array<{
    name?: string;
    browser_download_url?: string;
    size?: number;
  }>;
}

interface CachedRelease {
  release: GithubRelease;
  fetchedAt: number;
}

// In-memory cache so several clients/tabs hitting the route don't each burn a
// GitHub API call — the unauthenticated rate limit is 60 requests/hr per IP.
// Clients re-check every 6h anyway, so a short TTL is just a thundering-herd
// guard, not the source of freshness.
let cached: CachedRelease | null = null;
const CACHE_TTL_MS = 30 * 60 * 1000;

export async function GET() {
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return NextResponse.json(toPayload(cached.release));
  }

  try {
    const res = await fetch(GITHUB_API_URL, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "RemiAI",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      next: { revalidate: 0 },
    });

    if (!res.ok) {
      throw new Error(`GitHub API responded with ${res.status}`);
    }

    const release = (await res.json()) as GithubRelease;
    cached = { release, fetchedAt: Date.now() };
    return NextResponse.json(toPayload(release));
  } catch (err) {
    // Never break the app because GitHub is unreachable — the client treats a
    // failed check as "no update info".
    console.error("[updates] Failed to fetch latest release:", err);
    return NextResponse.json(
      { error: "Failed to check for updates" },
      { status: 502 },
    );
  }
}

function toPayload(release: GithubRelease): LatestRelease {
  const tagName = release.tag_name ?? "";
  return {
    tagName,
    version: tagName.replace(/^v/i, ""),
    name: release.name ?? tagName,
    body: release.body ?? "",
    publishedAt: release.published_at ?? "",
    htmlUrl: release.html_url ?? `https://github.com/${REPO}/releases/latest`,
    assets: (release.assets ?? [])
      .filter((asset) => asset.browser_download_url)
      .map((asset) => ({
        name: asset.name ?? "",
        url: asset.browser_download_url as string,
        size: asset.size ?? 0,
      })),
  };
}
