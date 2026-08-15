import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations, providers, providerModels, toolConfigs } from "@/db/schema";
import { DATA_DIR } from "@/lib/paths";
import { resolveFfmpegBinaries, runFfmpeg } from "./ffmpeg";

// ---------------------------------------------------------------------------
// Model registry
//
// Transcription supports two engines:
//   - "offline": Whisper runs locally via @huggingface/transformers +
//     onnxruntime-node (q8-quantized). No network calls, no API key, no per-
//     minute cost — but it needs a model downloaded once (models are cached
//     under DATA_DIR/whisper-models), and it is slower on CPU for long files.
//   - "provider": the AI SDK's `transcribe()` against the user's configured
//     OpenAI-compatible provider (whisper-1 etc.). Fast and accurate, uses
//     the provider's own API key, and sends the audio to that provider.
// ---------------------------------------------------------------------------

export const OFFLINE_WHISPER_MODELS = {
  "whisper-tiny": {
    repoId: "Xenova/whisper-tiny",
    params: "39M",
    size: "~40 MB",
    description: "Fastest, lowest accuracy — good for short clips / quick drafts",
  },
  "whisper-base": {
    repoId: "Xenova/whisper-base",
    params: "74M",
    size: "~80 MB",
    description: "Balanced speed/accuracy — the default offline model",
  },
  "whisper-small": {
    repoId: "Xenova/whisper-small",
    params: "244M",
    size: "~250 MB",
    description: "Accurate, slower on CPU — good for important recordings",
  },
} as const;

export type OfflineWhisperModel = keyof typeof OFFLINE_WHISPER_MODELS;

/** Default provider model for OpenAI-compatible transcription endpoints. */
export const DEFAULT_PROVIDER_TRANSCRIPTION_MODEL = "whisper-1";

/** Where offline Whisper models are cached (override for tests / CI). */
export const WHISPER_CACHE_DIR =
  process.env.WHISPER_CACHE_DIR ?? path.join(DATA_DIR, "whisper-models");

// ---------------------------------------------------------------------------
// Persisted transcription config (tool_configs, toolId "transcription")
// ---------------------------------------------------------------------------

export interface TranscriptionConfig {
  engine: "offline" | "provider";
  /** Offline Whisper model id (used when engine === "offline"). */
  offlineModel: OfflineWhisperModel;
  /** Provider row id used for transcription (used when engine === "provider"). */
  providerId?: number;
  /** Provider transcription model id (e.g. whisper-1). */
  providerModel: string;
  /** Optional ISO-639-1 language hint (e.g. "en"); auto-detect when unset. */
  language?: string;
}

const DEFAULT_CONFIG: TranscriptionConfig = {
  engine: "offline",
  offlineModel: "whisper-base",
  providerModel: DEFAULT_PROVIDER_TRANSCRIPTION_MODEL,
};

export function normalizeTranscriptionConfig(raw: unknown): TranscriptionConfig {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    ...DEFAULT_CONFIG,
    ...(typeof r.engine === "string" &&
    (r.engine === "offline" || r.engine === "provider")
      ? { engine: r.engine }
      : {}),
    ...(typeof r.offlineModel === "string" &&
    (r.offlineModel as string) in OFFLINE_WHISPER_MODELS
      ? { offlineModel: r.offlineModel as OfflineWhisperModel }
      : {}),
    ...(typeof r.providerId === "number"
      ? { providerId: r.providerId }
      : {}),
    ...(typeof r.providerModel === "string" && r.providerModel.trim()
      ? { providerModel: r.providerModel.trim() }
      : {}),
    ...(typeof r.language === "string" && r.language.trim()
      ? { language: r.language.trim() }
      : {}),
  };
}

export async function getTranscriptionConfig(): Promise<TranscriptionConfig> {
  const row = await db
    .select()
    .from(toolConfigs)
    .where(eq(toolConfigs.toolId, "transcription"))
    .get();
  return normalizeTranscriptionConfig(row?.config);
}

export async function saveTranscriptionConfig(
  patch: Partial<TranscriptionConfig>,
): Promise<TranscriptionConfig> {
  const next = { ...(await getTranscriptionConfig()), ...patch };
  const existing = await db
    .select()
    .from(toolConfigs)
    .where(eq(toolConfigs.toolId, "transcription"))
    .get();
  if (existing) {
    await db
      .update(toolConfigs)
      .set({ config: next as never, updatedAt: new Date().toISOString() })
      .where(eq(toolConfigs.toolId, "transcription"));
  } else {
    await db.insert(toolConfigs).values({
      toolId: "transcription",
      enabled: true,
      config: next as never,
    });
  }
  return next;
}

// ---------------------------------------------------------------------------
// Audio prep: normalize any media file to a 16 kHz mono WAV
// ---------------------------------------------------------------------------

export interface PreparedAudio {
  /** Absolute path of the temporary 16 kHz mono WAV. */
  wavPath: string;
  /** Temp directory to clean up afterwards. */
  tmpDir: string;
  /** WAV bytes. */
  bytes: Buffer;
  /** Duration of the source media in seconds, when known. */
  sourceDuration?: number | null;
}

/**
 * Convert any media file (video or audio, any codec) to a 16 kHz mono WAV
 * via ffmpeg. Both engines consume this: offline Whisper needs raw PCM
 * samples, and the provider endpoint accepts WAV directly (smaller payload
 * than the original file, and it strips any video track).
 */
export async function prepareAudioForTranscription(
  inputPath: string,
  timeoutMs = 120_000,
): Promise<PreparedAudio> {
  const { ffmpeg } = await resolveFfmpegBinaries();
  const tmpDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "remiai-transcribe-"),
  );
  const wavPath = path.join(tmpDir, "audio.wav");
  const result = await runFfmpeg(
    ffmpeg,
    [
      "-y",
      "-i", inputPath,
      "-vn",
      "-ac", "1",
      "-ar", "16000",
      "-c:a", "pcm_s16le",
      wavPath,
    ],
    { timeoutMs },
  );
  if (result.exitCode !== 0) {
    const tail = result.stderr.trim().split("\n").slice(-5).join("\n");
    await fs.rm(tmpDir, { recursive: true, force: true });
    throw new Error(
      result.timedOut
        ? `Audio preparation timed out after ${Math.round(timeoutMs / 1000)}s. The file may be corrupt or too long.`
        : `Could not read audio from the file${tail ? `:\n${tail}` : ""}`,
    );
  }
  let bytes: Buffer;
  try {
    bytes = await fs.readFile(wavPath);
  } catch {
    await fs.rm(tmpDir, { recursive: true, force: true });
    throw new Error("Audio preparation produced no output file.");
  }
  return { wavPath, tmpDir, bytes };
}

/** Parse a 16-bit PCM WAV buffer into Float32 samples (mono). */
export function decodeWavToF32(buf: Buffer): Float32Array {
  const dataView = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const fmtPos = buf.indexOf("fmt ");
  const dataPos = buf.indexOf("data");
  if (fmtPos < 0 || dataPos < 0) {
    throw new Error("Not a valid WAV file (missing fmt/data chunks).");
  }
  const bitsPerSample = dataView.getUint16(fmtPos + 8 + 14, true);
  const channels = dataView.getUint16(fmtPos + 8 + 2, true);
  if (bitsPerSample !== 16) {
    throw new Error(`Unexpected WAV sample size ${bitsPerSample} — expected 16-bit PCM.`);
  }
  const dataOffset = dataPos + 8;
  const bytesPerSample = bitsPerSample / 8;
  const totalSamples = (buf.length - dataOffset) / bytesPerSample;
  const audio = new Float32Array(totalSamples / channels);
  for (let i = 0, s = 0; i < audio.length; i++, s += channels) {
    audio[i] = dataView.getInt16(dataOffset + s * bytesPerSample, true) / 32768;
  }
  return audio;
}

// ---------------------------------------------------------------------------
// Offline engine (@huggingface/transformers Whisper)
// ---------------------------------------------------------------------------

// Pipeline instances are cached per model — loading takes a few seconds and
// must happen once per process. The promise pattern prevents concurrent
// loads from double-initializing on parallel tool calls.
const offlinePipelines = new Map<string, Promise<unknown>>();

export interface OfflineTranscriptionResult {
  text: string;
  chunks: Array<{ start: number; end: number; text: string }>;
}

async function loadOfflinePipeline(model: OfflineWhisperModel): Promise<unknown> {
  const existing = offlinePipelines.get(model);
  if (existing) return existing;

  const loading = (async () => {
    // Dynamic import keeps the heavy native module out of the main bundle
    // (chat requests never touch it unless transcription is actually used).
    const { pipeline, env } = await import("@huggingface/transformers");
    env.cacheDir = WHISPER_CACHE_DIR;
    env.allowLocalModels = false;
    env.useBrowserCache = false;
    return pipeline("automatic-speech-recognition", OFFLINE_WHISPER_MODELS[model].repoId, {
      dtype: "q8",
    });
  })().catch((err) => {
    // Remove the failed promise so a later call retries instead of forever
    // rejecting with the cached error.
    offlinePipelines.delete(model);
    throw err;
  });
  offlinePipelines.set(model, loading);
  return loading;
}

/** Size of a directory in bytes. */
async function dirSizeBytes(dir: string): Promise<number> {
  let total = 0;
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) total += await dirSizeBytes(p);
    else if (entry.isFile()) total += (await fs.stat(p).catch(() => ({ size: 0 }))).size;
  }
  return total;
}

function offlineModelDir(model: OfflineWhisperModel): string {
  const repo = OFFLINE_WHISPER_MODELS[model].repoId; // e.g. Xenova/whisper-base
  return path.join(WHISPER_CACHE_DIR, "models--" + repo.replace("/", "--"));
}

export async function offlineModelStatus(model: OfflineWhisperModel): Promise<{
  model: OfflineWhisperModel;
  downloaded: boolean;
  sizeBytes: number;
}> {
  const dir = offlineModelDir(model);
  let downloaded = false;
  let sizeBytes = 0;
  try {
    await fs.access(dir);
    downloaded = true;
    sizeBytes = await dirSizeBytes(dir);
  } catch {
    // not downloaded
  }
  return { model, downloaded, sizeBytes };
}

export async function listOfflineModelStatuses(): Promise<
  Array<{ model: OfflineWhisperModel; downloaded: boolean; sizeBytes: number }>
> {
  return Promise.all(
    (Object.keys(OFFLINE_WHISPER_MODELS) as OfflineWhisperModel[]).map(offlineModelStatus),
  );
}

/** Trigger a download of an offline model (awaits the pipeline init). */
export async function downloadOfflineModel(model: OfflineWhisperModel): Promise<void> {
  await loadOfflinePipeline(model);
}

/** Remove a downloaded offline model from the cache. */
export async function deleteOfflineModel(model: OfflineWhisperModel): Promise<boolean> {
  const dir = offlineModelDir(model);
  try {
    await fs.access(dir);
  } catch {
    return false; // not downloaded
  }
  await fs.rm(dir, { recursive: true, force: true });
  // Drop any cached pipeline so the next use re-downloads.
  offlinePipelines.delete(model);
  return true;
}

/** Transcribe Float32 PCM samples with the local Whisper model. */
export async function transcribeOffline(
  audio: Float32Array,
  model: OfflineWhisperModel,
  language?: string,
): Promise<OfflineTranscriptionResult> {
  const transcriber = await loadOfflinePipeline(model) as {
    (input: Float32Array, opts: Record<string, unknown>): Promise<{
      text: string;
      chunks?: Array<{ timestamp: [number, number]; text: string }>;
    }>;
  };
  const out = await transcriber(audio, {
    ...(language ? { language } : {}),
    return_timestamps: true,
  });
  const chunks = (out.chunks ?? [])
    .filter((c) => c && Array.isArray(c.timestamp) && c.text?.trim())
    .map((c) => ({
      start: Math.max(0, c.timestamp[0]),
      end: c.timestamp[1] ?? c.timestamp[0],
      text: c.text.trim(),
    }));
  return { text: out.text?.trim() ?? "", chunks };
}

// ---------------------------------------------------------------------------
// Provider engine (AI SDK transcribe → OpenAI-compatible providers)
// ---------------------------------------------------------------------------

export interface ProviderTranscriptionResult {
  text: string;
  language?: string;
  durationInSeconds?: number;
  segments: Array<{ start: number; end: number; text: string }>;
}

/** Whisper endpoint is served by every OpenAI-compatible provider (incl. Ollama). */
function providerSupportsTranscription(provider: typeof providers.$inferSelect): boolean {
  return provider.kind !== "anthropic";
}

/**
 * Find the provider to use for transcription:
 *   1. the explicitly configured providerId (if any),
 *   2. the conversation's own provider (if transcription-capable),
 *   3. the first enabled transcription-capable provider.
 */
export async function resolveTranscriptionProvider(
  conversationId: number,
  configuredProviderId?: number,
): Promise<typeof providers.$inferSelect | undefined> {
  if (configuredProviderId) {
    const row = await db
      .select()
      .from(providers)
      .where(eq(providers.id, configuredProviderId))
      .get();
    if (row && providerSupportsTranscription(row)) return row;
  }
  const conv = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .get();
  if (conv?.providerId) {
    const row = await db
      .select()
      .from(providers)
      .where(eq(providers.id, conv.providerId))
      .get();
    if (row && providerSupportsTranscription(row)) return row;
  }
  const all = await db
    .select()
    .from(providers)
    .where(eq(providers.enabled, true))
    .all();
  return all.find(providerSupportsTranscription);
}

/** Provider models that look like transcription models (whisper / transcribe). */
export async function listProviderTranscriptionModels(): Promise<
  Array<{ providerId: number; providerLabel: string; modelId: string; label?: string | null }>
> {
  const rows = await db
    .select({
      providerId: providerModels.providerId,
      modelId: providerModels.modelId,
      label: providerModels.label,
      providerLabel: providers.label,
    })
    .from(providerModels)
    .innerJoin(providers, eq(providerModels.providerId, providers.id))
    .all();
  const isTranscriptionModel = (id: string) =>
    /whisper|transcri|audio/i.test(id) &&
    !/image|tts|speech|voice|realtime/i.test(id);
  return rows
    .filter((r) => isTranscriptionModel(r.modelId))
    .map((r) => ({
      providerId: r.providerId,
      providerLabel: r.providerLabel,
      modelId: r.modelId,
      label: r.label,
    }));
}

/** Transcribe a 16 kHz WAV file with the provider engine. */
export async function transcribeWithProvider(
  wavBytes: Uint8Array,
  provider: typeof providers.$inferSelect,
  modelId: string,
  language?: string,
): Promise<ProviderTranscriptionResult> {
  const { transcribe } = await import("ai");
  const { createOpenAI } = await import("@ai-sdk/openai");
  const { createCompatFetch } = await import("@/lib/providers/compat");

  const baseUrl = provider.baseUrl ?? undefined;
  const apiKey = provider.apiKey ?? undefined;
  const transcriptionModel =
    baseUrl && provider.kind !== "openai"
      ? createOpenAI({
          baseURL: baseUrl,
          apiKey: apiKey ?? (provider.kind === "ollama" ? "ollama" : undefined),
          fetch: createCompatFetch(),
        }).transcription(modelId)
      : createOpenAI({ apiKey }).transcription(modelId);

  const result = await transcribe({
    model: transcriptionModel,
    audio: wavBytes,
    providerOptions:
      provider.kind === "openai" || provider.kind === "openai-compatible"
        ? { openai: language ? { language } : {} }
        : undefined,
  });

  return {
    text: result.text?.trim() ?? "",
    language: result.language,
    durationInSeconds: result.durationInSeconds,
    segments: (result.segments ?? []).map((s) => ({
      start: Math.max(0, s.startSecond),
      end: s.endSecond ?? s.startSecond,
      text: s.text.trim(),
    })),
  };
}

// ---------------------------------------------------------------------------
// Transcript rendering
// ---------------------------------------------------------------------------

/** Format seconds as [mm:ss.d] (or [hh:mm:ss.d] for long files). */
export function formatTimestamp(seconds: number): string {
  const s = Math.max(0, seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `[${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${sec.toFixed(1).padStart(4, "0")}]`;
  }
  return `[${String(m).padStart(2, "0")}:${sec.toFixed(1).padStart(4, "0")}]`;
}

/** Render a timestamped transcript text (for the saved file / UI). */
export function renderTranscript(
  segments: Array<{ start: number; end: number; text: string }>,
): string {
  if (segments.length === 0) return "";
  return segments
    .map((s) => `${formatTimestamp(s.start)} ${s.text}`)
    .join("\n");
}
