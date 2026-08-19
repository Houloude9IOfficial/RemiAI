import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DATA_DIR } from "@/lib/paths";

/** Durable lifecycle states used by Phase 0 traces and later run records. */
export type RunTraceState =
  | "queued"
  | "planning"
  | "executing"
  | "verifying"
  | "repairing"
  | "waiting"
  | "completed"
  | "partially_completed"
  | "failed"
  | "cancelled";

type TraceValue = string | number | boolean | string[] | null | undefined;
type TraceData = Record<string, TraceValue>;

type TraceEvent = {
  name: string;
  atMs: number;
  data?: TraceData;
};

export type RunTraceRecord = {
  version: 1;
  traceId: string;
  parentTraceId?: string;
  kind: string;
  conversationId?: number;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  state: RunTraceState;
  metrics: TraceData;
  events: TraceEvent[];
};

const TRACE_DIR = path.join(DATA_DIR, "traces");
const DEFAULT_RETENTION_DAYS = 14;
const MAX_RETENTION_DAYS = 90;

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function retentionDays(): number {
  const configured = Number(process.env.REMIAI_TRACE_RETENTION_DAYS);
  if (!Number.isFinite(configured)) return DEFAULT_RETENTION_DAYS;
  return Math.min(MAX_RETENTION_DAYS, Math.max(1, Math.floor(configured)));
}

function dayName(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Trace values are accepted only as scalar metadata and explicitly approved
 * arrays. The key filter is a second line of defence against accidentally
 * recording user content, secrets, prompts, or filesystem details.
 */
function redactData(data: TraceData | undefined): TraceData | undefined {
  if (!data) return undefined;
  const output: TraceData = {};
  for (const [key, value] of Object.entries(data)) {
    if (/content|prompt|message|text|input|output|args|body|header|secret|password|api.?key|token|path|url/i.test(key)) {
      // Token *counts* are useful metrics; token values/content are not.
      if (!/count|tokens|duration|ms|chars|bytes/i.test(key)) continue;
    }
    if (Array.isArray(value)) {
      output[key] = value.slice(0, 100).map((item) => String(item).slice(0, 120));
    } else if (
      value === null ||
      value === undefined ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      output[key] = typeof value === "string" ? value.slice(0, 240) : value;
    }
  }
  return Object.keys(output).length > 0 ? output : undefined;
}

function safeErrorCategory(error: unknown): string {
  if (error instanceof Error) return error.name.slice(0, 80);
  return typeof error === "string" ? error.slice(0, 80) : "UnknownError";
}

async function persistRecord(record: RunTraceRecord): Promise<void> {
  try {
    await fs.mkdir(TRACE_DIR, { recursive: true });
    const file = path.join(TRACE_DIR, `${dayName(new Date(record.startedAt))}.ndjson`);
    await fs.appendFile(file, `${JSON.stringify(record)}\n`, "utf8");

    const entries = await fs.readdir(TRACE_DIR, { withFileTypes: true });
    const cutoff = Date.now() - retentionDays() * 24 * 60 * 60 * 1000;
    await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".ndjson"))
        .map(async (entry) => {
          const filePath = path.join(TRACE_DIR, entry.name);
          const stats = await fs.stat(filePath).catch(() => null);
          if (stats && stats.mtimeMs < cutoff) await fs.unlink(filePath).catch(() => {});
        }),
    );
  } catch (error) {
    // Tracing must never affect a response, stream, or background task.
    console.warn("[observability] Failed to persist local trace:", safeErrorCategory(error));
  }
}

export function createRunTrace(opts: {
  kind?: string;
  conversationId?: number;
  parentTraceId?: string;
} = {}): RunTrace {
  return new RunTrace(opts);
}

export class RunTrace {
  readonly traceId = randomUUID();
  readonly startedAt = new Date().toISOString();
  readonly startedMs = nowMs();
  readonly kind: string;
  readonly conversationId?: number;
  readonly parentTraceId?: string;

  private readonly events: TraceEvent[] = [];
  private readonly metrics: TraceData = {};
  private finished = false;

  constructor(opts: {
    kind?: string;
    conversationId?: number;
    parentTraceId?: string;
  } = {}) {
    this.kind = opts.kind ?? "chat";
    this.conversationId = opts.conversationId;
    this.parentTraceId = opts.parentTraceId;
  }

  elapsedMs(): number {
    return Math.max(0, Math.round(nowMs() - this.startedMs));
  }

  event(name: string, data?: TraceData): void {
    if (this.finished) return;
    this.events.push({
      name: name.slice(0, 100),
      atMs: this.elapsedMs(),
      data: redactData(data),
    });
  }

  metric(name: string, value: TraceValue): void {
    if (this.finished) return;
    const redacted = redactData({ [name]: value });
    if (redacted && name in redacted) this.metrics[name] = redacted[name];
  }

  span(name: string, data?: TraceData): () => number {
    const start = nowMs();
    this.event(`${name}.start`, data);
    return () => {
      const durationMs = Math.max(0, Math.round(nowMs() - start));
      this.event(`${name}.end`, { durationMs });
      return durationMs;
    };
  }

  dbQuery(name: string, startedMs: number, data?: TraceData): void {
    this.metric("databaseQueryCount", Number(this.metrics.databaseQueryCount ?? 0) + 1);
    this.event("database.query", {
      name,
      durationMs: Math.max(0, Math.round(nowMs() - startedMs)),
      ...data,
    });
  }

  modelCallStart(data: {
    callId?: string;
    provider?: string;
    modelId?: string;
  }): void {
    this.metric("providerCallCount", Number(this.metrics.providerCallCount ?? 0) + 1);
    this.event("model.call.start", data);
  }

  modelCallEnd(data: {
    callId?: string;
    provider?: string;
    modelId?: string;
    inputTokens?: number;
    outputTokens?: number;
    responseTimeMs?: number;
    timeToFirstOutputMs?: number;
    finishReason?: string;
  }): void {
    this.metric("inputTokens", Number(this.metrics.inputTokens ?? 0) + (data.inputTokens ?? 0));
    this.metric("outputTokens", Number(this.metrics.outputTokens ?? 0) + (data.outputTokens ?? 0));
    if (data.timeToFirstOutputMs !== undefined && this.metrics.timeToFirstOutputMs === undefined) {
      this.metric("timeToFirstOutputMs", data.timeToFirstOutputMs);
    }
    this.event("model.call.end", data);
  }

  providerError(error: unknown): void {
    this.metric("providerErrorCount", Number(this.metrics.providerErrorCount ?? 0) + 1);
    this.event("provider.error", { category: safeErrorCategory(error) });
  }

  toolStart(toolName: string, callId?: string): void {
    this.event("tool.start", { toolName, callId });
  }

  toolEnd(toolName: string, durationMs: number, success: boolean, callId?: string): void {
    this.metric("toolExecutionCount", Number(this.metrics.toolExecutionCount ?? 0) + 1);
    this.event("tool.end", { toolName, durationMs, success, callId });
  }

  step(stepNumber: number, data?: TraceData): void {
    this.metric("modelStepCount", Math.max(Number(this.metrics.modelStepCount ?? 0), stepNumber + 1));
    this.event("model.step.end", { stepNumber, ...data });
  }

  recordState(state: RunTraceState, data?: TraceData): void {
    this.event("run.state", { state, ...data });
  }

  toRecord(state: RunTraceState, data?: TraceData): RunTraceRecord {
    const finishedAt = new Date().toISOString();
    return {
      version: 1,
      traceId: this.traceId,
      ...(this.parentTraceId ? { parentTraceId: this.parentTraceId } : {}),
      kind: this.kind,
      ...(this.conversationId !== undefined ? { conversationId: this.conversationId } : {}),
      startedAt: this.startedAt,
      finishedAt,
      durationMs: this.elapsedMs(),
      state,
      metrics: {
        ...this.metrics,
        ...redactData(data),
      },
      events: this.events.slice(),
    };
  }

  /** Finalize and persist asynchronously; callers should not await this. */
  finish(state: RunTraceState, data?: TraceData): void {
    if (this.finished) return;
    this.finished = true;
    const record = this.toRecord(state, data);
    void persistRecord(record);
  }
}

export const observability = {
  traceDirectory: TRACE_DIR,
  retentionDays,
};
