"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  Eye,
  Loader2,
  Palette,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────

interface VisualData {
  type: "visual";
  visualType: "svg" | "html";
  title: string;
  content: string;
  width: string;
  height: string;
  caption: string | null;
  note?: string;
}

// ─── Sanitisation helpers ─────────────────────────────────────────────

/**
 * Strip potentially harmful script content from SVG.
 * SVG <script> tags are stripped — the AI should not need them.
 * We also strip event handlers (onclick, onload, etc.) for safety.
 * This makes the sandboxed iframe defence-in-depth rather than the only
 * layer of protection.
 */
function sanitizeSvg(svg: string): string {
  // Remove <script>...</script> blocks
  let clean = svg.replace(/<script[\s\S]*?<\/script>/gi, "");
  // Remove event handler attributes (onclick, onload, onerror, etc.)
  clean = clean.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, "");
  // Remove javascript: URLs in SVG attributes
  clean = clean.replace(/javascript:\s*/gi, "");
  return clean;
}

// ─── SVG Inline Renderer ──────────────────────────────────────────────
// SVG is safe to render inline (no executable content after sanitization).
// This is more performant and accessible than an iframe.

function SvgRenderer({ content, className }: { content: string; className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!containerRef.current) return;

    // Parse and inject the SVG safely
    const container = containerRef.current;
    container.innerHTML = ""; // clear

    try {
      const sanitized = sanitizeSvg(content);
      // Use DOMParser to safely parse the SVG string into a document fragment
      const parser = new DOMParser();
      const doc = parser.parseFromString(sanitized, "image/svg+xml");

      // Check for parse errors
      const parseError = doc.querySelector("parsererror");
      if (parseError) {
        setError(true);
        setLoading(false);
        return;
      }

      // Extract the <svg> element
      const svgEl = doc.querySelector("svg");
      if (!svgEl) {
        // If it's SVG content without <svg> wrapper, try wrapping
        const wrapped = `<svg xmlns="http://www.w3.org/2000/svg">${sanitized}</svg>`;
        const retryDoc = parser.parseFromString(wrapped, "image/svg+xml");
        const retrySvg = retryDoc.querySelector("svg");
        if (!retrySvg) {
          setError(true);
          setLoading(false);
          return;
        }
        // Remove width/height from wrapper so it scales naturally
        retrySvg.removeAttribute("width");
        retrySvg.removeAttribute("height");
        retrySvg.setAttribute("width", "100%");
        retrySvg.setAttribute("height", "100%");
        container.appendChild(retrySvg);
      } else {
        // Make responsive
        svgEl.removeAttribute("width");
        svgEl.removeAttribute("height");
        svgEl.setAttribute("width", "100%");
        svgEl.setAttribute("height", "100%");
        container.appendChild(svgEl);
      }

      setLoading(false);
    } catch {
      setError(true);
      setLoading(false);
    }
  }, [content]);

  if (error) {
    return (
      <div className="flex items-center justify-center rounded-lg bg-destructive/5 border border-destructive/20 p-6 text-sm text-destructive">
        Could not render this SVG visual. There may be a syntax error in the generated code.
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Loading placeholder */}
      {loading && (
        <div className="flex items-center justify-center rounded-lg bg-muted/20 p-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}
      {/* SVG container — the SVG inherits transparent background from the parent */}
      <div
        ref={containerRef}
        className={cn(
          "w-full [&_svg]:block [&_svg]:max-w-full",
          loading && "hidden",
          className,
        )}
        style={{ minHeight: loading ? 0 : 100 }}
      />
    </div>
  );
}

// ─── HTML Iframe Renderer ────────────────────────────────────────────
// HTML is rendered in a sandboxed iframe to isolate styles/scripts.

function HtmlRenderer({ content, width, height: heightProp }: { content: string; width: string; height: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeHeight, setIframeHeight] = useState<number | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    setLoading(true);
    setLoadError(false);
    setIframeHeight(null);

    try {
      // Write the HTML content to the iframe's document
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!doc) {
        setLoadError(true);
        setLoading(false);
        return;
      }

      doc.open();
      doc.write(content);
      doc.close();

      // Measure the iframe content height after it renders
      const measure = () => {
        if (!iframe.contentWindow?.document.body) return;

        const body = iframe.contentWindow.document.body;
        const html = iframe.contentWindow.document.documentElement;

        // Use scrollHeight for accurate content height
        const contentHeight = Math.max(
          body.scrollHeight,
          html?.scrollHeight ?? 0,
          body.offsetHeight,
          html?.offsetHeight ?? 0,
        );

        if (contentHeight > 0) {
          setIframeHeight(contentHeight);
        }
        setLoading(false);
      };

      // Wait for fonts/images to load
      setTimeout(measure, 100);
      // Retry measurement after fonts load
      if (doc.fonts?.ready) {
        doc.fonts.ready.then(measure);
      }
    } catch {
      setLoadError(true);
      setLoading(false);
    }
  }, [content]);

  if (loadError) {
    return (
      <div className="flex items-center justify-center rounded-lg bg-destructive/5 border border-destructive/20 p-6 text-sm text-destructive">
        Could not render this visual. There was an error loading the content.
      </div>
    );
  }

  const displayHeight = iframeHeight ? `${iframeHeight + 8}px` : heightProp;

  return (
    <div className="relative">
      {/* Loading overlay */}
      {loading && (
        <div className="flex items-center justify-center rounded-lg bg-muted/20 p-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}        <iframe
        ref={iframeRef}
        title="Visual content"
        className={cn(
          "w-full border-0 overflow-hidden transition-opacity duration-300",
          loading ? "absolute opacity-0 pointer-events-none" : "opacity-100",
        )}
        style={{
          width,
          height: displayHeight !== "auto" ? displayHeight : undefined,
          minHeight: displayHeight === "auto" ? 100 : undefined,
          background: "transparent",
        }}
        // Sandbox: no scripts, no popups, no top navigation, no same-origin
        // Allow-same-origin needed for JS to read content height.
        sandbox="allow-same-origin"
        referrerPolicy="no-referrer"
      />
    </div>
  );
}

// ─── Main VisualCard Component ────────────────────────────────────────

export function VisualCard({ data }: { data: unknown }) {
  if (!data || typeof data !== "object") return null;

  const visual = data as Record<string, unknown>;
  if (visual.type !== "visual") return null;

  const { visualType, title, content, width, height, caption } =
    visual as unknown as VisualData;

  if (!content) {
    return (
      <div className="rounded-xl border border-border/40 bg-muted/10 p-6 text-center">
        <Eye className="mx-auto h-8 w-8 text-muted-foreground/40 mb-2" />
        <p className="text-sm text-muted-foreground">Visual content is empty.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border/50 bg-background/50 shadow-sm backdrop-blur-sm transition-all duration-200 hover:shadow-md">
      {/* Header */}
      <div className="flex items-center gap-2.5 border-b border-border/30 bg-muted/20 px-4 py-2.5">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-indigo-500/10">
          <Palette className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
        </div>
        <span className="text-sm font-semibold text-foreground truncate">
          {title}
        </span>
        {visualType && (
          <span className="shrink-0 rounded bg-indigo-500/10 px-1.5 py-0.5 text-[10px] font-medium text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
            {visualType}
          </span>
        )}
      </div>

      {/* Content area — transparent background so it blends into the chat */}
      <div
        className="w-full overflow-x-auto"
        style={{ background: "transparent" }}
      >
        {visualType === "svg" ? (
          <SvgRenderer content={content} />
        ) : (
          <HtmlRenderer content={content} width={width} height={height} />
        )}
      </div>

      {/* Optional caption */}
      {caption && (
        <div className="border-t border-border/20 px-4 py-2">
          <p className="text-[11px] text-muted-foreground/70 italic leading-relaxed">
            {caption}
          </p>
        </div>
      )}
    </div>
  );
}
