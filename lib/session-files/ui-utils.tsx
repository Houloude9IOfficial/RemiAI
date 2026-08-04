import { Folder, FileImage, FileJson, FileCode2, FileArchive, FileText } from "lucide-react";
import hljs from "highlight.js";
import type { SessionFileEntry } from "./storage";

// ── File type classification ─────────────────────────────────────────────

export const TEXT_EXTENSIONS = new Set([
  "txt", "md", "markdown", "py", "js", "mjs", "cjs", "jsx", "ts", "tsx",
  "html", "htm", "css", "scss", "json", "jsonl", "xml", "yaml", "yml",
  "csv", "svg", "log", "toml", "ini", "env", "sh", "sql",
]);

export const IMAGE_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "avif", "ico", "bmp",
]);

export function extOf(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx >= 0 ? name.slice(idx + 1).toLowerCase() : "";
}

export function isTextFile(name: string): boolean {
  return TEXT_EXTENSIONS.has(extOf(name));
}

export function isImageFile(name: string): boolean {
  return IMAGE_EXTENSIONS.has(extOf(name));
}

/** Render the right icon for a file (returns elements, not component refs). */
export function fileIconElement(name: string, isDir: boolean, className: string) {
  if (isDir) return <Folder className={className} />;
  const ext = extOf(name);
  if (IMAGE_EXTENSIONS.has(ext)) return <FileImage className={className} />;
  if (ext === "json" || ext === "jsonl") return <FileJson className={className} />;
  if (["zip", "gz", "tar", "rar", "7z"].includes(ext)) return <FileArchive className={className} />;
  if (TEXT_EXTENSIONS.has(ext)) return <FileCode2 className={className} />;
  return <FileText className={className} />;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ── Syntax highlighting (read-only preview) ──────────────────────────────

export function hljsLanguage(ext: string): string | undefined {
  const map: Record<string, string> = {
    py: "python",
    js: "javascript",
    mjs: "javascript",
    cjs: "javascript",
    jsx: "javascript",
    ts: "typescript",
    tsx: "typescript",
    html: "xml",
    htm: "xml",
    css: "css",
    scss: "scss",
    json: "json",
    jsonl: "json",
    xml: "xml",
    yaml: "yaml",
    yml: "yaml",
    sh: "bash",
    sql: "sql",
    md: "markdown",
    markdown: "markdown",
    ini: "ini",
    toml: "ini",
    log: "plaintext",
    txt: "plaintext",
    csv: "plaintext",
    svg: "xml",
  };
  return map[ext];
}

export function highlightCode(content: string, ext: string): string {
  const lang = hljsLanguage(ext);
  try {
    if (lang && hljs.getLanguage(lang)) {
      return hljs.highlight(content, { language: lang, ignoreIllegals: true }).value;
    }
    return hljs.highlightAuto(content).value;
  } catch {
    return content.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
}

// ── Tree building ─────────────────────────────────────────────────────────

export type TreeNode = {
  name: string;
  path: string;
  isDirectory: boolean;
  isFile: boolean;
  size: number;
  mtime: string;
  children: TreeNode[];
};

export function buildTree(entries: SessionFileEntry[]): TreeNode[] {
  const root: TreeNode[] = [];
  const lookup = new Map<string, TreeNode>();
  for (const e of entries) {
    const node: TreeNode = {
      name: e.name,
      path: e.path,
      isDirectory: e.isDirectory,
      isFile: e.isFile,
      size: e.size,
      mtime: e.mtime,
      children: [],
    };
    lookup.set(e.path, node);
  }
  // Deterministic ordering: dirs first, then alpha
  const sortNodes = (nodes: TreeNode[]) =>
    nodes.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

  for (const e of entries) {
    const node = lookup.get(e.path)!;
    const slash = e.path.lastIndexOf("/");
    if (slash === -1) {
      root.push(node);
    } else {
      const parentPath = e.path.slice(0, slash);
      const parent = lookup.get(parentPath);
      if (parent) parent.children.push(node);
      else root.push(node);
    }
  }
  sortNodes(root);
  for (const node of lookup.values()) sortNodes(node.children);
  return root;
}

/** All folder paths in a tree (used by the move-to-folder picker). */
export function collectFolders(nodes: TreeNode[], acc: string[] = []): string[] {
  for (const node of nodes) {
    if (node.isDirectory) {
      acc.push(node.path);
      collectFolders(node.children, acc);
    }
  }
  return acc;
}
