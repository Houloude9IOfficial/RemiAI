export type Memory = {
  id: number;
  content: string;
  createdAt: string;
  updatedAt: string;
};

async function unwrap<T>(res: Response): Promise<T> {
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data as T;
}

export const memoriesApi = {
  list: (): Promise<Memory[]> =>
    fetch("/api/memories").then((res) => unwrap<Memory[]>(res)),

  search: (query: string): Promise<Memory[]> =>
    fetch(`/api/memories?q=${encodeURIComponent(query)}`).then((res) =>
      unwrap<Memory[]>(res),
    ),

  create: (content: string): Promise<Memory> =>
    fetch("/api/memories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    }).then((res) => unwrap<Memory>(res)),

  remove: (id: number): Promise<{ ok: true }> =>
    fetch(`/api/memories/${id}`, { method: "DELETE" }).then((res) =>
      unwrap<{ ok: true }>(res),
    ),
};
