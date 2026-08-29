"use client";

import type { UIMessage } from "ai";
import { isTextUIPart, isToolUIPart, isReasoningUIPart, getToolName } from "ai";
import { Component, useRef, useState } from "react";
import { toast } from "sonner";
import { Copy, Check, RefreshCw } from "lucide-react";
import { ToolCallGroup } from "./ToolCallGroup";
import { VisualCard } from "./VisualCard";
import { GeneratingIndicator } from "./GeneratingIndicator";
import { ReasoningBlock } from "./ReasoningBlock";
import { FollowupSuggestions } from "./FollowupSuggestions";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { ImagePreview } from "./ImagePreview";
import { SourceEvidenceCard } from "./SourceEvidenceCard";
import {
  collectMessageSources,
  stripTrailingSourcesSection,
  wrapBareSourceUrls,
  type CitationRef,
} from "@/lib/chat/citations";
import {
  SessionFilesPresentCard,
  SessionFilesPresentLoading,
} from "./SessionFilesPresentCard";
import {
  CanvasPresentCard,
  CanvasPresentLoading,
} from "./CanvasPresentCard";
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
 * Whitespace is ALSO left unwrapped: markdown-to-jsx silently drops space
 * characters that sit inside an inline HTML tag (`<span> </span>` renders
 * as an empty tag), which glued words together into "Hi,mynameis" while
 * streaming. Plain-text whitespace between spans is preserved.
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
    // Skip wrapping for markdown structural characters and whitespace
    // (spaces, tabs, newlines — `\s` covers all of them).
    if (MARKDOWN_SYNTAX.has(char) || /\s/.test(char)) {
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
  {
    content: string;
    isStreaming?: boolean;
    citations?: Map<string, CitationRef> | null;
  },
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
        citations={this.props.citations}
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
 * Action bar shown under a message. On desktop the buttons stay hidden until
 * the message is hovered (or a button is focused via keyboard) for a cleaner
 * look; on mobile — where hover doesn't exist — they're always visible.
 * Opacity (not `hidden`) is used so the row keeps its layout space and the
 * reveal fades in smoothly.
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
        "md:opacity-0 md:transition-opacity md:duration-200 md:group-hover:opacity-100 md:focus-within:opacity-100",
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
            <ImagePreview
              key={idx}
              src={url}
              url={url}
              alt={alt || url}
              className="block max-w-full"
              imgClassName="my-1 block max-w-full rounded-md border border-white/20"
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
function StreamingSafeMarkdown({
  content,
  isStreaming,
  citations,
}: {
  content: string;
  isStreaming?: boolean;
  citations?: Map<string, CitationRef> | null;
}) {
  const prevLengthRef = useRef(0);

  if (!isStreaming) {
    // Streaming done — reset tracker and render clean markdown
    // eslint-disable-next-line react-hooks/refs -- render-time animation bookkeeping must use the previous streamed length
    prevLengthRef.current = 0;
    return <SafeMarkdown content={content} isStreaming={false} citations={citations} />;
  }

  // Text shrunk (e.g. error recovery / new stream starting) — reset
  // eslint-disable-next-line react-hooks/refs -- render-time animation bookkeeping must compare the previous streamed length
  if (content.length < prevLengthRef.current) {
    // eslint-disable-next-line react-hooks/refs -- render-time animation bookkeeping resets the previous streamed length
    prevLengthRef.current = 0;
  }

  // eslint-disable-next-line react-hooks/refs -- render-time animation bookkeeping reads the previous streamed length
  const prevLen = prevLengthRef.current;
  // eslint-disable-next-line react-hooks/refs -- render-time animation bookkeeping stores the current streamed length
  prevLengthRef.current = content.length;

  // Wrap newly arrived characters in individually animated spans
  const enriched = wrapNewCharsWithFadeIn(content, prevLen);

  return <SafeMarkdown content={enriched} isStreaming={true} citations={citations} />;
}

// ---------------------------------------------------------------------------
// Segment builder — preserves the original order of parts so text between
// tool calls actually renders *between* the tool call groups.
// ---------------------------------------------------------------------------

type Segment =
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string; isStreaming: boolean }
  | { type: "tool"; parts: UIMessage["parts"] }
  | { type: "visual"; part: UIMessage["parts"][number] }
  | { type: "sessionPresent"; part: UIMessage["parts"][number] }
  | { type: "canvasPresent"; part: UIMessage["parts"][number] }
  | { type: "suggestions"; data: unknown }
  | { type: "sources"; data: unknown };

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
 * Combine EVERY reasoning segment in a message into a single reasoning block.
 * Multi-step runs emit one reasoning part per step (interleaved with tools),
 * so without this pass a message shows 2+ stacked "Reasoning..." disclosures.
 * The merged block sits where the FIRST reasoning appeared; each step's
 * reasoning is separated by a blank paragraph. Streaming state is OR'd across
 * all steps, so the block stays open while any step is still reasoning.
 */
function mergeReasoningSegments(segments: Segment[]): Segment[] {
  const merged: Segment[] = [];
  let combined: Extract<Segment, { type: "reasoning" }> | null = null;
  let combinedInserted = false;

  for (const seg of segments) {
    if (seg.type === "reasoning") {
      if (combined) {
        combined.text += "\n\n" + seg.text;
        combined.isStreaming = combined.isStreaming || seg.isStreaming;
      } else {
        combined = { type: "reasoning", text: seg.text, isStreaming: seg.isStreaming };
      }
      // Insert the merged block at the position of the FIRST reasoning
      // segment; every later reasoning segment accumulates into it.
      if (!combinedInserted) {
        merged.push(combined);
        combinedInserted = true;
      }
      continue;
    }
    merged.push(seg);
  }
  if (combined && !combinedInserted) merged.push(combined);
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
    if (isReasoningUIPart(part)) {
      const reasoningText = part.text ?? "";
      if (!reasoningText.trim()) continue;
      const last = segments[segments.length - 1];
      const reasoningStreaming = part.state === "streaming";
      if (last?.type === "reasoning") {
        last.text += reasoningText;
        last.isStreaming = last.isStreaming || reasoningStreaming;
      } else {
        segments.push({
          type: "reasoning",
          text: reasoningText,
          isStreaming: reasoningStreaming,
        });
      }
    } else if (isTextUIPart(part)) {
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
      const hasSources =
        isComplete &&
        partOutput !== undefined &&
        partOutput !== null &&
        typeof partOutput === "object" &&
        Array.isArray((partOutput as Record<string, unknown>).sources) &&
        ((partOutput as Record<string, unknown>).sources as unknown[]).length > 0;

      if (isSuggestions && isComplete) {
        segments.push({ type: "suggestions", data: partOutput });
        continue;
      }
      if (hasSources) {
        segments.push({ type: "sources", data: partOutput });
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
      } else if (
        shortToolName === "canvas_create" ||
        shortToolName === "canvas_open" ||
        shortToolName === "canvas_add_file"
      ) {
        segments.push({ type: "canvasPresent", part });
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

  // Deduplicate canvas present cards: keep only the LAST one so the user
  // sees a single card at the end of the message, not one per canvas_* call.
  const lastCanvasIdx = segments.findLastIndex((s) => s.type === "canvasPresent");
  if (lastCanvasIdx >= 0) {
    const deduped = segments.filter((s, i) => s.type !== "canvasPresent" || i === lastCanvasIdx);
    return mergeReasoningSegments(mergeInRowToolSegments(deduped));
  }

  return mergeReasoningSegments(mergeInRowToolSegments(segments));
}

export function MessageBubble({
  message,
  isStreaming,
  onRegenerate,
  messagesAfter,
  conversationId,
}: {
  message: UIMessage;
  isStreaming?: boolean;
  /** Called with the message id to regenerate (AI messages only). */
  onRegenerate?: (messageId: string) => void;
  /** Number of messages that come after this one (used by the regenerate confirm). */
  messagesAfter?: number;
  /** Conversation id used by chat-scoped evidence export actions. */
  conversationId?: number;
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

    // Images go in a side-by-side grid; other files stay stacked below.
    const imageAttachments = attachments.filter((a) => a.isImage);
    const fileAttachments = attachments.filter((a) => !a.isImage);

    return (
      <div className="group flex justify-end">
        <div className="flex max-w-[min(85%,36rem)] flex-col items-end gap-1">
          <div
            className={cn(
              "flex flex-col gap-2",
              // When there's text, wrap it in a rounded bubble
              hasText &&
                "rounded-4xl bg-primary px-3.5 py-2.5 text-[15px] leading-relaxed text-primary-foreground",
            )}
          >
            {/* Text content (if any) — plain text, only images render */}
            {hasText && <UserMessageText text={cleanText} />}

            {/* Image attachments — side-by-side grid when multiple */}
            {imageAttachments.length > 0 && (
              <div
                className={cn(
                  "grid gap-2",
                  imageAttachments.length > 1
                    ? "grid-cols-2"
                    : "grid-cols-1",
                )}
              >
                {imageAttachments.map((att, idx) => (
                  <AttachedFileCard
                    key={`${att.url}-${idx}`}
                    url={att.url}
                    name={att.name}
                    mimeType={att.mimeType}
                    inUserMessage={hasText}
                    thumbnail={imageAttachments.length > 1}
                  />
                ))}
              </div>
            )}

            {/* Other file attachments as cards */}
            {fileAttachments.length > 0 && (
              <div className="flex flex-col gap-2">
                {fileAttachments.map((att, idx) => (
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

  // True once the model has stopped thinking and started writing its final
  // answer: a text part is actively streaming and no reasoning part is still
  // streaming. The reasoning block collapses the moment this flips on.
  const responseStreaming =
    isStreaming &&
    message.parts.some(
      (part) => isTextUIPart(part) && part.state === "streaming",
    ) &&
    !message.parts.some(
      (part) => isReasoningUIPart(part) && part.state === "streaming",
    );

  // If nothing to render yet, show a polished streaming placeholder.
  if (!hasAnyContent && isStreaming) {
    return (
      <GeneratingIndicator
        label="Thinking"
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

  // The AI can call suggest_followups multiple times per response — only the
  // LAST completed set is shown so duplicate followup cards never stack.
  const suggestionSegments = segments.filter(
    (s): s is Segment & { type: "suggestions" } => s.type === "suggestions",
  );
  const lastSuggestion =
    suggestionSegments.length > 0
      ? suggestionSegments[suggestionSegments.length - 1]
      : undefined;

  // Sources this message's tools actually retrieved — numbered, deduped, and
  // used for BOTH the inline citation chips and the single aggregated
  // Sources card (per-tool "sources" segments are folded into it).
  const messageSources = collectMessageSources(message.parts);
  const hasRetrievedSources = messageSources.list.length > 0;

  // Segments that render in the message body — suggestions and sources are
  // hoisted out (suggestions to the bottom, sources into one card).
  const renderableSegments = segments.filter(
    (s): s is Exclude<Segment, { type: "suggestions" } | { type: "sources" }> =>
      s.type !== "suggestions" && s.type !== "sources",
  );

  return (
    <div className="group flex justify-start">
      <div className="w-full text-[15px] leading-relaxed text-foreground">
        {/* Render segments in their original interleaved order */}
        <div className="flex flex-col gap-3.5">
          {/* Render non-suggestions/non-sources segments in their original
              interleaved order */}
          {renderableSegments.map((segment, idx) =>
            segment.type === "text" ? (
              <div
                key={`text-${idx}`}
                className="[&_.markdown-body]:text-[15px] [&_.markdown-body]:leading-[1.7]"
              >
                <StreamingSafeMarkdown
                  content={
                    hasRetrievedSources
                      ? wrapBareSourceUrls(
                          stripTrailingSourcesSection(segment.text),
                          messageSources.byUrl,
                        )
                      : segment.text
                  }
                  isStreaming={
                    isStreaming && idx === renderableSegments.length - 1
                  }
                  citations={messageSources.byUrl}
                />
              </div>
            ) : segment.type === "reasoning" ? (
              <ReasoningBlock
                key={`reasoning-${idx}`}
                text={segment.text}
                isStreaming={segment.isStreaming}
                // Whole-message streaming keeps the single merged block open
                // across tool gaps between reasoning phases, and is what
                // finalizes the accumulated duration when the run completes.
                messageStreaming={isStreaming}
                // Collapse the block the moment the final answer starts
                // generating (text streaming, no reasoning left).
                responseStreaming={responseStreaming}
              />
            ) : segment.type === "visual" ? (
              <VisualCardSegment key={`visual-${idx}`} part={segment.part} />
            ) : segment.type === "sessionPresent" ? (
              <SessionFilesPresentSegment
                key={`present-${idx}`}
                part={segment.part}
              />
            ) : segment.type === "canvasPresent" ? (
              <CanvasPresentSegment key={`canvas-${idx}`} part={segment.part} />
            ) : (
              <ToolCallGroup
                key={`tool-${idx}`}
                parts={segment.parts as unknown as Parameters<typeof ToolCallGroup>[0]["parts"]}
              />
            ),
          )}

          {/* Aggregated Sources card — the full numbered list behind the
              inline citation chips. The model's own trailing Sources section
              is stripped from the text above so this is the single list. */}
          {hasRetrievedSources && (
            <SourceEvidenceCard
              key="sources-card"
              data={{ sources: messageSources.list }}
              conversationId={conversationId}
            />
          )}

          {/* Suggestions only appear once the ENTIRE response has finished
              streaming. The model often calls suggest_followups mid-run —
              right after a tool executes, while it is still reasoning and
              writing — so without this gate the card pops up before the
              run ends. The AI can call it multiple times per response; only
              the LAST set is shown so duplicate cards never stack. */}
          {lastSuggestion && !isStreaming && (
            <div key="suggestions-last" className="mt-0.5">
              <FollowupSuggestions data={lastSuggestion.data} />
            </div>
          )}
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

// ── Canvas present segment — extracts output from canvas_* tool parts ──

function CanvasPresentSegment({ part }: { part: UIMessage["parts"][number] }) {
  const partObj = part as Record<string, unknown>;
  const state = (partObj.state as string) ?? "call-result";
  const output = partObj.output;

  const isComplete = state === "output-available" || state === "approval-responded";
  const isError = state === "output-error";

  if (isError) {
    return (
      <div className="overflow-hidden rounded-xl border border-destructive/20 bg-destructive/[0.04] p-4 text-sm text-destructive">
        Canvas could not be prepared — the tool call encountered an error.
      </div>
    );
  }

  if (!isComplete) {
    return <CanvasPresentLoading />;
  }

  if (!output || typeof output !== "object") {
    return (
      <div className="overflow-hidden rounded-xl border border-destructive/20 bg-destructive/[0.04] p-4 text-sm text-destructive">
        Canvas could not be rendered — unexpected output format.
      </div>
    );
  }

  return <CanvasPresentCard data={output} />;
}
