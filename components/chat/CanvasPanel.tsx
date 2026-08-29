"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import CodeMirror from "@uiw/react-codemirror";
import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { markdown } from "@codemirror/lang-markdown";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { json } from "@codemirror/lang-json";
import { yaml } from "@codemirror/lang-yaml";
import { xml } from "@codemirror/lang-xml";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/ThemeProvider";
import {
  LayoutPanelTop,
  FileCode2,
  Files,
  X,
  RefreshCw,
  Loader2,
  ExternalLink,
  Check,
  Save,
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  Eye,
  Download,
} from "lucide-react";
import { canvasApi } from "@/lib/api/canvas";
import { sessionFilesApi, subscribeSessionFilesChanged } from "@/lib/api/session-files";
import { extOf, formatBytes, buildTree, fileIconElement, type TreeNode } from "@/lib/session-files/ui-utils";
import type { CanvasSummary } from "@/lib/api/canvas";

/** File extensions editable as text in the canvas panel (client-safe copy). */
const EDITABLE_EXTENSIONS = new Set([
  "html", "htm", "css", "js", "mjs", "cjs", "jsx", "ts", "tsx",
  "json", "md", "markdown", "txt", "svg", "xml", "yaml", "yml", "csv",
]);
function isEditableFile(name: string): boolean {
  const idx = name.lastIndexOf(".");
  return idx >= 0 && EDITABLE_EXTENSIONS.has(name.slice(idx + 1).toLowerCase());
}

// ── CodeMirror language by extension ──────────────────────────────────────

function languageForExt(ext: string): Extension[] {
  switch (ext) {
    case "js": case "mjs": case "cjs": case "jsx": case "ts": case "tsx":
      return [javascript({ jsx: true, typescript: true })];
    case "py": return [python()];
    case "md": case "markdown": return [markdown()];
    case "css": case "scss": return [css()];
    case "html": case "htm": return [html()];
    case "json": return [json()];
    case "yaml": case "yml": return [yaml()];
    case "xml": case "svg": return [xml()];
    default: return [];
  }
}

function editorChrome(dark: boolean) {
  return EditorView.theme(
    {
      "&": { backgroundColor: "transparent", height: "100%", fontSize: "13px", color: "var(--foreground)" },
      ".cm-scroller": {
        fontFamily: "var(--font-jetbrains-mono), ui-monospace, SFMono-Regular, Menlo, monospace",
        lineHeight: "1.65",
      },
      ".cm-gutters": { backgroundColor: "transparent", color: "var(--muted-foreground)", borderRight: "1px solid var(--border)", fontSize: "11px" },
      "&.cm-focused": { outline: "none" },
      ".cm-activeLine": { backgroundColor: "color-mix(in oklch, var(--muted) 55%, transparent)" },
      ".cm-cursor": { borderLeftColor: "var(--foreground)" },
    },
    { dark },
  );
}

// ── Panel ────────────────────────────────────────────────────────────────

const PANEL_MIN_WIDTH = 320;
const PANEL_MAX_WIDTH = 680;
const PANEL_DEFAULT_WIDTH = 480;
const PANEL_WIDTH_KEY = "canvas-panel-width";

function clampWidth(value: number) {
  const viewportMax = (typeof window !== "undefined" ? window.innerWidth : 680) * 0.7;
  const max = Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, viewportMax));
  return Math.min(max, Math.max(PANEL_MIN_WIDTH, value));
}

type Tab = "preview" | "editor";

export function CanvasPanel({
  conversationId,
  onClose,
  focusSlug,
}: {
  conversationId: number;
  onClose: () => void;
  focusSlug?: string | null;
}) {
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ["canvases", conversationId],
    queryFn: () => canvasApi.list(conversationId),
  });
  const canvases = data?.canvases ?? [];

  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [handledFocus, setHandledFocus] = useState<string | null>(null);
  if (focusSlug && handledFocus !== focusSlug) {
    setHandledFocus(focusSlug);
    setSelectedSlug(focusSlug);
  } else if (!focusSlug && !selectedSlug && canvases.length > 0) {
    setSelectedSlug(canvases[0].slug);
  }

  const canvas = canvases.find((c) => c.slug === selectedSlug) ?? null;
  const [tab, setTab] = useState<Tab>("preview");
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [previewVersion, setPreviewVersion] = useState(0);

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["canvases", conversationId] });
    queryClient.invalidateQueries({ queryKey: ["canvas-file", conversationId] });
  }, [queryClient, conversationId]);

  useEffect(() => {
    const unsub = subscribeSessionFilesChanged(({ conversationId: cid }) => {
      if (cid !== conversationId) return;
      invalidate();
      setPreviewVersion((v) => v + 1);
    });
    return unsub;
  }, [conversationId, invalidate]);

  if (!canvas) {
    return (
      <div className="flex h-full w-full flex-col border-l border-border/60 bg-muted/25">
        <PanelHeader onClose={onClose} title="Canvas" subtitle="Interactive buildable projects" />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-10 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
            <LayoutPanelTop className="h-5 w-5 text-muted-foreground/70" />
          </div>
          <div>
            <p className="text-sm font-medium">No canvas yet</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Ask the AI to create a website, app, calculator, game, or interactive demo.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const fileCount = canvas.files.filter((f) => f.isFile).length;

  return (
    <div className="flex h-full w-full flex-col border-l border-border/60 bg-muted/25">
      <PanelHeader
        onClose={onClose}
        title={canvas.name}
        subtitle={`${fileCount} file${fileCount === 1 ? "" : "s"} · Live preview with JS`}
      />

      {canvases.length > 1 && (
        <div className="flex flex-wrap gap-1 border-b border-border/60 px-2.5 py-1.5">
          {canvases.map((c) => (
            <button
              key={c.slug}
              type="button"
              onClick={() => { setSelectedSlug(c.slug); setSelectedFile(null); }}
              className={cn(
                "rounded-md px-2 py-1 text-xs transition-colors",
                c.slug === canvas.slug ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-1 border-b border-border/60 px-2.5 py-1.5">
        <button type="button" onClick={() => setTab("preview")}
          className={cn("inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
            tab === "preview" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
          <Eye className="h-3.5 w-3.5" /> Preview
        </button>
        <button type="button" onClick={() => setTab("editor")}
          className={cn("inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
            tab === "editor" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
          <FileCode2 className="h-3.5 w-3.5" /> Code
        </button>
        <div className="ml-auto flex items-center gap-1">
          <button type="button" onClick={() => setPreviewVersion((v) => v + 1)}
            aria-label="Reload preview" title="Reload preview"
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-95">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <a href={canvas.previewUrl} target="_blank" rel="noopener noreferrer"
            aria-label="Open preview in new tab" title="Open in new tab"
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-95">
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
          <a href={canvasApi.downloadUrl(conversationId, canvas.slug)}
            aria-label="Download canvas as ZIP" title="Download as ZIP"
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-95">
            <Download className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {tab === "preview" ? (
          <CanvasPreview key={`preview-${canvas.slug}-${previewVersion}`} conversationId={conversationId} canvas={canvas} version={previewVersion} />
        ) : (
          <CanvasEditor conversationId={conversationId} canvas={canvas} selectedFile={selectedFile} onSelectFile={setSelectedFile} />
        )}
      </div>
    </div>
  );
}

// ── Header ────────────────────────────────────────────────────────────────

function PanelHeader({ onClose, title, subtitle }: { onClose: () => void; title: string; subtitle: string }) {
  return (
    <div className="flex items-center gap-2 border-b border-border/60 px-3.5 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold leading-tight">{title}</p>
        <p className="truncate text-[10px] text-muted-foreground">{subtitle}</p>
      </div>
      <button type="button" onClick={onClose} aria-label="Close canvas"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-95">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

// ── Building state ───────────────────────────────────────────────────────

function CanvasBuildingState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-background">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/assets/building.gif" alt="Building…" className="h-24 w-24 object-contain" />
      <div className="text-center">
        <p className="text-sm font-medium">Building your canvas…</p>
        <p className="mt-1 text-xs text-muted-foreground">The AI is writing HTML, CSS, and JavaScript.</p>
      </div>
    </div>
  );
}

// ── Live preview via srcdoc ───────────────────────────────────────────────
// Fetches the entry HTML + all linked CSS/JS, inlines them into a single
// self-contained HTML document, then renders via srcdoc. This avoids:
//   - X-Frame-Options / CSP frame-ancestors blocking (srcdoc bypasses them)
//   - Flash of unstyled content (everything is inlined, loads atomically)

function CanvasPreview({
  conversationId,
  canvas,
  version,
}: {
  conversationId: number;
  canvas: CanvasSummary;
  version: number;
}) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  // The base URL for resolving relative asset paths when fetching them.
  const baseUrl = `/api/chat/${conversationId}/session-files/canvas/${canvas.slug}/`;

  // Count of non-starter files to decide if we're still "building"
  const realFileCount = canvas.files.filter((f) => f.isFile && f.name !== canvas.entryFile && f.name !== "canvas.json").length;

  useEffect(() => {
    let cancelled = false;

    async function fetchText(path: string): Promise<string | null> {
      try {
        const res = await sessionFilesApi.content(conversationId, path);
        return res.content ?? null;
      } catch {
        return null;
      }
    }

    async function load() {
      try {
        const entryPath = `canvas/${canvas.slug}/${canvas.entryFile}`;
        const rawHtml = await fetchText(entryPath);
        if (cancelled) return;
        if (!rawHtml) {
          setError("Entry file not found");
          return;
        }

        // Parse the HTML to find linked CSS and JS files
        const parser = new DOMParser();
        const doc = parser.parseFromString(rawHtml, "text/html");

        // Collect <link rel="stylesheet" href="..."> and <script src="...">
        const cssLinks: string[] = [];
        const jsLinks: string[] = [];

        for (const link of doc.querySelectorAll("link[rel='stylesheet'][href]")) {
          const href = link.getAttribute("href");
          if (href && !href.startsWith("http") && !href.startsWith("data:")) {
            cssLinks.push(href);
          }
        }
        for (const script of doc.querySelectorAll("script[src]")) {
          const src = script.getAttribute("src");
          if (src && !src.startsWith("http") && !src.startsWith("data:")) {
            jsLinks.push(src);
          }
        }

        // Fetch all CSS and JS files in parallel
        const [cssResults, jsResults] = await Promise.all([
          Promise.all(cssLinks.map(async (href) => {
            const content = await fetchText(`canvas/${canvas.slug}/${href}`);
            return { href, content };
          })),
          Promise.all(jsLinks.map(async (src) => {
            const content = await fetchText(`canvas/${canvas.slug}/${src}`);
            return { src, content };
          })),
        ]);

        if (cancelled) return;

        // Build the inlined HTML
        let result = rawHtml;

        // Strip existing <base> tags
        result = result.replace(/<base[^>]*>/gi, "");

        // Replace <link rel="stylesheet" href="..."> with inline <style>
        for (const { href, content } of cssResults) {
          if (content) {
            const escapedHref = href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const linkRegex = new RegExp(`<link[^>]*href=["']${escapedHref}["'][^>]*/?>`, "gi");
            result = result.replace(linkRegex, `<style>/* ${href} */\n${content}\n</style>`);
          }
        }

        // Replace <script src="..."> with inline <script>
        for (const { src, content } of jsResults) {
          if (content) {
            const escapedSrc = src.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const scriptRegex = new RegExp(`<script[^>]*src=["']${escapedSrc}["'][^>]*></script>`, "gi");
            result = result.replace(scriptRegex, `<script>/* ${src} */\n${content}\n</script>`);
          }
        }

        // Inject <head> if missing
        if (!result.match(/<head[^>]*>/i)) {
          if (result.match(/<!DOCTYPE|<!doctype/i)) {
            result = result.replace(/(<html[^>]*>)/i, "$1\n<head></head>");
          } else {
            result = `<head></head>${result}`;
          }
        }

        setHtml(result);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load preview");
      }
    }
    load();
    return () => { cancelled = true; };
  }, [conversationId, canvas.slug, canvas.entryFile, baseUrl, version, retryCount]);

  // Show building state if canvas only has the starter entry file
  if (realFileCount === 0 && !error) {
    return <CanvasBuildingState />;
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="rounded-lg border border-destructive/20 bg-destructive/4 p-4 text-sm text-destructive max-w-sm">
          Preview failed: {error}
        </div>
        <button type="button" onClick={() => setRetryCount((v) => v + 1)}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium transition-all hover:bg-muted active:scale-[0.97]">
          <RefreshCw className="h-3.5 w-3.5" /> Retry
        </button>
      </div>
    );
  }

  if (html === null) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <p className="text-xs text-muted-foreground">Loading preview…</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex flex-1 flex-col p-3">
        <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg border border-accent bg-background">
          <iframe
            key={`canvas-preview-${canvas.slug}-${version}-${retryCount}`}
            srcDoc={html}
            title={`Preview of ${canvas.name}`}
            className="h-full w-full border-0"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
            referrerPolicy="no-referrer"
          />
        </div>
      </div>
    </div>
  );
}

// ── Code editor ──────────────────────────────────────────────────────────

function CanvasEditor({
  conversationId,
  canvas,
  selectedFile,
  onSelectFile,
}: {
  conversationId: number;
  canvas: CanvasSummary;
  selectedFile: string | null;
  onSelectFile: (path: string | null) => void;
}) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [userEdits, setUserEdits] = useState<Record<string, string>>({});

  const editable = useMemo(
    () =>
      canvas.files
        .filter((f) => f.isFile && isEditableFile(f.name))
        .sort((a, b) => a.path.localeCompare(b.path)),
    [canvas.files],
  );

  const entry = editable.find((f) => f.path === selectedFile) ?? null;

  const { data, isLoading } = useQuery({
    queryKey: ["canvas-file", conversationId, canvas.slug, selectedFile],
    queryFn: async () => sessionFilesApi.content(conversationId, selectedFile!),
    enabled: !!selectedFile,
  });

  const loadedContent = data?.content ?? "";
  const value = (selectedFile && userEdits[selectedFile] !== undefined)
    ? userEdits[selectedFile]
    : loadedContent;
  const dirty = !!entry && entry.path === selectedFile && value !== loadedContent;

  const ext = extOf(entry?.name ?? "");
  const extensions = useMemo<Extension[]>(
    () => [languageForExt(ext), editorChrome(isDark), EditorView.lineWrapping].flat(),
    [ext, isDark],
  );

  const saveRef = useRef<() => void>(() => {});
  const dirtyRef = useRef(dirty);
  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat) return;
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== "s") return;
      if (dirtyRef.current) { e.preventDefault(); saveRef.current(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const handleOpen = useCallback((path: string) => {
    onSelectFile(path);
  }, [onSelectFile]);

  const handleSave = useCallback(async () => {
    if (!entry || !dirty) return;
    setSaving(true);
    try {
      await sessionFilesApi.write(conversationId, entry.path, value);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      setUserEdits((prev) => {
        const next = { ...prev };
        delete next[entry.path];
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ["canvases", conversationId] });
      toast.success(`Saved ${entry.name}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [conversationId, entry, dirty, value, queryClient]);
  useEffect(() => { saveRef.current = handleSave; }, [handleSave]);

  if (!selectedFile) {
    return (
      <div className="flex h-full">
        <FileTreeCanvas files={editable} selected={null} onSelect={handleOpen} />
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
          <FileCode2 className="h-7 w-7 text-muted-foreground/40" />
          <p className="px-6 text-xs">Select a file on the left to edit it. Changes save and refresh the preview.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      <FileTreeCanvas files={editable} selected={selectedFile} onSelect={handleOpen} />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-1.5 border-b border-border/60 px-2.5 py-1.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium leading-tight">{entry?.name}</p>
            <p className="truncate text-[10px] text-muted-foreground">{entry?.path}</p>
          </div>
          <button type="button" onClick={handleSave} disabled={saving || !dirty}
            className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all active:scale-[0.97]",
              dirty ? "bg-primary text-primary-foreground hover:bg-primary/90" : "border border-border bg-background text-muted-foreground")}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saved ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Save className="h-3.5 w-3.5" />}
            {saving ? "Saving" : saved ? "Saved" : "Save"}
          </button>
        </div>
        {isLoading ? (
          <div className="flex flex-1 items-center justify-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : isEditableFile(entry?.name ?? "") ? (
          <div className="min-h-0 flex-1 overflow-auto bg-muted/15">
            <CodeMirror theme={isDark ? "dark" : "light"} value={value} onChange={(v) => { if (selectedFile) setUserEdits((prev) => ({ ...prev, [selectedFile]: v })); }}
              extensions={extensions} height="100%" className="h-full"
              basicSetup={{ foldGutter: true, autocompletion: true, highlightActiveLine: true, highlightActiveLineGutter: false }} />
          </div>
        ) : (
          <div className="flex h-full flex-1 items-center justify-center space-x-3 p-5">
            <a href={sessionFilesApi.rawUrl(conversationId, selectedFile, true)}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.97]">
              <ExternalLink className="h-3.5 w-3.5" /> Download
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

// ── File tree ─────────────────────────────────────────────────────────────

function FileTreeCanvas({
  files, selected, onSelect,
}: {
  files: Array<{ path: string; name: string; size: number | null; isFile: boolean; isDirectory: boolean }>;
  selected: string | null;
  onSelect: (path: string) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const entries = useMemo(() => files.map((f) => ({ path: f.path, name: f.name, isDirectory: f.isDirectory, isFile: f.isFile, size: f.size ?? 0, mtime: "" })), [files]);
  const tree = useMemo(() => buildTree(entries), [entries]);
  const toggleDir = (path: string) => setCollapsed((prev) => { const next = new Set(prev); if (next.has(path)) next.delete(path); return next.add(path); });

  if (files.length === 0) {
    return (
      <div className="flex w-40 shrink-0 flex-col items-center justify-center gap-2 border-r border-border/60 bg-muted/15 text-center">
        <Files className="h-5 w-5 text-muted-foreground/40" />
        <p className="text-[10px] text-muted-foreground">No editable files</p>
      </div>
    );
  }

  return (
    <div className="w-44 shrink-0 overflow-y-auto border-r border-border/60 bg-muted/15 p-1.5 custom-scrollbar">
      {tree.map((node) => <TreeRow key={node.path} node={node} depth={0} collapsed={collapsed} onToggleDir={toggleDir} selected={selected === node.path} onSelect={onSelect} />)}
    </div>
  );
}

function TreeRow({ node, depth, collapsed, onToggleDir, selected, onSelect }: { node: TreeNode; depth: number; collapsed: Set<string>; onToggleDir: (path: string) => void; selected: boolean; onSelect: (path: string) => void }) {
  const isCollapsed = collapsed.has(node.path);
  return (
    <div>
      <button type="button" onClick={() => (node.isDirectory ? onToggleDir(node.path) : onSelect(node.path))}
        style={{ paddingLeft: `${8 + depth * 12}px` }}
        className={cn("flex w-full items-center gap-1.5 rounded-md py-1 pr-1.5 text-left text-[12px] transition-colors",
          selected ? "bg-primary/10 text-primary" : node.isDirectory ? "text-foreground/90 hover:bg-muted" : "text-foreground/80 hover:bg-muted")}>
        {node.isDirectory ? (
          <>{isCollapsed ? <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />}{isCollapsed ? <Folder className="h-3.5 w-3.5 shrink-0 text-amber-500/80" /> : <FolderOpen className="h-3.5 w-3.5 shrink-0 text-amber-500/80" />}</>
        ) : <span className="w-3 shrink-0" />}
        {!node.isDirectory && fileIconElement(node.name, false, "h-3.5 w-3.5 shrink-0 text-muted-foreground/70")}
        <span className="truncate">{node.name}</span>
        {!node.isDirectory && node.size > 0 && <span className="ml-auto shrink-0 pl-1 text-[9px] tabular-nums text-muted-foreground/50">{formatBytes(node.size)}</span>}
      </button>
      {node.isDirectory && !isCollapsed && <div>{node.children.map((child) => <TreeRow key={child.path} node={child} depth={depth + 1} collapsed={collapsed} onToggleDir={onToggleDir} selected={selected} onSelect={onSelect} />)}</div>}
    </div>
  );
}

// ── Resizable wrapper ─────────────────────────────────────────────────────

export function ResizableCanvasPanel({ conversationId, onClose, focusSlug }: { conversationId: number; onClose: () => void; focusSlug?: string | null }) {
  const [width, setWidth] = useState(() => {
    try { const stored = Number(window.localStorage.getItem(PANEL_WIDTH_KEY)); return Number.isFinite(stored) ? clampWidth(stored) : PANEL_DEFAULT_WIDTH; }
    catch { return PANEL_DEFAULT_WIDTH; }
  });
  const [isResizing, setIsResizing] = useState(false);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => { try { window.localStorage.setItem(PANEL_WIDTH_KEY, String(Math.round(width))); } catch {} }, [width]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); dragRef.current = { startX: e.clientX, startWidth: width }; setIsResizing(true); document.body.style.cursor = "col-resize"; document.body.style.userSelect = "none"; };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => { if (!dragRef.current) return; setWidth(clampWidth(dragRef.current.startWidth - (e.clientX - dragRef.current.startX))); };
  const onPointerUp = () => { if (!dragRef.current) return; dragRef.current = null; setIsResizing(false); document.body.style.cursor = ""; document.body.style.userSelect = ""; };

  return (
    <motion.div initial={{ width: 0, opacity: 0 }} animate={{ width, opacity: 1 }} exit={{ width: 0, opacity: 0 }}
      transition={isResizing ? { duration: 0 } : { duration: 0.22, ease: "easeOut" }}
      className="relative hidden h-full shrink-0 overflow-hidden md:block">
      <div role="separator" aria-orientation="vertical" aria-label="Resize canvas panel" title="Drag to resize" tabIndex={0}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
        className="group absolute inset-y-0 left-0 z-10 flex w-2 cursor-col-resize touch-none items-stretch justify-center select-none focus:outline-none">
        <div className={cn("my-1.5 w-0.5 rounded-full transition-colors duration-150", isResizing ? "bg-primary/60" : "bg-transparent group-hover:bg-border group-focus-visible:bg-border")} />
      </div>
      <CanvasPanel conversationId={conversationId} onClose={onClose} focusSlug={focusSlug} />
    </motion.div>
  );
}
