// ---------------------------------------------------------------------------
// Client-side API for backup export / import
// ---------------------------------------------------------------------------

export interface BackupHistoryData {
  exportedAt: string;
  totalSize: number;
  includesFiles: boolean;
  tableStats: Record<string, number>;
  uploadCount: number;
  avatarCount: number;
  skillCount: number;
  appVersion: string;
}

export interface ExportResponse {
  /** Single-use URL for the staged encrypted backup file. */
  downloadUrl: string;
  /** Metadata recorded after the client receives the complete response. */
  history: BackupHistoryData;
  /** Size of the encrypted blob in bytes. */
  size: number;
  stats: {
    tables: Record<string, number>;
    uploads: number;
    avatars: number;
  };
}

export interface ImportResponse {
  success: true;
  tables: Record<string, number>;
  files: {
    uploads: number;
    avatars: number;
  };
  exportedAt: string;
  appVersion: string;
  warnings: string[];
}

export interface HistoryEntry {
  id: number;
  exportedAt: string;
  totalSize: number;
  includesFiles: boolean;
  tableStats: Record<string, number>;
  uploadCount: number;
  avatarCount: number;
  skillCount?: number;
  appVersion: string;
  createdAt: string;
}

export interface HistoryResponse {
  entries: HistoryEntry[];
}

/**
 * Read a response body and parse it as JSON.
 *
 * Backup payloads are large, and on some deployments the server or an
 * upstream proxy (Caddy, nginx, a hosting load balancer, body-size guards…)
 * can reply with an HTML/plain-text error page or a truncated body that is
 * not valid JSON. Calling `res.json()` directly in that case throws a
 * cryptic "JSON.parse: unexpected character at line 1 column 1" error that
 * hides what actually went wrong.
 *
 * This helper parses defensively and turns non-JSON responses into a clear,
 * actionable Error containing the HTTP status, content-type, and a snippet of
 * the body when available.
 */
async function parseJson<T>(res: Response, methodLabel: string): Promise<T> {
  const text = await res.text();
  try {
    const data = JSON.parse(text) as T & { error?: string };
    if (!res.ok) throw new Error(data.error ?? `${methodLabel} failed (${res.status})`);
    return data;
  } catch (err) {
    // `res.ok` was already handled above; if we get here it means the body
    // was not JSON at all.
    if (err instanceof SyntaxError) {
      let detail = `server returned a non-JSON response (${res.status}${
        res.ok ? "" : " " + res.statusText
      }, content-type: ${res.headers.get("content-type") ?? "unknown"})`;
      const snippet = text.trim().slice(0, 300);
      if (snippet) detail += `: ${JSON.stringify(snippet)}`;
      throw new Error(`${methodLabel} failed — ${detail}`);
    }
    throw err;
  }
}

export const backupApi = {
  /**
   * Fetch backup history entries, most recent first.
   */
  history: async (limit: number = 20): Promise<HistoryResponse> => {
    const res = await fetch(`/api/backup/history?limit=${limit}`);
    return parseJson<HistoryResponse>(res, "Loading backup history");
  },

  /**
   * Record a backup after the complete export response has reached the client.
   */
  recordHistory: async (data: BackupHistoryData): Promise<void> => {
    const res = await fetch("/api/backup/history", {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    await parseJson<{ success: true }>(res, "Recording backup history");
  },

  /**
   * Create an encrypted backup and return its single-use download URL.
   */
  export: async (
    password: string,
    includeFiles: boolean,
  ): Promise<ExportResponse> => {
    const res = await fetch("/api/backup/export", {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, includeFiles }),
    });
    return parseJson<ExportResponse>(res, "Exporting backup");
  },

  /**
   * Download the staged encrypted backup through its single-use URL.
   */
  download: async (downloadUrl: string): Promise<Blob> => {
    const res = await fetch(downloadUrl, { cache: "no-store" });
    if (!res.ok) {
      return parseJson<never>(res, "Downloading backup");
    }
    return res.blob();
  },

  /**
   * Restore from an encrypted backup file.
   * Sends the file + password to the server for decryption and restore.
   */
  import: async (
    file: File,
    password: string,
  ): Promise<ImportResponse> => {
    // Send the encrypted text as the raw request body. This avoids both
    // multipart parsing differences and JSON body limits for large backups.
    const encrypted = await file.text();

    const res = await fetch("/api/backup/import", {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=UTF-8",
        "X-RemiAI-Backup-Password": password,
      },
      body: encrypted,
    });
    return parseJson<ImportResponse>(res, "Restoring backup");
  },
};