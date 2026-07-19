export type ScheduledTask = {
  id: number;
  conversationId: number;
  triggerAt: string;
  task: string;
  status: "pending" | "processing" | "completed" | "failed" | "cancelled";
  schedule: string | null;
  lastRunAt: string | null;
  result: string | null;
  error: string | null;
  notificationSent: boolean;
  createdAt: string;
  completedAt: string | null;
  conversationTitle?: string;
};

export type ListTasksResponse = {
  tasks: ScheduledTask[];
  count: number;
};

async function unwrap<T>(res: Response): Promise<T> {
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data as T;
}

export const scheduledTasksApi = {
  list: (params?: { limit?: number; status?: string }): Promise<ListTasksResponse> => {
    const search = new URLSearchParams();
    if (params?.limit) search.set("limit", String(params.limit));
    if (params?.status) search.set("status", params.status);
    const qs = search.toString();
    return fetch(`/api/scheduled-tasks${qs ? `?${qs}` : ""}`).then((res) =>
      unwrap<ListTasksResponse>(res),
    );
  },

  cancel: (id: number): Promise<{ ok: true }> =>
    fetch(`/api/scheduled-tasks/${id}`, { method: "DELETE" }).then((res) =>
      unwrap<{ ok: true }>(res),
    ),
};
