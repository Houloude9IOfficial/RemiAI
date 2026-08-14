import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";
import { truncateToolResult } from "@/lib/utils";
import {
  getRootById,
  resolvePath,
  resolveUploadUrl,
} from "@/lib/fs/access";
import {
  buildSessionFileUrl,
  normalizeSessionPath,
  resolveSessionPath,
} from "@/lib/session-files/storage";
import { emitSessionFilesChanged } from "@/lib/session-files/events";
import {
  ALL_EXTENSIONS,
  AUDIO_EXTENSIONS,
  VIDEO_EXTENSIONS,
  codecArgsForTarget,
  probeMediaMetadata,
  resolveFfmpegBinaries,
  runFfmpeg,
  type MediaMetadata,
} from "./ffmpeg";
import {
  OFFLINE_WHISPER_MODELS,
  deleteOfflineModel,
  downloadOfflineModel,
  getTranscriptionConfig,
  listOfflineModelStatuses,
  listProviderTranscriptionModels,
  offlineModelStatus,
  prepareAudioForTranscription,
  decodeWavToF32,
  renderTranscript,
  resolveTranscriptionProvider,
  saveTranscriptionConfig,
  transcribeOffline,
  transcribeWithProvider,
  type OfflineWhisperModel,
} from "./transcribe";

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

const MAX_INPUT_SIZE = 2 * 1024 * 1024 * 1024; // 2 GB — conversions above this are impractically slow
const MAX_FRAMES = 8;
const DEFAULT_FRAME_WIDTH = 960;
const DEFAULT_CONVERT_TIMEOUT = 120_000;
const MAX_CONVERT_TIMEOUT = 600_000;

// ---------------------------------------------------------------------------
// Input / output resolution
// ---------------------------------------------------------------------------

type SourceRef = {
  url?: string;
  rootId?: number;
  relativePath?: string;
};

/** Refine message for url-or-root tool inputs (mirrors read_document). */
const sourceRefine = {
  message:
    "Either `url` (for uploaded/session files) or both `rootId` and `relativePath` (for directory files) are required.",
};

async function resolveSource(src: SourceRef): Promise<{
  absPath: string;
  filename: string;
  displayPath: string;
}> {
  if (src.url) {
    const { filename, resolvedPath } = await resolveUploadUrl(src.url);
    return {
      absPath: resolvedPath,
      filename: path.basename(filename.replace(/\\/g, "/")),
      displayPath: filename,
    };
  }
  if (!src.rootId || !src.relativePath) {
    throw new Error(
      "Either `url` (for uploaded files) or both `rootId` and `relativePath` (for directory files) are required.",
    );
  }
  const root = await getRootById(src.rootId);
  const absPath = await resolvePath(root, src.relativePath);
  const displayPath = src.relativePath.replace(/\\/g, "/");
  return {
    absPath,
    filename: path.basename(displayPath),
    displayPath,
  };
}

async function assertMediaFile(absPath: string, displayPath: string): Promise<void> {
  let stats;
  try {
    stats = await fs.stat(absPath);
  } catch {
    throw new Error(`Media file not found: "${displayPath}"`);
  }
  if (!stats.isFile()) {
    throw new Error(`"${displayPath}" is not a file`);
  }
  if (stats.size > MAX_INPUT_SIZE) {
    throw new Error(
      `"${displayPath}" is ${(stats.size / 1024 / 1024 / 1024).toFixed(2)} GB — exceeds the 2 GB media-processing limit`,
    );
  }
}

/** Sanitize a user/AI-supplied output filename to a safe basename. */
function sanitizeOutputName(name: string, fallbackExt: string): string {
  const base = path.basename(String(name ?? "").replace(/\\/g, "/")).trim();
  const cleaned = base.replace(/[^\w.\- ]+/g, "").trim();
  if (!cleaned) return `output.${fallbackExt}`;
  return cleaned;
}

type OutputTarget = {
  absPath: string;
  /** Session-sandbox relative path (forward slashes) when kind === "session". */
  sessionPath?: string;
  url?: string;
  kind: "session" | "directory";
  label: string;
};

/**
 * Resolve where a generated media file should be written:
 * - explicit permitted root (`outputRootId` + `outputRelativePath`), or
 * - the conversation's session sandbox under `media/<subdir>/` by default.
 */
async function resolveOutputTarget(opts: {
  conversationId: number;
  filename: string;
  subdir: string;
  outputRootId?: number;
  outputRelativePath?: string;
}): Promise<OutputTarget> {
  const { conversationId, filename, subdir } = opts;

  if (opts.outputRootId) {
    const root = await getRootById(opts.outputRootId);
    if (!root.canWrite) {
      throw new Error(
        `Root "${root.label}" (id ${root.id}) is read-only — cannot write converted files there.`,
      );
    }
    const rel = opts.outputRelativePath?.trim()
      ? opts.outputRelativePath.replace(/\\/g, "/")
      : filename;
    const absPath = await resolvePath(root, rel);
    return { absPath, kind: "directory", label: `${root.label}/${rel}` };
  }

  if (opts.outputRelativePath) {
    throw new Error(
      "`outputRelativePath` requires `outputRootId` — pass both to write into a permitted directory, or omit both to save into this chat's session files.",
    );
  }

  const sessionPath = normalizeSessionPath(`${subdir}/${filename}`);
  const absPath = await resolveSessionPath(conversationId, sessionPath);
  return {
    absPath,
    sessionPath,
    url: buildSessionFileUrl(conversationId, sessionPath),
    kind: "session",
    label: sessionPath,
  };
}

/** Delete a partial output file after a failed ffmpeg run (best effort). */
async function cleanupOutput(target: OutputTarget): Promise<void> {
  try {
    await fs.rm(target.absPath, { force: true });
  } catch {
    // best effort
  }
}

// ---------------------------------------------------------------------------
// Shared conversion implementation
// ---------------------------------------------------------------------------

function describeRunError(stderr: string): string {
  const tail = stderr
    .trim()
    .split("\n")
    .filter((l) => l.trim())
    .slice(-6)
    .join("\n");
  return tail
    ? `ffmpeg failed${tail ? `:\n${tail}` : ""}`
    : "ffmpeg failed with no output.";
}

async function runConversion(opts: {
  conversationId: number;
  source: SourceRef;
  targetExt: string;
  outputName?: string;
  outputRootId?: number;
  outputRelativePath?: string;
  extractAudioOnly: boolean;
  videoCodec?: string;
  audioCodec?: string;
  bitrate?: string;
  width?: number;
  fps?: number;
  timeoutMs: number;
}): Promise<unknown> {
  const {
    conversationId,
    source,
    targetExt,
    extractAudioOnly,
    timeoutMs,
  } = opts;

  const input = await resolveSource(source);
  await assertMediaFile(input.absPath, input.displayPath);

  const metadata = await probeMediaMetadata(input.absPath);
  if (extractAudioOnly && !metadata.hasAudio) {
    throw new Error(
      `"${input.filename}" has no audio stream — nothing to extract.`,
    );
  }
  if (!extractAudioOnly && !metadata.hasVideo) {
    throw new Error(
      `"${input.filename}" has no video stream — use an audio format (e.g. ${[...AUDIO_EXTENSIONS].join(", ")}) instead.`,
    );
  }

  const filename = sanitizeOutputName(
    opts.outputName ?? input.filename.replace(/\.[^.]+$/, "") + "." + targetExt,
    targetExt,
  );
  const subdir = extractAudioOnly ? "media/audio" : "media/converted";
  const target = await resolveOutputTarget({
    conversationId,
    filename,
    subdir,
    outputRootId: opts.outputRootId,
    outputRelativePath: opts.outputRelativePath,
  });

  const args: string[] = ["-y", "-i", input.absPath];
  // Only the first video + first audio stream (avoid subtitle/data tracks).
  if (extractAudioOnly) {
    args.push("-map", "0:a:0");
  } else {
    args.push("-map", "0:v:0", "-map", "0:a:0?");
  }

  if (opts.width && !extractAudioOnly) {
    // ffmpeg's legacy filter parser splits on commas, so compute the actual
    // scale width in JS (never upscale beyond the source) instead of using
    // min()/iw inside the filter expression.
    const srcWidth = metadata.video?.width ?? opts.width;
    const scaleWidth = Math.min(opts.width, srcWidth);
    args.push("-vf", `scale=${scaleWidth}:-2`);
  }
  if (opts.fps && !extractAudioOnly) {
    args.push("-r", String(opts.fps));
  }

  args.push(...codecArgsForTarget(targetExt, {
    extractAudioOnly,
    videoCodec: opts.videoCodec,
    audioCodec: opts.audioCodec,
    bitrate: opts.bitrate,
  }));

  // Fast-start moov atom for MP4/M4A so the file plays before fully downloading.
  if (["mp4", "m4a"].includes(targetExt.toLowerCase())) {
    args.push("-movflags", "+faststart");
  }
  // ffmpeg does not create parent directories — ensure the target dir exists.
  await fs.mkdir(path.dirname(target.absPath), { recursive: true });
  args.push(target.absPath);

  const { ffmpeg } = await resolveFfmpegBinaries();
  const result = await runFfmpeg(ffmpeg, args, { timeoutMs });

  if (result.exitCode !== 0) {
    await cleanupOutput(target);
    throw new Error(
      (result.timedOut
        ? `Conversion timed out after ${Math.round(timeoutMs / 1000)}s and was stopped. Try a shorter clip, a smaller resolution, or a faster format.`
        : describeRunError(result.stderr)) +
        `\nOutput path was: ${target.label}`,
    );
  }

  const outStats = await fs.stat(target.absPath).catch(() => null);
  const outSize = outStats?.size ?? 0;

  return truncateToolResult(
    {
      ok: true,
      action: extractAudioOnly ? "extracted_audio" : "converted",
      format: targetExt,
      source: { filename: input.filename },
      output: {
        filename,
        size: outSize,
        path: target.label,
        ...(target.kind === "session" && target.url ? { url: target.url } : {}),
      },
      durationMs: result.durationMs,
    },
    40_000,
  );
}

// ---------------------------------------------------------------------------
// Tool: get_media_metadata
// ---------------------------------------------------------------------------

export const getMediaMetadataTool = {
  description: `Get detailed technical metadata for a video or audio file: container, duration, bitrate, codecs, resolution, frame rate (fps), pixel format, audio sample rate/channels, language tags, and per-stream details. Works with chat uploads ('url') or files in permitted directories ('rootId' + 'relativePath'). Use this first to analyze a media file, then extract frames ('extract_video_frames') to visually inspect video content or convert ('convert_media' / 'extract_audio').`,
  parameters: z
    .object({
      rootId: z
        .coerce.number()
        .int()
        .positive()
        .optional()
        .describe("Permitted root ID (omit if using `url`)"),
      relativePath: z
        .string()
        .optional()
        .describe("Path to the media file within the root (omit if using `url`)"),
      url: z
        .string()
        .optional()
        .describe("Chat file URL (upload or session sandbox file). Use instead of rootId+relativePath for chat files."),
    })
    .refine((data) => Boolean(data.url) || Boolean(data.rootId && data.relativePath), sourceRefine),
  execute: async ({ rootId, relativePath, url }: SourceRef) => {
    const input = await resolveSource({ url, rootId, relativePath });
    await assertMediaFile(input.absPath, input.displayPath);
    const metadata: MediaMetadata = await probeMediaMetadata(input.absPath);
    return truncateToolResult(
      {
        filename: metadata.filename,
        container: metadata.container,
        containerLong: metadata.containerLong,
        size: metadata.size,
        duration: metadata.duration,
        durationLabel:
          metadata.duration != null
            ? formatDuration(metadata.duration)
            : null,
        bitRate: metadata.bitRate,
        hasVideo: metadata.hasVideo,
        hasAudio: metadata.hasAudio,
        video: metadata.video
          ? {
              codec: metadata.video.codec,
              codecLong: metadata.video.codecLong,
              profile: metadata.video.profile,
              width: metadata.video.width,
              height: metadata.video.height,
              fps: metadata.video.fps,
              frameCount: metadata.video.frameCount,
              pixelFormat: metadata.video.pixelFormat,
              bitRate: metadata.video.bitRate,
              duration: metadata.video.duration,
            }
          : null,
        audio: metadata.audio
          ? {
              codec: metadata.audio.codec,
              codecLong: metadata.audio.codecLong,
              sampleRate: metadata.audio.sampleRate,
              channels: metadata.audio.channels,
              channelLayout: metadata.audio.channelLayout,
              bitRate: metadata.audio.bitRate,
              duration: metadata.audio.duration,
              language: metadata.audio.language,
            }
          : null,
        streams: metadata.streams.map((s) => ({
          index: s.index,
          codecType: s.codecType,
          codec: s.codec,
          width: s.width,
          height: s.height,
          fps: s.fps,
          sampleRate: s.sampleRate,
          channels: s.channels,
        })),
        tags: metadata.tags,
      },
      40_000,
    );
  },
};

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const parts = [String(h).padStart(2, "0"), String(m).padStart(2, "0")];
  parts.push(s.toFixed(2).padStart(5, "0"));
  return parts.join(":");
}

// ---------------------------------------------------------------------------
// Tool: convert_media
// ---------------------------------------------------------------------------

const convertParams = {
  rootId: z.coerce.number().int().positive().optional(),
  relativePath: z.string().optional(),
  url: z.string().optional(),
  format: z
    .string()
    .min(1)
    .describe(
      `Target format (no dot): video: ${[...VIDEO_EXTENSIONS].sort().join(", ")}; audio: ${[...AUDIO_EXTENSIONS].sort().join(", ")}. Audio formats strip the video track.`,
    ),
  outputName: z
    .string()
    .optional()
    .describe("Optional output filename (defaults to the source name with the new extension)"),
  outputRootId: z
    .coerce.number()
    .int()
    .positive()
    .optional()
    .describe("Write the converted file into this permitted root (requires outputRelativePath, or defaults to the output filename at the root)"),
  outputRelativePath: z
    .string()
    .optional()
    .describe("Destination path within outputRootId (forward slashes). Omit both output* fields to save into this chat's session files (returns a download URL)."),
  videoCodec: z.string().optional().describe("Optional ffmpeg video codec override (e.g. libx264, libvpx-vp9)"),
  audioCodec: z.string().optional().describe("Optional ffmpeg audio codec override (e.g. aac, libmp3lame, pcm_s16le)"),
  bitrate: z.string().optional().describe("Optional audio bitrate for mp3/m4a/aac (e.g. 128k, 192k)"),
  width: z.coerce.number().int().positive().max(7680).optional().describe("Optional max video width in pixels (aspect ratio preserved)"),
  fps: z.coerce.number().positive().optional().describe("Optional output frame rate for video (e.g. 30)"),
  timeout: z.number().int().positive().max(MAX_CONVERT_TIMEOUT).optional().default(DEFAULT_CONVERT_TIMEOUT).describe(`Timeout in ms (default ${DEFAULT_CONVERT_TIMEOUT / 1000}s, max ${MAX_CONVERT_TIMEOUT / 1000}s)`),
} as const;

export const convertMediaTool = {
  description: `Convert a video or audio file to another format (e.g. mp4, webm, mkv, mov, avi, gif, mp3, wav, m4a, ogg, flac, opus, aac). Audio target formats extract the audio track automatically. Use 'url' (chat/session files) or 'rootId' + 'relativePath' for directory files. By default the converted file is saved into this chat's session files and a 'url' is returned — pass 'outputRootId'/'outputRelativePath' to write into a permitted directory instead. The result includes the output path — embed the returned 'url' in your reply (e.g. '[file.mp4](url)') so the user can open/download it.`,
  parameters: z.object(convertParams).refine(
    (data) => Boolean(data.url) || Boolean(data.rootId && data.relativePath),
    sourceRefine,
  ),
  execute: async (args: any) => {
    const format = String(args.format ?? "").toLowerCase().replace(/^\./, "");
    if (!ALL_EXTENSIONS.has(format)) {
      throw new Error(
        `Unsupported format "${format}". Supported: video ${[...VIDEO_EXTENSIONS].sort().join(", ")}; audio ${[...AUDIO_EXTENSIONS].sort().join(", ")}.`,
      );
    }
    return runConversion({
      conversationId: args._conversationId,
      source: { url: args.url, rootId: args.rootId, relativePath: args.relativePath },
      targetExt: format,
      outputName: args.outputName,
      outputRootId: args.outputRootId,
      outputRelativePath: args.outputRelativePath,
      extractAudioOnly: AUDIO_EXTENSIONS.has(format),
      videoCodec: args.videoCodec,
      audioCodec: args.audioCodec,
      bitrate: args.bitrate,
      width: args.width,
      fps: args.fps,
      timeoutMs: args.timeout ?? DEFAULT_CONVERT_TIMEOUT,
    });
  },
};

// ---------------------------------------------------------------------------
// Tool: extract_audio
// ---------------------------------------------------------------------------

export const extractAudioTool = {
  description: `Extract the audio track from a video (or audio) file into a standalone audio file (mp3, wav, m4a, ogg, flac, opus, aac). Works with 'url' or 'rootId'+'relativePath'. Saved to this chat's session files by default (a 'url' is returned — embed it in your reply so the user can download it); pass 'outputRootId'/'outputRelativePath' to write into a permitted directory.`,
  parameters: z
    .object({
      rootId: z.coerce.number().int().positive().optional(),
      relativePath: z.string().optional(),
      url: z.string().optional(),
      format: z
        .enum(["mp3", "wav", "m4a", "ogg", "flac", "opus", "aac"])
        .optional()
        .default("mp3")
        .describe("Output audio format"),
      bitrate: z
        .string()
        .optional()
        .describe("Optional bitrate for lossy formats (e.g. 128k, 192k)"),
      outputName: z.string().optional().describe("Optional output filename"),
      outputRootId: z.coerce.number().int().positive().optional(),
      outputRelativePath: z.string().optional(),
      timeout: z.number().int().positive().max(MAX_CONVERT_TIMEOUT).optional().default(DEFAULT_CONVERT_TIMEOUT),
    })
    .refine((data) => Boolean(data.url) || Boolean(data.rootId && data.relativePath), sourceRefine),
  execute: async (args: any) => {
    const format = String(args.format ?? "mp3").toLowerCase();
    return runConversion({
      conversationId: args._conversationId,
      source: { url: args.url, rootId: args.rootId, relativePath: args.relativePath },
      targetExt: format,
      outputName: args.outputName,
      outputRootId: args.outputRootId,
      outputRelativePath: args.outputRelativePath,
      extractAudioOnly: true,
      audioCodec: undefined,
      bitrate: args.bitrate,
      timeoutMs: args.timeout ?? DEFAULT_CONVERT_TIMEOUT,
    });
  },
};

// ---------------------------------------------------------------------------
// Tool: extract_video_frames
// ---------------------------------------------------------------------------

export const extractVideoFramesTool = {
  description: `Extract still frames from a video so you can visually analyze its content. Frames are returned to you as images (you can see them immediately) and also saved as files: to this chat's session files by default ('media/frames/...', URLs returned — embed them in your reply so the user can view them) or to a permitted directory ('outputRootId' + 'outputRelativePath'). Request specific 'timestamps' (seconds) or let 'count' evenly-space frames across the video. Use after 'get_media_metadata' when you need to inspect what is actually in the video.`,
  parameters: z
    .object({
      rootId: z.coerce.number().int().positive().optional(),
      relativePath: z.string().optional(),
      url: z.string().optional(),
      timestamps: z
        .array(z.coerce.number().min(0))
        .max(MAX_FRAMES)
        .optional()
        .describe("Specific timestamps in seconds to extract (max 8). Overrides `count`."),
      count: z
        .coerce.number()
        .int()
        .min(1)
        .max(MAX_FRAMES)
        .optional()
        .default(3)
        .describe("Number of evenly-spaced frames to extract (default 3, max 8)"),
      width: z
        .coerce.number()
        .int()
        .positive()
        .max(3840)
        .optional()
        .default(DEFAULT_FRAME_WIDTH)
        .describe(`Max frame width in pixels (default ${DEFAULT_FRAME_WIDTH}, aspect ratio preserved)`),
      format: z
        .enum(["jpg", "png"])
        .optional()
        .default("jpg")
        .describe("Frame image format (jpg is smaller/faster; png is lossless)"),
      outputRootId: z.coerce.number().int().positive().optional(),
      outputRelativePath: z
        .string()
        .optional()
        .describe("Destination directory within outputRootId for the frame files (omit both output* fields to save into this chat's session files)"),
      timeout: z
        .number()
        .int()
        .positive()
        .max(300_000)
        .optional()
        .default(120_000)
        .describe("Timeout in ms (default 120s, max 300s)"),
    })
    .refine((data) => Boolean(data.url) || Boolean(data.rootId && data.relativePath), sourceRefine),
  execute: async (args: any) => {
    const input = await resolveSource({
      url: args.url,
      rootId: args.rootId,
      relativePath: args.relativePath,
    });
    await assertMediaFile(input.absPath, input.displayPath);
    const metadata = await probeMediaMetadata(input.absPath);
    if (!metadata.hasVideo) {
      throw new Error(
        `"${input.filename}" has no video stream — frames can only be extracted from videos.`,
      );
    }
    const duration = metadata.video?.duration ?? metadata.duration ?? null;

    let timestamps: number[] = [];
    if (Array.isArray(args.timestamps) && args.timestamps.length > 0) {
      timestamps = args.timestamps.map((t: number) => Number(t));
    } else {
      const count = Math.min(MAX_FRAMES, Math.max(1, args.count ?? 3));
      if (duration && duration > 0) {
        // Interior points — avoids black first/last frames on short clips.
        timestamps = Array.from(
          { length: count },
          (_, i) => (duration * (i + 1)) / (count + 1),
        );
      } else {
        timestamps = Array.from({ length: count }, (_, i) => i * 1.0);
      }
    }
    // Clamp to [0, duration] and dedupe near-identical values.
    const seen = new Set<number>();
    timestamps = timestamps
      .filter((t) => Number.isFinite(t) && t >= 0)
      .filter((t) => {
        if (duration != null && t > duration) return false;
        const key = Math.round(t * 10) / 10;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, MAX_FRAMES);

    if (timestamps.length === 0) {
      throw new Error("No valid frame timestamps could be computed for this video.");
    }

    const fmt = args.format === "png" ? "png" : "jpg";
    const ext = fmt === "png" ? "png" : "jpg";
    const stem = sanitizeOutputName(
      input.filename.replace(/\.[^.]+$/, "") + "_frame",
      "frame",
    );

    // Write frames directly into the destination (session sandbox by default).
    const subdir = "media/frames";
    let targetDir: OutputTarget | null = null;
    let dirAbsPath: string | null = null;
    if (args.outputRootId) {
      const root = await getRootById(args.outputRootId);
      if (!root.canWrite) {
        throw new Error(
          `Root "${root.label}" (id ${root.id}) is read-only — cannot write frames there.`,
        );
      }
      const rel = (args.outputRelativePath ?? "").trim().replace(/\\/g, "/");
      dirAbsPath = await resolvePath(root, rel || ".");
      targetDir = { absPath: dirAbsPath, kind: "directory", label: rel || "." };
    } else {
      const sessionPath = normalizeSessionPath(subdir);
      dirAbsPath = await resolveSessionPath(args._conversationId, sessionPath);
      targetDir = {
        absPath: dirAbsPath,
        kind: "session",
        sessionPath,
        url: buildSessionFileUrl(args._conversationId, sessionPath),
        label: sessionPath,
      };
    }

    const { ffmpeg } = await resolveFfmpegBinaries();
    const width = Math.min(3840, Math.max(16, Number(args.width) || DEFAULT_FRAME_WIDTH));
    const frames: Array<{ absPath: string; filename: string; timestamp: number }> = [];
    const failures: Array<{ timestamp: number; error: string }> = [];

    for (let i = 0; i < timestamps.length; i++) {
      const t = timestamps[i];
      const filename = `${stem}_${String(i + 1).padStart(2, "0")}.${ext}`;
      const frameAbsPath =
        targetDir.kind === "session"
          ? await resolveSessionPath(args._conversationId, `${subdir}/${filename}`)
          : path.join(dirAbsPath!, filename);
      await fs.mkdir(path.dirname(frameAbsPath), { recursive: true });

      // Compute the scale width in JS (legacy filter parser splits on commas;
      // never upscale beyond the source).
      const srcWidth = metadata.video?.width ?? width;
      const scaleWidth = Math.min(width, srcWidth);
      const vf = `scale=${scaleWidth}:-2`;
      const result = await runFfmpeg(
        ffmpeg,
        [
          "-y",
          "-ss", String(t),
          "-i", input.absPath,
          "-frames:v", "1",
          "-vf", vf,
          ...(fmt === "jpg" ? ["-q:v", "3"] : []),
          frameAbsPath,
        ],
        { timeoutMs: args.timeout ?? 120_000 },
      );
      if (result.exitCode === 0) {
        try {
          await fs.access(frameAbsPath);
          frames.push({ absPath: frameAbsPath, filename, timestamp: t });
        } catch {
          failures.push({ timestamp: t, error: "ffmpeg exited 0 but produced no file" });
        }
      } else {
        failures.push({
          timestamp: t,
          error: result.timedOut ? "timed out" : result.stderr.trim().split("\n").slice(-2).join(" "),
        });
      }
    }

    if (frames.length === 0) {
      const detail =
        failures.length > 0
          ? ` (${failures.length} of ${timestamps.length} failed: ${failures[0].error})`
          : "";
      throw new Error(`Failed to extract any frames from "${input.filename}"${detail}`);
    }

    // Notify the session panel about the new frame files.
    if (targetDir.kind === "session") {
      for (const frame of frames) {
        emitSessionFilesChanged(args._conversationId, {
          operation: "write",
          path: `${subdir}/${frame.filename}`,
        });
      }
    }

    // Build the content result: text summary + the frames as images the model
    // can actually see (AI SDK v7 "content" tool output with file parts).
    const textLines = [
      `Extracted ${frames.length} frame${frames.length === 1 ? "" : "s"} from "${input.filename}":`,
      ...frames.map((f) => {
        const t = formatDuration(f.timestamp).replace(/^00:/, "");
        const loc =
          targetDir.kind === "session"
            ? buildSessionFileUrl(args._conversationId, `${subdir}/${f.filename}`)
            : f.absPath;
        return `- ${t} → ${loc}`;
      }),
    ];
    if (failures.length > 0) {
      textLines.push(
        `(${failures.length} requested frame${failures.length === 1 ? "" : "s"} could not be extracted)`,
      );
    }
    textLines.push(
      "The frames are attached as images below — inspect them and describe/analyze their content. Embed their URLs in your reply so the user can view them too.",
    );

    const value: any[] = [{ type: "text", text: textLines.join("\n") }];
    for (const frame of frames) {
      const data = await fs.readFile(frame.absPath);
      value.push({
        type: "file",
        filename: frame.filename,
        mediaType: fmt === "png" ? "image/png" : "image/jpeg",
        data: { type: "data", data: data.toString("base64") },
      });
    }

    return { type: "content", value };
  },
  // Tell the AI SDK this tool's output is an SDK v7 "content" output (text +
  // image file parts) rather than plain JSON — without this the frames would
  // be re-serialized as a base64 JSON blob and the model could never "see"
  // them, defeating the purpose of frame extraction.
  toModelOutput: async ({ output }: { output: unknown }) => output,
};

// ---------------------------------------------------------------------------
// Tool: transcribe_audio
// ---------------------------------------------------------------------------

const MAX_TRANSCRIBE_TIMEOUT = 600_000;
const DEFAULT_TRANSCRIBE_TIMEOUT = 300_000;

/** Cap the transcript body returned inline to keep tool results bounded. */
const MAX_INLINE_TRANSCRIPT = 12_000;

async function runTranscription(opts: {
  conversationId: number;
  source: SourceRef;
  engine?: "auto" | "offline" | "provider";
  model?: string;
  language?: string;
  outputName?: string;
  outputRootId?: number;
  outputRelativePath?: string;
  timeoutMs: number;
}): Promise<unknown> {
  const input = await resolveSource(opts.source);
  await assertMediaFile(input.absPath, input.displayPath);

  // Probe to check the file actually has an audio stream.
  const metadata = await probeMediaMetadata(input.absPath);
  if (!metadata.hasAudio) {
    throw new Error(
      `"${input.filename}" has no audio stream — nothing to transcribe.`,
    );
  }

  // Normalize to 16 kHz mono WAV (both engines consume this).
  const prepared = await prepareAudioForTranscription(input.absPath, opts.timeoutMs);
  let result: {
    text: string;
    language?: string;
    durationInSeconds?: number;
    segments: Array<{ start: number; end: number; text: string }>;
  };
  let engineUsed: "offline" | "provider";
  let modelUsed: string;
  try {
    const config = await getTranscriptionConfig();

    // Resolve which engine to use.
    let engine: "offline" | "provider";
    if (opts.engine && opts.engine !== "auto") {
      engine = opts.engine;
    } else {
      engine = config.engine;
    }

    if (engine === "offline") {
      // Resolve the offline model: explicit arg (must be a known id) → config.
      let offlineModel: OfflineWhisperModel = config.offlineModel;
      if (opts.model) {
        const candidate = String(opts.model).trim();
        if (!(candidate in OFFLINE_WHISPER_MODELS)) {
          throw new Error(
            `Unknown offline model "${candidate}". Available: ${Object.keys(OFFLINE_WHISPER_MODELS).join(", ")}.`,
          );
        }
        offlineModel = candidate as OfflineWhisperModel;
      }
      const samples = decodeWavToF32(prepared.bytes);
      const off = await transcribeOffline(samples, offlineModel, opts.language ?? config.language);
      result = { text: off.text, segments: off.chunks };
      engineUsed = "offline";
      modelUsed = offlineModel;
    } else {
      // Provider engine.
      const provider = await resolveTranscriptionProvider(
        opts.conversationId,
        config.providerId,
      );
      if (!provider) {
        throw new Error(
          "No provider available for transcription. Configure an OpenAI-compatible provider, or switch to the offline engine (manage_transcription_models → set engine to offline).",
        );
      }
      const providerModel = opts.model?.trim() || config.providerModel || "whisper-1";
      const prov = await transcribeWithProvider(
        prepared.bytes,
        provider,
        providerModel,
        opts.language ?? config.language,
      );
      result = prov;
      engineUsed = "provider";
      modelUsed = providerModel;
    }
  } finally {
    // Always remove the temp WAV + directory.
    await fs.rm(prepared.tmpDir, { recursive: true, force: true }).catch(() => {});
  }

  const transcript = result.text;
  if (!transcript.trim()) {
    throw new Error(
      "Transcription produced no text — the audio may contain no clear speech, or the model failed to recognize it.",
    );
  }

  // Save a transcript file into the session sandbox (or permitted directory).
  const filename = sanitizeOutputName(
    opts.outputName ?? input.filename.replace(/\.[^.]+$/, "") + ".txt",
    "txt",
  );
  const target = await resolveOutputTarget({
    conversationId: opts.conversationId,
    filename,
    subdir: "media/transcripts",
    outputRootId: opts.outputRootId,
    outputRelativePath: opts.outputRelativePath,
  });
  await fs.mkdir(path.dirname(target.absPath), { recursive: true });
  await fs.writeFile(
    target.absPath,
    renderTranscript(result.segments) || transcript,
    "utf-8",
  );
  if (target.kind === "session") {
    emitSessionFilesChanged(opts.conversationId, {
      operation: "write",
      path: target.sessionPath ?? target.label,
    });
  }

  // Build the inline transcript (capped) plus a segment summary.
  const inline =
    transcript.length > MAX_INLINE_TRANSCRIPT
      ? transcript.slice(0, MAX_INLINE_TRANSCRIPT) +
        `\n…[truncated — full transcript (${transcript.length.toLocaleString()} chars) saved to the transcript file; quote segments from it or read the file with a session-file tool for the rest]`
      : transcript;

  return truncateToolResult(
    {
      ok: true,
      engine: engineUsed,
      model: modelUsed,
      language: result.language ?? opts.language ?? null,
      durationInSeconds: result.durationInSeconds ?? metadata.duration ?? null,
      transcript: inline,
      segmentCount: result.segments.length,
      segments: result.segments.slice(0, 200).map((s) => ({
        start: Math.round(s.start * 10) / 10,
        end: Math.round(s.end * 10) / 10,
        text: s.text,
      })),
      transcriptFile: {
        filename,
        path: target.label,
        ...(target.kind === "session" && target.url ? { url: target.url } : {}),
      },
    },
    60_000,
  );
}

export const transcribeAudioTool = {
  description: `Transcribe speech in a video or audio file to text, using either a local Whisper model (offline, private, no API key — models are downloaded once via manage_transcription_models) or your configured OpenAI-compatible provider (fast, uses provider credits). Returns the transcript, timestamped segments, detected language, and saves a .txt transcript file into this chat's session files by default (a 'url' is returned — embed it in your reply so the user can download it); pass 'outputRootId'/'outputRelativePath' to write into a permitted directory instead. Use 'url' for chat/session files or 'rootId'+'relativePath' for directory files. For long recordings, prefer the offline engine or split the audio first.`,
  parameters: z
    .object({
      rootId: z.coerce.number().int().positive().optional(),
      relativePath: z.string().optional(),
      url: z.string().optional(),
      engine: z
        .enum(["auto", "offline", "provider"])
        .optional()
        .describe("Transcription engine: offline (local Whisper, private/free) or provider (configured API). Defaults to the configured engine."),
      model: z
        .string()
        .optional()
        .describe("Optional model override: an offline model id (whisper-tiny, whisper-base, whisper-small) or a provider transcription model id (e.g. whisper-1)."),
      language: z
        .string()
        .optional()
        .describe("Optional ISO-639-1 language hint (e.g. 'en', 'es'); auto-detected when omitted."),
      outputName: z.string().optional().describe("Optional output filename for the transcript (.txt)"),
      outputRootId: z.coerce.number().int().positive().optional(),
      outputRelativePath: z.string().optional(),
      timeout: z
        .number()
        .int()
        .positive()
        .max(MAX_TRANSCRIBE_TIMEOUT)
        .optional()
        .default(DEFAULT_TRANSCRIBE_TIMEOUT)
        .describe(`Timeout in ms (default ${DEFAULT_TRANSCRIBE_TIMEOUT / 1000}s, max ${MAX_TRANSCRIBE_TIMEOUT / 1000}s)`),
    })
    .refine((data) => Boolean(data.url) || Boolean(data.rootId && data.relativePath), sourceRefine),
  execute: async (args: any) => {
    return runTranscription({
      conversationId: args._conversationId,
      source: { url: args.url, rootId: args.rootId, relativePath: args.relativePath },
      engine: args.engine,
      model: args.model,
      language: args.language,
      outputName: args.outputName,
      outputRootId: args.outputRootId,
      outputRelativePath: args.outputRelativePath,
      timeoutMs: args.timeout ?? DEFAULT_TRANSCRIBE_TIMEOUT,
    });
  },
};

// ---------------------------------------------------------------------------
// Tool: manage_transcription_models
// ---------------------------------------------------------------------------

const transcriptionModelList = (config: any) =>
  `Active configuration: engine=${config.engine}, model=${config.engine === "offline" ? config.offlineModel : config.providerModel}${config.language ? `, language=${config.language}` : ""}.\n\n`;

export const manageTranscriptionModelsTool = {
  description: `Manage how the AI transcribes audio: list offline Whisper models (with download status and sizes) and your provider's transcription models, download or delete offline models (downloaded once, cached locally — offline transcription is private and free), and set which engine/model is used by transcribe_audio. Actions: 'list' (default), 'download' (offline model), 'delete' (offline model), 'set' (engine + optional model/language). Call 'list' first to see what's available.`,
  parameters: z.object({
    action: z
      .enum(["list", "download", "delete", "set"])
      .optional()
      .default("list")
      .describe("Action to perform (default: list)"),
    model: z
      .string()
      .optional()
      .describe("Model id for download/delete (offline: whisper-tiny, whisper-base, whisper-small) or for set with engine='provider' (e.g. whisper-1)"),
    engine: z
      .enum(["offline", "provider"])
      .optional()
      .describe("Engine to set as active (with action='set')"),
    providerId: z
      .coerce.number()
      .int()
      .positive()
      .optional()
      .describe("Provider row id to use for the provider engine (with action='set', engine='provider'). Defaults to the conversation's provider."),
    language: z
      .string()
      .optional()
      .describe("Optional language hint to set (ISO-639-1, e.g. 'en'), or 'auto' to clear it (with action='set')"),
  }),
  execute: async (args: any) => {
    const action = args.action ?? "list";
    const config = await getTranscriptionConfig();

    if (action === "list") {
      const [offline, providerModels, providerUsed] = await Promise.all([
        listOfflineModelStatuses(),
        listProviderTranscriptionModels(),
        resolveTranscriptionProvider(0, config.providerId).catch(() => undefined),
      ]);
      const offlineLines = offline
        .map(
          (m) =>
            `- ${m.model} (${OFFLINE_WHISPER_MODELS[m.model].params} params, ${OFFLINE_WHISPER_MODELS[m.model].size}): ${m.downloaded ? `downloaded (${(m.sizeBytes / 1024 / 1024).toFixed(0)} MB)` : "not downloaded"}`,
        )
        .join("\n");
      const providerLines =
        providerModels.length > 0
          ? providerModels
              .map(
                (m) => `- ${m.modelId} (via ${m.providerLabel}${m.label ? ` — ${m.label}` : ""})`,
              )
              .join("\n")
          : "- (no transcription models found in your providers — whisper-1 works with most OpenAI-compatible providers)";
      const providerSummary = providerUsed
        ? `Provider engine uses: ${providerUsed.label} (id ${providerUsed.id})`
        : "No transcription-capable provider configured — the provider engine is unavailable until you add one (OpenAI or OpenAI-compatible).";
      return truncateToolResult(
        {
          engine: config.engine,
          offlineModel: config.offlineModel,
          providerModel: config.providerModel,
          providerId: config.providerId ?? null,
          language: config.language ?? null,
          offlineModels: offlineLines,
          providerModels: providerLines,
          providerStatus: providerSummary,
        },
        30_000,
      );
    }

    if (action === "download") {
      const model = args.model as string;
      if (!model || !(model in OFFLINE_WHISPER_MODELS)) {
        throw new Error(
          `Specify an offline model to download: ${Object.keys(OFFLINE_WHISPER_MODELS).join(", ")}.`,
        );
      }
      const m = model as OfflineWhisperModel;
      const before = await offlineModelStatus(m);
      if (before.downloaded) {
        return `Offline model "${m}" is already downloaded (${(before.sizeBytes / 1024 / 1024).toFixed(0)} MB). It is ready to use with transcribe_audio.`;
      }
      await downloadOfflineModel(m);
      const after = await offlineModelStatus(m);
      return `Downloaded offline model "${m}" (${(after.sizeBytes / 1024 / 1024).toFixed(0)} MB). Use transcribe_audio to transcribe — it is now the default unless you change it.`;
    }

    if (action === "delete") {
      const model = args.model as string;
      if (!model || !(model in OFFLINE_WHISPER_MODELS)) {
        throw new Error(
          `Specify an offline model to delete: ${Object.keys(OFFLINE_WHISPER_MODELS).join(", ")}.`,
        );
      }
      const m = model as OfflineWhisperModel;
      const deleted = await deleteOfflineModel(m);
      return deleted
        ? `Deleted offline model "${m}". It will be re-downloaded on next use.`
        : `Model "${m}" was not downloaded — nothing to delete.`;
    }

    // action === "set"
    if (!args.engine || (args.engine !== "offline" && args.engine !== "provider")) {
      throw new Error(
        "Specify an engine to switch to: 'offline' or 'provider' (with action='set').",
      );
    }
    const patch: any = { engine: args.engine };
    if (args.engine === "offline") {
      if (args.model) {
        if (!(args.model in OFFLINE_WHISPER_MODELS)) {
          throw new Error(
            `Unknown offline model "${args.model}". Available: ${Object.keys(OFFLINE_WHISPER_MODELS).join(", ")}.`,
          );
        }
        patch.offlineModel = args.model;
      }
    } else {
      if (args.model) patch.providerModel = args.model.trim();
      if (args.providerId) patch.providerId = Number(args.providerId);
    }
    if (args.language !== undefined) {
      const lang = String(args.language).trim().toLowerCase();
      patch.language = lang === "auto" || lang === "" ? undefined : lang;
    }
    const saved = await saveTranscriptionConfig(patch);
    return (
      transcriptionModelList(saved) +
      `transcribe_audio will now use engine="${saved.engine}"` +
      (saved.engine === "offline"
        ? ` with offline model "${saved.offlineModel}"` +
          (saved.language ? ` and language "${saved.language}"` : " (auto-detect)")
        : ` with provider model "${saved.providerModel}"` +
          (saved.language ? ` and language "${saved.language}"` : " (auto-detect)")) +
      "."
    );
  },
};

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

/**
 * Build the media-processing tools for a conversation. The tools write
 * generated files into the conversation's session sandbox by default, so the
 * builder needs the conversation id.
 */
export function buildMediaTools(conversationId: number): Record<string, any> {
  const withConversation = (tool: any) => ({
    ...tool,
    execute: async (args: any) => {
      try {
        return await tool.execute({ ...args, _conversationId: conversationId });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(message);
      }
    },
  });

  return {
    get_media_metadata: getMediaMetadataTool,
    convert_media: withConversation(convertMediaTool),
    extract_audio: withConversation(extractAudioTool),
    extract_video_frames: withConversation(extractVideoFramesTool),
    transcribe_audio: withConversation(transcribeAudioTool),
    manage_transcription_models: manageTranscriptionModelsTool,
  };
}
