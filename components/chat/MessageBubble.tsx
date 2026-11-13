"use client";

import type { UIMessage } from "ai";
import { isTextUIPart, isToolUIPart, getToolName } from "ai";
import { Component, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { Copy, Check, Play, RefreshCw, Pencil, X, ChevronDown, ChevronUp } from "lucide-react";
import { extractFileChanges } from "./ToolActivity";
import { ToolCallCard } from "./ToolCallCard";
import { WorkActivity } from "./WorkActivity";
import { latestWorkActivity, partitionWorkText } from "@/lib/chat/work-activity";
import { VisualCard } from "./VisualCard";
import { RemiCard } from "./RemiCard";
import { FollowupSuggestions } from "./FollowupSuggestions";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { ImagePreview } from "./ImagePreview";
import { ResponseDetails } from "./SourceEvidenceCard";
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
import { isRemiCardOutput, remiCardPartIdentity } from "@/lib/chat/card-identity";
import { isSearchTraceToolPart } from "@/lib/chat/search-trace";
import { formatResponseTokens, messageResponseUsage } from "@/lib/chat/response-usage";
import { getStreamDisplayCharsPerSecond } from "@/lib/chat/stream-display-rate";
import {
  formatRequestCompletionTime,
  formatRequestDuration,
  localDateKey,
  messageRequestTiming,
  type RequestTiming,
} from "@/lib/chat/request-duration";

// ── Helpers ───────────────────────────────────────────────────────────

/**
 * Decouples visible text from provider deltas. The display can never outrun
 * this clock, so a fast response remains legible; a slow response is shown as
 * soon as each new character becomes available. Once the provider finishes,
 * a buffered tail accelerates enough to clear within five seconds.
 */
function useSmoothedStreamContent(
  content: string,
  sourceStreaming: boolean,
  messageStreaming: boolean,
) {
  const [visibleLength, setVisibleLength] = useState(() =>
    sourceStreaming ? 0 : content.length,
  );
  const visibleLengthRef = useRef(visibleLength);
  const previousContentRef = useRef(content);
  // Provider deltas can arrive faster than the browser paints. The animation
  // loop reads this ref so each delta does not cancel and restart that loop.
  const contentRef = useRef(content);

  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  useEffect(() => {
    const previousContent = previousContentRef.current;
    previousContentRef.current = content;

    // A recovered stream can be shorter than the old buffer. Keep the portion
    // already revealed when possible so a transient replacement never makes
    // the entire response appear to restart from the beginning.
    if (content.length < previousContent.length) {
      const nextLength = Math.min(visibleLengthRef.current, content.length);
      visibleLengthRef.current = nextLength;
      setVisibleLength(nextLength);
    }
  }, [content, sourceStreaming]);

  // A background question reply can be replaced by a longer saved snapshot
  // after the animation has already stopped. Restart the idle buffer then.
  const settledContentLength = sourceStreaming ? 0 : content.length;
  useEffect(() => {
    const initialContentLength = sourceStreaming ? contentRef.current.length : settledContentLength;
    if (!sourceStreaming && visibleLengthRef.current >= initialContentLength) return;

    const remainingCharacters = initialContentLength - visibleLengthRef.current;
    const charactersPerSecond = getStreamDisplayCharsPerSecond(
      remainingCharacters,
      messageStreaming,
    );
    let frame = 0;
    let previousTime: number | null = null;
    let carry = 0;
    const advance = (time: number) => {
      if (previousTime !== null) {
        carry += ((time - previousTime) * charactersPerSecond) / 1000;
        const count = Math.floor(carry);
        if (count > 0) {
          carry -= count;
          const nextLength = Math.min(
            contentRef.current.length,
            visibleLengthRef.current + count,
          );
          visibleLengthRef.current = nextLength;
          setVisibleLength(nextLength);
        }
      }
      previousTime = time;
      // Keep the loop ready while this text part is active, even if it has
      // caught up with the latest delta; more text may arrive next frame.
      if (sourceStreaming || visibleLengthRef.current < contentRef.current.length) {
        frame = requestAnimationFrame(advance);
      }
    };
    frame = requestAnimationFrame(advance);
    return () => cancelAnimationFrame(frame);
  }, [sourceStreaming, messageStreaming, settledContentLength]);

  const displayStreaming = sourceStreaming || visibleLength < content.length;
  return {
    content: content.slice(0, visibleLength),
    isStreaming: displayStreaming,
  };
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
    conversationId?: number;
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
        conversationId={this.props.conversationId}
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
      className="flex h-6.5 w-6.5 items-center justify-center rounded-md text-muted-foreground/55 transition-colors hover:text-foreground active:scale-90"
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
        className="flex h-6.5 w-6.5 items-center justify-center rounded-md text-muted-foreground/55 transition-colors hover:text-foreground active:scale-90"
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
  alwaysVisible = false,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  alwaysVisible?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-0.5",
        align === "right" ? "justify-end" : "justify-start",
        !alwaysVisible &&
          "md:opacity-0 md:transition-opacity md:duration-200 md:group-hover:opacity-100 md:focus-within:opacity-100",
      )}
    >
      {children}
    </div>
  );
}

const localDaySubscribers = new Set<() => void>();
let localDayTimer: ReturnType<typeof setInterval> | null = null;

function subscribeToLocalDay(callback: () => void) {
  localDaySubscribers.add(callback);
  if (localDayTimer === null) {
    localDayTimer = setInterval(() => {
      for (const subscriber of localDaySubscribers) subscriber();
    }, 60_000);
  }
  return () => {
    localDaySubscribers.delete(callback);
    if (localDaySubscribers.size === 0 && localDayTimer !== null) {
      clearInterval(localDayTimer);
      localDayTimer = null;
    }
  };
}

function RequestTimingLabel({ timing, showDuration, usage }: {
  timing: RequestTiming | null;
  showDuration: boolean;
  usage: ReturnType<typeof messageResponseUsage>;
}) {
  // Use the browser's local day after hydration so a server timezone cannot
  // render a different "today" label. The shared timer updates open chats
  // when their local calendar day changes.
  const todayKey = useSyncExternalStore(
    subscribeToLocalDay,
    () => localDateKey(new Date()),
    () => null,
  );
  const duration = timing ? formatRequestDuration(timing.durationMs) : null;
  const completedTime = timing?.completedAt && todayKey
    ? formatRequestCompletionTime(timing.completedAt, todayKey)
    : null;
  const label = [
    showDuration && duration && `Total request time: ${duration}`,
    completedTime && `Completed ${completedTime}`,
    usage.inputTokens !== undefined && `${usage.inputTokens.toLocaleString("en-US")} input tokens`,
    usage.outputTokens !== undefined && `${usage.outputTokens.toLocaleString("en-US")} output tokens`,
  ].filter(Boolean).join(" · ");
  if (!label) return null;

  return (
    <span className="ml-1 text-[11px] text-muted-foreground/70 tabular-nums" title={label} aria-label={label}>
      {showDuration && duration && <>· {duration}</>}{completedTime && <> · {completedTime}</>}
      {usage.inputTokens !== undefined && <> · {formatResponseTokens(usage.inputTokens)} Input</>}
      {usage.outputTokens !== undefined && <> · {formatResponseTokens(usage.outputTokens)} Output</>}
    </span>
  );
}

// ── User message text — plain text, images only ────────────────────────

function EditMessageForm({
  initialText,
  onCancel,
  onSave,
}: {
  initialText: string;
  onCancel: () => void;
  onSave: (text: string) => void;
}) {
  const [text, setText] = useState(initialText);
  const textareaId = useId();
  const canSave = text.trim().length > 0;

  const save = () => {
    if (canSave) onSave(text);
  };

  return (
    <form
      className="w-full min-w-0 rounded-2xl border border-primary/30 bg-muted/30 p-3 shadow-sm"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <label htmlFor={textareaId} className="text-sm font-medium text-foreground">
          Edit message
        </label>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {text.length.toLocaleString()} characters
        </span>
      </div>
      <textarea
        id={textareaId}
        autoFocus
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && !event.nativeEvent.isComposing) {
            event.preventDefault();
            onCancel();
          }
          if (
            event.key === "Enter" &&
            (event.metaKey || event.ctrlKey) &&
            !event.nativeEvent.isComposing
          ) {
            event.preventDefault();
            save();
          }
        }}
        aria-describedby={`${textareaId}-help`}
        className="field-sizing-content min-h-32 max-h-[min(50vh,32rem)] w-full resize-y rounded-xl border border-input bg-background px-3 py-2.5 text-[15px] leading-relaxed text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
      />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p id={`${textareaId}-help`} className="text-xs text-muted-foreground">
          This restarts the conversation from this message. Press ⌘/Ctrl + Enter to resend.
        </p>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-3.5 w-3.5" />
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSave}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Check className="h-3.5 w-3.5" />
            Save & resend
          </button>
        </div>
      </div>
    </form>
  );
}

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
 * Renders buffered Markdown in real time. The response receives one durable
 * entrance animation when its first displayed content arrives; later parser
 * updates retain their formatting and whitespace instead of remounting spans.
 */
function StreamingSafeMarkdown({
  content,
  isStreaming,
  messageStreaming,
  citations,
  conversationId,
}: {
  content: string;
  isStreaming?: boolean;
  /** True until the entire assistant message, including any tool steps, ends. */
  messageStreaming?: boolean;
  citations?: Map<string, CitationRef> | null;
  conversationId?: number;
}) {
  const display = useSmoothedStreamContent(
    content,
    isStreaming ?? false,
    messageStreaming ?? false,
  );
  const [hasStarted, setHasStarted] = useState(false);

  useEffect(() => {
    if (!display.content) return;
    const frame = requestAnimationFrame(() => setHasStarted(true));
    return () => cancelAnimationFrame(frame);
  }, [display.content]);

  return (
    <div className={hasStarted ? "animate-streaming-response-in" : undefined}>
      <SafeMarkdown
        content={display.content}
        isStreaming={display.isStreaming}
        citations={citations}
        conversationId={conversationId}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Segment builder — preserves the original order of parts so text between
// tool calls actually renders *between* the tool call groups.
// ---------------------------------------------------------------------------

type Segment =
  | { type: "text"; text: string }
  | { type: "tool"; parts: UIMessage["parts"] }
  | { type: "visual"; part: UIMessage["parts"][number] }
  | { type: "remiCard"; part: UIMessage["parts"][number] }
  | { type: "sessionPresent"; part: UIMessage["parts"][number] }
  | { type: "canvasPresent"; part: UIMessage["parts"][number] }
  | { type: "suggestions"; data: unknown }
  | { type: "sources"; data: unknown };

/** Tools that deliver an inline RemiCard. */
const REMI_CARD_TOOL_NAMES = new Set([
  "weather_card",
  "timezone_card",
  "currency_card",
  "map_card",
  "crypto_card",
  "news_card",
  "stock_card",
]);

function isRemiCardPart(part: UIMessage["parts"][number], shortToolName: string | null): boolean {
  if (shortToolName && (REMI_CARD_TOOL_NAMES.has(shortToolName) || shortToolName.endsWith("_card"))) {
    return true;
  }
  const record = part as Record<string, unknown>;
  const output = record.output;
  return isRemiCardOutput(output);
}

function remiCardPartOutput(part: UIMessage["parts"][number]): Record<string, unknown> | null {
  const record = part as Record<string, unknown>;
  if (record.output && typeof record.output === "object") return record.output as Record<string, unknown>;
  const invocation = record.toolInvocation;
  if (invocation && typeof invocation === "object") {
    const output = (invocation as Record<string, unknown>).output ?? (invocation as Record<string, unknown>).result;
    return output && typeof output === "object" ? output as Record<string, unknown> : null;
  }
  return null;
}

function cardKind(part: UIMessage["parts"][number]): string | null {
  const output = remiCardPartOutput(part);
  if (isRemiCardOutput(output)) return String(output.card).toLowerCase();
  try {
    return getToolName(part as Parameters<typeof getToolName>[0]).toLowerCase().replace(/^.*__/, "").replace(/_card$/, "");
  } catch {
    return null;
  }
}

function isFailedCard(part: UIMessage["parts"][number]): boolean {
  const output = remiCardPartOutput(part);
  if (!isRemiCardOutput(output)) return false;
  const data = output.data;
  return Boolean(data && typeof data === "object" && typeof (data as Record<string, unknown>).error === "string");
}

/** Keep one visual for duplicate card calls in a single assistant turn. */
function dedupeRemiCardSegments(segments: Segment[]): Segment[] {
  const cardSegments = segments.filter(
    (segment): segment is Extract<Segment, { type: "remiCard" }> => segment.type === "remiCard",
  );
  const successfulKinds = new Set(
    cardSegments
      .filter((segment) => !isFailedCard(segment.part))
      .map((segment) => cardKind(segment.part))
      .filter((kind): kind is string => Boolean(kind)),
  );
  // If a location/device lookup is retried successfully in the same turn,
  // don't leave the failed placeholder above the usable result.
  const withoutSupersededFailures = segments.filter((segment) => {
    if (segment.type !== "remiCard" || !isFailedCard(segment.part)) return true;
    const kind = cardKind(segment.part);
    return kind === null || !successfulKinds.has(kind);
  });
  const lastByIdentity = new Map<string, number>();
  withoutSupersededFailures.forEach((segment, index) => {
    if (segment.type !== "remiCard") return;
    const identity = remiCardPartIdentity(segment.part);
    if (identity) lastByIdentity.set(identity, index);
  });
  if (lastByIdentity.size === 0) return withoutSupersededFailures;
  return withoutSupersededFailures.filter((segment, index) => {
    if (segment.type !== "remiCard") return true;
    const identity = remiCardPartIdentity(segment.part);
    return !identity || lastByIdentity.get(identity) === index;
  });
}

/**
 * Text this short between two tool calls is transitional filler (e.g.
 * "Hmm," or "Let me retry") — it gets absorbed so the calls read as one
 * back-to-back row. Anything longer is treated as real content that must
 * render between the groups.
 */
/**
 * True for session-file writes/edits that scaffold a canvas's files (paths
 * under canvas/{slug}/) during the creation request. On the first canvas
 * message those cards are hidden — the canvas card already shows the result.
 */
function isCanvasScaffoldWrite(part: UIMessage["parts"][number]): boolean {
  if (!isToolUIPart(part)) return false;
  let name: string;
  try {
    name = getToolName(part);
  } catch {
    return false;
  }
  const short = name.toLowerCase().replace(/^.*__/, "");
  if (
    short !== "session_file_write" &&
    short !== "session_file_edit" &&
    short !== "session_file_mkdir"
  ) {
    return false;
  }
  const rec = part as Record<string, unknown>;
  const input = rec.input as Record<string, unknown> | undefined;
  const path =
    typeof input?.path === "string"
      ? input.path
      : typeof input?.from === "string"
        ? input.from
        : "";
  return path.replace(/\\/g, "/").startsWith("canvas/");
}

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
      // Detect follow-up suggestions and sources for their dedicated cards.
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

      // Keep user-facing tool results in the response body.
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
      } else if (isRemiCardPart(part, shortToolName)) {
        segments.push({ type: "remiCard", part });
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

  // Canvas creation scaffolding: on the FIRST canvas request the AI writes
  // the project files with session-file writes under canvas/{slug}/. Hide
  // those "Wrote/Updated session file" cards — the canvas card already
  // communicates the result. Later iterations (canvas_open only, no
  // canvas_create) keep their edit cards visible.
  const createdCanvas = parts.some((p) => {
    if (!isToolUIPart(p)) return false;
    try {
      const n = getToolName(p);
      const short = n.toLowerCase().replace(/^.*__/, "");
      return short === "canvas_create" || short === "canvas_add_file";
    } catch {
      return false;
    }
  });
  const visibleSegments = createdCanvas
    ? segments.filter(
        (s) => s.type !== "tool" || !s.parts.every(isCanvasScaffoldWrite),
      )
    : segments;

  const dedupedCardSegments = dedupeRemiCardSegments(visibleSegments);

  // Deduplicate canvas present cards: keep only the LAST one so the user
  // sees a single card at the end of the message, not one per canvas_* call.
  const lastCanvasIdx = dedupedCardSegments.findLastIndex(
    (s) => s.type === "canvasPresent",
  );
  return dedupedCardSegments.filter(
    (segment, index) => segment.type !== "canvasPresent" || index === lastCanvasIdx,
  );
}

const USER_MESSAGE_AUTO_COLLAPSE_CHAR_THRESHOLD = 450;
const USER_MESSAGE_AUTO_COLLAPSE_LINE_THRESHOLD = 8;
const USER_MESSAGE_MAX_HEIGHT_COLLAPSED_PX = 180;

function UserMessageBubble({
  message,
  onEdit,
  onContinue,
  collapseLongUserMessages,
}: {
  message: UIMessage;
  onEdit?: (messageId: string, text: string) => void;
  onContinue?: () => void;
  collapseLongUserMessages: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const inlineText = message.parts
    .filter(isTextUIPart)
    .map((p) => p.text)
    .join("");
  const attachments = parseAttachments(inlineText);
  const cleanText = stripAttachmentMarkdown(inlineText);
  const hasText = cleanText.length > 0;
  const imageAttachments = attachments.filter((a) => a.isImage);
  const fileAttachments = attachments.filter((a) => !a.isImage);

  // Heuristic based on character count and line breaks
  const isInitiallyLong =
    cleanText.length > USER_MESSAGE_AUTO_COLLAPSE_CHAR_THRESHOLD ||
    cleanText.split("\n").length > USER_MESSAGE_AUTO_COLLAPSE_LINE_THRESHOLD;

  const [isCollapsed, setIsCollapsed] = useState<boolean>(() =>
    collapseLongUserMessages && isInitiallyLong,
  );
  const [canCollapse, setCanCollapse] = useState<boolean>(() => isInitiallyLong);
  const textContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!textContainerRef.current) return;
    const scrollHeight = textContainerRef.current.scrollHeight;
    if (scrollHeight > USER_MESSAGE_MAX_HEIGHT_COLLAPSED_PX + 20) {
      setCanCollapse(true);
    }
  }, [cleanText]);

  if (!inlineText) return null;

  return (
    <div className="group flex justify-end">
      <div className="flex w-full max-w-[42rem] flex-col items-end gap-1">
        {isEditing ? (
          <EditMessageForm
            initialText={inlineText}
            onCancel={() => setIsEditing(false)}
            onSave={(nextText) => {
              if (!onEdit) return;
              setIsEditing(false);
              onEdit(message.id, nextText);
            }}
          />
        ) : (
          <div
            className={cn(
              "relative flex flex-col gap-2 transition-[max-height] duration-200",
              hasText &&
                "rounded-2xl bg-primary/90 px-3.5 py-2.5 text-[15px] leading-relaxed text-primary-foreground",
            )}
          >
            {hasText && (
              <div className="relative">
                <div
                  ref={textContainerRef}
                  style={{
                    maxHeight: isCollapsed
                      ? `${USER_MESSAGE_MAX_HEIGHT_COLLAPSED_PX}px`
                      : undefined,
                    maskImage: isCollapsed
                      ? "linear-gradient(to bottom, black 0%, black 45%, rgba(0,0,0,0.85) 60%, rgba(0,0,0,0.45) 75%, rgba(0,0,0,0.15) 88%, transparent 100%)"
                      : undefined,
                    WebkitMaskImage: isCollapsed
                      ? "linear-gradient(to bottom, black 0%, black 45%, rgba(0,0,0,0.85) 60%, rgba(0,0,0,0.45) 75%, rgba(0,0,0,0.15) 88%, transparent 100%)"
                      : undefined,
                  }}
                  className={cn(
                    "overflow-hidden transition-[max-height] duration-200",
                  )}
                >
                  <UserMessageText text={cleanText} />
                </div>

                {isCollapsed && (canCollapse || isInitiallyLong) && (
                  <div className="absolute inset-x-0 bottom-0 flex justify-center pb-0.5">
                    <button
                      type="button"
                      onClick={() => setIsCollapsed(false)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-primary-foreground/15 px-3 py-1 text-xs font-medium text-primary-foreground shadow-xs backdrop-blur-md transition-all hover:bg-white/25 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-foreground"
                      aria-expanded={false}
                    >
                      <span>Show more</span>
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            )}

            {hasText && !isCollapsed && (canCollapse || isInitiallyLong) && (
              <div className="flex justify-end pt-0.5">
                <button
                  type="button"
                  onClick={() => setIsCollapsed(true)}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium text-primary-foreground/80 transition-colors hover:bg-white/15 hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-foreground"
                  aria-expanded={true}
                >
                  <span>Show less</span>
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {imageAttachments.length > 0 && (
              <div
                className={cn(
                  "grid gap-2",
                  imageAttachments.length > 1 ? "grid-cols-2" : "grid-cols-1",
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

            {!hasText && attachments.length === 0 && (
              <span className="text-sm text-primary-foreground/60">Sent a file</span>
            )}
          </div>
        )}
        {!isEditing && (hasText || onEdit || onContinue) && (
          <MessageActionsRow align="right" alwaysVisible={Boolean(onContinue)}>
            {onContinue && (
              <button
                type="button"
                onClick={onContinue}
                aria-label="Continue response"
                title="Continue response"
                className="flex h-6.5 w-6.5 items-center justify-center rounded-md text-muted-foreground/55 transition-colors hover:text-foreground active:scale-90"
              >
                <Play className="h-3.5 w-3.5" />
              </button>
            )}
            {/* {hasText && (
              <button
                type="button"
                onClick={() => setIsCollapsed((prev) => !prev)}
                aria-label={isCollapsed ? "Expand message" : "Collapse message"}
                title={isCollapsed ? "Expand message" : "Collapse message"}
                className="flex h-6.5 w-6.5 items-center justify-center rounded-md text-muted-foreground/55 transition-colors hover:text-foreground active:scale-90"
              >
                {isCollapsed ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronUp className="h-3.5 w-3.5" />
                )}
              </button>
            )} */}
            {hasText && <CopyButton text={cleanText} ariaLabel="Copy message" />}
            {onEdit && (
              <button
                type="button"
                onClick={() => {
                  setIsCollapsed(false);
                  setIsEditing(true);
                }}
                aria-label="Edit message"
                title="Edit message"
                className="flex h-6.5 w-6.5 items-center justify-center rounded-md text-muted-foreground/55 transition-colors hover:text-foreground active:scale-90"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
          </MessageActionsRow>
        )}
      </div>
    </div>
  );
}

export function MessageBubble({
  message,
  collapseLongUserMessages = true,
  expandReasoningWhileWorking = true,
  isStreaming,
  onRegenerate,
  onEdit,
  onContinue,
  messagesAfter,
  conversationId,
}: {
  message: UIMessage;
  /** Whether eligible user messages should default to their collapsed view. */
  collapseLongUserMessages?: boolean;
  /** Whether active reasoning disclosures should automatically open. */
  expandReasoningWhileWorking?: boolean;
  isStreaming?: boolean;
  /** Called with the message id to regenerate (AI messages only). */
  onRegenerate?: (messageId: string) => void;
  /** Called with the message id and replacement text to edit it. */
  onEdit?: (messageId: string, text: string) => void;
  /** Called when this is the last user message without an assistant reply. */
  onContinue?: () => void;
  /** Number of messages that come after this one (used by the regenerate confirm). */
  messagesAfter?: number;
  /** Conversation id used by chat-scoped evidence export actions. */
  conversationId?: number;
}) {
  if (message.role === "user") {
    return (
      <UserMessageBubble
        // Changing the global display preference resets each message to its
        // preference-driven default while retaining local manual toggles until
        // the preference changes again.
        key={`${message.id}-${collapseLongUserMessages ? "collapsed" : "expanded"}`}
        message={message}
        onEdit={onEdit}
        onContinue={onContinue}
        collapseLongUserMessages={collapseLongUserMessages}
      />
    );
  }

  // ---- Assistant messages ----
  const { answerParts, activityParts } = partitionWorkText(message.parts);
  const segments = buildSegments(answerParts);
  const hasAnyContent = segments.length > 0;

  // Plain-text representation of the response (for the copy button): all
  // text parts joined, mirroring what the markdown renderer displays.
  const copyableText = answerParts
    .filter(isTextUIPart)
    .map((p) => p.text)
    .join("\n\n");
  const requestTiming = messageRequestTiming(message.parts);
  const activity = latestWorkActivity(message.parts)?.data;

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
  const flowSegments = segments.filter(
    (segment): segment is Exclude<Segment, { type: "suggestions" } | { type: "sources" }> => {
      if (segment.type === "suggestions" || segment.type === "sources") return false;
      if (isStreaming || !("part" in segment) || !isToolUIPart(segment.part)) return true;
      // A cancelled run can leave a card tool without a result. Its activity
      // row shows the interruption and the result slot stops loading.
      return segment.part.state === "output-available" ||
        segment.part.state === "output-error" ||
        segment.part.state === "approval-responded";
    },
  );

  // Canvas cards are hoisted to the BOTTOM of the message (next to the file
  // digest) instead of interrupting the tool/answer flow.
  const canvasSegments = flowSegments.filter(
    (s): s is Segment & { type: "canvasPresent" } => s.type === "canvasPresent",
  );
  const bodySegments = flowSegments.filter((s) => s.type !== "canvasPresent");
  const lastTextIndex = bodySegments.findLastIndex((segment) => segment.type === "text");

  const messageFileChanges = isStreaming ? [] : extractFileChanges(
    flowSegments.flatMap((segment) => segment.type === "tool" ? segment.parts.filter(isToolUIPart) : []),
  );

  return (
    <div className="group flex justify-start">
      <div className="w-full text-[15px] leading-relaxed text-foreground">
        <div className="flex flex-col gap-3.5">
          <WorkActivity
            key={activity?.runId ?? message.id}
            parts={activityParts}
            activity={activity}
            streaming={isStreaming ?? false}
            autoExpand={expandReasoningWhileWorking}
            legacyDurationMs={requestTiming?.durationMs}
          />

          {bodySegments.map((segment, idx) =>
            segment.type === "text" ? (
              <div
                key={`text-${idx}`}
                className="[&_.markdown-body]:text-[15px] [&_.markdown-body]:leading-[1.7]"
              >
                <StreamingSafeMarkdown
                  content={
                    hasRetrievedSources
                      ? !isStreaming
                        ? wrapBareSourceUrls(
                            stripTrailingSourcesSection(segment.text),
                            messageSources.byUrl,
                          )
                        : stripTrailingSourcesSection(segment.text)
                      : segment.text
                  }
                  isStreaming={
                    isStreaming && idx === lastTextIndex
                  }
                  messageStreaming={isStreaming}
                  citations={!isStreaming ? messageSources.byUrl : null}
                  conversationId={conversationId}
                />
              </div>
            ) : segment.type === "visual" ? (
              <VisualCardSegment key={isToolUIPart(segment.part) ? segment.part.toolCallId : `visual-${idx}`} part={segment.part} conversationId={conversationId} />
            ) : segment.type === "remiCard" ? (
              <RemiCardSegment key={`remi-${idx}`} part={segment.part} />
            ) : segment.type === "sessionPresent" ? (
              <SessionFilesPresentSegment
                key={`present-${idx}`}
                conversationId={conversationId}
                part={segment.part}
              />
            ) : (
              segment.parts.filter(isToolUIPart).filter((part) => !isSearchTraceToolPart(part))
                .map((part) => <ToolCallCard key={part.toolCallId} part={part} resultOnly />)
            ),
          )}

          {message.parts.filter((part) => part.type === "file").map((part, index) => (
            /^(?:https?:\/\/|data:|\/api\/)/i.test(part.url) && (
              <AttachedFileCard
                key={`file-${index}`}
                url={part.url}
                name={part.filename ?? "Generated file"}
                mimeType={part.mediaType}
              />
            )
          ))}

          {/* Canvas cards — hoisted to the bottom of the message, next to the
              file digest, instead of interrupting the answer flow. */}
          {canvasSegments.map((segment, idx) => (
            <CanvasPresentSegment
              key={`canvas-bottom-${idx}`}
              part={segment.part}
            />
          ))}

          {!isStreaming && (
            <ResponseDetails sources={messageSources.list} changes={messageFileChanges} conversationId={conversationId} />
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

        {/* Actions — hidden while the response is still streaming */}
        {!isStreaming && (hasAnyContent || activity || copyableText.length > 0) && (
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
            <RequestTimingLabel timing={requestTiming} showDuration={!activity} usage={messageResponseUsage(message.parts)} />
          </MessageActionsRow>
        )}
      </div>
    </div>
  );
}

// ── Visual card segment — extracts output from a create_visual tool part ──

function VisualCardSegment({ part, conversationId }: { part: UIMessage["parts"][number]; conversationId?: number }) {
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
  if (typeof outputObj.error === "string") {
    return <p className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">{outputObj.error}</p>;
  }
  if (outputObj.type !== "visual") {
    return (
      <div className="overflow-hidden rounded-xl border border-destructive/20 bg-destructive/[0.04] p-4 text-sm text-destructive">
        Visual could not be rendered — unexpected output type.
      </div>
    );
  }

  return <VisualCard data={output} conversationId={conversationId} />;
}

// ── Remi card segment — inline visual card (weather, timezone, etc.) ──

function RemiCardSegment({ part }: { part: UIMessage["parts"][number] }) {
  const partObj = part as Record<string, unknown>;
  const state = (partObj.state as string) ?? "call-result";
  const output = partObj.output;
  const toolName = (() => {
    try {
      return getToolName(part as Parameters<typeof getToolName>[0]);
    } catch {
      return "";
    }
  })();
  const isComplete = state === "output-available" || state === "approval-responded";
  const isError = state === "output-error";
  if (isError) {
    return (
      <div className="overflow-hidden rounded-xl border border-destructive/20 bg-destructive/[0.04] p-4 text-sm text-destructive">
        Card could not be loaded. The tool call encountered an error.
      </div>
    );
  }
  if (!isComplete) {
    return (
      <div className="overflow-hidden rounded-xl border border-border/55 bg-surface-2/40">
        <div className="flex items-center gap-2.5 px-3.5 py-3">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10">
            <svg className="h-3.5 w-3.5 animate-spin text-primary" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4 31.4" strokeLinecap="round" />
            </svg>
          </div>
          <span className="text-sm font-medium text-foreground">Loading {toolName.replace("_card", "")} card…</span>
        </div>
      </div>
    );
  }
  if (!output || typeof output !== "object") {
    return (
      <div className="overflow-hidden rounded-xl border border-destructive/20 bg-destructive/[0.04] p-4 text-sm text-destructive">
        Card could not be rendered. Unexpected output format.
      </div>
    );
  }
  const rec = output as Record<string, unknown>;
  // Per-card "text" mode (profile setting) — render a compact textual fallback instead of the visual card.
  if (rec.displayMode === "text") {
    const data = (rec.data as Record<string, unknown> | undefined) ?? rec;
    const desc = typeof rec.description === "string" ? rec.description : "";
    // Render a minimal text summary; the full structured data stays in the tool output for the model.
    const preview = (() => {
      try {
        const card = String(rec.card ?? "card");
        if (card === "weather" && data) {
          const cur = (data.current as Record<string, unknown> | undefined) ?? data;
          const t = cur?.temperature_c ?? (data as Record<string, unknown>).temperature_c;
          return `Weather — ${typeof t === "number" ? `${Number(t).toFixed(1)}°C` : "—"} · ${String((data as Record<string, unknown>).location ?? "")}`;
        }
        if (card === "currency" && data) return `${String(data.from ?? "")} → ${String(data.to ?? "")} · ${String(data.converted ?? data.rate ?? "")}`;
        if (card === "crypto" && data) return `${String(data.coin ?? card)} · $${String(data.price ?? "—")}`;
        return JSON.stringify(data).slice(0, 220);
      } catch {
        return "";
      }
    })();
    return (
      <div className="rounded-xl border border-border/40 bg-card px-3.5 py-2.5 text-sm">
        <div className="text-xs font-semibold capitalize tracking-wide">{String(rec.card ?? "card")}</div>
        <div className="mt-1 text-sm text-muted-foreground">{preview}</div>
        {desc ? <div className="mt-1 text-[11px] italic text-muted-foreground">{desc}</div> : null}
      </div>
    );
  }
  return <RemiCard data={output} />;
}

// ── Session files present segment — extracts output from a session_present_files part ──

function SessionFilesPresentSegment({ part, conversationId }: { part: UIMessage["parts"][number]; conversationId?: number }) {
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

  return <SessionFilesPresentCard data={output} conversationId={conversationId} />;
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
