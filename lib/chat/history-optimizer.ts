import type { UIMessage } from "ai";

/**
 * Message-history optimizer.
 *
 * Persisted UI messages carry far more than the model needs on the next
 * request: full tool inputs (write_file content, python code, create_visual
 * markup), full tool outputs (up to 50k chars each, and base64 media that is
 * intentionally never truncated), UI-only `step-start` markers, and — for
 * reasoning models — the model's own chain-of-thought.
 *
 * This module rewrites the history BEFORE it reaches `convertToModelMessages`
 * so the provider only ever sees what is genuinely useful:
 *
 * - **UI-only parts are dropped** (`step-start` markers, `reasoning` text).
 * - **Recent turns stay verbatim** for immediate follow-ups, except:
 *   - heavy tool *inputs* (file contents / code / visual markup) are replaced
 *     with a `[N chars omitted]` reference — the model just wrote that
 *     content, re-sending it adds nothing;
 *   - tool *outputs* over `RECENT_OUTPUT_MAX_CHARS` are truncated to a
 *     preview (the model can re-run the tool to refetch anything it needs).
 * - **Older turns become natural-language traces**: each completed tool round
 *   is condensed to `tool_name(args…) → [result compacted]`, which preserves
 *   *what happened* without re-billing the payload.
 *
 * The output keeps the exact UIMessage part shapes the AI SDK expects, so
 * tool-call/tool-result pairing is preserved and `convertToModelMessages`
 * never sees a dangling tool call.
 */

/** Messages at the end of the history kept (near) verbatim. */
export const RECENT_MESSAGES_KEPT = 8;

/** Outputs in the recent window above this char count get a preview instead. */
export const RECENT_OUTPUT_MAX_CHARS = 12_000;

/** Outputs in older turns above this char count get a preview instead. */
export const OLD_OUTPUT_MAX_CHARS = 300;

/** Loose view of a persisted UI part (parts are a JSON round-trip anyway). */
type LoosePart = Record<string, unknown> & { type: string };

/** Tool inputs whose `content`/`code` payloads bloat every re-send. */
const HEAVY_INPUT_TOOLS = new Set([
  "write_file",
  "edit_file",
  "session_file_write",
  "session_file_edit",
  "create_visual",
  "python_exec",
  "js_exec",
  "create_routine",
  "update_routine",
]);

/** Tool outputs that are useful to summarize down to a tiny shape. */
const OUTPUT_SHAPERS: Record<string, (output: unknown) => string | null> = {
  write_file: (o) => shapeWriteResult(o),
  edit_file: (o) => shapeWriteResult(o),
  session_file_write: (o) => shapeWriteResult(o),
  session_file_edit: (o) => shapeWriteResult(o),
  create_visual: (o) => {
    if (o && typeof o === "object") {
      const rec = o as Record<string, unknown>;
      const title = typeof rec.title === "string" ? rec.title : "";
      const type = typeof rec.type === "string" ? rec.type : "";
      return `[Visual created${title ? ` — ${title}` : ""}${type ? ` (${type})` : ""}]`;
    }
    return null;
  },
  suggest_followups: (o) => {
    if (o && typeof o === "object") {
      const rec = o as Record<string, unknown>;
      const count = Array.isArray(rec.suggestions) ? rec.suggestions.length : null;
      return `[Suggested ${count ?? "?"} followups]`;
    }
    return null;
  },
  remember: (o) => {
    if (o && typeof o === "object") {
      const rec = o as Record<string, unknown>;
      return typeof rec.message === "string" ? rec.message : null;
    }
    return null;
  },
  // Execution tools: only the program output matters, not the full stdout.
  js_exec: (o) => shapeExecResult(o, "js"),
  python_exec: (o) => shapeExecResult(o, "python"),
};

/** Execution output shape: exit code + first lines of stdout/stderr, capped. */
function shapeExecResult(o: unknown, kind: string): string | null {
  if (o && typeof o === "object") {
    const rec = o as Record<string, unknown>;
    const code = typeof rec.exitCode === "number" ? rec.exitCode : "?";
    const out = typeof rec.stdout === "string" ? rec.stdout : "";
    const err = typeof rec.stderr === "string" ? rec.stderr : "";
    const preview = (out || err).replace(/\s+/g, " ").slice(0, 160);
    const outLen = out.length;
    const errLen = err.length;
    return `[${kind} exit ${code}${preview ? ` — ${preview}` : ""}${outLen > 160 || errLen > 160 ? ` (${(outLen + errLen).toLocaleString()} chars)` : ""}]`;
  }
  return null;
}

function shapeWriteResult(o: unknown): string | null {
  if (o && typeof o === "object") {
    const rec = o as Record<string, unknown>;
    const ok = rec.ok === true || rec.success === true;
    const path =
      typeof rec.path === "string"
        ? rec.path
        : typeof rec.relativePath === "string"
          ? rec.relativePath
          : "";
    return `[${ok ? "Wrote" : "Write attempted"}: ${path || "?"}]`;
  }
  return null;
}

/** Compact a heavy tool input, keeping identifying args and dropping payloads. */
function compactToolInput(toolName: string, input: unknown): unknown {
  if (input === undefined || input === null) return input;
  if (typeof input !== "object" || Array.isArray(input)) return input;

  const rec = input as Record<string, unknown>;
  if (!HEAVY_INPUT_TOOLS.has(toolName)) return input;

  const out: Record<string, unknown> = {};
  let omitted = 0;
  for (const [key, value] of Object.entries(rec)) {
    if (key === "content" || key === "code") {
      const str = typeof value === "string" ? value : JSON.stringify(value);
      omitted += str?.length ?? 0;
      continue;
    }
    out[key] = value;
  }
  if (omitted > 0) {
    out["_contentOmitted"] = `[${omitted.toLocaleString()} chars omitted]`;
  }
  return out;
}

/** Produce a compact preview string for a tool output. */
function compactToolOutput(
  toolName: string,
  output: unknown,
  maxChars: number,
): unknown {
  const shaper = OUTPUT_SHAPERS[toolName];
  if (shaper) {
    const shaped = shaper(output);
    if (shaped !== null) return shaped;
  }

  let json: string;
  try {
    json = JSON.stringify(output);
  } catch {
    return "[Tool result could not be serialised]";
  }
  if (json.length <= maxChars) return output;

  const preview = json.slice(0, Math.min(200, maxChars));
  return `[Tool result compacted — ${preview}… [+${(json.length - maxChars).toLocaleString()} chars omitted]]`;
}

/**
 * Compact one message's parts. Returns a new parts array (the original is
 * never mutated).
 *
 * @param parts    the message's parts
 * @param isRecent whether this message sits in the verbatim recent window
 */
export function optimizeMessageParts(
  parts: UIMessage["parts"],
  isRecent: boolean,
): UIMessage["parts"] {
  const out: UIMessage["parts"] = [];

  for (const rawPart of parts) {
    const part = rawPart as unknown as LoosePart;

    // UI-only markers — zero value to the model.
    if (part.type === "step-start") continue;
    if (part.type === "reasoning") continue;

    // ── v7 tool parts: type is `tool-${toolName}` ───────────────────────
    if (
      part.type.startsWith("tool-") &&
      part.type !== "tool-invocation" &&
      part.toolCallId !== undefined
    ) {
      const toolName = part.type.slice("tool-".length);
      const compacted: LoosePart = { ...part };
      if (part.input !== undefined) {
        compacted.input = compactToolInput(toolName, part.input);
      }
      if (part.output !== undefined) {
        compacted.output = compactToolOutput(
          toolName,
          part.output,
          isRecent ? RECENT_OUTPUT_MAX_CHARS : OLD_OUTPUT_MAX_CHARS,
        );
      }
      out.push(compacted as never);
      continue;
    }

    // ── Legacy `tool-invocation` parts (older SDK generations) ─────────
    if (part.type === "tool-invocation") {
      const inv = (part.toolInvocation ?? {}) as Record<string, unknown>;
      const toolName = typeof inv.toolName === "string" ? inv.toolName : "unknown";
      const compacted: LoosePart = {
        ...part,
        toolInvocation: {
          ...inv,
          args: inv.args !== undefined ? compactToolInput(toolName, inv.args) : inv.args,
          output:
            inv.output !== undefined
              ? compactToolOutput(
                  toolName,
                  inv.output,
                  isRecent ? RECENT_OUTPUT_MAX_CHARS : OLD_OUTPUT_MAX_CHARS,
                )
              : inv.output,
        },
      };
      out.push(compacted as never);
      continue;
    }

    // Everything else (text, file, image, custom…) passes through.
    out.push(rawPart);
  }

  return out;
}

/**
 * Optimize the full message history for a request.
 *
 * Keeps the last {@link RECENT_MESSAGES_KEPT} messages (near) verbatim and
 * collapses older turns into compact tool traces. Returns a NEW array —
 * the input is never mutated.
 */
export function optimizeMessageHistory(
  uiMessages: UIMessage[],
  opts: { keepRecent?: number } = {},
): UIMessage[] {
  const keepRecent = opts.keepRecent ?? RECENT_MESSAGES_KEPT;
  if (uiMessages.length <= keepRecent) {
    // Still strip UI-only parts — they cost tokens on every request.
    return uiMessages.map((m) => ({ ...m, parts: optimizeMessageParts(m.parts, true) }));
  }
  const cutoff = uiMessages.length - keepRecent;

  return uiMessages.map((m, i) => {
    const isRecent = i >= cutoff;
    const parts = optimizeMessageParts(m.parts, isRecent);
    if (parts.length === m.parts.length && parts.every((p, idx) => p === m.parts[idx])) {
      return m;
    }
    return { ...m, parts };
  });
}
