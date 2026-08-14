import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

// ---------------------------------------------------------------------------
// Binary resolution
//
// ffmpeg/ffprobe are resolved in this order:
//   1. FFMPEG_PATH / FFPROBE_PATH env overrides
//   2. binaries on PATH (system installs — e.g. the Docker image's apt ffmpeg)
//   3. bundled binaries from ffmpeg-static / ffprobe-static (installed by npm)
// The resolved paths are cached for the process lifetime.
// ---------------------------------------------------------------------------

export interface FfmpegBinaries {
  ffmpeg: string;
  ffprobe: string;
  source: "env" | "system" | "bundled";
}

let cachedBinaries: FfmpegBinaries | null = null;

function isExecutable(p: string): boolean {
  try {
    fs.accessSync(p, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** Search the PATH (plus extra dirs) for a binary name. */
function findOnPath(bin: string, extraDirs: string[] = []): string | null {
  const pathVar =
    process.env.PATH && process.env.PATH.trim().length > 0
      ? process.env.PATH
      : process.platform === "win32"
        ? "C:\\Windows\\System32;C:\\Windows"
        : "/usr/bin:/bin:/usr/sbin:/sbin";
  const dirs = [...pathVar.split(path.delimiter), ...extraDirs];
  for (const dir of dirs) {
    if (!dir) continue;
    const candidate = path.join(
      dir,
      process.platform === "win32" ? `${bin}.exe` : bin,
    );
    if (isExecutable(candidate)) return candidate;
  }
  return null;
}

/** Try the bundled ffmpeg-static / ffprobe-static packages. */
async function findBundled(
  pkg: "ffmpeg-static" | "ffprobe-static",
): Promise<string | null> {
  try {
    const mod = (await import(pkg)) as unknown;
    const raw = (mod as Record<string, unknown>).default ?? mod;
    const candidate =
      typeof raw === "string"
        ? raw
        : typeof (raw as Record<string, unknown>).path === "string"
          ? ((raw as Record<string, unknown>).path as string)
          : null;
    if (candidate && isExecutable(candidate)) return candidate;
  } catch {
    // Package not installed / binary download skipped — fall through.
  }
  return null;
}

/**
 * Resolve usable ffmpeg + ffprobe binaries. Throws a descriptive error when
 * neither a system install nor the bundled binaries are available.
 */
export async function resolveFfmpegBinaries(): Promise<FfmpegBinaries> {
  if (cachedBinaries) return cachedBinaries;

  const envFfmpeg = process.env.FFMPEG_PATH;
  const envFfprobe = process.env.FFPROBE_PATH;
  if (
    envFfmpeg &&
    envFfprobe &&
    isExecutable(envFfmpeg) &&
    isExecutable(envFfprobe)
  ) {
    cachedBinaries = { ffmpeg: envFfmpeg, ffprobe: envFfprobe, source: "env" };
    return cachedBinaries;
  }

  const systemFfmpeg = findOnPath("ffmpeg");
  const systemFfprobe = findOnPath("ffprobe");
  if (systemFfmpeg && systemFfprobe) {
    cachedBinaries = {
      ffmpeg: systemFfmpeg,
      ffprobe: systemFfprobe,
      source: "system",
    };
    return cachedBinaries;
  }

  const [bundledFfmpeg, bundledFfprobe] = await Promise.all([
    findBundled("ffmpeg-static"),
    findBundled("ffprobe-static"),
  ]);
  if (bundledFfmpeg && bundledFfprobe) {
    cachedBinaries = {
      ffmpeg: bundledFfmpeg,
      ffprobe: bundledFfprobe,
      source: "bundled",
    };
    return cachedBinaries;
  }

  throw new Error(
    "ffmpeg/ffprobe are not available. Install them (e.g. `brew install ffmpeg` or `apt-get install ffmpeg`) or set FFMPEG_PATH/FFPROBE_PATH. (The bundled ffmpeg-static/ffprobe-static binaries could not be used.)",
  );
}

// ---------------------------------------------------------------------------
// Subprocess runner (with timeout + process-tree kill)
// ---------------------------------------------------------------------------

export interface FfmpegRunResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
}

/** Kill a process and its whole tree, cross-platform. */
function killProcessTree(proc: import("node:child_process").ChildProcess): void {
  const pid = proc.pid;
  try {
    if (process.platform === "win32") {
      if (pid) {
        spawn("taskkill", ["/pid", String(pid), "/T", "/F"], {
          stdio: "ignore",
          windowsHide: true,
        });
      } else {
        proc.kill();
      }
      return;
    }
    if (pid) {
      try {
        process.kill(-pid, "SIGTERM");
      } catch {
        proc.kill("SIGTERM");
      }
      setTimeout(() => {
        try {
          process.kill(-pid, "SIGKILL");
        } catch {
          try {
            proc.kill("SIGKILL");
          } catch {
            // already dead
          }
        }
      }, 2000);
    } else {
      proc.kill("SIGTERM");
    }
  } catch {
    // Process may already be dead
  }
}

/** Minimal env for subprocesses (GUI-launched apps can have an empty PATH). */
function getSafeEnv(): NodeJS.ProcessEnv {
  const fallbackPath =
    process.platform === "win32"
      ? "C:\\Windows\\System32;C:\\Windows"
      : "/usr/bin:/bin:/usr/sbin:/sbin";
  const env: Record<string, string> = {
    PATH:
      process.env.PATH && process.env.PATH.trim().length > 0
        ? process.env.PATH
        : fallbackPath,
  };
  if (process.platform === "win32") {
    env.SYSTEMROOT = process.env.SYSTEMROOT ?? "";
  }
  return env as NodeJS.ProcessEnv;
}

/**
 * Run a binary with args, collecting stdout/stderr. On timeout the whole
 * process tree is killed and `timedOut` is set.
 */
export async function runFfmpeg(
  bin: string,
  args: string[],
  opts: { timeoutMs: number },
): Promise<FfmpegRunResult> {
  const start = Date.now();
  return new Promise((resolve) => {
    let resolved = false;
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const proc = spawn(bin, args, {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      detached: process.platform !== "win32",
      env: getSafeEnv(),
    });

    const timeoutTimer = setTimeout(() => {
      timedOut = true;
      killProcessTree(proc);
    }, opts.timeoutMs);

    proc.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf-8");
    });
    proc.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf-8");
    });

    proc.on("error", (err: NodeJS.ErrnoException) => {
      clearTimeout(timeoutTimer);
      if (!resolved) {
        resolved = true;
        resolve({
          stdout,
          stderr: `Cannot run: ${err.message}`,
          exitCode: -1,
          timedOut,
          durationMs: Date.now() - start,
        });
      }
    });

    proc.on("close", (exitCode) => {
      clearTimeout(timeoutTimer);
      if (!resolved) {
        resolved = true;
        resolve({
          stdout,
          stderr,
          exitCode,
          timedOut,
          durationMs: Date.now() - start,
        });
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Metadata probing (ffprobe)
// ---------------------------------------------------------------------------

export interface MediaStreamInfo {
  index: number;
  /** "video" | "audio" | "subtitle" | "data" | ... */
  codecType: string;
  codec: string;
  codecLong?: string;
  profile?: string;
  width?: number;
  height?: number;
  pixelFormat?: string;
  /** Frames per second (decimal), or null when unknown. */
  fps?: number | null;
  /** Number of frames (when the container knows it). */
  frameCount?: number;
  /** Bit rate in bits/second, or null. */
  bitRate?: number | null;
  /** Audio sample rate in Hz, or null. */
  sampleRate?: number | null;
  channels?: number | null;
  channelLayout?: string;
  /** Duration in seconds, or null. */
  duration?: number | null;
  language?: string;
  title?: string;
}

export interface MediaMetadata {
  filename: string;
  container: string;
  containerLong?: string;
  size: number;
  /** Duration in seconds, or null. */
  duration?: number | null;
  /** Bit rate in bits/second, or null. */
  bitRate?: number | null;
  streams: MediaStreamInfo[];
  /** First video stream (convenience). */
  video?: MediaStreamInfo;
  /** First audio stream (convenience). */
  audio?: MediaStreamInfo;
  hasVideo: boolean;
  hasAudio: boolean;
  tags?: Record<string, string>;
}

/** Parse "30000/1001" (or "25", "0/0") into a decimal fps value. */
export function parseFps(raw: unknown): number | null {
  if (typeof raw !== "string" || !raw) return null;
  if (!raw.includes("/")) {
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  const [numStr, denStr] = raw.split("/");
  const num = Number(numStr);
  const den = Number(denStr);
  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0 || num === 0) {
    return null;
  }
  const value = num / den;
  return Number.isFinite(value) && value > 0 ? Math.round(value * 1000) / 1000 : null;
}

function toNumber(raw: unknown): number | null {
  if (typeof raw === "number") return raw;
  if (typeof raw === "string" && raw.trim() !== "") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function mapStream(raw: Record<string, unknown>, index: number): MediaStreamInfo {
  const tags = raw.tags as Record<string, unknown> | undefined;
  return {
    index,
    codecType: String(raw.codec_type ?? "unknown"),
    codec: String(raw.codec_name ?? "unknown"),
    codecLong:
      typeof raw.codec_long_name === "string" ? raw.codec_long_name : undefined,
    profile: typeof raw.profile === "string" ? raw.profile : undefined,
    width: toNumber(raw.width) ?? undefined,
    height: toNumber(raw.height) ?? undefined,
    pixelFormat:
      typeof raw.pix_fmt === "string" ? raw.pix_fmt : undefined,
    fps: parseFps(raw.avg_frame_rate ?? raw.r_frame_rate),
    frameCount: toNumber(raw.nb_frames) ?? undefined,
    bitRate: toNumber(raw.bit_rate) ?? undefined,
    sampleRate: toNumber(raw.sample_rate) ?? undefined,
    channels: toNumber(raw.channels) ?? undefined,
    channelLayout:
      typeof raw.channel_layout === "string" ? raw.channel_layout : undefined,
    duration: toNumber(raw.duration) ?? undefined,
    language:
      typeof tags?.language === "string" ? tags.language : undefined,
    title: typeof tags?.title === "string" ? tags.title : undefined,
  };
}

function mapTags(raw: Record<string, unknown> | undefined): Record<string, string> | undefined {
  if (!raw) return undefined;
  const tags: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string") tags[key] = value;
  }
  return Object.keys(tags).length > 0 ? tags : undefined;
}

/**
 * Probe a media file and return normalized metadata. Works for video and
 * audio files of any format ffprobe understands.
 */
export async function probeMediaMetadata(filePath: string): Promise<MediaMetadata> {
  const { ffprobe } = await resolveFfmpegBinaries();
  const result = await runFfmpeg(
    ffprobe,
    ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", filePath],
    { timeoutMs: 30_000 },
  );

  if (result.exitCode !== 0 || !result.stdout.trim()) {
    const tail = result.stderr.trim().split("\n").slice(-5).join("\n");
    throw new Error(
      `ffprobe failed to read the file${tail ? `:\n${tail}` : " (is it a valid media file?)"}`,
    );
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    throw new Error("ffprobe returned unparseable output for this file.");
  }

  const format = (parsed.format as Record<string, unknown>) ?? {};
  const rawStreams = Array.isArray(parsed.streams) ? (parsed.streams as Record<string, unknown>[]) : [];

  const streams = rawStreams.map((s, i) => mapStream(s, i));
  const video = streams.find((s) => s.codecType === "video");
  const audio = streams.find((s) => s.codecType === "audio");

  return {
    filename: path.basename(filePath),
    container: String(format.format_name ?? "unknown"),
    containerLong:
      typeof format.format_long_name === "string" ? format.format_long_name : undefined,
    size: toNumber(format.size) ?? 0,
    duration: toNumber(format.duration),
    bitRate: toNumber(format.bit_rate),
    streams,
    video,
    audio,
    hasVideo: Boolean(video),
    hasAudio: Boolean(audio),
    tags: mapTags(format.tags as Record<string, unknown> | undefined),
  };
}

// ---------------------------------------------------------------------------
// Conversion helpers
// ---------------------------------------------------------------------------

/** Audio-only target extensions → extract-audio path. */
export const AUDIO_EXTENSIONS = new Set([
  "mp3", "wav", "m4a", "ogg", "oga", "flac", "opus", "aac",
]);

/** Video container targets → re-encode video (+ audio when present). */
export const VIDEO_EXTENSIONS = new Set([
  "mp4", "webm", "mkv", "mov", "avi", "gif",
]);

export const ALL_EXTENSIONS = new Set([...AUDIO_EXTENSIONS, ...VIDEO_EXTENSIONS]);

export function isAudioExt(ext: string): boolean {
  return AUDIO_EXTENSIONS.has(ext.toLowerCase());
}

/**
 * Return the ffmpeg codec args for a target extension. Keeps the output
 * broadly compatible (H.264+AAC for mp4/mkv/mov, VP9+Opus for webm, ...).
 */
export function codecArgsForTarget(
  ext: string,
  opts: {
    extractAudioOnly?: boolean;
    videoCodec?: string;
    audioCodec?: string;
    bitrate?: string;
  } = {},
): string[] {
  const e = ext.toLowerCase();
  const args: string[] = [];

  // Audio-only targets always drop video.
  if (isAudioExt(e) || opts.extractAudioOnly) {
    args.push("-vn");
  } else if (!opts.videoCodec) {
    switch (e) {
      case "mp4":
      case "mkv":
      case "mov":
        args.push("-c:v", "libx264", "-pix_fmt", "yuv420p");
        break;
      case "webm":
        args.push("-c:v", "libvpx-vp9");
        break;
      case "avi":
        args.push("-c:v", "mpeg4");
        break;
      case "gif":
        args.push("-vf", "fps=12,scale=480:-1:flags=lanczos");
        break;
      default:
        break;
    }
  } else {
    args.push("-c:v", opts.videoCodec);
  }

  if (e === "gif") {
    // GIF has no audio track.
    args.push("-an");
    return args;
  }

  const audioTarget = isAudioExt(e) ? e : e;
  if (opts.audioCodec) {
    args.push("-c:a", opts.audioCodec);
  } else if (opts.extractAudioOnly || isAudioExt(e)) {
    switch (audioTarget) {
      case "mp3":
        args.push("-c:a", "libmp3lame", "-b:a", opts.bitrate ?? "192k");
        break;
      case "wav":
        args.push("-c:a", "pcm_s16le");
        break;
      case "m4a":
        args.push("-c:a", "aac");
        break;
      case "ogg":
      case "oga":
        args.push("-c:a", "libvorbis");
        break;
      case "flac":
        args.push("-c:a", "flac");
        break;
      case "opus":
        args.push("-c:a", "libopus");
        break;
      case "aac":
        args.push("-c:a", "aac");
        break;
      default:
        break;
    }
  } else {
    switch (e) {
      case "mp4":
      case "mkv":
      case "mov":
        args.push("-c:a", "aac");
        break;
      case "webm":
        args.push("-c:a", "libopus");
        break;
      case "avi":
        args.push("-c:a", "libmp3lame");
        break;
      default:
        break;
    }
  }

  return args;
}
