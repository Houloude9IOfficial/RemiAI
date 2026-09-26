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

/** Search evidence is compacted on the very next request, even when recent. */
const SEARCH_RESULT_LIMIT = 5;
const SEARCH_TITLE_MAX_CHARS = 180;
const SEARCH_SNIPPET_MAX_CHARS = 320;

/** Search tools whose result lists are useful for the current answer, but not verbatim history. */
const SEARCH_TOOLS = new Set([
  "web_search",
  "news_search",
  "news_top_headlines",
]);

/** Loose view of a persisted UI part (parts are a JSON round-trip anyway). */
type LoosePart = Record<string, unknown> & { type: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clipped(value: unknown, maxChars: number): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > maxChars
    ? `${normalized.slice(0, Math.max(1, maxChars - 1))}…`
    : normalized;
}

function normalizeUrl(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const parsed = new URL(value);
    parsed.hash = "";
    const url = parsed.toString();
    return url !== parsed.origin && url.endsWith("/") ? url.slice(0, -1) : url;
  } catch {
    return value.trim().replace(/\/+$/, "");
  }
}

function citedUrls(parts: UIMessage["parts"]): Set<string> {
  const urls = new Set<string>();
  const urlPattern = /https?:\/\/[^\s)<>{}\]]+/g;
  for (const part of parts) {
    const raw = part as unknown as LoosePart;
    if (raw.type !== "text" || typeof raw.text !== "string") continue;
    for (const match of raw.text.matchAll(urlPattern)) {
      const normalized = normalizeUrl(match[0].replace(/[.,;:!?]+$/, ""));
      if (normalized) urls.add(normalized);
    }
  }
  return urls;
}

/**
 * Preserve the small amount of search evidence a follow-up can use without
 * re-sending every provider snippet. The complete result remains in the
 * persisted UI message; this shape exists only in the model payload.
 */
export function compactSearchToolOutput(output: unknown, cited: Set<string> = new Set()): unknown {
  if (!isRecord(output)) return output;
  const payload = isRecord(output.result) ? output.result : output;
  const rawResults = Array.isArray(payload.results) ? payload.results : [];
  const rawSources = Array.isArray(output.sources)
    ? output.sources
    : Array.isArray(payload.sources)
      ? payload.sources
      : [];

  const candidates = rawResults.flatMap((raw, index) => {
    if (!isRecord(raw)) return [];
    const url = typeof raw.url === "string" ? raw.url :
      typeof raw.pageUrl === "string" ? raw.pageUrl : "";
    const normalizedUrl = normalizeUrl(url);
    if (!normalizedUrl && !clipped(raw.title, SEARCH_TITLE_MAX_CHARS)) return [];
    return [{
      index,
      cited: cited.has(normalizedUrl),
      value: {
        ...(clipped(raw.title, SEARCH_TITLE_MAX_CHARS) ? { title: clipped(raw.title, SEARCH_TITLE_MAX_CHARS) } : {}),
        ...(url ? { url } : {}),
        ...(clipped(raw.description, SEARCH_SNIPPET_MAX_CHARS) ? { description: clipped(raw.description, SEARCH_SNIPPET_MAX_CHARS) } : {}),
        ...(clipped(raw.source, 100) ? { source: clipped(raw.source, 100) } : {}),
        ...(clipped(raw.age, 80) ? { age: clipped(raw.age, 80) } : {}),
      },
    }];
  });
  const selected = candidates
    .sort((a, b) => Number(b.cited) - Number(a.cited) || a.index - b.index)
    .slice(0, SEARCH_RESULT_LIMIT);
  const selectedUrls = new Set(selected.map((item) => normalizeUrl(item.value.url)).filter(Boolean));
  const selectedSources = rawSources.flatMap((raw) => {
    if (!isRecord(raw)) return [];
    const url = typeof raw.url === "string" ? raw.url : "";
    const normalizedUrl = normalizeUrl(url);
    if (!url || (selectedUrls.size > 0 && !selectedUrls.has(normalizedUrl) && !cited.has(normalizedUrl))) return [];
    return [{
      ...(typeof raw.id === "number" ? { id: raw.id } : {}),
      url,
      ...(clipped(raw.title, SEARCH_TITLE_MAX_CHARS) ? { title: clipped(raw.title, SEARCH_TITLE_MAX_CHARS) } : {}),
      ...(clipped(raw.status, 40) ? { status: clipped(raw.status, 40) } : {}),
    }];
  }).slice(0, SEARCH_RESULT_LIMIT);

  return {
    ...(typeof payload.type === "string" ? { type: payload.type } : {}),
    ...(clipped(payload.query, 500) ? { query: clipped(payload.query, 500) } : {}),
    ...(clipped(payload.category, 40) ? { category: clipped(payload.category, 40) } : {}),
    ...(clipped(payload.provider, 80) ? { provider: clipped(payload.provider, 80) } : {}),
    ...(typeof payload.count === "number" ? { count: payload.count } : {}),
    results: selected.map((item) => item.value),
    ...(selectedSources.length > 0 ? { sources: selectedSources } : {}),
    _compacted: true,
    _note: "Search results compacted for conversation context. The assistant's answer contains the relevant synthesis; rerun the search or open a source for full results.",
  };
}

/** A compact, plain-text search trace suitable for the rolling summary input. */
export function searchEvidenceSummary(output: unknown): string {
  const compacted = compactSearchToolOutput(output);
  if (!isRecord(compacted)) return "";
  const query = typeof compacted.query === "string" ? compacted.query : "search";
  const results = Array.isArray(compacted.results) ? compacted.results : [];
  const labels = results.flatMap((raw) => {
    if (!isRecord(raw)) return [];
    const title = typeof raw.title === "string" ? raw.title : "untitled source";
    const url = typeof raw.url === "string" ? raw.url : "";
    return [`${title}${url ? ` (${url})` : ""}`];
  });
  return `${query}: ${labels.join("; ")}`.slice(0, 1_800);
}

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
  // Search results and the assistant's synthesis are persisted in the same
  // completed assistant message. Prefer sources the answer actually cited.
  const messageCitedUrls = citedUrls(parts);

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
        compacted.output = SEARCH_TOOLS.has(toolName)
          ? compactSearchToolOutput(part.output, messageCitedUrls)
          : compactToolOutput(
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
              ? SEARCH_TOOLS.has(toolName)
                ? compactSearchToolOutput(inv.output, messageCitedUrls)
                : compactToolOutput(
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
