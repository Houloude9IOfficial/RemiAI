/**
 * Frontend API client for canvas projects, plus the custom event used to
 * auto-open the canvas panel when the AI presents a canvas (canvas_open).
 *
 * NOTE: must stay client-safe — no imports from server-only modules (e.g.
 * lib/session-files/storage pulls node fs + better-sqlite3 into the browser
 * bundle). File types are re-declared here instead.
 */

export type CanvasFileEntry = {
  path: string;
  name: string;
  isDirectory: boolean;
  isFile: boolean;
  size: number;
  mtime: string;
};

export type CanvasSummary = {
  slug: string;
  name: string;
  description: string;
  entryFile: string;
  updatedAt: string;
  previewUrl: string;
  files: CanvasFileEntry[];
};

// ---------------------------------------------------------------------------
// Panel present event
// ---------------------------------------------------------------------------

export const CANVAS_PRESENT_EVENT = "remi:canvas:present";
export const CANVAS_OPENED_EVENT = "remi:canvas:opened";
export const CANVAS_CLOSED_EVENT = "remi:canvas:closed";

export type CanvasPresentDetail = {
  /** Canvas slug to open in the panel. */
  slug?: string;
  /** Optional short note shown with the canvas card. */
  message?: string | null;
  /** True when the user explicitly clicked "Open canvas" — always honored,
      even if they previously dismissed the panel in this page session. */
  manual?: boolean;
};

/**
 * Dispatch the event that opens the canvas panel to a specific canvas.
 * Fired by the CanvasPresentCard once the canvas_open tool completes, and
 * by the card's "Open canvas" button (with `manual: true`).
 */
export function dispatchCanvasPresent(detail: CanvasPresentDetail = {}) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<CanvasPresentDetail>(CANVAS_PRESENT_EVENT, { detail }),
  );
}

/**
 * Dispatch the event confirming the canvas panel actually OPENED. Sent by
 * the page only when it honors a present (i.e. not when the user dismissed
 * the panel) — the cards use it to show the "Opened canvas…" copy.
 */
export function dispatchCanvasOpened(slug: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<{ slug: string }>(CANVAS_OPENED_EVENT, {
      detail: { slug },
    }),
  );
}

/**
 * Dispatch the event that the canvas panel was closed — lets the canvas
 * cards switch their copy from "Opened canvas…" back to a neutral label.
 */
export function dispatchCanvasClosed() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CANVAS_CLOSED_EVENT));
}

// ---------------------------------------------------------------------------
// API client — canvases ride on the existing session-files sandbox, so file
// listing/content/write all reuse sessionFilesApi; this client only discovers
// canvases (the manifests) for the conversation.
// ---------------------------------------------------------------------------

export const canvasApi = {
  /** List canvas projects for a conversation (manifest metadata + files). */
  list: (conversationId: number): Promise<{ count: number; canvases: CanvasSummary[] }> => {
    return fetch(`/api/canvases?conversationId=${conversationId}`).then((res) =>
      Promise.resolve(
        res.json().then((data) => {
          if (!res.ok) throw new Error(data.error ?? "Failed to load canvases");
          return data as { count: number; canvases: CanvasSummary[] };
        }),
      ),
    );
  },

  /** URL to download a canvas as a .zip archive. */
  downloadUrl: (conversationId: number, slug: string): string =>
    `/api/chat/${conversationId}/session-files/canvas/${encodeURIComponent(slug)}/download`,
};