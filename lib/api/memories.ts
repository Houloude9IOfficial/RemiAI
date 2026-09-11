import { MEMORY_CATEGORIES, type MemoryCategory } from "@/lib/memory-categories";

export type { MemoryCategory };
export { MEMORY_CATEGORIES };

export type Memory = {
  id: number;
  content: string;
  category: MemoryCategory;
  memoryDate: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ListMemoriesParams = {
  q?: string;
  category?: MemoryCategory | "all";
  memoryDate?: string;
  from?: string;
  to?: string;
};

export type CreateMemoryPayload = {
  content: string;
  category?: MemoryCategory;
  memoryDate?: string | null;
};

export type UpdateMemoryPayload = {
  content?: string;
  category?: MemoryCategory;
  memoryDate?: string | null;
};

async function unwrap<T>(res: Response): Promise<T> {
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data as T;
}

function buildQuery(params: ListMemoriesParams): string {
  const sp = new URLSearchParams();
  if (params.q) sp.set("q", params.q);
  if (params.category && params.category !== "all") sp.set("category", params.category);
  if (params.memoryDate) sp.set("memoryDate", params.memoryDate);
  if (params.from) sp.set("from", params.from);
  if (params.to) sp.set("to", params.to);
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

export const memoriesApi = {
  list: (params: ListMemoriesParams = {}): Promise<Memory[]> =>
    fetch(`/api/memories${buildQuery(params)}`).then((res) => unwrap<Memory[]>(res)),

  search: (query: string): Promise<Memory[]> =>
    fetch(`/api/memories?q=${encodeURIComponent(query)}`).then((res) => unwrap<Memory[]>(res)),

  create: (payload: CreateMemoryPayload): Promise<Memory> =>
    fetch("/api/memories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then((res) => unwrap<Memory>(res)),

  update: (id: number, payload: UpdateMemoryPayload): Promise<Memory> =>
    fetch(`/api/memories/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then((res) => unwrap<Memory>(res)),

  remove: (id: number): Promise<{ ok: true }> =>
    fetch(`/api/memories/${id}`, { method: "DELETE" }).then((res) => unwrap<{ ok: true }>(res)),
};
