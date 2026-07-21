/**
 * Preload Script — Secure bridge between Electron main process and renderer.
 *
 * Uses contextBridge to expose a minimal, typed API so the Next.js renderer
 * can invoke native features without enabling nodeIntegration.
 *
 * Available in the renderer as: `window.electronAPI`
 */

import { contextBridge, ipcRenderer } from "electron";

/**
 * Typed API surface exposed to the renderer process.
 * All communication goes through IPC (ipcMain ↔ ipcRenderer) so the
 * renderer never gets direct Node.js or Electron access.
 */
const electronAPI = {
  // ── App Info ──────────────────────────────────────────────────────
  getAppInfo: (): Promise<{
    version: string;
    name: string;
    platform: string;
    arch: string;
    isDev: boolean;
  }> => ipcRenderer.invoke("get-app-info"),

  getPlatform: (): Promise<string> => ipcRenderer.invoke("get-platform"),

  // ── File Dialogs ─────────────────────────────────────────────────
  openFileDialog: (
    options?: { title?: string; filters?: { name: string; extensions: string[] }[] },
  ): Promise<{ canceled: boolean; filePaths: string[] } | null> =>
    ipcRenderer.invoke("open-file-dialog", options),

  openDirectoryDialog: (
    options?: { title?: string },
  ): Promise<{ canceled: boolean; filePaths: string[] } | null> =>
    ipcRenderer.invoke("open-directory-dialog", options),

  // ── Notifications ────────────────────────────────────────────────
  sendNotification: (payload: { title: string; body: string }): Promise<void> =>
    ipcRenderer.invoke("send-notification", payload),

  // ── Auto-update listeners ────────────────────────────────────────
  onUpdateAvailable: (callback: (version: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, version: string) =>
      callback(version);
    ipcRenderer.on("update-available", handler);
    return () => ipcRenderer.removeListener("update-available", handler);
  },

  onUpdateDownloaded: (callback: (version: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, version: string) =>
      callback(version);
    ipcRenderer.on("update-downloaded", handler);
    return () => ipcRenderer.removeListener("update-downloaded", handler);
  },

  installUpdate: (): Promise<void> => ipcRenderer.invoke("install-update"),
};

// Expose to the renderer under a safe namespace
contextBridge.exposeInMainWorld("electronAPI", electronAPI);

// Type declaration so TypeScript in the renderer can access it
export type ElectronAPI = typeof electronAPI;
