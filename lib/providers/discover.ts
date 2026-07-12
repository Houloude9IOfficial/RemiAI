/**
 * Auto-discover available models from AI providers.
 *
 * Each provider kind uses a different API endpoint and auth scheme.
 * If discovery fails (network error, bad auth, etc.) we gracefully
 * fall back to the static catalog. Discovery is best-effort — it
 * never throws.
 */

type ProviderInfo = {
  kind: string;
  baseUrl: string | null;
  apiKey: string | null;
};

type DiscoveryResult = {
  models: { modelId: string; label: string | null }[];
  discovered: boolean;
};

// ── OpenAI ─────────────────────────────────────────────────────────────

async function discoverOpenAI(apiKey: string): Promise<DiscoveryResult> {
  try {
    const res = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return { models: [], discovered: false };

    const body = (await res.json()) as { data?: { id: string }[] };
    if (!body.data) return { models: [], discovered: false };

    return {
      models: body.data.map((m) => ({
        modelId: m.id,
        label: null,
      })),
      discovered: true,
    };
  } catch {
    return { models: [], discovered: false };
  }
}

// ── Anthropic ─────────────────────────────────────────────────────────

async function discoverAnthropic(apiKey: string): Promise<DiscoveryResult> {
  try {
    const res = await fetch("https://api.anthropic.com/v1/models", {
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
    });
    if (!res.ok) return { models: [], discovered: false };

    const body = (await res.json()) as {
      data?: { type: string; id: string; display_name?: string }[];
    };
    if (!body.data) return { models: [], discovered: false };

    return {
      models: body.data.map((m) => ({
        modelId: m.id,
        label: m.display_name ?? null,
      })),
      discovered: true,
    };
  } catch {
    return { models: [], discovered: false };
  }
}

// ── Ollama ─────────────────────────────────────────────────────────────

async function discoverOllama(baseUrl: string | null): Promise<DiscoveryResult> {
  try {
    // The Ollama API for listing models lives at /api/tags, not under /v1
    const base = baseUrl?.replace(/\/v1\/?$/, "") ?? "http://localhost:11434";
    const res = await fetch(`${base}/api/tags`);
    if (!res.ok) return { models: [], discovered: false };

    const body = (await res.json()) as { models?: { name: string }[] };
    if (!body.models) return { models: [], discovered: false };

    return {
      models: body.models.map((m) => ({
        modelId: m.name,
        label: null,
      })),
      discovered: true,
    };
  } catch {
    return { models: [], discovered: false };
  }
}

// ── OpenAI-compatible ──────────────────────────────────────────────────

async function discoverOpenAICompatible(
  baseUrl: string,
  apiKey: string | null,
): Promise<DiscoveryResult> {
  try {
    const headers: Record<string, string> = {};
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/models`, {
      headers,
    });
    if (!res.ok) return { models: [], discovered: false };

    const body = (await res.json()) as { data?: { id: string }[] };
    if (!body.data) return { models: [], discovered: false };

    return {
      models: body.data.map((m) => ({
        modelId: m.id,
        label: null,
      })),
      discovered: true,
    };
  } catch {
    return { models: [], discovered: false };
  }
}

// ── Main entry ─────────────────────────────────────────────────────────

/**
 * Try to discover models from the provider's API.
 *
 * Returns `discovered: true` with the model list on success, or
 * `discovered: false` with an empty list on any failure (network,
 * auth, parsing, etc.).
 */
export async function discoverModels(
  provider: ProviderInfo,
): Promise<DiscoveryResult> {
  switch (provider.kind) {
    case "openai":
      if (!provider.apiKey) return { models: [], discovered: false };
      return discoverOpenAI(provider.apiKey);

    case "anthropic":
      if (!provider.apiKey) return { models: [], discovered: false };
      return discoverAnthropic(provider.apiKey);

    case "ollama":
      return discoverOllama(provider.baseUrl);

    case "openai-compatible":
      if (!provider.baseUrl) return { models: [], discovered: false };
      return discoverOpenAICompatible(provider.baseUrl, provider.apiKey);

    default:
      return { models: [], discovered: false };
  }
}
