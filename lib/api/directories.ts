export type Directory = {
  id: number;
  path: string;
  label: string;
  canRead: boolean;
  canWrite: boolean;
  createdAt: string;
};

export type DirectoryInput = {
  path: string;
  label: string;
  canRead: boolean;
  canWrite: boolean;
};

async function unwrap<T>(res: Response): Promise<T> {
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data as T;
}

export const directoriesApi = {
  list: (): Promise<Directory[]> =>
    fetch("/api/directories").then((res) => unwrap<Directory[]>(res)),

  validate: (
    path: string,
  ): Promise<{ valid: boolean; resolvedPath?: string; error?: string }> =>
    fetch("/api/directories/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    }).then((res) => unwrap<{ valid: boolean; resolvedPath?: string; error?: string }>(res)),

  create: (input: DirectoryInput): Promise<Directory> =>
    fetch("/api/directories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }).then((res) => unwrap<Directory>(res)),

  update: (
    id: number,
    input: Partial<Pick<DirectoryInput, "label" | "canRead" | "canWrite">>,
  ): Promise<Directory> =>
    fetch(`/api/directories/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }).then((res) => unwrap<Directory>(res)),

  remove: (id: number): Promise<{ ok: true }> =>
    fetch(`/api/directories/${id}`, { method: "DELETE" }).then((res) => unwrap<{ ok: true }>(res)),
};
