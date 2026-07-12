import type { UIMessage } from "ai";

export type Conversation = {
  id: number;
  title: string;
  providerId: number | null;
  modelId: string | null;
  totalInputTokens: number;
  totalOutputTokens: number;
  createdAt: string;
  updatedAt: string;
};

async function unwrap<T>(res: Response): Promise<T> {
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Request failed");
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

  get: (id: number): Promise<{ conversation: Conversation; messages: UIMessage[] }> =>
    fetch(`/api/conversations/${id}`).then((res) =>
      unwrap<{ conversation: Conversation; messages: UIMessage[] }>(res),
    ),

  update: (
    id: number,
    input: Partial<{ title: string; providerId: number | null; modelId: string | null }>,
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
