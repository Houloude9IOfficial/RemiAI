"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { markdown } from "@codemirror/lang-markdown";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { json } from "@codemirror/lang-json";
import { sql } from "@codemirror/lang-sql";
import { yaml } from "@codemirror/lang-yaml";
import { xml } from "@codemirror/lang-xml";
import { ArrowLeft, Download, Save, Pencil, FolderInput, Trash2, Loader2, WrapText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/ThemeProvider";
import { cn } from "@/lib/utils";
import { extOf } from "@/lib/session-files/ui-utils";
import type { SessionFileEntry } from "@/lib/session-files/storage";

// ── Line-ending helpers ──────────────────────────────────────────────────
// Normalize CRLF / lone CR so pasted text (from Windows/Mac rich sources)
// keeps its line formatting instead of collapsing into one run-on line.

function normalizeLineEndings(s: string): string {
  return s.replace(/\r\n?/g, "\n");
}

function detectLineEnding(s: string): "\r\n" | "\r" | "\n" {
  if (s.includes("\r\n")) return "\r\n";
  if (s.includes("\r")) return "\r";
  return "\n";
}

/** Re-apply the file's original line-ending style before saving. */
function applyLineEnding(s: string, le: "\r\n" | "\r" | "\n"): string {
  return le === "\n" ? s : s.replace(/\n/g, le);
}

// ── Language selection ───────────────────────────────────────────────────

function languageForExt(ext: string) {
  switch (ext) {
    case "js":
    case "mjs":
    case "cjs":
    case "jsx":
    case "ts":
    case "tsx":
      return javascript({ jsx: true, typescript: true });
    case "py":
      return python();
    case "md":
    case "markdown":
      return markdown();
    case "css":
    case "scss":
      return css();
    case "html":
    case "htm":
      return html();
    case "json":
    case "jsonl":
      return json();
    case "sql":
      return sql();
    case "yaml":
    case "yml":
      return yaml();
    case "xml":
    case "svg":
      return xml();
    default:
      return [];
  }
}

const LANGUAGE_LABELS: Record<string, string> = {
  js: "JavaScript",
  mjs: "JavaScript",
  cjs: "JavaScript",
  jsx: "JSX",
  ts: "TypeScript",
  tsx: "TSX",
  py: "Python",
  md: "Markdown",
  markdown: "Markdown",
  css: "CSS",
  scss: "SCSS",
  html: "HTML",
  htm: "HTML",
  json: "JSON",
  jsonl: "JSON",
  sql: "SQL",
  yaml: "YAML",
  yml: "YAML",
  xml: "XML",
  svg: "SVG",
};

// ── Theme-aware syntax colors ────────────────────────────────────────────
// All colors come from CSS variables defined in globals.css (light + dark
// variants), so the editor follows the app theme — and custom accent
// palettes — automatically, with no rebuild needed.

const syntaxColors = HighlightStyle.define([
  { tag: [t.keyword, t.moduleKeyword, t.controlKeyword, t.operatorKeyword, t.definitionKeyword], color: "var(--editor-keyword)" },
  { tag: [t.string, t.special(t.string), t.character], color: "var(--editor-string)" },
  { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: "var(--editor-comment)", fontStyle: "italic" },
  { tag: [t.number, t.bool, t.null], color: "var(--editor-number)" },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: "var(--editor-function)" },
  { tag: [t.className, t.typeName], color: "var(--editor-type)" },
  { tag: [t.tagName], color: "var(--editor-tag)" },
  { tag: [t.attributeName, t.propertyName], color: "var(--editor-attribute)" },
  { tag: [t.variableName, t.definition(t.variableName)], color: "var(--editor-variable)" },
  { tag: [t.bracket, t.punctuation, t.separator, t.operator], color: "var(--editor-punctuation)" },
  { tag: [t.meta, t.documentMeta, t.labelName], color: "var(--editor-meta)" },
]);

// ── Theme-aware editor chrome (uses the app's CSS variables) ─────────────
// The `dark` flag mirrors the resolved app theme so CodeMirror's base theme
// matches what's on screen instead of always assuming dark mode.

function editorChrome(dark: boolean) {
  return EditorView.theme(
    {
      "&": {
        backgroundColor: "transparent",
        height: "100%",
        fontSize: "13px",
        color: "var(--foreground)",
      },
      ".cm-scroller": {
        fontFamily: "var(--font-jetbrains-mono), ui-monospace, SFMono-Regular, Menlo, monospace",
        lineHeight: "1.65",
        scrollbarWidth: "thin",
        scrollbarColor: "color-mix(in oklch, var(--muted-foreground) 35%, transparent) transparent",
        "&::-webkit-scrollbar": { width: "10px", height: "10px" },
        "&::-webkit-scrollbar-track": { background: "transparent" },
        "&::-webkit-scrollbar-thumb": {
          background: "color-mix(in oklch, var(--muted-foreground) 30%, transparent)",
          borderRadius: "9999px",
          border: "2px solid transparent",
          backgroundClip: "content-box",
        },
        "&::-webkit-scrollbar-thumb:hover": {
          background: "color-mix(in oklch, var(--muted-foreground) 50%, transparent)",
          border: "2px solid transparent",
          backgroundClip: "content-box",
        },
      },
      ".cm-content": {
        caretColor: "var(--foreground)",
        padding: "10px 0",
      },
      "&.cm-focused": { outline: "none" },
      ".cm-gutters": {
        backgroundColor: "transparent",
        color: "color-mix(in oklch, var(--muted-foreground) 55%, transparent)",
        borderRight: "1px solid var(--border)",
        fontSize: "11px",
      },
      ".cm-activeLine": {
        backgroundColor: "color-mix(in oklch, var(--muted) 55%, transparent)",
      },
      ".cm-activeLineGutter": { backgroundColor: "transparent" },
      "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
        backgroundColor: "color-mix(in oklch, var(--primary) 22%, transparent)",
      },
      ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--foreground)" },
      ".cm-placeholder": { color: "var(--muted-foreground)" },
      ".cm-matchingBracket": {
        backgroundColor: "color-mix(in oklch, var(--primary) 20%, transparent)",
        outline: "1px solid color-mix(in oklch, var(--primary) 45%, transparent)",
      },
      ".cm-tooltip": {
        backgroundColor: "var(--popover)",
        color: "var(--popover-foreground)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        overflow: "hidden",
      },
      ".cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]": {
        backgroundColor: "var(--muted)",
        color: "var(--foreground)",
      },
    },
    { dark },
  );
}

// ── Component ─────────────────────────────────────────────────────────────

export function FileEditor({
  entry,
  initialContent,
  saving,
  deleteConfirm,
  onSave,
  onBack,
  onDownload,
  onRename,
  onMove,
  onDelete,
  onCancelDelete,
}: {
  entry: SessionFileEntry;
  initialContent: string;
  saving: boolean;
  deleteConfirm: boolean;
  onSave: (value: string) => void | Promise<void>;
  onBack: () => void;
  onDownload: () => void;
  onRename: () => void;
  onMove: () => void;
  onDelete: () => void;
  onCancelDelete: () => void;
}) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const ext = extOf(entry.name);
  const languageLabel = LANGUAGE_LABELS[ext] ?? (ext ? ext.toUpperCase() : "Plain text");

  // Load content with normalized line endings for correct display; remember
  // the original style so saving preserves it instead of silently rewriting
  // the whole file to LF.
  const normalizedInitial = useMemo(() => normalizeLineEndings(initialContent), [initialContent]);
  const lineEnding = useMemo(() => detectLineEnding(initialContent), [initialContent]);

  const [value, setValue] = useState(normalizedInitial);
  const [wrap, setWrap] = useState(true);
  const [cursor, setCursor] = useState({ line: 1, col: 1 });
  const dirty = value !== normalizedInitial;

  // If the file content changes underneath us (saved via this editor, edited
  // by the AI, refreshed from disk), follow it — but never clobber edits the
  // user has typed since the last known content.
  const lastInitial = useRef(normalizedInitial);
  useEffect(() => {
    if (lastInitial.current === normalizedInitial) return;
    const prev = lastInitial.current;
    lastInitial.current = normalizedInitial;
    setValue((current) => (current === prev ? normalizedInitial : current));
  }, [normalizedInitial]);

  // Latest-value refs so the ⌘/Ctrl+S handler always saves the freshest state.
  const dirtyRef = useRef(dirty);
  const saveRef = useRef<() => void>(() => {});
  useEffect(() => {
    dirtyRef.current = dirty;
    saveRef.current = () => onSave(applyLineEnding(value, lineEnding));
  });

  // Global ⌘/Ctrl+S while the editor is mounted — saves the file and swallows
  // the browser's useless "save page" default. The `defaultPrevented` guard
  // dedupes the two FileEditor instances FileManagerView mounts (desktop pane
  // + CSS-hidden mobile pane); `e.repeat` ignores held keys.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat) return;
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== "s") return;
      e.preventDefault();
      if (dirtyRef.current) saveRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const extensions = useMemo<Extension[]>(
    () => [
      languageForExt(ext),
      syntaxHighlighting(syntaxColors),
      editorChrome(isDark),
      wrap ? EditorView.lineWrapping : [],
      // Normalize clipboard line endings so pasted multi-line text keeps its
      // formatting instead of showing stray \r characters or one run-on line.
      EditorView.clipboardInputFilter.of((text) => normalizeLineEndings(text)),
      // Track the cursor position for the status bar.
      EditorView.updateListener.of((update) => {
        if (!update.selectionSet && !update.docChanged) return;
        const head = update.state.selection.main.head;
        const line = update.state.doc.lineAt(head);
        setCursor({ line: line.number, col: head - line.from + 1 });
      }),
    ],
    [ext, isDark, wrap],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <div className="flex items-center gap-1 border-b border-border/60 px-2.5 py-2">
        <Button variant="ghost" size="icon-sm" onClick={onBack} aria-label="Close editor" title="Back">
          <ArrowLeft />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 truncate text-xs font-medium leading-tight">
            <span className="truncate">{entry.name}</span>
            {dirty && (
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" title="Unsaved changes" />
            )}
          </p>
          <p className="truncate text-[10px] text-muted-foreground">{entry.path}</p>
        </div>
        <Button
          variant={dirty ? "default" : "ghost"}
          size="sm"
          onClick={() => saveRef.current()}
          disabled={!dirty || saving}
          className="shrink-0"
          title={dirty ? "Save changes (⌘S / Ctrl+S)" : "No changes to save"}
        >
          {saving ? <Loader2 className="animate-spin" /> : <Save />}
          Save
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={onDownload} aria-label="Download file" title="Download">
          <Download />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={onRename} aria-label="Rename file" title="Rename">
          <Pencil />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={onMove} aria-label="Move file" title="Move to folder">
          <FolderInput />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onDelete}
          onMouseLeave={deleteConfirm ? onCancelDelete : undefined}
          aria-label={deleteConfirm ? "Confirm delete" : "Delete file"}
          title={deleteConfirm ? "Click again to confirm" : "Delete"}
          className={cn(deleteConfirm && "bg-destructive text-white hover:bg-destructive/90")}
        >
          {deleteConfirm ? "OK" : <Trash2 />}
        </Button>
      </div>

      {/* Editor */}
      <div className="min-h-0 flex-1 overflow-hidden bg-muted/[0.15]">
        <CodeMirror
          theme={isDark ? "dark" : "light"}
          value={value}
          onChange={setValue}
          extensions={extensions}
          height="100%"
          className="h-full"
          basicSetup={{
            foldGutter: true,
            autocompletion: true,
            highlightActiveLine: true,
            highlightActiveLineGutter: false,
          }}
        />
      </div>

      {/* Status bar */}
      <div className="flex select-none items-center gap-2 border-t border-border/60 bg-muted/[0.2] px-3 py-1 text-[10px] text-muted-foreground">
        <span className="tabular-nums">
          Ln {cursor.line}, Col {cursor.col}
        </span>
        <span className="opacity-40">·</span>
        <span className="max-w-[30%] truncate">{languageLabel}</span>
        <span className="opacity-40">·</span>
        <span className="tabular-nums">{ext ? `.${ext}` : "text"}</span>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {dirty && (
            <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 font-medium text-amber-600 dark:text-amber-400">
              Unsaved
            </span>
          )}
          <button
            type="button"
            onClick={() => setWrap((w) => !w)}
            aria-pressed={wrap}
            aria-label={wrap ? "Disable word wrap" : "Enable word wrap"}
            title={wrap ? "Word wrap: on" : "Word wrap: off"}
            className={cn(
              "flex items-center gap-1 rounded-md px-1.5 py-0.5 transition-colors",
              wrap
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground/70 hover:bg-muted hover:text-foreground",
            )}
          >
            <WrapText className="h-3 w-3" />
            Wrap
          </button>
        </div>
      </div>
    </div>
  );
}
