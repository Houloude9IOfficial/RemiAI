"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { FileImage, Grid2X2, List, Loader2, Play, RefreshCw, Search } from "lucide-react";
import { sessionFilesApi, type LibraryFileEntry } from "@/lib/api/session-files";
import {
  fileIconElement,
  formatBytes,
  isImageFile,
  isVideoFile,
} from "@/lib/session-files/ui-utils";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

type LibraryTab = "all" | "images" | "videos" | "documents";
type ViewMode = "grid" | "list";

const tabs: { id: LibraryTab; label: string }[] = [
  { id: "images", label: "Images" },
  { id: "videos", label: "Videos" },
  { id: "documents", label: "Documents" },
  { id: "all", label: "All" },
];

function LibraryVideo({ file }: { file: LibraryFileEntry }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  const playPreview = () => {
    const video = videoRef.current;
    if (!video) return;
    video.play().catch(() => undefined);
  };

  const stopPreview = () => {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    video.currentTime = 0;
  };

  return (
    <div
      className="relative overflow-hidden bg-muted/70"
      onMouseEnter={playPreview}
      onMouseLeave={stopPreview}
    >
      <video
        ref={videoRef}
        src={file.url}
        muted
        loop
        playsInline
        preload="metadata"
        className="block aspect-video w-full object-contain"
      />
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/10 text-white transition-opacity group-hover:opacity-0">
        <Play className="size-9 fill-current drop-shadow-md" />
      </span>
    </div>
  );
}

function LibraryCard({ file }: { file: LibraryFileEntry }) {
  const router = useRouter();
  const isImage = isImageFile(file.name);
  const isVideo = isVideoFile(file.name);
  const date = Number.isNaN(new Date(file.mtime).getTime())
    ? "Unknown date"
    : format(new Date(file.mtime), "MMM d, yyyy");

  return (
    <button
      type="button"
      onClick={() => router.push(`/chat/${file.conversationId}`)}
      className={cn(
        "group mb-5 block w-full break-inside-avoid overflow-hidden rounded-2xl text-left transition duration-200 focus-visible:outline-2 focus-visible:outline-primary",
        (isImage || isVideo)
          ? "bg-muted/30 hover:shadow-lg"
          : "border border-border/60 bg-card hover:border-primary/30 hover:shadow-md",
      )}
      aria-label={`Open ${file.name} in ${file.conversationTitle}`}
    >
      <div className="relative">
        {isImage ? (
          // The files are local, access-controlled API responses. Keeping the
          // browser's native image element preserves each image's intrinsic
          // dimensions for the masonry layout.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={file.url}
            alt={file.name}
            className="block h-auto w-full"
            loading="lazy"
          />
        ) : isVideo ? (
          <LibraryVideo file={file} />
        ) : (
          <div className="flex aspect-[4/3] flex-col items-center justify-center gap-4 bg-muted/45 px-4 text-muted-foreground">
            <span className="flex size-16 items-center justify-center rounded-2xl bg-background shadow-sm">
              {fileIconElement(file.name, false, "size-8")}
            </span>
            <span className="max-w-[90%] truncate text-center text-sm font-medium text-foreground">{file.name}</span>
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-3 pb-3 pt-12 text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100">
          <p className="truncate text-sm font-semibold">{file.name}</p>
          <p className="mt-0.5 truncate text-xs text-white/75">{date} · {file.conversationTitle}</p>
        </div>
      </div>
      {!isImage && !isVideo && (
        <div className="flex items-center justify-between gap-2 px-3 py-3 text-xs text-muted-foreground">
          <span className="truncate">{file.conversationTitle}</span>
          <span className="shrink-0">{date}</span>
        </div>
      )}
    </button>
  );
}

function LibraryListRow({ file }: { file: LibraryFileEntry }) {
  const router = useRouter();
  const date = Number.isNaN(new Date(file.mtime).getTime())
    ? "Unknown date"
    : format(new Date(file.mtime), "MMM d, yyyy");

  return (
    <button
      type="button"
      onClick={() => router.push(`/chat/${file.conversationId}`)}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary"
    >
      <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted text-muted-foreground">
        {isImageFile(file.name) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={file.url} alt="" className="size-full object-cover" />
        ) : fileIconElement(file.name, false, "size-5")}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{file.name}</span>
        <span className="block truncate text-xs text-muted-foreground">{file.conversationTitle}</span>
      </span>
      <span className="hidden text-xs text-muted-foreground sm:block">{formatBytes(file.size)}</span>
      <span className="w-24 shrink-0 text-right text-xs text-muted-foreground">{date}</span>
    </button>
  );
}

export function LibraryPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<LibraryTab>("all");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<ViewMode>("grid");
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["library-files"],
    queryFn: () => sessionFilesApi.library(),
    staleTime: 15_000,
  });
  const files = useMemo(() => data?.files ?? [], [data]);
  const visibleFiles = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return files.filter((file) => {
      const matchesTab = activeTab === "all"
        || (activeTab === "images" && isImageFile(file.name))
        || (activeTab === "videos" && isVideoFile(file.name))
        || (activeTab === "documents" && !isImageFile(file.name) && !isVideoFile(file.name));
      return matchesTab && (!needle || `${file.name} ${file.conversationTitle}`.toLowerCase().includes(needle));
    });
  }, [activeTab, files, query]);

  return (
    <div className="min-h-full">
      <h1 className="sr-only">Library</h1>
      <header className="sticky top-0 z-10 border-b border-border/65 bg-background/92 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/75 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-[1800px] flex-wrap items-center gap-x-5 gap-y-2">
          <nav className="flex items-center gap-1" aria-label="Library filters">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "rounded-full px-3.5 py-2 text-sm transition-colors",
                  activeTab === tab.id
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                )}
              >
                {tab.label}
              </button>
            ))}
          </nav>
          <div className="order-3 flex w-full min-w-44 flex-1 items-center gap-1 sm:order-none sm:w-auto sm:justify-end">
            <button
              type="button"
              onClick={() => setView("grid")}
              className={cn("flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground", view === "grid" && "bg-muted text-foreground")}
              aria-label="Grid view"
              title="Grid view"
            >
              <Grid2X2 className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => setView("list")}
              className={cn("flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground", view === "list" && "bg-muted text-foreground")}
              aria-label="List view"
              title="List view"
            >
              <List className="size-4" />
            </button>
            <label className="relative ml-1 min-w-0 flex-1 sm:max-w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search library" className="h-10 rounded-full pl-9" />
            </label>
            <button
              type="button"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["library-files"] })}
              disabled={isFetching}
              className="ml-1 flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
              aria-label="Refresh library"
              title="Refresh library"
            >
              <RefreshCw className={cn("size-4", isFetching && "animate-spin")} />
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-[1800px] px-4 py-5 sm:px-6 lg:px-8">
        {isLoading ? (
          <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-5 animate-spin" /> Loading your library
          </div>
        ) : visibleFiles.length === 0 ? (
          <div className="flex min-h-72 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-muted/20 px-6 text-center">
            <FileImage className="size-9 text-muted-foreground/45" />
            <div>
              <p className="font-medium">{files.length === 0 ? "Your library is empty" : "No matching files"}</p>
              <p className="mt-1 text-sm text-muted-foreground">{files.length === 0 ? "Files created or uploaded in a chat will appear here." : "Try a different filter or search."}</p>
            </div>
          </div>
        ) : view === "list" ? (
          <div className="divide-y divide-border/60 rounded-2xl border border-border/60 bg-card p-1">
            {visibleFiles.map((file) => <LibraryListRow key={`${file.conversationId}:${file.path}`} file={file} />)}
          </div>
        ) : (
          <div className="columns-1 gap-5 sm:columns-2 lg:columns-3 xl:columns-4 2xl:columns-5 min-[1800px]:columns-6">
            {visibleFiles.map((file) => <LibraryCard key={`${file.conversationId}:${file.path}`} file={file} />)}
          </div>
        )}
      </section>
    </div>
  );
}
