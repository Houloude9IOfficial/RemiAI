"use client";

import { useMemo, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
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
import { ArrowLeft, Download, Save, Pencil, FolderInput, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/ThemeProvider";
import { cn } from "@/lib/utils";
import { extOf } from "@/lib/session-files/ui-utils";
import type { SessionFileEntry } from "@/lib/session-files/storage";

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

// ── Theme-aware editor chrome (uses the app's CSS variables) ─────────────

const editorChrome = EditorView.theme(
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
    },
    ".cm-content": {
      caretColor: "var(--foreground)",
      padding: "12px 0",
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
  { dark: true },
);

const lightHighlight = HighlightStyle.define([
  { tag: [t.keyword, t.moduleKeyword, t.controlKeyword, t.operatorKeyword, t.definitionKeyword], color: "#7c3aed" },
  { tag: [t.string, t.special(t.string), t.character], color: "#1d4ed8" },
  { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: "#6b7280" },
  { tag: [t.number, t.bool, t.null], color: "#2563eb" },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: "#7c3aed" },
  { tag: [t.className, t.typeName], color: "#b45309" },
  { tag: [t.tagName], color: "#dc2626" },
  { tag: [t.attributeName, t.propertyName], color: "#1d4ed8" },
  { tag: [t.variableName, t.definition(t.variableName)], color: "#c2410c" },
  { tag: [t.bracket, t.punctuation, t.separator, t.operator], color: "#374151" },
  { tag: [t.meta, t.documentMeta, t.labelName], color: "#6b7280" },
]);

const darkHighlight = HighlightStyle.define([
  { tag: [t.keyword, t.moduleKeyword, t.controlKeyword, t.operatorKeyword, t.definitionKeyword], color: "#c084fc" },
  { tag: [t.string, t.special(t.string), t.character], color: "#7dd3fc" },
  { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: "#94a3b8" },
  { tag: [t.number, t.bool, t.null], color: "#93c5fd" },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: "#c084fc" },
  { tag: [t.className, t.typeName], color: "#fcd34d" },
  { tag: [t.tagName], color: "#fca5a5" },
  { tag: [t.attributeName, t.propertyName], color: "#93c5fd" },
  { tag: [t.variableName, t.definition(t.variableName)], color: "#fdba74" },
  { tag: [t.bracket, t.punctuation, t.separator, t.operator], color: "#cbd5e1" },
  { tag: [t.meta, t.documentMeta, t.labelName], color: "#94a3b8" },
]);

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
  const [value, setValue] = useState(initialContent);
  const dirty = value !== initialContent;

  const extensions = useMemo(
    () => [
      languageForExt(ext),
      syntaxHighlighting(isDark ? darkHighlight : lightHighlight),
      editorChrome,
    ],
    [ext, isDark],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <div className="flex items-center gap-1.5 border-b border-border/60 px-2.5 py-2">
        <Button variant="ghost" size="icon-sm" onClick={onBack} aria-label="Close editor">
          <ArrowLeft />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 truncate text-xs font-medium leading-tight">
            <span className="truncate">{entry.name}</span>
            {dirty && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" title="Unsaved changes" />}
          </p>
          <p className="truncate text-[10px] text-muted-foreground">{entry.path}</p>
        </div>
        <Button
          variant={dirty ? "default" : "ghost"}
          size="sm"
          onClick={() => onSave(value)}
          disabled={!dirty || saving}
          className="shrink-0"
        >
          {saving ? <Loader2 className="animate-spin" /> : <Save />}
          Save
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={onDownload} aria-label="Download file">
          <Download />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={onRename} aria-label="Rename file">
          <Pencil />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={onMove} aria-label="Move file">
          <FolderInput />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onDelete}
          onMouseLeave={deleteConfirm ? onCancelDelete : undefined}
          aria-label={deleteConfirm ? "Confirm delete" : "Delete file"}
          className={cn(deleteConfirm && "bg-destructive text-white hover:bg-destructive/90")}
        >
          {deleteConfirm ? "OK" : <Trash2 />}
        </Button>
      </div>

      {/* Editor */}
      <div className="min-h-0 flex-1 overflow-hidden bg-muted/[0.15]">
        <CodeMirror
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
    </div>
  );
}
