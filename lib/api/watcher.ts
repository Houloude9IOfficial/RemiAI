export type WatcherDirStatus = {
  id: number;
  label: string;
  path: string;
  watchEnabled: boolean;
  indexedFiles: number;
  isWatched: boolean;
};

export type WatcherStatus = {
  running: boolean;
  scanning: boolean;
  totalFiles: number;
  lastScanTime: string | null;
  watchedDirs: WatcherDirStatus[];
};

async function unwrap<T>(res: Response): Promise<T> {
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data as T;
}

export const watcherApi = {
  /** Get the current watcher status with file counts. */
  status: (): Promise<WatcherStatus> =>
    fetch("/api/watcher/status").then((res) => unwrap<WatcherStatus>(res)),

  /** Trigger a manual re-scan of all watched directories. */
  scan: (): Promise<{ ok: boolean; message: string; scanned: number }> =>
    fetch("/api/watcher/scan", { method: "POST" }).then((res) =>
      unwrap<{ ok: boolean; message: string; scanned: number }>(res),
    ),

  /** Trigger a manual re-scan of a single watched directory. */
  scanDirectory: (
    id: number,
  ): Promise<{ ok: boolean; message: string; directoryId: number }> =>
    fetch(`/api/watcher/scan/${id}`, { method: "POST" }).then((res) =>
      unwrap<{ ok: boolean; message: string; directoryId: number }>(res),
    ),
};
