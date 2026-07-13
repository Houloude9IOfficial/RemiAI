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
