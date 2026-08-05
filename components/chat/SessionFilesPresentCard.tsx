"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import {
  Files,
  FileCode2,
  Download,
  Loader2,
  ExternalLink,
} from "lucide-react";
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

type PresentSingleOutput = {
  type: "session_file";
  path: string;
  name: string;
  size: number | null;
  url: string;
  message?: string | null;
};

/**
 * Renders the inline result of a `session_present_files` / `session_present_file`
 * tool call. Auto-opens the session files panel once the tool completes, and
 * offers an explicit "Open" button as well.
 *
 * - `session_present_files` → lists the files and opens the panel.
 * - `session_present_file`  → opens the panel straight to that file's viewer.
 */
export function SessionFilesPresentCard({ data }: { data: unknown }) {
  const raw =
    data && typeof data === "object" ? (data as Record<string, unknown>) : null;
  const type = raw?.type;

  if (type === "session_file") {
    return <SingleFileCard data={data as PresentSingleOutput} />;
  }

  if (type === "session_files") {
    return <FilesCard data={data as PresentOutput} />;
  }

  return null;
}

// ── Single file (session_present_file) ─────────────────────────────────────

function SingleFileCard({ data }: { data: PresentSingleOutput }) {
  const showCard = false // Do not show for now...
  const name = data.name || data.path.split("/").pop() || data.path;

  // Auto-open the side panel straight to this file once the card appears.
  useEffect(() => {
    const t = setTimeout(
      () =>
        dispatchSessionFilesPresent({
          focusPath: data.path,
          message: data.message ?? null,
        }),
      350,
    );
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={`overflow-hidden rounded-xl bg-primary/[0.04] ${!showCard ? "hidden" : ""}`}
    >
      <div className="flex items-center gap-2.5 px-3.5 py-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-primary">
          <FileCode2 className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {data.message || `Opened ${name}`}
          </p>
          <p className="truncate text-[11px] text-muted-foreground">{data.path}</p>
        </div>
        <a
          href={data.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Open ${name}`}
          title="Open file"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-95"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
        <a
          href={`${data.url}?download=1`}
          aria-label={`Download ${name}`}
          title="Download file"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-95"
        >
          <Download className="h-3.5 w-3.5" />
        </a>
        <button
          type="button"
          onClick={() =>
            dispatchSessionFilesPresent({
              focusPath: data.path,
              message: data.message ?? null,
            })
          }
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.97]"
        >
          Open file
        </button>
      </div>
    </motion.div>
  );
}

// ── File list (session_present_files) ──────────────────────────────────────

function FilesCard({ data }: { data: PresentOutput }) {
  const files = data.files && Array.isArray(data.files) ? data.files : [];

  // Auto-open the side panel once the card appears.
  useEffect(() => {
    const t = setTimeout(
      () =>
        dispatchSessionFilesPresent({
          paths: files.map((f) => f.path),
          message: data.message ?? null,
        }),
      350,
    );
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
            {data.message || "Session files are ready"}
          </p>
        </div>
        <button
          type="button"
          onClick={() =>
            dispatchSessionFilesPresent({
              paths: files.map((f) => f.path),
              message: data.message ?? null,
            })
          }
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.97]"
        >
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
