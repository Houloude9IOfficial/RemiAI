import { NextRequest, NextResponse } from "next/server";
import { getPermittedRoots, getRootById, listDirectory } from "@/lib/fs/access";

export type BrowseEntry = {
  name: string;
  relativePath: string;
  isDirectory: boolean;
  rootId: number;
  rootLabel: string;
};

/**
 * GET /api/directories/browse
 *
 * Returns files and directories from configured roots, suitable for the
 * @-mention file picker in the chat input.
 *
 * Query params:
 *   rootId     — optional, filter to a single root (default: all roots)
 *   relativePath — optional, browse a subdirectory within the root (rootId required)
 *   depth      — optional, how deep to recurse (default: 1, max: 3)
 *
 * Each entry includes:
 *   name         — display name (file or folder name)
 *   relativePath — path relative to the root
 *   isDirectory  — whether it's a directory
 *   rootId       — which root it belongs to
 *   rootLabel    — the root's label for display
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const rootIdParam = searchParams.get("rootId");
  const relativePath = searchParams.get("relativePath") ?? undefined;
  const depthParam = searchParams.get("depth");
  const depth = depthParam ? Math.min(Math.max(parseInt(depthParam, 10) || 1, 1), 3) : 1;

  try {
    let roots = await getPermittedRoots();

    if (rootIdParam) {
      const root = await getRootById(Number(rootIdParam));
      roots = [root];
    } else {
      // For "all roots" view, only show the roots themselves (depth 0)
      const entries: BrowseEntry[] = roots.map((r) => ({
        name: r.label,
        relativePath: "",
        isDirectory: true,
        rootId: r.id,
        rootLabel: r.label,
      }));
      return NextResponse.json({ roots: entries });
    }

    if (roots.length === 0) {
      return NextResponse.json({ roots: [], entries: [] });
    }

    const root = roots[0];
    const entries = await browseDirectory(root, relativePath ?? "", depth);

    return NextResponse.json({ roots: [], entries });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to browse directory";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Recursively collect files and directories for browsing.
 * Accepts a full root object to avoid redundant DB re-fetches on recursion.
 */
async function browseDirectory(
  root: { id: number; label: string; path: string; canRead: boolean; canWrite: boolean },
  relativePath: string,
  depth: number,
): Promise<BrowseEntry[]> {
  const entries = await listDirectory(root, relativePath || null);

  const results: BrowseEntry[] = [];
  for (const entry of entries) {
    const entryRelativePath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
    results.push({
      name: entry.name,
      relativePath: entryRelativePath,
      isDirectory: entry.isDirectory,
      rootId: root.id,
      rootLabel: root.label,
    });

    // Recurse into directories if we have depth remaining
    if (entry.isDirectory && depth > 1) {
      const children = await browseDirectory(root, entryRelativePath, depth - 1);
      results.push(...children);
    }
  }

  return results;
}
