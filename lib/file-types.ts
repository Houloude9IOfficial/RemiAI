import {
  FileIcon,
  ImageIcon,
  FileText,
  FileCode,
  FileArchive,
  FileSpreadsheet,
  Video,
  type LucideIcon,
} from "lucide-react";

/** File type display info — icon, color, and background color */
export interface FileTypeInfo {
  icon: LucideIcon;
  color: string;
  bg: string;
}

/**
 * Map a MIME type to an icon, text color, and badge background.
 */
export function getFileTypeInfo(mimeType: string): FileTypeInfo {
  if (mimeType.startsWith("image/"))
    return { icon: ImageIcon, color: "text-blue-500", bg: "bg-blue-500/10" };
  if (mimeType.startsWith("video/"))
    return { icon: Video, color: "text-purple-500", bg: "bg-purple-500/10" };
  if (mimeType.includes("pdf"))
    return { icon: FileText, color: "text-red-500", bg: "bg-red-500/10" };
  if (
    mimeType.includes("spreadsheet") ||
    mimeType.includes("excel") ||
    mimeType.includes("csv")
  )
    return { icon: FileSpreadsheet, color: "text-emerald-500", bg: "bg-emerald-500/10" };
  if (mimeType.includes("zip") || mimeType.includes("tar") || mimeType.includes("gzip"))
    return { icon: FileArchive, color: "text-amber-500", bg: "bg-amber-500/10" };
  if (
    mimeType.includes("javascript") ||
    mimeType.includes("typescript") ||
    mimeType.includes("python") ||
    mimeType.includes("html") ||
    mimeType.includes("css") ||
    mimeType.includes("json") ||
    mimeType.includes("xml")
  )
    return { icon: FileCode, color: "text-green-500", bg: "bg-green-500/10" };
  if (
    mimeType.includes("text") ||
    mimeType.includes("document") ||
    mimeType.includes("msword") ||
    mimeType.includes("markdown")
  )
    return { icon: FileText, color: "text-sky-500", bg: "bg-sky-500/10" };
  return { icon: FileIcon, color: "text-muted-foreground", bg: "bg-muted/50" };
}

/**
 * Format a byte size into a human-readable string.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Look up a MIME type from a file extension.
 */
const EXT_TO_MIME: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
  csv: "text/csv",
  json: "application/json",
  js: "text/javascript",
  ts: "text/typescript",
  py: "text/x-python",
  html: "text/html",
  css: "text/css",
  md: "text/markdown",
  xml: "application/xml",
  zip: "application/zip",
  tar: "application/x-tar",
  gz: "application/gzip",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  bmp: "image/bmp",
  svg: "image/svg+xml",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  m4v: "video/x-m4v",
  avi: "video/x-msvideo",
  mkv: "video/x-matroska",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  m4a: "audio/mp4",
  flac: "audio/flac",
  aac: "audio/aac",
};

export function mimeTypeFromExtension(filename: string): string {
  const ext = filename.match(/\.(\w+)$/)?.[1]?.toLowerCase();
  return ext ? EXT_TO_MIME[ext] ?? "application/octet-stream" : "application/octet-stream";
}
