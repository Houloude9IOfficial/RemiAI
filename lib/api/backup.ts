// ---------------------------------------------------------------------------
// Client-side API for backup export / import
// ---------------------------------------------------------------------------

export interface ExportResponse {
  /** Base64-encoded encrypted backup blob. */
  encrypted: string;
  /** Size of the encrypted backup blob in bytes. */
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
  appVersion: string;
  createdAt: string;
}

export interface HistoryResponse {
  entries: HistoryEntry[];
}

async function unwrap<T>(res: Response): Promise<T> {
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data as T;
}

export const backupApi = {
  /**
   * Fetch backup history entries, most recent first.
   */
  history: async (limit: number = 20): Promise<HistoryResponse> => {
    const res = await fetch(`/api/backup/history?limit=${limit}`);
    return unwrap<HistoryResponse>(res);
  },

  /**
   * Create an encrypted backup of all data.
   * Returns the encrypted blob as a downloadable file (triggers browser download).
   */
  export: async (
    password: string,
    includeFiles: boolean,
  ): Promise<ExportResponse> => {
    const res = await fetch("/api/backup/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, includeFiles }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Export failed");
    return data as ExportResponse;
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
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Import failed");
    return data as ImportResponse;
  },
};
