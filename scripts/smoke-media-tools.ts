/* eslint-disable */
// Quick smoke test for the media tools.
// Run with: npx tsx scripts/smoke-media-tools.ts
// Seeds a copy of /tmp/media-test/sample.mp4 into the app's session-files dir
// (conversation 999001) and exercises all four tools against it.
import path from "node:path";
import fs from "node:fs/promises";
import { buildMediaTools } from "../lib/media/tools";
import { SESSION_FILES_DIR } from "../lib/paths";

const CONVERSATION_ID = 999001;
const SRC = "/tmp/media-test/sample.mp4";
const sessionUrl = `/api/chat/${CONVERSATION_ID}/session-files/uploads/sample.mp4`;

async function main() {
  const sandbox = path.join(SESSION_FILES_DIR, String(CONVERSATION_ID), "uploads");
  await fs.mkdir(sandbox, { recursive: true });
  await fs.copyFile(SRC, path.join(sandbox, "sample.mp4"));

  const tools = buildMediaTools(CONVERSATION_ID);

  // 1. metadata via session URL
  console.log("== get_media_metadata ==");
  const meta = await tools.get_media_metadata.execute({ url: sessionUrl });
  console.log(JSON.stringify({
    filename: meta.filename,
    container: meta.container,
    duration: meta.duration,
    hasVideo: meta.hasVideo,
    hasAudio: meta.hasAudio,
    video: meta.video && { codec: meta.video.codec, width: meta.video.width, height: meta.video.height, fps: meta.video.fps, pixelFormat: meta.video.pixelFormat },
    audio: meta.audio && { codec: meta.audio.codec, sampleRate: meta.audio.sampleRate, channels: meta.audio.channels },
  }, null, 2));

  // 2. convert mp4 → webm
  console.log("\n== convert_media (mp4 → webm) ==");
  const conv = await tools.convert_media.execute({ url: sessionUrl, format: "webm" });
  console.log(JSON.stringify(conv, null, 2));

  // 3. extract audio
  console.log("\n== extract_audio (→ mp3) ==");
  const audio = await tools.extract_audio.execute({ url: sessionUrl, format: "mp3" });
  console.log(JSON.stringify(audio, null, 2));

  // 4. extract frames
  console.log("\n== extract_video_frames (count=3, jpg) ==");
  const frames = await tools.extract_video_frames.execute({ url: sessionUrl, count: 3, format: "jpg" });
  console.log("type:", frames.type);
  const textPart = frames.value.find((v: any) => v.type === "text");
  const fileParts = frames.value.filter((v: any) => v.type === "file");
  console.log("text:\n" + textPart.text);
  console.log("file parts:", fileParts.length, "| mediaType:", fileParts[0]?.mediaType, "| base64 len:", fileParts[0]?.data?.data?.length);

  const frameDir = path.join(SESSION_FILES_DIR, String(CONVERSATION_ID), "media", "frames");
  console.log("frames on disk:", await fs.readdir(frameDir));

  // 5. convert with a bad format → error
  console.log("\n== convert_media (bad format) ==");
  try {
    await tools.convert_media.execute({ url: sessionUrl, format: "exe" });
    console.log("ERROR: should have thrown");
  } catch (e: any) {
    console.log("expected error:", e.message.slice(0, 160));
  }

  // 6. extract audio from an audio file (mp3 → wav)
  console.log("\n== convert_media (mp3 → wav) ==");
  const mp3Path = path.join(SESSION_FILES_DIR, String(CONVERSATION_ID), "media", "audio");
  const wav = await tools.convert_media.execute({
    url: `/api/chat/${CONVERSATION_ID}/session-files/media/audio/sample.mp3`,
    format: "wav",
  });
  console.log(JSON.stringify(wav, null, 2));

  // 7. manage_transcription_models (list)
  console.log("\n== manage_transcription_models (list) ==");
  const models = await tools.manage_transcription_models.execute({ action: "list" });
  console.log(JSON.stringify({
    engine: models.engine,
    offlineModel: models.offlineModel,
    providerModel: models.providerModel,
    offlineModels: models.offlineModels,
    providerModels: models.providerModels,
    providerStatus: models.providerStatus,
  }, null, 2));

  // 8. transcribe_audio (offline, tiny — small + fast)
  console.log("\n== transcribe_audio (offline whisper-tiny) ==");
  const speech = "/tmp/media-test/speech.wav";
  if (await fs.stat(speech).then(() => true).catch(() => false)) {
    const sandbox2 = path.join(SESSION_FILES_DIR, String(CONVERSATION_ID), "uploads");
    await fs.copyFile(speech, path.join(sandbox2, "speech.wav"));
    const trans = await tools.transcribe_audio.execute({
      url: `/api/chat/${CONVERSATION_ID}/session-files/uploads/speech.wav`,
      engine: "offline",
      model: "whisper-tiny",
      language: "en",
    });
    console.log(JSON.stringify({
      ok: trans.ok,
      engine: trans.engine,
      model: trans.model,
      language: trans.language,
      segmentCount: trans.segmentCount,
      transcript: trans.transcript,
      transcriptFile: trans.transcriptFile,
    }, null, 2));
  } else {
    console.log("SKIP: /tmp/media-test/speech.wav not present (say -o ... to generate)");
  }

  // 9. transcribe a file with no audio → clear error
  console.log("\n== transcribe_audio (no audio stream) ==");
  const silent = "/tmp/media-test/silent.mp4"; // video-only file
  if (await fs.stat(silent).then(() => true).catch(() => false)) {
    const sandbox3 = path.join(SESSION_FILES_DIR, String(CONVERSATION_ID), "uploads");
    await fs.copyFile(silent, path.join(sandbox3, "silent.mp4"));
    try {
      await tools.transcribe_audio.execute({
        url: `/api/chat/${CONVERSATION_ID}/session-files/uploads/silent.mp4`,
        engine: "offline",
        model: "whisper-tiny",
      });
      console.log("ERROR: should have thrown");
    } catch (e: any) {
      console.log("expected error:", e.message.slice(0, 160));
    }
  } else {
    console.log("SKIP: /tmp/media-test/silent.mp4 not present (ffmpeg -f lavfi testsrc ... to generate)");
  }

  console.log("\n[smoke-media-tools] OK");

  // Clean up the seeded sandbox.
  await fs.rm(path.join(SESSION_FILES_DIR, String(CONVERSATION_ID)), {
    recursive: true,
    force: true,
  });
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
