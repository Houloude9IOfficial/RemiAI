"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { LayoutPanelTop } from "lucide-react";
import {
  CANVAS_CLOSED_EVENT,
  CANVAS_OPENED_EVENT,
  dispatchCanvasPresent,
} from "@/lib/api/canvas";

/**
 * Renders the inline result of a `canvas_create` / `canvas_open` tool call
 * and auto-opens the canvas panel (live preview + code editor) once the tool
 * completes, mirroring how `session_present_files` opens the session panel.
 */
export function CanvasPresentCard({ data }: { data: unknown }) {
  const isCanvas =
    data !== null &&
    typeof data === "object" &&
    (data as Record<string, unknown>).type === "canvas";

  const slug = isCanvas
    ? String((data as Record<string, unknown>).slug ?? "")
    : "";
  const name = isCanvas
    ? String((data as Record<string, unknown>).name ?? "")
    : "";
  const description = isCanvas
    ? String((data as Record<string, unknown>).description ?? "")
    : "";
  const entryFile = isCanvas
    ? String((data as Record<string, unknown>).entryFile ?? "index.html")
    : "index.html";
  const message = isCanvas
    ? ((data as Record<string, unknown>).message as string | null | undefined) ?? null
    : null;
  const files = isCanvas
    ? ((data as Record<string, unknown>).files as unknown[] | undefined) ?? []
    : [];
  const fileCount =
    (typeof (data as Record<string, unknown>).fileCount === "number"
      ? Number((data as Record<string, unknown>).fileCount)
      : files.length) ?? 0;

  // Whether this card's canvas is currently open in the panel. Drives the
  // headline copy: "Opened canvas…" while open, a neutral label once closed.
  const [isOpen, setIsOpen] = useState(false);

  // Track open/close state so the card's copy matches reality. The page
  // dispatches CANVAS_OPENED_EVENT only when it actually opens the panel
  // (skipping it when the user dismissed it), so the "Opened canvas…" copy
  // is never shown while the panel is really closed. A manual close flips
  // it back to the neutral label.
  useEffect(() => {
    if (!isCanvas) return;
    const onOpened = (event: Event) => {
      const detail = (event as CustomEvent<{ slug: string }>).detail;
      if (detail?.slug && detail.slug !== slug) return;
      setIsOpen(true);
    };
    const onClosed = () => setIsOpen(false);
    window.addEventListener(CANVAS_OPENED_EVENT, onOpened);
    window.addEventListener(CANVAS_CLOSED_EVENT, onClosed);
    return () => {
      window.removeEventListener(CANVAS_OPENED_EVENT, onOpened);
      window.removeEventListener(CANVAS_CLOSED_EVENT, onClosed);
    };
  }, [isCanvas, slug]);

  // Auto-open the panel once the card appears (no-op for non-canvas output).
  useEffect(() => {
    if (!slug) return;
    const t = setTimeout(() => {
      dispatchCanvasPresent({ slug, message });
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  if (!isCanvas) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="overflow-hidden rounded-xl bg-primary/[0.04]"
    >
      <div className="flex items-center gap-2.5 px-3.5 py-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <LayoutPanelTop className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {isOpen
              ? message || (name ? `Canvas: ${name}` : "Canvas ready")
              : name
                ? `Canvas ready: ${name}`
                : "Canvas ready"}
          </p>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {isOpen
              ? description ||
                `${fileCount} file${fileCount === 1 ? "" : "s"} · entry ${entryFile}`
              : description || `${fileCount} file${fileCount === 1 ? "" : "s"}`}
          </p>
        </div>
        <button
          type="button"
          onClick={() =>
            dispatchCanvasPresent({ slug, message, manual: true })
          }
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.97]"
        >
          {isOpen ? "Reopen canvas" : "Open canvas"}
        </button>
      </div>
    </motion.div>
  );
}

/** Loading placeholder while the canvas tool is still running. */
export function CanvasPresentLoading() {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-primary/15 bg-primary/[0.03] px-3.5 py-3">
      <span className="text-sm text-muted-foreground">Setting up canvas…</span>
    </div>
  );
}
