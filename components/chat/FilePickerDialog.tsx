"use client";

import { useState, useRef, useMemo, useCallback, useEffect, Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  FileIcon,
  FolderIcon,
  ChevronRight,
  Loader2,
  Search,
  ArrowLeft,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { directoriesApi, type BrowseEntry } from "@/lib/api/directories";
import { projectsApi } from "@/lib/api/projects";
import { formatProjectFileReference } from "@/lib/projects/references";
import { formatFileDisplay } from "./FileMention";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface FilePickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (displayText: string) => void;
}

type PickerEntry = BrowseEntry & {
  source: "directory" | "project";
  isRoot: boolean;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FilePickerDialog({ open, onOpenChange, onSelect }: FilePickerDialogProps) {
  const [expandedRoot, setExpandedRoot] = useState<number | null>(null);
  const [expandedProject, setExpandedProject] = useState<number | null>(null);
  // Relative path inside the expanded root ("" = root level). Lets the user
  // drill into subdirectories as deep as they need to.
  const [currentPath, setCurrentPath] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Fetch roots
  const { data: rootsData, isLoading: rootsLoading } = useQuery({
    queryKey: ["directories", "browse"],
    queryFn: () => directoriesApi.browse(),
    enabled: open,
  });
  const { data: projects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: projectsApi.list,
    enabled: open,
  });

  // Fetch files for the current root + subdirectory
  const { data: filesData, isLoading: filesLoading } = useQuery({
    queryKey: ["directories", "browse", "root", expandedRoot, currentPath],
    queryFn: () => directoriesApi.browse(expandedRoot!, currentPath || undefined, 2),
    enabled: open && expandedRoot !== null,
  });
  const { data: projectFiles = [], isLoading: projectFilesLoading } = useQuery({
    queryKey: ["project-files", expandedProject],
    queryFn: () => projectsApi.files(expandedProject!),
    enabled: open && expandedProject !== null,
  });

  // Reset when opening
  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      onOpenChange(nextOpen);
      if (nextOpen) {
        setExpandedRoot(null);
        setExpandedProject(null);
        setCurrentPath("");
        setSearchQuery("");
        setSelectedIndex(0);
        // Focus search input after dialog opens
        requestAnimationFrame(() => searchInputRef.current?.focus());
      }
    },
    [onOpenChange],
  );

  // Navigate into a directory (or jump to a breadcrumb level)
  const navigateTo = useCallback((rootId: number, path: string) => {
    setExpandedRoot(rootId);
    setExpandedProject(null);
    setCurrentPath(path);
    setSearchQuery("");
    setSelectedIndex(0);
  }, []);

  const navigateToProject = useCallback((projectId: number, path: string) => {
    setExpandedProject(projectId);
    setExpandedRoot(null);
    setCurrentPath(path);
    setSearchQuery("");
    setSelectedIndex(0);
  }, []);

  // Go up one level: subdirectory → parent → root list
  const goUpOneLevel = useCallback(() => {
    if (expandedRoot === null && expandedProject === null) return;
    setSearchQuery("");
    setSelectedIndex(0);
    if (currentPath) {
      const segments = currentPath.split("/");
      segments.pop();
      setCurrentPath(segments.join("/"));
    } else {
      setExpandedRoot(null);
      setExpandedProject(null);
    }
  }, [expandedRoot, expandedProject, currentPath]);

  // Path segments for the breadcrumb
  const pathSegments = useMemo(
    () => (currentPath ? currentPath.split("/") : []),
    [currentPath],
  );

  const rootLabel = expandedProject !== null
    ? projects.find((project) => project.id === expandedProject)?.name ?? "Project files"
    : rootsData?.roots.find((r) => r.rootId === expandedRoot)?.rootLabel ?? "Directory";

  // Build entries
  const entries = useMemo(() => {
    const items: PickerEntry[] = [];

    if (expandedRoot === null && expandedProject === null) {
      for (const root of rootsData?.roots ?? []) {
        items.push({ ...root, source: "directory", isRoot: true });
      }
      for (const project of projects) {
        items.push({
          name: project.name,
          relativePath: "",
          isDirectory: true,
          rootId: project.id,
          rootLabel: project.name,
          source: "project",
          isRoot: true,
        });
      }
    } else if (expandedRoot !== null) {
      for (const file of filesData?.entries ?? []) {
        items.push({ ...file, source: "directory", isRoot: false });
      }
    } else if (expandedProject !== null) {
      const prefix = currentPath ? `${currentPath}/` : "";
      for (const file of projectFiles) {
        if (!file.path.startsWith(prefix)) continue;
        const remainder = file.path.slice(prefix.length);
        if (!remainder || remainder.includes("/")) continue;
        items.push({
          name: file.name,
          relativePath: file.path,
          isDirectory: file.isDirectory,
          rootId: expandedProject,
          rootLabel,
          source: "project",
          isRoot: false,
        });
      }
    }

    // Filter by search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return items.filter(
        (item) =>
          item.name.toLowerCase().includes(q) ||
          item.relativePath.toLowerCase().includes(q) ||
          item.rootLabel.toLowerCase().includes(q),
      );
    }

    return items.slice(0, 100);
  }, [rootsData, projects, filesData, projectFiles, expandedRoot, expandedProject, currentPath, rootLabel, searchQuery]);

  // Keep the selection inside the visible list (entries shrink on refetch/filter)
  const activeIndex = Math.min(selectedIndex, Math.max(entries.length - 1, 0));

  // Scroll selected item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const selected = list.children[activeIndex] as HTMLElement | undefined;
    selected?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const handleSelect = useCallback(
    (entry: PickerEntry) => {
      if (entry.isDirectory) {
        if (entry.source === "project") navigateToProject(entry.rootId, entry.isRoot ? "" : entry.relativePath);
        else navigateTo(entry.rootId, entry.isRoot ? "" : entry.relativePath);
        return;
      }

      onSelect(entry.source === "project"
        ? `📄 ${entry.rootLabel}/${entry.relativePath} ${formatProjectFileReference({ projectId: entry.rootId, kind: "file", path: entry.relativePath })} `
        : formatFileDisplay(entry) + " ");
    },
    [onSelect, navigateTo, navigateToProject],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((prev) => Math.min(prev + 1, entries.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((prev) => Math.max(prev - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (entries[activeIndex]) {
            handleSelect(entries[activeIndex]);
          }
          break;
        case "Escape":
          e.preventDefault();
          if (expandedRoot !== null || expandedProject !== null) {
            goUpOneLevel();
          } else {
            handleOpenChange(false);
          }
          break;
        case "ArrowRight":
          e.preventDefault();
          {
            const item = entries[activeIndex];
            if (item?.isDirectory) {
              if (item.source === "project") navigateToProject(item.rootId, item.isRoot ? "" : item.relativePath);
              else navigateTo(item.rootId, item.isRoot ? "" : item.relativePath);
            }
          }
          break;
        case "ArrowLeft":
          e.preventDefault();
          goUpOneLevel();
          break;
      }
    },
    [entries, activeIndex, handleSelect, expandedRoot, expandedProject, handleOpenChange, navigateTo, navigateToProject, goUpOneLevel],
  );

  const showLoading = (expandedRoot === null && expandedProject === null && (rootsLoading || projectsLoading))
    || (expandedRoot !== null && filesLoading)
    || (expandedProject !== null && projectFilesLoading);
  const empty = !showLoading && entries.length === 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {expandedRoot !== null || expandedProject !== null ? (
              <button
                type="button"
                onClick={goUpOneLevel}
                className="flex items-center gap-1.5 text-sm font-medium text-primary/70 hover:text-primary transition-colors"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                {currentPath ? "Back" : "Back to directories"}
              </button>
            ) : (
              "Browse server files"
            )}
          </DialogTitle>
          <DialogDescription>
            Reference a server folder, file, or a project&apos;s shared files.
          </DialogDescription>
        </DialogHeader>

        {/* Breadcrumb */}
        {(expandedRoot !== null || expandedProject !== null) && (
          <nav
            aria-label="Current directory"
            className="flex flex-wrap items-center gap-1 rounded-lg bg-muted/40 px-2.5 py-1.5 text-xs text-muted-foreground/80"
          >
            <button
              type="button"
              onClick={() => expandedProject !== null ? navigateToProject(expandedProject, "") : navigateTo(expandedRoot!, "")}
              className="max-w-[140px] truncate rounded px-1 py-0.5 font-medium text-foreground/70 transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/40"
            >
              {rootLabel}
            </button>
            {pathSegments.map((segment, idx) => (
              <Fragment key={`${segment}-${idx}`}>
                <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/30" />
                <button
                  type="button"
                  onClick={() => expandedProject !== null
                    ? navigateToProject(expandedProject, pathSegments.slice(0, idx + 1).join("/"))
                    : navigateTo(expandedRoot!, pathSegments.slice(0, idx + 1).join("/"))}
                  className={cn(
                    "max-w-[140px] truncate rounded px-1 py-0.5 transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/40",
                    idx === pathSegments.length - 1
                      ? "font-medium text-foreground/90"
                      : "text-foreground/70",
                  )}
                >
                  {segment}
                </button>
              </Fragment>
            ))}
          </nav>
        )}

        {/* Search input */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search files and directories..."
            className="w-full rounded-lg border border-border/60 bg-transparent py-2 pl-9 pr-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 placeholder:text-muted-foreground/40"
          />
        </div>

        {/* File list */}
        <div
          ref={listRef}
          className="max-h-[280px] overflow-y-auto -mx-1 px-1 custom-scrollbar"
        >
          {showLoading && (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/40" />
            </div>
          )}

          {empty && (
            <div className="px-3 py-10 text-center text-sm text-muted-foreground/50">
              {searchQuery.trim()
                ? `No files matching "${searchQuery}"`
                : expandedRoot !== null || expandedProject !== null
                  ? "This directory is empty"
                  : "No server directories or projects available."}
            </div>
          )}

          {!showLoading &&
            entries.map((item, idx) => {
              const entry = item;
              const isSelected = idx === activeIndex;
              const isRoot = item.isRoot;

              return (
                <div
                  key={`${item.source}-${entry.rootId}-${entry.relativePath}`}
                  role="button"
                  tabIndex={0}
                  aria-label={
                    isRoot
                      ? `Browse ${entry.source === "project" ? "project files for" : "directory"} ${entry.rootLabel}`
                      : entry.isDirectory
                        ? `Open folder ${entry.name}`
                        : `Select file ${entry.name}`
                  }
                  className={cn(
                    "group flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm transition-all outline-none",
                    isSelected
                      ? "bg-primary/10 text-primary"
                      : "text-foreground/80 hover:bg-muted/50 focus-visible:bg-muted/50",
                  )}
                  onClick={() => handleSelect(item)}
                  onKeyDown={(e) => {
                    // Ignore keys originating from the nested attach button
                    if (e.target !== e.currentTarget) return;
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleSelect(item);
                    }
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                >
                  {/* Icon */}
                  {entry.isDirectory || isRoot ? (
                    <FolderIcon className="h-4 w-4 shrink-0 text-amber-500/70" />
                  ) : (
                    <FileIcon className="h-4 w-4 shrink-0 text-blue-500/70" />
                  )}

                  {/* Name */}
                  <span className="flex-1 truncate font-medium">
                    {isRoot ? entry.rootLabel : entry.name}
                  </span>
                  {isRoot && entry.source === "project" && (
                    <span className="shrink-0 text-[11px] text-muted-foreground/60">Project files</span>
                  )}

                  {/* Path hint */}
                  {!isRoot && entry.relativePath && (
                    <span className="hidden sm:block truncate text-[11px] text-muted-foreground/40 max-w-[120px]">
                      {entry.relativePath}
                    </span>
                  )}

                  {/* Actions */}
                  <span className="flex shrink-0 items-center gap-0.5">
                    {/* Nested folder: attach the folder itself (revealed on hover) */}
                    {(entry.source === "project" || !isRoot) && entry.isDirectory && (
                      <button
                        type="button"
                        title={isRoot ? "Attach all project files" : "Attach this folder"}
                        aria-label={isRoot ? `Attach all files from project ${entry.rootLabel}` : `Attach folder ${entry.name}`}
                        className={cn(
                          "rounded-md p-1 text-muted-foreground/40 opacity-0 transition-all group-hover:opacity-100 hover:text-primary focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/40",
                          (isSelected || isRoot) && "opacity-100",
                        )}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelect(entry.source === "project"
                            ? `📁 ${entry.rootLabel}${isRoot ? " files" : `/${entry.relativePath}`} ${formatProjectFileReference({
                                projectId: entry.rootId,
                                kind: isRoot ? "root" : "folder",
                                path: isRoot ? null : entry.relativePath,
                              })} `
                            : formatFileDisplay(entry) + " ");
                        }}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {/* Navigate hint */}
                    {entry.isDirectory && (
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/30" />
                    )}
                  </span>
                </div>
              );
            })}
        </div>

        {/* Footer */}
        {/* <div className="text-center text-[11px] text-muted-foreground/40 border-t border-border/20 pt-3 -mx-4 -mb-4 px-4 pb-3 bg-muted/20 rounded-b-xl">
          <kbd className="rounded border border-border/30 px-1.5 py-0.5 font-mono text-[10px]">↵</kbd>
          <span className="mx-1">select</span>
          <kbd className="rounded border border-border/30 px-1.5 py-0.5 font-mono text-[10px]">→</kbd>
          <span className="mx-1">expand</span>
          <kbd className="rounded border border-border/30 px-1.5 py-0.5 font-mono text-[10px]">Esc</kbd>
          <span className="mx-1">back</span>
        </div> */}
      </DialogContent>
    </Dialog>
  );
}
