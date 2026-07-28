"use client";

import type { UIMessage } from "ai";
import { isTextUIPart, isToolUIPart, getToolName } from "ai";
import { Component, useRef } from "react";
import { ToolCallGroup } from "./ToolCallGroup";
import { VisualCard } from "./VisualCard";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { cn } from "@/lib/utils";
import {
  AttachedFileCard,
  parseAttachments,
  stripAttachmentMarkdown,
} from "./AttachedFileCard";

// ── Helpers ───────────────────────────────────────────────────────────

/** Characters that are structurally significant to markdown syntax. */
const MARKDOWN_SYNTAX = new Set([
  "*", "#", "`", ">", "-", "_", "[", "]", "(", ")", "!", "~", "|", "\\", "&",
]);

/**
 * Wraps each non-markdown-syntax character in the `newChars` portion of
 * `text` in an individually animated `<span>`. The `prevLength` is the
 * number of already-rendered characters; everything beyond it gets the
 * letter-by-letter fade-in treatment.
 *
 * Characters that are part of markdown syntax (e.g. `*`, `#`, `` ` ``) are
 * left unwrapped so the markdown parser sees them natively.
 *
 * Returns a raw HTML string that markdown-to-jsx will pass through.
 */
function wrapNewCharsWithFadeIn(text: string, prevLength: number): string {
  if (prevLength >= text.length) return text;

  const before = text.slice(0, prevLength);
  const toWrap = text.slice(prevLength);

  let result = "";
  for (let i = 0; i < toWrap.length; i++) {
    const char = toWrap[i];
    // Skip wrapping for markdown structural characters and newlines
    if (MARKDOWN_SYNTAX.has(char) || char === "\n") {
      result += char;
    } else {
      const delay = i * 12; // 12ms between each character
      // Escape HTML special characters to prevent injection
      const escaped = char === "&" ? "&amp;" : char === "<" ? "&lt;" : char === ">" ? "&gt;" : char === '"' ? "&quot;" : char;
      result += `<span class="animate-letter-fade-in" style="animation-delay:${delay}ms;color:inherit">${escaped}</span>`;
    }
  }

  return before + result;
}

// ── Error boundary ────────────────────────────────────────────────────

/**
 * Error boundary that wraps the markdown renderer.
 * If markdown parsing throws (e.g. on malformed streaming content),
 * this falls back to rendering the raw text so the response is never
 * entirely invisible.
 */
class SafeMarkdown extends Component<
  { content: string; isStreaming?: boolean },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <p className="whitespace-pre-wrap">{this.props.content}</p>
      );
    }
    return (
      <MarkdownRenderer
        content={this.props.content}
        isStreaming={this.props.isStreaming}
      />
    );
  }
}

// ── Streaming-aware markdown wrapper ──────────────────────────────────

/**
 * Wraps SafeMarkdown to provide letter-by-letter fade-in for the last
 * streaming segment. Tracks the `prevLength` across renders so only
 * newly arrived characters get animated.
 */
function StreamingSafeMarkdown({ content, isStreaming }: { content: string; isStreaming?: boolean }) {
  const prevLengthRef = useRef(0);

  if (!isStreaming) {
    // Streaming done — reset tracker and render clean markdown
    prevLengthRef.current = 0;
    return <SafeMarkdown content={content} isStreaming={false} />;
  }

  // Text shrunk (e.g. error recovery / new stream starting) — reset
  if (content.length < prevLengthRef.current) {
    prevLengthRef.current = 0;
  }

  const prevLen = prevLengthRef.current;
  prevLengthRef.current = content.length;

  // Wrap newly arrived characters in individually animated spans
  const enriched = wrapNewCharsWithFadeIn(content, prevLen);

  return <SafeMarkdown content={enriched} isStreaming={true} />;
}

// ---------------------------------------------------------------------------
// Segment builder — preserves the original order of parts so text between
// tool calls actually renders *between* the tool call groups.
// ---------------------------------------------------------------------------

type Segment =
  | { type: "text"; text: string }
  | { type: "tool"; parts: UIMessage["parts"] }
  | { type: "visual"; part: UIMessage["parts"][number] };

/**
 * Walk through `parts` in order and produce interleaved segments.
 * Consecutive text parts are merged into one text segment.
 * Consecutive tool parts are merged into one tool segment.
 * All other part types (step-start, source, file) are skipped.
 */
function buildSegments(parts: UIMessage["parts"]): Segment[] {
  const segments: Segment[] = [];

  for (const part of parts) {
    if (isTextUIPart(part)) {
      const last = segments[segments.length - 1];
      if (last?.type === "text") {
        // Append to ongoing text segment (streaming appends text-deltas)
        last.text += part.text;
      } else {
        segments.push({ type: "text", text: part.text });
      }
    } else if (isToolUIPart(part)) {
      // Detect create_visual tool calls and promote them to inline visual cards
      // instead of nesting them inside a ToolCallGroup.
      const toolName = (() => {
        try {
          return getToolName(part);
        } catch {
          return null;
        }
      })();

      if (
        toolName !== null &&
        toolName.toLowerCase().replace(/^.*__/, "") === "create_visual"
      ) {
        segments.push({ type: "visual", part });
      } else {
        const last = segments[segments.length - 1];
        if (last?.type === "tool") {
          last.parts.push(part);
        } else {
          segments.push({ type: "tool", parts: [part] });
        }
      }
    }
    // Skip step-start, source, file parts
  }

  return segments;
}

export function MessageBubble({ message, isStreaming }: { message: UIMessage; isStreaming?: boolean }) {
  // ---- User messages ----
  if (message.role === "user") {
    const inlineText = message.parts
      .filter(isTextUIPart)
      .map((p) => p.text)
      .join("");
    if (!inlineText) return null;

    // Parse file attachments from markdown
    const attachments = parseAttachments(inlineText);
    const cleanText = stripAttachmentMarkdown(inlineText);
    const hasText = cleanText.length > 0;

    return (
      <div className="flex justify-end">
        <div
          className={cn(
            "max-w-[75%] flex flex-col gap-2",
            // When there's text, wrap it in a rounded bubble
            hasText &&
              "rounded-2xl bg-primary px-4 py-2 text-sm text-primary-foreground",
          )}
        >
          {/* Text content (if any) */}
          {hasText && (
            <div
              className={cn(
                "[&_.markdown-body]:[color:var(--primary-foreground)]",
                "[&_.markdown-body_img]:my-1 [&_.markdown-body_img]:rounded-md [&_.markdown-body_img]:border [&_.markdown-body_img]:border-white/20",
                "[&_.markdown-body_a]:text-primary-foreground/80 [&_.markdown-body_a]:underline [&_.markdown-body_a]:underline-offset-2",
                "[&_.markdown-body_p]:mb-0",
              )}
            >
              <MarkdownRenderer content={cleanText} />
            </div>
          )}

          {/* File attachments as polished cards */}
          {attachments.length > 0 && (
            <div
              className={cn(
                "flex flex-col gap-2",
                !hasText && "pt-0",
              )}
            >
              {attachments.map((att, idx) => (
                <AttachedFileCard
                  key={`${att.url}-${idx}`}
                  url={att.url}
                  name={att.name}
                  mimeType={att.mimeType}
                  inUserMessage={hasText}
                />
              ))}
            </div>
          )}

          {/* No text, no attachments — shouldn't happen, but handle gracefully */}
          {!hasText && attachments.length === 0 && (
            <span className="text-primary-foreground/60 text-sm">Sent a file</span>
          )}
        </div>
      </div>
    );
  }

  // ---- Assistant messages ----
  const segments = buildSegments(message.parts);
  const hasAnyContent = segments.length > 0;

  // If nothing to render yet, show a streaming placeholder.
if (!hasAnyContent) {
  return (
          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground/60">
            <div className="flex h-3 w-3 items-center justify-center">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground/40" />
            </div>
            Generating response...
          </div>
  );
}

  const showThinking = isStreaming && hasAnyContent;

  return (
    <div className="flex justify-start">
      <div className="w-full max-w-[85%] px-4 py-3 text-sm text-foreground">
        {/* Render segments in their original interleaved order */}
        <div className="flex flex-col gap-3">
          {segments.map((segment, idx) =>
            segment.type === "text" ? (
              <StreamingSafeMarkdown
                key={`text-${idx}`}
                content={segment.text}
                isStreaming={isStreaming && idx === segments.length - 1}
              />
            ) : segment.type === "visual" ? (
              <VisualCardSegment key={`visual-${idx}`} part={segment.part} />
            ) : (
              <ToolCallGroup key={`tool-${idx}`} parts={segment.parts as any} />
            ),
          )}
        </div>

        {/* Thinking indicator — shown under content while AI is still processing */}
        {showThinking && (
          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground/60">
            <div className="flex h-3 w-3 items-center justify-center">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground/40" />
            </div>
            Thinking...
          </div>
        )}
      </div>
    </div>
  );
}

// ── Visual card segment — extracts output from a create_visual tool part ──

function VisualCardSegment({ part }: { part: UIMessage["parts"][number] }) {
  // Safely extract output and state from the tool part
  const partObj = part as Record<string, unknown>;
  const state = (partObj.state as string) ?? "call-result";
  const output = partObj.output;

  const isComplete = state === "output-available" || state === "approval-responded";
  const isError = state === "output-error";

  // Show error state if the tool call failed
  if (isError) {
    return (
      <div className="overflow-hidden rounded-xl border border-destructive/20 bg-destructive/[0.04] p-4 text-sm text-destructive">
        Visual could not be generated — the tool call encountered an error.
      </div>
    );
  }

  // While the tool is still being called (input being constructed or executing),
  // show a compact loading placeholder so the user knows a visual is coming.
  if (!isComplete) {
    return (
      <div className="overflow-hidden rounded-xl border border-indigo-500/15 bg-indigo-500/[0.04]">
        <div className="flex items-center gap-2.5 px-3.5 py-3">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-indigo-500/10">
            <svg className="h-3.5 w-3.5 animate-spin text-indigo-500" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4 31.4" strokeLinecap="round" />
            </svg>
          </div>
          <span className="text-sm font-medium text-indigo-600 dark:text-indigo-400">
            Generating visual...
          </span>
        </div>
      </div>
    );
  }

  // Check that the output has the expected visual shape
  if (!output || typeof output !== "object") {
    return (
      <div className="overflow-hidden rounded-xl border border-destructive/20 bg-destructive/[0.04] p-4 text-sm text-destructive">
        Visual could not be rendered — unexpected output format.
      </div>
    );
  }

  const outputObj = output as Record<string, unknown>;
  if (outputObj.type !== "visual") {
    return (
      <div className="overflow-hidden rounded-xl border border-destructive/20 bg-destructive/[0.04] p-4 text-sm text-destructive">
        Visual could not be rendered — unexpected output type.
      </div>
    );
  }

  return <VisualCard data={output} />;
}
