"use client";

import { useState } from "react";
import type { UIMessage } from "ai";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, FileText, Code, File, FileDown } from "lucide-react";
import { cn } from "@/lib/utils";

type ExportFormat = "markdown" | "txt" | "json" | "pdf";

interface FormatOption {
  id: ExportFormat;
  label: string;
  description: string;
  icon: typeof FileText;
  extension: string;
  mimeType: string;
}

const FORMATS: FormatOption[] = [
  {
    id: "markdown",
    label: "Markdown",
    description: "Rich text with formatting, code blocks, and headers",
    icon: FileText,
    extension: ".md",
    mimeType: "text/plain",
  },
  {
    id: "txt",
    label: "Plain Text",
    description: "Simple plain text without formatting",
    icon: FileText,
    extension: ".txt",
    mimeType: "text/plain",
  },
  {
    id: "json",
    label: "JSON",
    description: "Raw conversation data in JSON format",
    icon: Code,
    extension: ".json",
    mimeType: "application/json",
  },
  {
    id: "pdf",
    label: "PDF Document",
    description: "Formatted PDF document with styled messages",
    icon: File,
    extension: ".pdf",
    mimeType: "application/pdf",
  },
];

function formatConversation(
  messages: UIMessage[],
  format: ExportFormat,
  title: string,
): string {
  switch (format) {
    case "markdown":
      return formatAsMarkdown(messages, title);
    case "txt":
      return formatAsPlainText(messages, title);
    case "json":
      return formatAsJson(messages, title);
    case "pdf":
      return ""; // PDF is handled separately in handleExport
  }
}

/* ── Format helpers ──────────────────────────────────────────── */

function getToolName(part: Record<string, unknown>): string {
  const inv = part.toolInvocation as Record<string, unknown> | undefined;
  return (inv?.toolName as string) ?? "tool";
}

function getToolState(part: Record<string, unknown>): string {
  const inv = part.toolInvocation as Record<string, unknown> | undefined;
  return (inv?.state as string) ?? "call";
}

function getToolResult(part: Record<string, unknown>): unknown {
  const inv = part.toolInvocation as Record<string, unknown> | undefined;
  return inv?.result;
}

function formatAsMarkdown(messages: UIMessage[], title: string): string {
  const lines: string[] = [];
  lines.push(`# ${title}`);
  lines.push("");
  lines.push(`> Exported on ${new Date().toLocaleString()}`);
  lines.push("");
  lines.push("---");
  lines.push("");

  for (const msg of messages) {
    const roleLabel =
      msg.role === "user"
        ? "**You**"
        : msg.role === "assistant"
          ? "**Remi**"
          : "**System**";

    lines.push(`### ${roleLabel}`);
    lines.push("");

    for (const part of msg.parts) {
      if (part.type === "text") {
        lines.push(part.text);
        lines.push("");
      } else if (part.type === "tool-invocation") {
        const toolName = getToolName(part as unknown as Record<string, unknown>);
        const state = getToolState(part as unknown as Record<string, unknown>);
        if (state === "result" || state === "output-available") {
          lines.push(`> _Used tool: \`${toolName}\`_`);
          lines.push("");
          const result = getToolResult(part as unknown as Record<string, unknown>);
          const resultStr =
            typeof result === "object"
              ? JSON.stringify(result, null, 2)
              : String(result ?? "");
          if (resultStr) {
            lines.push("```json");
            lines.push(resultStr);
            lines.push("```");
            lines.push("");
          }
        } else {
          lines.push(`> _Running tool: \`${toolName}\`…_`);
          lines.push("");
        }
      }
    }
  }
  return lines.join("\n");
}

function formatAsPlainText(messages: UIMessage[], title: string): string {
  const lines: string[] = [];
  lines.push(title);
  lines.push("=".repeat(Math.min(title.length, 80)));
  lines.push(`Exported on ${new Date().toLocaleString()}`);
  lines.push("");
  lines.push("─".repeat(50));
  lines.push("");

  for (const msg of messages) {
    const roleLabel =
      msg.role === "user"
        ? "You"
        : msg.role === "assistant"
          ? "Remi"
          : "System";

    lines.push(`[${roleLabel}]`);
    lines.push("");

    for (const part of msg.parts) {
      if (part.type === "text") {
        lines.push(part.text);
        lines.push("");
      } else if (part.type === "tool-invocation") {
        const toolName = getToolName(part as unknown as Record<string, unknown>);
        const state = getToolState(part as unknown as Record<string, unknown>);
        if (state === "result" || state === "output-available") {
          lines.push(`[Used tool: ${toolName}]`);
          lines.push("");
        } else {
          lines.push(`[Running tool: ${toolName}...]`);
          lines.push("");
        }
      }
    }
  }
  return lines.join("\n");
}

function formatAsJson(messages: UIMessage[], title: string): string {
  const exportData = {
    title,
    exportedAt: new Date().toISOString(),
    messages: messages.map((msg) => ({
      role: msg.role,
      parts: msg.parts,
    })),
  };
  return JSON.stringify(exportData, null, 2);
}

async function formatAsPdf(messages: UIMessage[], title: string): Promise<Blob> {
  const { default: jsPDF } = await import("jspdf");

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;
  const pageBottom = 277; // A4 height (297) - bottom margin (20)
  let y = margin;

  // Colors
  const mutedColor: [number, number, number] = [100, 116, 139];
  const textColor: [number, number, number] = [30, 41, 59];
  const headingColor: [number, number, number] = [15, 23, 42];

  // ── Helpers ─────────────────────────────────────────────────

  function withOpacity(opacity: number, fn: () => void) {
    doc.saveGraphicsState();
    doc.setGState(new (doc as any).GState({ opacity }));
    fn();
    doc.restoreGraphicsState();
  }

  /** Ensure at least `needed` mm of space remains on the current page. */
  function ensureSpace(needed: number) {
    if (y + needed >= pageBottom) {
      doc.addPage();
      y = margin;
    }
  }

  /**
   * Render wrapped text at the current y position.
   * Uses jsPDF's internal line height so spacing matches exactly
   * what jsPDF uses, preventing content overflow past page boundaries.
   */
  function renderText(
    text: string,
    size: number,
    color: [number, number, number],
    font: "helvetica" | "courier" = "helvetica",
    style: "normal" | "bold" | "italic" = "normal",
    indent = 0,
  ): number {
    doc.setFont(font, style);
    doc.setFontSize(size);
    doc.setTextColor(...color);

    const maxWidth = contentWidth - indent;
    const lines = doc.splitTextToSize(text, maxWidth);
    if (lines.length === 0) return 0;

    // Get jsPDF's actual line height for the current font/size
    // `getTextDimensions("A").h` gives the height of one line
    const lineHeight = doc.getTextDimensions("A").h;
    // Add a tiny inter-paragraph gap
    const gap = 1;
    const totalHeight = lines.length * lineHeight + gap;

    ensureSpace(totalHeight);

    // Render each line individually so y-tracking perfectly matches
    for (let i = 0; i < lines.length; i++) {
      doc.text(lines[i], margin + indent, y + i * lineHeight);
    }
    y += totalHeight;
    return totalHeight;
  }

  /** Render a horizontal divider line. */
  function renderDivider() {
    ensureSpace(6);
    doc.setDrawColor(200, 200, 210);
    doc.setLineWidth(0.3);
    doc.line(margin, y, pageWidth - margin, y);
    y += 5;
  }

  /** Render a role label with colored background chip. */
  function renderRoleLabel(label: string, color: [number, number, number]) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...color);
    const lineHeight = doc.getTextDimensions("A").h;
    const chipHeight = Math.max(lineHeight + 4, 7);
    ensureSpace(chipHeight + 3);

    withOpacity(0.08, () => {
      doc.setFillColor(...color);
      doc.roundedRect(margin, y - 1.5, contentWidth, chipHeight, 1.5, 1.5, "F");
    });
    doc.text(label, margin, y + lineHeight);
    y += chipHeight + 2;
  }

  /**
   * Render a code block with a subtle background.
   */
  function renderCodeBlock(code: string) {
    const truncated =
      code.length > 2000
        ? code.slice(0, 2000) + "\n… [truncated]"
        : code;

    doc.setFont("courier", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...mutedColor);

    const codeLines = doc.splitTextToSize(truncated, contentWidth - 6);
    if (codeLines.length === 0) return;
    const lineHeight = doc.getTextDimensions("A").h;
    const codeHeight = codeLines.length * lineHeight + 4;

    ensureSpace(codeHeight + 2);

    withOpacity(0.4, () => {
      doc.setFillColor(241, 245, 249);
      doc.roundedRect(margin + 3, y, contentWidth - 6, codeHeight, 1.5, 1.5, "F");
    });
    // Render each code line individually for precise y-tracking
    for (let i = 0; i < codeLines.length; i++) {
      doc.text(codeLines[i], margin + 5, y + 3 + i * lineHeight);
    }
    y += codeHeight + 3;
  }

  /** Render a blockquote line (indented, italic, dimmer). */
  function renderBlockquote(text: string) {
    renderText(text, 9, mutedColor, "helvetica", "italic", 5);
  }

  // ── Markdown-aware line renderer ──────────────────────────────

  /**
   * Render a single line of text, detecting markdown syntax:
   *   - `# heading` → h1 (18pt bold)
   *   - `## heading` → h2 (14pt bold)
   *   - `### heading` → h3 (12pt bold)
   *   - `> quote` → blockquote
   *   - Inline `**bold**` and backtick code
   *   - Code fences (```) are handled by the caller
   */
  function renderMarkdownLine(line: string) {
    const trimmed = line.trim();

    // Headings
    if (/^### /.test(trimmed)) {
      ensureSpace(6);
      withOpacity(0.06, () => {
        doc.setFillColor(100, 116, 139);
        doc.roundedRect(margin, y - 1, contentWidth, 6, 1, 1, "F");
      });
      renderText(trimmed.replace(/^### /, ""), 12, headingColor, "helvetica", "bold");
      return;
    }
    if (/^## /.test(trimmed)) {
      ensureSpace(8);
      doc.setDrawColor(200, 200, 210);
      doc.setLineWidth(0.5);
      doc.line(margin, y, margin + 30, y);
      y += 3;
      renderText(trimmed.replace(/^## /, ""), 14, headingColor, "helvetica", "bold");
      return;
    }
    if (/^# /.test(trimmed)) {
      ensureSpace(10);
      doc.setDrawColor(59, 130, 246);
      doc.setLineWidth(0.8);
      doc.line(margin, y, margin + 40, y);
      y += 4;
      renderText(trimmed.replace(/^# /, ""), 18, headingColor, "helvetica", "bold");
      return;
    }

    // Blockquote
    if (/^> /.test(trimmed)) {
      // Render left bar
      ensureSpace(5);
      const quoteText = trimmed.replace(/^> /, "");
      const needed = estimateTextHeight(quoteText, 9, contentWidth - 8);
      ensureSpace(needed + 2);
      doc.setDrawColor(200, 200, 210);
      doc.setLineWidth(1.5);
      doc.line(margin + 2, y - 1, margin + 2, y + needed + 1);
      renderBlockquote(quoteText);
      return;
    }

    // Regular text — render via word-wrapped renderText
    renderText(line, 10, textColor);
  }

  /** Estimate how many mm a block of text will occupy at a given size. */
  function estimateTextHeight(text: string, size: number, maxWidth: number): number {
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(text, maxWidth);
    if (lines.length === 0) return 0;
    const lineHeight = doc.getTextDimensions("A").h;
    return lines.length * lineHeight + 1;
  }

  // ── Render content ────────────────────────────────────────────

  // Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(...headingColor);
  const titleLines = doc.splitTextToSize(title, contentWidth);
  doc.text(titleLines, margin, y);
  y += titleLines.length * 8 + 3;

  // Date line
  renderText(`Exported on ${new Date().toLocaleString()}`, 9, mutedColor);
  y += 1;
  renderDivider();

  // Messages
  let inCodeBlock = false;
  let codeBuffer: string[] = [];

  function flushCodeBlock() {
    if (codeBuffer.length > 0) {
      renderCodeBlock(codeBuffer.join("\n"));
      codeBuffer = [];
    }
  }

  for (const msg of messages) {
    ensureSpace(20);

    const roleLabel =
      msg.role === "user"
        ? "You"
        : msg.role === "assistant"
          ? "Remi"
          : "System";

    const roleColor: [number, number, number] =
      msg.role === "user"
        ? [59, 130, 246]
        : msg.role === "assistant"
          ? [16, 185, 129]
          : [100, 116, 139];

    renderRoleLabel(roleLabel, roleColor);

    // Message content
    for (const part of msg.parts) {
      if (part.type === "text") {
        const rawText = part.text;

        // Process line by line for markdown and code blocks
        const lines = rawText.split("\n");
        for (const line of lines) {
          const trimmed = line.trim();

          // Toggle code blocks
          if (trimmed.startsWith("```")) {
            if (inCodeBlock) {
              flushCodeBlock();
              inCodeBlock = false;
            } else {
              flushCodeBlock();
              inCodeBlock = true;
            }
            continue;
          }

          if (inCodeBlock) {
            codeBuffer.push(line);
          } else if (trimmed === "") {
            // Empty line — small gap
            ensureSpace(3);
            y += 2;
          } else {
            renderMarkdownLine(line);
          }
        }

        // Flush any open code block
        flushCodeBlock();
      } else if (part.type === "tool-invocation") {
        const toolName = getToolName(part as unknown as Record<string, unknown>);
        const state = getToolState(part as unknown as Record<string, unknown>);
        if (state === "result" || state === "output-available") {
          // Render tool usage as a small label + code block
          const result = getToolResult(part as unknown as Record<string, unknown>);
          const resultStr =
            typeof result === "object"
              ? JSON.stringify(result, null, 2)
              : String(result ?? "");
          if (resultStr) {
            ensureSpace(4);
            doc.setFont("helvetica", "bold");
            doc.setFontSize(7);
            doc.setTextColor(...mutedColor);
            doc.text(`⚙ ${toolName}`, margin, y);
            y += 3;
            renderCodeBlock(resultStr);
          }
        } else {
          renderText(`⚙ ${toolName}…`, 8, mutedColor, "helvetica", "italic");
        }
      }
    }

    y += 2;
    renderDivider();
  }

  return doc.output("blob");
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  downloadBlob(blob, filename);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function ExportDialog({
  messages,
  title,
}: {
  messages: UIMessage[];
  title: string;
}) {
  const [open, setOpen] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat | null>(null);
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    if (!selectedFormat) return;
    setExporting(true);

    const format = FORMATS.find((f) => f.id === selectedFormat)!;
    const safeTitle = title.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 100);
    const filename = `${safeTitle}${format.extension}`;

    if (selectedFormat === "pdf") {
      const blob = await formatAsPdf(messages, title);
      downloadBlob(blob, filename);
    } else {
      const content = formatConversation(messages, selectedFormat, title);
      downloadFile(content, filename, format.mimeType);
    }

    setExporting(false);
    setOpen(false);
    setSelectedFormat(null);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        aria-label="Export conversation"
        className="inline-flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
      >
        <FileDown className="h-4 w-4" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Export conversation</DialogTitle>
          <DialogDescription>
            Choose a format to export this conversation as a file.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 py-2">
          {FORMATS.map((format) => {
            const Icon = format.icon;
            const isSelected = selectedFormat === format.id;
            return (
              <button
                key={format.id}
                type="button"
                onClick={() => setSelectedFormat(format.id)}
                className={cn(
                  "flex items-start gap-3 rounded-lg border p-3 text-left transition-all duration-150",
                  isSelected
                    ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                    : "border-border/60 hover:border-border hover:bg-muted/50",
                )}
              >
                <div
                  className={cn(
                    "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border",
                    isSelected
                      ? "border-primary/30 bg-primary/10 text-primary"
                      : "border-border/60 text-muted-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex flex-col">
                  <span
                    className={cn(
                      "text-sm font-medium",
                      isSelected && "text-primary",
                    )}
                  >
                    {format.label}
                    <span className="ml-1.5 text-xs text-muted-foreground font-normal">
                      {format.extension}
                    </span>
                  </span>
                  <span className="text-xs text-muted-foreground/80 mt-0.5">
                    {format.description}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setOpen(false);
              setSelectedFormat(null);
            }}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!selectedFormat}
            onClick={handleExport}
            className="gap-1.5"
          >
            {exporting ? (
              <>
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Exporting…
              </>
            ) : (
              <>
                <Download className="h-3.5 w-3.5" />
                Export
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
