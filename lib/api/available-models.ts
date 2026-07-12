export type AvailableProvider = {
  providerId: number;
  label: string;
  kind: string;
  models: { modelId: string; modelLabel: string | null; isDefault: boolean }[];
};

export const availableModelsApi = {
  list: async (): Promise<AvailableProvider[]> => {
    const res = await fetch("/api/providers/available");
    if (!res.ok) throw new Error("Failed to load models");
    return res.json();
  },
};
