// ── ElevenLabs TTS API Route (Server-side Proxy) ────────────────────
// Proxies TTS requests to ElevenLabs without exposing the API key to
// the client. The API key is stored in the tool_configs database.
// ────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { db } from "@/db";
import { toolConfigs } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * Default ElevenLabs voice ID for a deep, premium male voice.
 * "pNInz6obpgDQGcFmaJgB" = Adam (deep, warm, authoritative)
 * Users can override this per request if needed.
 */
const DEFAULT_VOICE_ID = "pNInz6obpgDQGcFmaJgB";

export async function POST(req: Request) {
  try {
    const { text, voiceId } = await req.json();

    if (!text || typeof text !== "string") {
      return NextResponse.json(
        { error: "Text is required" },
        { status: 400 },
      );
    }

    // Look up the ElevenLabs API key and config from tool_configs
    const config = await db
      .select()
      .from(toolConfigs)
      .where(eq(toolConfigs.toolId, "elevenlabs"))
      .get();

    const apiKey = config?.apiKey;

    if (!apiKey) {
      return NextResponse.json(
        { error: "ElevenLabs API key not configured" },
        { status: 400 },
      );
    }

    // Get voice_id from tool config, fall back to request param, then default
    const toolExtraFields = (config?.config as Record<string, string>) ?? {};
    const configuredVoiceId = toolExtraFields.voice_id;
    const targetVoiceId = voiceId || configuredVoiceId || DEFAULT_VOICE_ID;

    // Check if TTS is enabled (default: enabled when configured)
    const ttsEnabled = toolExtraFields.tts_enabled !== "false";
    if (!ttsEnabled) {
      return NextResponse.json(
        { error: "ElevenLabs TTS is disabled in settings" },
        { status: 400 },
      );
    }

    // Call ElevenLabs TTS API
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${targetVoiceId}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_multilingual_v2",
          voice_settings: {
            stability: 0.45,
            similarity_boost: 0.55,
            style: 0.3,
            use_speaker_boost: true,
          },
        }),
      },
    );

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "Unknown error");
      console.error(
        `[ElevenLabs TTS] ${response.status}: ${errorBody}`,
      );
      return NextResponse.json(
        { error: `ElevenLabs API error: ${response.status}` },
        { status: response.status },
      );
    }

    // Return the audio stream
    const audioBuffer = await response.arrayBuffer();

    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(audioBuffer.byteLength),
        "Cache-Control": "no-cache",
      },
    });
  } catch (err) {
    console.error("[ElevenLabs TTS] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/**
 * GET endpoint to check if ElevenLabs is configured and which features are enabled.
 * Used by the client to decide TTS/STT engine selection.
 */
export async function GET() {
  try {
    const config = await db
      .select()
      .from(toolConfigs)
      .where(eq(toolConfigs.toolId, "elevenlabs"))
      .get();

    const extraFields = (config?.config as Record<string, string>) ?? {};

    return NextResponse.json({
      hasKey: !!config?.apiKey,
      enabled: config?.enabled ?? false,
      // Default to enabled when not explicitly set to "false"
      ttsEnabled: extraFields.tts_enabled !== "false",
      sttEnabled: extraFields.stt_enabled !== "false",
      voiceId: extraFields.voice_id || null,
    });
  } catch {
    return NextResponse.json({
      hasKey: false,
      enabled: false,
      ttsEnabled: false,
      sttEnabled: false,
      voiceId: null,
    });
  }
}
