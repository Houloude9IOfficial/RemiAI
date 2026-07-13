"use client";

import type { UIMessage } from "ai";
import { isTextUIPart, isToolUIPart } from "ai";
import { Component, useRef } from "react";
import { ToolCallGroup } from "./ToolCallGroup";
import { MarkdownRenderer } from "./MarkdownRenderer";

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
      result += `<span class="animate-letter-fade-in" style="animation-delay:${delay}ms">${escaped}</span>`;
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
  | { type: "tool"; parts: UIMessage["parts"] };

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
      const last = segments[segments.length - 1];
      if (last?.type === "tool") {
        last.parts.push(part);
      } else {
        segments.push({ type: "tool", parts: [part] });
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

    return (
      <div className="flex justify-end">
        <div className="max-w-[75%] rounded-2xl bg-primary px-4 py-2 text-sm text-primary-foreground">
          <p className="whitespace-pre-wrap">{inlineText}</p>
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
      <div className="flex justify-start">
        <div className="w-full max-w-[85%] px-4 py-3 text-sm">
          <div className="flex items-center gap-2">
            <div className="flex h-4 w-4 items-center justify-center">
              <span className="h-2 w-2 animate-pulse rounded-full bg-muted-foreground/40" />
            </div>
            <span className="text-xs text-muted-foreground/60">
              Generating response...
            </span>
          </div>
        </div>
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
