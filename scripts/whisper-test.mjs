import fs from "node:fs";
import { pipeline, env } from "@huggingface/transformers";
env.cacheDir = "/tmp/whisper-cache";
env.allowLocalModels = false;

const buf = fs.readFileSync("/tmp/media-test/speech.wav");
const dataView = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
const bitsPerSample = dataView.getUint16(buf.indexOf("fmt ") + 8 + 14, true);
const channels = dataView.getUint16(buf.indexOf("fmt ") + 8 + 2, true);
const dataOffset = buf.indexOf("data") + 8;
const bytesPerSample = bitsPerSample / 8;
const totalSamples = (buf.length - dataOffset) / bytesPerSample;
const audio = new Float32Array(totalSamples / channels);
for (let i = 0, s = 0; i < audio.length; i++, s += channels) {
  audio[i] = dataView.getInt16(dataOffset + s * bytesPerSample, true) / 32768;
}

const t0 = Date.now();
const transcriber = await pipeline("automatic-speech-recognition", "Xenova/whisper-base", { dtype: "q8" });
console.log("pipeline ready in", ((Date.now() - t0) / 1000).toFixed(1) + "s");
const t1 = Date.now();
const out = await transcriber(audio, { language: "english" });
console.log("transcribed in", ((Date.now() - t1) / 1000).toFixed(1) + "s");
console.log("TEXT:", out.text);
