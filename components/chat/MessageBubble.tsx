"use client";

import type { UIMessage } from "ai";
import { isTextUIPart, isToolUIPart, getToolName } from "ai";
import { Component, useRef, useState } from "react";
import { toast } from "sonner";
import { Copy, Check, RefreshCw } from "lucide-react";
import { ToolCallGroup } from "./ToolCallGroup";
import { VisualCard } from "./VisualCard";
import { GeneratingIndicator } from "./GeneratingIndicator";
import { FollowupSuggestions } from "./FollowupSuggestions";
import { MarkdownRenderer } from "./MarkdownRenderer";
import {
  SessionFilesPresentCard,
  SessionFilesPresentLoading,
} from "./SessionFilesPresentCard";
import { cn } from "@/lib/utils";
import {
  AttachedFileCard,
  parseAttachments,
  stripAttachmentMarkdown,
} from "./AttachedFileCard";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

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

// ── Message actions (copy / regenerate) ────────────────────────────────

/**
 * Small circular copy button that reveals on hover. Copies `text` to the
 * clipboard and briefly flips to a checkmark.
 */
function CopyButton({ text, ariaLabel = "Copy message" }: { text: string; ariaLabel?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy to clipboard");
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={ariaLabel}
      title={ariaLabel}
      className="flex h-6.5 w-6.5 items-center justify-center rounded-md text-muted-foreground/55 transition-colors hover:bg-muted hover:text-foreground active:scale-90"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

/**
 * Regenerate button. If there are messages after this one, asks for
 * confirmation first (regenerating deletes them). Otherwise regenerates
 * immediately.
 */
function RegenerateButton({
  messageId,
  messagesAfter,
  onRegenerate,
}: {
  messageId: string;
  /** Number of messages that come after this one in the conversation. */
  messagesAfter: number;
  onRegenerate: (messageId: string) => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  const requestRegenerate = () => {
    if (messagesAfter > 0) {
      setConfirmOpen(true);
    } else {
      onRegenerate(messageId);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={requestRegenerate}
        aria-label="Regenerate response"
        title="Regenerate response"
        className="flex h-6.5 w-6.5 items-center justify-center rounded-md text-muted-foreground/55 transition-colors hover:bg-muted hover:text-foreground active:scale-90"
      >
        <RefreshCw className="h-3.5 w-3.5" />
      </button>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Regenerate response?</DialogTitle>
            <DialogDescription>
              {messagesAfter > 0
                ? `This will delete the ${messagesAfter} message${messagesAfter === 1 ? "" : "s"} after it and generate a new response.`
                : "Generate a new response to replace this one."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setConfirmOpen(false);
                onRegenerate(messageId);
              }}
            >
              <RefreshCw className="h-4 w-4" />
              Regenerate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Action bar shown under a message. Always visible with quiet styling so it
 * never reserves invisible space under tool-call-heavy messages.
 */
function MessageActionsRow({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-0.5",
        align === "right" ? "justify-end" : "justify-start",
      )}
    >
      {children}
    </div>
  );
}

// ── User message text — plain text, images only ────────────────────────

/**
 * Renders a user's message as plain text — no markdown formatting, so
 * typing `**bold**` or `# heading` shows the literal characters. The
 * only markdown honored is image syntax `![alt](url)`, which renders as
 * an actual inline image. Uploaded-file attachments are already extracted
 * into `AttachedFileCard`s, so any image markdown remaining here is an
 * external (non-upload) image.
 */
function UserMessageText({ text }: { text: string }) {
  // Split on image markdown so we can interleave plain text and <img>.
  const segments = text.split(/(!\[[^\]]*\]\([^)]+\))/g);

  return (
    <div className="whitespace-pre-wrap break-words">
      {segments.map((segment, idx) => {
        if (!segment) return null;
        const img = /^!\[([^\]]*)\]\(([^)]+)\)$/.exec(segment);
        if (img) {
          const url = img[2].trim();
          const alt = img[1].trim();
          return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={idx}
              src={url}
              alt={alt || url}
              loading="lazy"
              className="my-1 block max-w-full rounded-md border border-white/20"
            />
          );
        }
        return <span key={idx}>{segment}</span>;
      })}
    </div>
  );
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
  | { type: "visual"; part: UIMessage["parts"][number] }
  | { type: "sessionPresent"; part: UIMessage["parts"][number] }
  | { type: "suggestions"; data: unknown };

/**
 * Text this short between two tool calls is transitional filler (e.g.
 * "Hmm," or "Let me retry") — it gets absorbed so the calls read as one
 * back-to-back row. Anything longer is treated as real content that must
 * render between the groups.
 */
const SHORT_FILLER_MAX_CHARS = 150;
const SHORT_FILLER_MAX_WORDS = 24;

function isShortFiller(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) return true;
  const wordCount = trimmed.split(/\s+/).length;
  return trimmed.length <= SHORT_FILLER_MAX_CHARS && wordCount <= SHORT_FILLER_MAX_WORDS;
}

/**
 * Second pass over the raw segments: tool groups separated ONLY by short
 * filler text are merged into a single group (the filler is absorbed, so
 * the calls appear back-to-back). Text at the start or end of a message is
 * always preserved — only filler sitting *between* two tool groups is
 * dropped. Adjacent tool segments (e.g. after a real-text flush) merge too.
 */
function mergeInRowToolSegments(segments: Segment[]): Segment[] {
  const merged: Segment[] = [];
  let filler: Extract<Segment, { type: "text" }> | null = null;

  for (const seg of segments) {
    if (seg.type === "text") {
      if (filler) {
        // Consecutive text segments can't occur (first pass merges them),
        // but be defensive rather than silently dropping content.
        filler.text += seg.text;
      } else {
        filler = seg;
      }
      continue;
    }

    const last = merged[merged.length - 1];
    if (filler) {
      if (
        last?.type === "tool" &&
        seg.type === "tool" &&
        isShortFiller(filler.text)
      ) {
        // Filler sits between two tool groups — absorb it and merge them.
        // (Adjacent tool segments can't otherwise occur: pass 1 already
        // merges consecutive tool parts into one segment.)
        last.parts.push(...seg.parts);
      } else {
        merged.push(filler);
        merged.push(seg);
      }
      filler = null;
    } else {
      merged.push(seg);
    }
  }

  if (filler) merged.push(filler);
  return merged;
}

/**
 * Walk through `parts` in order and produce interleaved segments.
 * Consecutive text parts are merged into one text segment.
 * Consecutive tool parts are merged into one tool segment, and tool groups
 * separated only by short filler text are merged as well (see
 * `mergeInRowToolSegments`).
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
      } else if (part.text.trim().length === 0) {
        // Empty/whitespace-only text — the model frequently emits empty
        // text deltas around tool calls. It renders nothing visible, so drop
        // it instead of letting it split consecutive in-row tool calls into
        // separate cards. They merge into one group in real time.
        continue;
      } else {
        segments.push({ type: "text", text: part.text });
      }
    } else if (isToolUIPart(part)) {
      // Detect suggest_followups output and promote to inline followup card
      // instead of nesting inside a ToolCallGroup.
      const partObj = part as Record<string, unknown>;
      const partState = partObj.state as string | undefined;
      const partOutput = partObj.output;
      const isComplete =
        partState === "output-available" ||
        partState === "approval-responded";
      const isSuggestions =
        partOutput !== undefined &&
        partOutput !== null &&
        typeof partOutput === "object" &&
        (partOutput as Record<string, unknown>).type === "suggestions";

      if (isSuggestions && isComplete) {
        segments.push({ type: "suggestions", data: partOutput });
        continue;
      }

      // Detect create_visual tool calls and promote them to inline visual cards
      // instead of nesting them inside a ToolCallGroup.
      const toolName = (() => {
        try {
          return getToolName(part);
        } catch {
          return null;
        }
      })();

      const shortToolName =
        toolName === null ? null : toolName.toLowerCase().replace(/^.*__/, "");

      if (shortToolName === "create_visual") {
        segments.push({ type: "visual", part });
      } else if (
        shortToolName === "session_present_files" ||
        shortToolName === "session_present_file"
      ) {
        segments.push({ type: "sessionPresent", part });
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

  return mergeInRowToolSegments(segments);
}

export function MessageBubble({
  message,
  isStreaming,
  onRegenerate,
  messagesAfter,
}: {
  message: UIMessage;
  isStreaming?: boolean;
  /** Called with the message id to regenerate (AI messages only). */
  onRegenerate?: (messageId: string) => void;
  /** Number of messages that come after this one (used by the regenerate confirm). */
  messagesAfter?: number;
}) {
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
      <div className="group flex justify-end">
        <div className="flex max-w-[min(85%,36rem)] flex-col items-end gap-1">
          <div
            className={cn(
              "flex flex-col gap-2",
              // When there's text, wrap it in a rounded bubble
              hasText &&
                "rounded-2xl bg-primary px-3.5 py-2.5 text-[15px] leading-relaxed text-primary-foreground",
            )}
          >
            {/* Text content (if any) — plain text, only images render */}
            {hasText && <UserMessageText text={cleanText} />}

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
              <span className="text-sm text-primary-foreground/60">Sent a file</span>
            )}
          </div>
          {hasText && (
            <MessageActionsRow align="right">
              <CopyButton text={cleanText} ariaLabel="Copy message" />
            </MessageActionsRow>
          )}
        </div>
      </div>
    );
  }

  // ---- Assistant messages ----
  const segments = buildSegments(message.parts);
  const hasAnyContent = segments.length > 0;

  // If nothing to render yet, show a polished streaming placeholder.
  if (!hasAnyContent && isStreaming) {
    return (
      <GeneratingIndicator
        label="Generating response"
        variant="pill"
        className="animate-fade-in"
      />
    );
  }

  const showThinking = isStreaming && hasAnyContent;

  // Plain-text representation of the response (for the copy button): all
  // text parts joined, mirroring what the markdown renderer displays.
  const copyableText = message.parts
    .filter(isTextUIPart)
    .map((p) => p.text)
    .join("\n\n");

  return (
    <div className="group flex justify-start">
      <div className="w-full text-[15px] leading-relaxed text-foreground">
        {/* Render segments in their original interleaved order */}
        <div className="flex flex-col gap-3.5">
          {/* Render non-suggestions segments in their original interleaved order */}
          {segments
            .filter((s) => s.type !== "suggestions")
            .map((segment, idx) =>
              segment.type === "text" ? (
                <div
                  key={`text-${idx}`}
                  className="[&_.markdown-body]:text-[15px] [&_.markdown-body]:leading-[1.7]"
                >
                  <StreamingSafeMarkdown
                    content={segment.text}
                    isStreaming={isStreaming && idx === segments.length - 1}
                  />
                </div>
              ) : segment.type === "visual" ? (
                <VisualCardSegment key={`visual-${idx}`} part={segment.part} />
              ) : segment.type === "sessionPresent" ? (
                <SessionFilesPresentSegment
                  key={`present-${idx}`}
                  part={segment.part}
                />
              ) : (
                <ToolCallGroup key={`tool-${idx}`} parts={segment.parts as any} />
              ),
            )}

          {/* Suggestions always rendered at the bottom, cleanly separated */}
          {segments
            .filter((s): s is Segment & { type: "suggestions" } => s.type === "suggestions")
            .map((segment, idx) => (
              <div key={`suggestions-${idx}`} className="mt-0.5">
                <FollowupSuggestions data={segment.data} />
              </div>
            ))}
        </div>

        {/* Thinking indicator — shown under content while AI is still processing */}
        {showThinking && (
          <GeneratingIndicator label="Thinking" className="mt-10" />
        )}

        {/* Actions — hidden while the response is still streaming */}
        {!isStreaming && (hasAnyContent || copyableText.length > 0) && (
          <MessageActionsRow>
            {copyableText.length > 0 && (
              <CopyButton text={copyableText} ariaLabel="Copy response" />
            )}
            {onRegenerate && (
              <RegenerateButton
                messageId={message.id}
                messagesAfter={messagesAfter ?? 0}
                onRegenerate={onRegenerate}
              />
            )}
          </MessageActionsRow>
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
      <div className="overflow-hidden rounded-xl border border-border/55 bg-surface-2/40">
        <div className="flex items-center gap-2.5 px-3.5 py-3">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10">
            <svg className="h-3.5 w-3.5 animate-spin text-primary" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4 31.4" strokeLinecap="round" />
            </svg>
          </div>
          <span className="text-sm font-medium text-foreground">
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

// ── Session files present segment — extracts output from a session_present_files part ──

function SessionFilesPresentSegment({ part }: { part: UIMessage["parts"][number] }) {
  const partObj = part as Record<string, unknown>;
  const state = (partObj.state as string) ?? "call-result";
  const output = partObj.output;

  const isComplete = state === "output-available" || state === "approval-responded";
  const isError = state === "output-error";

  if (isError) {
    return (
      <div className="overflow-hidden rounded-xl border border-destructive/20 bg-destructive/[0.04] p-4 text-sm text-destructive">
        Session files could not be presented — the tool call encountered an error.
      </div>
    );
  }

  if (!isComplete) {
    return <SessionFilesPresentLoading />;
  }

  if (!output || typeof output !== "object") {
    return (
      <div className="overflow-hidden rounded-xl border border-destructive/20 bg-destructive/[0.04] p-4 text-sm text-destructive">
        Session files could not be rendered — unexpected output format.
      </div>
    );
  }

  return <SessionFilesPresentCard data={output} />;
}
