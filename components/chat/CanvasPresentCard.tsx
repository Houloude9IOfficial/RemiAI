"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import { LayoutPanelTop } from "lucide-react";
import { dispatchCanvasPresent } from "@/lib/api/canvas";

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
            {message || (name ? `Canvas: ${name}` : "Canvas ready")}
          </p>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {description || `${fileCount} file${fileCount === 1 ? "" : "s"} · entry ${entryFile}`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => dispatchCanvasPresent({ slug, message })}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.97]"
        >
          Open canvas
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
