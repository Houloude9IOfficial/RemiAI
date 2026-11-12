// ---------------------------------------------------------------------------
// Helpers shared between FilePickerDialog and any file reference UI.
// ---------------------------------------------------------------------------

/** Format a file entry for display in the input text.
 *  Shows just the relative path from the root (e.g. `📄 main/package.json`)
 *  rather than including the root label, keeping the input clean.
 *  The AI resolves the correct root via `list_permitted_roots`. */
export function formatFileDisplay(entry: {
  rootLabel: string;
  relativePath: string;
  isDirectory: boolean;
}): string {
  const icon = entry.isDirectory ? "📁" : "📄";
  const path = entry.relativePath || entry.rootLabel;
  return `${icon} ${path}`;
}

/** Recognize only file routes belonging to the current conversation. */
export function sessionFileMentionPath(href: string, conversationId: number): string | null {
  const prefix = `/api/chat/${conversationId}/session-files/`;
  if (!href.startsWith(prefix)) return null;

  const [route, query] = href.slice(prefix.length).split(/[?#]/, 2);
  try {
    const segments = route === "raw"
      ? (new URLSearchParams(query).get("path") ?? "").split("/")
      : route.split("/").map(decodeURIComponent);
    if (segments.some((segment) =>
      !segment || segment === "." || segment === ".." || /[/\\\u0000-\u001f\u007f]/.test(segment)
    )) return null;
    if (segments.length === 1 && ["download", "content", "raw"].includes(segments[0])) return null;
    if (route.startsWith("canvas/") && route.split("/").length === 3 && route.endsWith("/download")) return null;
    return segments.join("/");
  } catch {
    return null;
  }
}
