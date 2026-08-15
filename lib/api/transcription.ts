import type { TranscriptionConfig } from "@/lib/media/transcribe";

export interface TranscriptionSettingsResponse {
  config: TranscriptionConfig;
  offlineModels: Array<{
    model: string;
    downloaded: boolean;
    sizeBytes: number;
    params: string;
    size: string;
    description: string;
  }>;
  providerModels: Array<{
    providerId: number;
    providerLabel: string;
    modelId: string;
    label?: string | null;
  }>;
  providers: Array<{
    id: number;
    kind: string;
    label: string;
    baseUrl?: string | null;
    supportsTranscription: boolean;
  }>;
}

async function unwrap<T>(res: Response): Promise<T> {
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data as T;
}

export const transcriptionApi = {
  get: (): Promise<TranscriptionSettingsResponse> =>
    fetch("/api/transcription").then((res) => unwrap<TranscriptionSettingsResponse>(res)),

  save: (config: Partial<TranscriptionConfig>): Promise<{ ok: true; config: TranscriptionConfig }> =>
    fetch("/api/transcription", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "save", config }),
    }).then((res) => unwrap<{ ok: true; config: TranscriptionConfig }>(res)),

  download: (
    model: string,
  ): Promise<{ ok: true; offlineModels: TranscriptionSettingsResponse["offlineModels"] }> =>
    fetch("/api/transcription", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "download", model }),
    }).then((res) =>
      unwrap<{ ok: true; offlineModels: TranscriptionSettingsResponse["offlineModels"] }>(res),
    ),

  delete: (
    model: string,
  ): Promise<{ ok: true; deleted: boolean; offlineModels: TranscriptionSettingsResponse["offlineModels"] }> =>
    fetch("/api/transcription", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", model }),
    }).then((res) =>
      unwrap<{ ok: true; deleted: boolean; offlineModels: TranscriptionSettingsResponse["offlineModels"] }>(res),
    ),
};
