export type ProviderKind = "anthropic" | "openai" | "ollama" | "openai-compatible";

export type Provider = {
  id: number;
  kind: ProviderKind;
  isPreset: boolean;
  label: string;
  baseUrl: string | null;
  apiKey: string | null;
  hasApiKey: boolean;
  enabled: boolean;
  createdAt: string;
};

export type ProviderInput = {
  kind: ProviderKind;
  isPreset: boolean;
  label: string;
  baseUrl?: string | null;
  apiKey?: string | null;
};

export type ProviderModel = {
  id: number;
  providerId: number;
  modelId: string;
  label: string | null;
  enabled: boolean;
  isDefault: boolean;
};

async function unwrap<T>(res: Response): Promise<T> {
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data as T;
}

export const providersApi = {
  list: (): Promise<Provider[]> =>
    fetch("/api/providers").then((res) => unwrap<Provider[]>(res)),

  create: (input: ProviderInput): Promise<Provider> =>
    fetch("/api/providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }).then((res) => unwrap<Provider>(res)),

  update: (
    id: number,
    input: Partial<Pick<ProviderInput, "label" | "baseUrl" | "apiKey"> & { enabled: boolean }>,
  ): Promise<Provider> =>
    fetch(`/api/providers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }).then((res) => unwrap<Provider>(res)),

  remove: (id: number): Promise<{ ok: true }> =>
    fetch(`/api/providers/${id}`, { method: "DELETE" }).then((res) => unwrap<{ ok: true }>(res)),

  listModels: (providerId: number): Promise<ProviderModel[]> =>
    fetch(`/api/providers/${providerId}/models`).then((res) => unwrap<ProviderModel[]>(res)),

  addModel: (
    providerId: number,
    input: { modelId: string; label?: string | null },
  ): Promise<ProviderModel> =>
    fetch(`/api/providers/${providerId}/models`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }).then((res) => unwrap<ProviderModel>(res)),

  updateModel: (
    providerId: number,
    modelId: string,
    input: Partial<{ enabled: boolean; isDefault: boolean }>,
  ): Promise<ProviderModel> =>
    fetch(`/api/providers/${providerId}/models/${encodeURIComponent(modelId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }).then((res) => unwrap<ProviderModel>(res)),

  removeModel: (providerId: number, modelId: string): Promise<{ ok: true }> =>
    fetch(`/api/providers/${providerId}/models/${encodeURIComponent(modelId)}`, {
      method: "DELETE",
    }).then((res) => unwrap<{ ok: true }>(res)),
};
