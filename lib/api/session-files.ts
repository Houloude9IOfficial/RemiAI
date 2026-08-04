/**
 * Frontend API client for session files, plus the custom event used to
 * auto-open the session files panel when the AI calls `session_present_files`.
 */

export type SessionFileEntry = {
  path: string;
  name: string;
  isDirectory: boolean;
  isFile: boolean;
  size: number;
  mtime: string;
};

export type SessionFilesList = {
  conversationId: number;
  count: number;
  files: SessionFileEntry[];
};

export type SessionFilesOverviewEntry = {
  id: number;
  title: string;
  updatedAt: string;
  fileCount: number;
  totalSize: number;
};

// ---------------------------------------------------------------------------
// Panel present event
// ---------------------------------------------------------------------------

export const SESSION_FILES_PRESENT_EVENT = "remi:session-files:present";

export type SessionFilesPresentDetail = {
  paths?: string[];
  message?: string | null;
};

/**
 * Dispatch the event that opens the session files panel (used by the
 * present card rendered in chat messages).
 */
export function dispatchSessionFilesPresent(detail: SessionFilesPresentDetail = {}) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<SessionFilesPresentDetail>(SESSION_FILES_PRESENT_EVENT, {
      detail,
    }),
  );
}

// ---------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------

function base(conversationId: number) {
  return `/api/chat/${conversationId}/session-files`;
}

async function unwrap<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data as T;
}

export const sessionFilesApi = {
  list: (conversationId: number): Promise<SessionFilesList> =>
    fetch(base(conversationId)).then((res) => unwrap<SessionFilesList>(res)),

  overview: (): Promise<{ conversations: SessionFilesOverviewEntry[] }> =>
    fetch("/api/session-files").then((res) =>
      unwrap<{ conversations: SessionFilesOverviewEntry[] }>(res),
    ),

  upload: (
    conversationId: number,
    file: File,
    dir?: string | null,
  ): Promise<{ ok: true; file: SessionFileEntry }> => {
    const form = new FormData();
    form.append("file", file);
    if (dir) form.append("dir", dir);
    return fetch(base(conversationId), {
      method: "POST",
      body: form,
    }).then((res) => unwrap<{ ok: true; file: SessionFileEntry }>(res));
  },

  /** Create or overwrite a text file ("write"). */
  write: (
    conversationId: number,
    path: string,
    content: string,
  ): Promise<{ ok: true; path: string; wrote: number }> =>
    fetch(base(conversationId), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "write", path, content }),
    }).then((res) => unwrap<{ ok: true; path: string; wrote: number }>(res)),

  /** Create a folder ("mkdir"). */
  mkdir: (
    conversationId: number,
    path: string,
  ): Promise<{ ok: true; entry: SessionFileEntry }> =>
    fetch(base(conversationId), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "mkdir", path }),
    }).then((res) => unwrap<{ ok: true; entry: SessionFileEntry }>(res)),

  /** Rename or move a file/folder ("move"). */
  move: (
    conversationId: number,
    from: string,
    to: string,
  ): Promise<{ ok: true; entry: SessionFileEntry }> =>
    fetch(base(conversationId), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "move", from, to }),
    }).then((res) => unwrap<{ ok: true; entry: SessionFileEntry }>(res)),

  remove: (conversationId: number, path: string): Promise<{ ok: true }> =>
    fetch(base(conversationId), {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    }).then((res) => unwrap<{ ok: true }>(res)),

  content: (
    conversationId: number,
    path: string,
  ): Promise<{
    path: string;
    name: string;
    content: string;
    totalBytes: number;
    isTruncated: boolean;
  }> =>
    fetch(`${base(conversationId)}/content?path=${encodeURIComponent(path)}`).then(
      (res) =>
        unwrap<{
          path: string;
          name: string;
          content: string;
          totalBytes: number;
          isTruncated: boolean;
        }>(res),
    ),

  rawUrl: (conversationId: number, path: string, download = false): string =>
    `${base(conversationId)}/raw?path=${encodeURIComponent(path)}${download ? "&download=1" : ""}`,

  downloadZipUrl: (conversationId: number): string =>
    `${base(conversationId)}/download`,
};
