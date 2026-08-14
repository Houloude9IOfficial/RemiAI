import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { providers } from "@/db/schema";
import {
  OFFLINE_WHISPER_MODELS,
  deleteOfflineModel,
  downloadOfflineModel,
  getTranscriptionConfig,
  listOfflineModelStatuses,
  listProviderTranscriptionModels,
  saveTranscriptionConfig,
  type OfflineWhisperModel,
  type TranscriptionConfig,
} from "@/lib/media/transcribe";

/** Current config + model inventory for the Settings > Tools panel. */
export async function GET() {
  const [config, offline, providerModels, allProviders] = await Promise.all([
    getTranscriptionConfig(),
    listOfflineModelStatuses(),
    listProviderTranscriptionModels(),
    db.select().from(providers).all(),
  ]);

  return NextResponse.json({
    config,
    offlineModels: offline.map((m) => ({
      ...m,
      params: OFFLINE_WHISPER_MODELS[m.model].params,
      size: OFFLINE_WHISPER_MODELS[m.model].size,
      description: OFFLINE_WHISPER_MODELS[m.model].description,
    })),
    providerModels,
    providers: allProviders.map((p) => ({
      id: p.id,
      kind: p.kind,
      label: p.label,
      baseUrl: p.baseUrl,
      // Anthropic has no transcription endpoint.
      supportsTranscription: p.kind !== "anthropic",
    })),
  });
}

const bodySchema = (raw: unknown): {
  action: "save" | "download" | "delete";
  config?: Partial<TranscriptionConfig>;
  model?: string;
} => {
  const r = (raw ?? {}) as Record<string, unknown>;
  const action = r.action === "download" || r.action === "delete" ? r.action : "save";
  return {
    action,
    config: (r.config as Partial<TranscriptionConfig>) ?? undefined,
    model: typeof r.model === "string" ? r.model : undefined,
  };
};

export async function POST(req: Request) {
  const { action, config, model } = bodySchema(await req.json().catch(() => ({})));

  try {
    if (action === "download") {
      if (!model || !(model in OFFLINE_WHISPER_MODELS)) {
        return NextResponse.json(
          { error: `Unknown offline model. Available: ${Object.keys(OFFLINE_WHISPER_MODELS).join(", ")}` },
          { status: 400 },
        );
      }
      await downloadOfflineModel(model as OfflineWhisperModel);
      const status = await listOfflineModelStatuses();
      return NextResponse.json({ ok: true, offlineModels: status });
    }

    if (action === "delete") {
      if (!model || !(model in OFFLINE_WHISPER_MODELS)) {
        return NextResponse.json(
          { error: `Unknown offline model. Available: ${Object.keys(OFFLINE_WHISPER_MODELS).join(", ")}` },
          { status: 400 },
        );
      }
      const deleted = await deleteOfflineModel(model as OfflineWhisperModel);
      const status = await listOfflineModelStatuses();
      return NextResponse.json({ ok: true, deleted, offlineModels: status });
    }

    // save
    const saved = await saveTranscriptionConfig(config ?? {});
    return NextResponse.json({ ok: true, config: saved });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
