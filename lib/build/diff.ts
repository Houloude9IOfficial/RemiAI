export const MAX_DIFF_PREVIEW_LINES = 48;
export const MAX_DIFF_PREVIEW_CHARS = 4_000;

function splitLines(content: string): string[] {
  if (!content) return [];
  const lines = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  // A terminal newline is a delimiter, not an extra user-visible line.
  if (lines.at(-1) === "") lines.pop();
  return lines;
}

/**
 * Create a compact, bounded preview for a single text-file change.
 *
 * This intentionally shows the changed middle block rather than attempting a
 * full Myers diff. Build runs may write large files, so the helper stays
 * predictable and never stores unbounded file contents in the run record.
 */
export function buildBoundedLineDiff(
  before: string,
  after: string,
  options: {
    maxLines?: number;
    maxChars?: number;
  } = {},
): string | undefined {
  const maxLines = Math.max(1, options.maxLines ?? MAX_DIFF_PREVIEW_LINES);
  const maxChars = Math.max(80, options.maxChars ?? MAX_DIFF_PREVIEW_CHARS);
  const beforeLines = splitLines(before);
  const afterLines = splitLines(after);

  let prefix = 0;
  while (
    prefix < beforeLines.length &&
    prefix < afterLines.length &&
    beforeLines[prefix] === afterLines[prefix]
  ) {
    prefix++;
  }

  let suffix = 0;
  while (
    suffix < beforeLines.length - prefix &&
    suffix < afterLines.length - prefix &&
    beforeLines[beforeLines.length - 1 - suffix] ===
      afterLines[afterLines.length - 1 - suffix]
  ) {
    suffix++;
  }

  const removed = beforeLines.slice(prefix, beforeLines.length - suffix);
  const added = afterLines.slice(prefix, afterLines.length - suffix);
  if (removed.length === 0 && added.length === 0) return undefined;

  const lines = [`@@ -${removed.length} +${added.length} @@`];
  let truncated = false;
  const append = (prefixChar: "-" | "+", value: string) => {
    if (lines.length >= maxLines) {
      truncated = true;
      return;
    }
    const next = `${prefixChar} ${value}`;
    const currentLength = lines.join("\n").length;
    if (currentLength + next.length + 1 > maxChars) {
      truncated = true;
      return;
    }
    lines.push(next);
  };

  for (const line of removed) append("-", line);
  for (const line of added) append("+", line);

  if (truncated) lines.push("… diff preview truncated …");
  return lines.join("\n");
}
