"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import { Files, Eye, Loader2, FileCode2 } from "lucide-react";
import { dispatchSessionFilesPresent } from "@/lib/api/session-files";

type PresentedFile = {
  path: string;
  name: string;
  isDirectory: boolean;
  size: number | null;
};

type PresentOutput = {
  type: "session_files";
  message?: string | null;
  count: number;
  files: PresentedFile[];
};

/**
 * Renders the inline result of a `session_present_files` tool call.
 * Auto-opens the session files panel once the tool completes, and offers
 * an explicit "Open panel" button as well.
 */
export function SessionFilesPresentCard({ data }: { data: unknown }) {
  const valid =
    !!data &&
    typeof data === "object" &&
    (data as PresentOutput).type === "session_files";
  const output = valid ? (data as PresentOutput) : null;
  const files = output?.files && Array.isArray(output.files) ? output.files : [];
  const count = output?.count ?? files.length;

  // Auto-open the side panel once the card appears.
  useEffect(() => {
    if (!valid) return;
    const t = setTimeout(
      () =>
        dispatchSessionFilesPresent({
          paths: files.map((f) => f.path),
          message: output?.message ?? null,
        }),
      350,
    );
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valid]);

  if (!output) return null;

  const shortName = (p: string) => {
    const parts = p.split("/");
    return parts[parts.length - 1];
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="overflow-hidden rounded-xl bg-primary/[0.04]"
    >
      <div className="flex items-center gap-2.5 px-3.5 py-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-primary">
          <Files className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">
            {output.message || "Session files are ready"}
          </p>
        </div>
        <button
          type="button"
          onClick={() =>
            dispatchSessionFilesPresent({
              paths: files.map((f) => f.path),
              message: output.message ?? null,
            })
          }
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.97]"
        >
          {/* <Eye className="h-3.5 w-3.5" /> */}
          Open sidebar
        </button>
      </div>

      {files.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-t border-primary/10 px-3.5 py-2.5">
          {files.slice(0, 6).map((f) => (
            <span
              key={f.path}
              className="inline-flex max-w-full items-center gap-1 rounded-md border border-border/60 bg-background/70 px-2 py-1 text-[11px] text-muted-foreground"
            >
              <FileCode2 className="h-3 w-3 shrink-0" />
              <span className="truncate">{shortName(f.path)}</span>
            </span>
          ))}
          {files.length > 6 && (
            <span className="text-[11px] text-muted-foreground">
              +{files.length - 6} more
            </span>
          )}
        </div>
      )}
    </motion.div>
  );
}

/** Loading placeholder while the present tool is still running. */
export function SessionFilesPresentLoading() {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-primary/15 bg-primary/[0.03] px-3.5 py-3">
      <Loader2 className="h-4 w-4 animate-spin text-primary" />
      <span className="text-sm text-muted-foreground">Preparing session files…</span>
    </div>
  );
}
