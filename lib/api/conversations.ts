import type { UIMessage } from "ai";

export type Conversation = {
  id: number;
  title: string;
  providerId: number | null;
  modelId: string | null;
  mode: string;
  qualityPolicy: "fast" | "balanced" | "quality" | "selected";
  bashMode: "sandboxed" | "full";
  totalInputTokens: number;
  totalOutputTokens: number;
  createdAt: string;
  updatedAt: string;
};

async function unwrap<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(
      (data as { error?: string } | null)?.error ?? `Request failed (${res.status})`,
    );
    // Attach the HTTP status so callers can distinguish a 404 (deleted
    // conversation) from network/server errors.
    (err as Error & { statusCode?: number }).statusCode = res.status;
    throw err;
  }
  return data as T;
}

export const conversationsApi = {
  list: (): Promise<Conversation[]> =>
    fetch("/api/conversations").then((res) => unwrap<Conversation[]>(res)),

  create: (input?: { providerId?: number | null; modelId?: string | null }): Promise<Conversation> =>
    fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input ?? {}),
    }).then((res) => unwrap<Conversation>(res)),

  get: (
    id: number,
    opts?: { timeoutMs?: number },
  ): Promise<{ conversation: Conversation; messages: UIMessage[] }> => {
    const { timeoutMs } = opts ?? {};
    // Guard against requests that hang forever (server starting up, cold
    // instance, dead connection) so the UI can never be stuck on a skeleton.
    const controller = new AbortController();
    const timer = timeoutMs ? setTimeout(() => controller.abort(), timeoutMs) : undefined;
    return fetch(`/api/conversations/${id}`, { signal: controller.signal })
      .then((res) => unwrap<{ conversation: Conversation; messages: UIMessage[] }>(res))
      .finally(() => {
        if (timer) clearTimeout(timer);
      });
  },

  update: (
    id: number,
    input: Partial<{
      title: string;
      providerId: number | null;
      modelId: string | null;
      mode: string;
      qualityPolicy: "fast" | "balanced" | "quality" | "selected";
      bashMode: "sandboxed" | "full";
    }>,
  ): Promise<Conversation> =>
    fetch(`/api/conversations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }).then((res) => unwrap<Conversation>(res)),

  remove: (id: number): Promise<{ ok: true }> =>
    fetch(`/api/conversations/${id}`, { method: "DELETE" }).then((res) =>
      unwrap<{ ok: true }>(res),
    ),

  duplicate: (id: number): Promise<Conversation> =>
    fetch(`/api/conversations/${id}/duplicate`, { method: "POST" }).then((res) =>
      unwrap<Conversation>(res),
    ),

  removeMany: (ids: number[]): Promise<{ ok: true }> =>
    fetch("/api/conversations/batch-delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    }).then((res) => unwrap<{ ok: true }>(res)),
};
