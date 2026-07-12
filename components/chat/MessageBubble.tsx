"use client";

import type { UIMessage } from "ai";
import { isTextUIPart, isToolUIPart } from "ai";
import { ToolCallGroup } from "./ToolCallGroup";
import { MarkdownRenderer } from "./MarkdownRenderer";

/**
 * Collect consecutive tool parts into groups for rendering.
 * Non-tool parts (step-start, text, files, etc.) are skipped entirely.
 */
function collectToolGroups(parts: UIMessage["parts"]) {
  const groups: Array<{ parts: (typeof parts)[number][] }> = [];
  let currentGroup: (typeof parts)[number][] | null = null;

  for (const part of parts) {
    if (isToolUIPart(part)) {
      if (currentGroup) {
        currentGroup.push(part);
      } else {
        currentGroup = [part];
      }
    } else {
      if (currentGroup) {
        groups.push({ parts: currentGroup });
        currentGroup = null;
      }
    }
  }

  if (currentGroup) {
    groups.push({ parts: currentGroup });
  }

  return groups;
}

export function MessageBubble({ message }: { message: UIMessage }) {
  // ---- User messages ----
  if (message.role === "user") {
    const inlineText = message.parts
      .filter(isTextUIPart)
      .map((p) => p.text)
      .join("");
    if (!inlineText) return null;

    return (
      <div className="flex justify-end">
        <div className="max-w-[75%] rounded-2xl bg-primary px-4 py-2 text-sm text-primary-foreground">
          <p className="whitespace-pre-wrap">{inlineText}</p>
        </div>
      </div>
    );
  }

  // ---- Assistant messages ----
  // Join ALL text parts' .text properties (across all steps).
  // During streaming the last text part is mutated in-place by
  // text-delta events, so this is always up-to-date.
  const fullText = message.parts
    .filter(isTextUIPart)
    .map((p) => p.text)
    .join("");

  const toolGroups = collectToolGroups(message.parts);
  const hasToolGroups = toolGroups.length > 0;
  const hasText = fullText.trim().length > 0;

  // If nothing to render yet, show a streaming placeholder.
  // The parent MessageList handles the visible placeholder while
  // streaming is in progress. We just need the DOM node to exist
  // so React can populate it when content arrives.
  if (!hasToolGroups && !hasText) {
    return (
      <div className="flex justify-start">
        <div className="w-full max-w-[85%] text-sm text-foreground px-4 py-2">
          <div className="flex items-center gap-2">
            <div className="flex h-4 w-4 items-center justify-center">
              <span className="h-2 w-2 animate-pulse rounded-full bg-muted-foreground/40" />
            </div>
            <span className="text-muted-foreground/60">
              Generating response...
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="w-full max-w-[85%] text-sm text-foreground px-4 py-2">
        {/* Tool call groups */}
        {hasToolGroups && (
          <div className="mb-2 flex flex-col gap-2">
            {toolGroups.map((group, idx) => (
              <ToolCallGroup key={idx} parts={group.parts as any} />
            ))}
          </div>
        )}

        {/* Text content */}
        {hasText && <p className="whitespace-pre-wrap">{fullText}</p>}
      </div>
    </div>
  );
}
