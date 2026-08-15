export type AvailableModel = {
  modelId: string;
  modelLabel: string | null;
  isDefault: boolean;
  /** Approximate context-window size in tokens (for the header usage meter). */
  contextWindow: number;
};

export type AvailableProvider = {
  providerId: number;
  label: string;
  kind: string;
  models: AvailableModel[];
};

export const availableModelsApi = {
  list: async (): Promise<AvailableProvider[]> => {
    const res = await fetch("/api/providers/available");
    if (!res.ok) throw new Error("Failed to load models");
    return res.json();
  },
};
