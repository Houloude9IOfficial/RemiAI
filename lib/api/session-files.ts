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

  upload: (conversationId: number, file: File): Promise<{ ok: true; file: SessionFileEntry }> => {
    const form = new FormData();
    form.append("file", file);
    return fetch(base(conversationId), {
      method: "POST",
      body: form,
    }).then((res) => unwrap<{ ok: true; file: SessionFileEntry }>(res));
  },

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
