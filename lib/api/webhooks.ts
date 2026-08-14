import type { WebhookCondition } from "@/db/schema";

export type Webhook = {
  id: number;
  name: string;
  secret: string;
  systemPrompt: string;
  conditions: WebhookCondition[];
  conversationId: number | null;
  respondSync: boolean;
  enabled: boolean;
  lastReceivedAt: string | null;
  lastStatus: string | null;
  lastEventId: number | null;
  createdAt: string;
  updatedAt: string;
};

export type WebhookInput = {
  name: string;
  systemPrompt?: string;
  conditions?: WebhookCondition[];
  conversationId?: number | null;
  respondSync?: boolean;
  enabled?: boolean;
};

export type WebhookEvent = {
  id: number;
  webhookId: number;
  status: "received" | "processing" | "completed" | "skipped" | "failed";
  payload: unknown;
  result: string | null;
  error: string | null;
  receivedAt: string;
  completedAt: string | null;
};

export type WebhookTestResult = {
  ok: boolean;
  result?: string;
  error?: string;
  processing?: boolean;
  eventId: number;
};

async function unwrap<T>(res: Response): Promise<T> {
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data as T;
}

export const webhooksApi = {
  list: (): Promise<Webhook[]> =>
    fetch("/api/webhooks").then((res) => unwrap<Webhook[]>(res)),

  create: (input: WebhookInput): Promise<Webhook> =>
    fetch("/api/webhooks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }).then((res) => unwrap<Webhook>(res)),

  update: (
    id: number,
    input: Partial<WebhookInput & { regenerateSecret?: boolean }>,
  ): Promise<Webhook> =>
    fetch(`/api/webhooks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }).then((res) => unwrap<Webhook>(res)),

  remove: (id: number): Promise<{ ok: true }> =>
    fetch(`/api/webhooks/${id}`, { method: "DELETE" }).then((res) =>
      unwrap<{ ok: true }>(res),
    ),

  events: (id: number): Promise<WebhookEvent[]> =>
    fetch(`/api/webhooks/${id}/events`).then((res) => unwrap<WebhookEvent[]>(res)),

  test: (id: number, payload?: unknown): Promise<WebhookTestResult> =>
    fetch(`/api/webhooks/${id}/test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload }),
    }).then((res) => unwrap<WebhookTestResult>(res)),
};
