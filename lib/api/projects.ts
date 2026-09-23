import type { Conversation } from "./conversations";
import type { SessionFileEntry } from "./session-files";

export type Project = { id: number; name: string; brief: string; instructions: string; notes: string; pinned: boolean; sortOrder: number; createdAt: string; updatedAt: string };
export type ProjectFile = SessionFileEntry & { url: string | null };

async function unwrap<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? `Request failed (${response.status})`);
  return body as T;
}

export const projectsApi = {
  list: (): Promise<Project[]> => fetch("/api/projects").then(unwrap<Project[]>),
  create: (input: { name: string; brief?: string; instructions?: string }): Promise<Project> => fetch("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }).then(unwrap<Project>),
  update: (id: number, input: Partial<Pick<Project, "name" | "brief" | "instructions" | "notes" | "pinned" | "sortOrder">>): Promise<Project> => fetch(`/api/projects/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }).then(unwrap<Project>),
  remove: (id: number): Promise<{ ok: boolean }> => fetch(`/api/projects/${id}`, { method: "DELETE" }).then(unwrap<{ ok: boolean }>),
  reorder: (ids: number[]): Promise<{ ok: boolean }> => fetch("/api/projects/reorder", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) }).then(unwrap<{ ok: boolean }>),
  chats: (id: number): Promise<Conversation[]> => fetch(`/api/projects/${id}/chats`).then(unwrap<Conversation[]>),
  files: (id: number): Promise<ProjectFile[]> => fetch(`/api/projects/${id}/files`).then((res) => unwrap<{ files: ProjectFile[] }>(res)).then((data) => data.files),
  upload: (id: number, file: File): Promise<void> => { const form = new FormData(); form.set("file", file); return fetch(`/api/projects/${id}/files`, { method: "POST", body: form }).then(unwrap<unknown>).then(() => undefined); },
  writeFile: (id: number, path: string, content: string): Promise<void> => fetch(`/api/projects/${id}/files`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path, content }) }).then(unwrap<unknown>).then(() => undefined),
  deleteFile: (id: number, path: string): Promise<void> => fetch(`/api/projects/${id}/files`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path }) }).then(unwrap<unknown>).then(() => undefined),
};
