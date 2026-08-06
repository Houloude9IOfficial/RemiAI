"use client";

import { useRef, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Eye, Loader2 } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────

type VisualAlign = "left" | "center" | "right";

interface VisualData {
  type: "visual";
  visualType: "svg" | "html";
  title: string;
  content: string;
  width: string;
  height: string;
  caption: string | null;
  align?: VisualAlign;
  note?: string;
}

// ─── Theme injection ──────────────────────────────────────────────────

/** Read live chat theme tokens for injection into SVG/HTML visuals. */
function readChatThemeVars(): Record<string, string> {
  if (typeof window === "undefined") {
    return {
      chatBg: "transparent",
      chatFg: "currentColor",
      chatMuted: "#888",
      chatBorder: "transparent",
      chatPrimary: "#6366f1",
    };
  }
  const s = getComputedStyle(document.documentElement);
  const pick = (name: string, fallback: string) => {
    const v = s.getPropertyValue(name).trim();
    return v || fallback;
  };
  return {
    chatBg: pick("--background", "transparent"),
    chatFg: pick("--foreground", "currentColor"),
    chatMuted: pick("--muted-foreground", "#888"),
    chatBorder: pick("--border", "transparent"),
    chatPrimary: pick("--primary", "#6366f1"),
  };
}

function themeCssBlock(vars: Record<string, string>): string {
  return `
:root, html, body, svg {
  --chat-bg: ${vars.chatBg};
  --chat-fg: ${vars.chatFg};
  --chat-muted: ${vars.chatMuted};
  --chat-border: ${vars.chatBorder};
  --chat-primary: ${vars.chatPrimary};
  --background: ${vars.chatBg};
  --foreground: ${vars.chatFg};
}
html, body {
  margin: 0;
  padding: 0;
  background: transparent !important;
  background-color: transparent !important;
  color: var(--chat-fg);
  font-family: inherit;
}
svg {
  background: transparent !important;
}
`.trim();
}

function sanitizeSvg(svg: string): string {
  let clean = svg.replace(/<script[\s\S]*?<\/script>/gi, "");
  clean = clean.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, "");
  clean = clean.replace(/javascript:\s*/gi, "");
  return clean;
}

function injectSvgTheme(svgEl: SVGElement, vars: Record<string, string>) {
  svgEl.style.background = "transparent";
  svgEl.style.setProperty("--chat-bg", vars.chatBg);
  svgEl.style.setProperty("--chat-fg", vars.chatFg);
  svgEl.style.setProperty("--chat-muted", vars.chatMuted);
  svgEl.style.setProperty("--chat-border", vars.chatBorder);
  svgEl.style.setProperty("--chat-primary", vars.chatPrimary);
  svgEl.style.setProperty("--background", vars.chatBg);
  svgEl.style.setProperty("--foreground", vars.chatFg);

  // Soften obvious full-bleed opaque background rects
  const vb = svgEl.getAttribute("viewBox")?.split(/[\s,]+/) ?? [];
  const vbW = vb[2];
  const vbH = vb[3];
  svgEl.querySelectorAll("rect").forEach((rect) => {
    const w = rect.getAttribute("width");
    const h = rect.getAttribute("height");
    const x = rect.getAttribute("x") ?? "0";
    const y = rect.getAttribute("y") ?? "0";
    const isFullBleed =
      (x === "0" || x === "0%") &&
      (y === "0" || y === "0%") &&
      (w === "100%" || (vbW != null && w === vbW)) &&
      (h === "100%" || (vbH != null && h === vbH));
    const fill = (rect.getAttribute("fill") ?? "").toLowerCase();
    if (
      isFullBleed &&
      fill &&
      fill !== "none" &&
      fill !== "transparent" &&
      !fill.startsWith("url(")
    ) {
      rect.setAttribute("fill", "transparent");
    }
  });

  const ns = "http://www.w3.org/2000/svg";
  svgEl.querySelector("style[data-chat-theme]")?.remove();
  const style = document.createElementNS(ns, "style");
  style.setAttribute("data-chat-theme", "1");
  style.textContent = themeCssBlock(vars);
  svgEl.insertBefore(style, svgEl.firstChild);
}

// ─── SVG Inline Renderer ──────────────────────────────────────────────

function SvgRenderer({ content, className }: { content: string; className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    try {
      const sanitized = sanitizeSvg(content);
      const parser = new DOMParser();
      const doc = parser.parseFromString(sanitized, "image/svg+xml");

      if (doc.querySelector("parsererror")) {
        setError(true);
        setLoading(false);
        return;
      }

      const vars = readChatThemeVars();
      let svgEl = doc.querySelector("svg");
      if (!svgEl) {
        const wrapped = `<svg xmlns="http://www.w3.org/2000/svg">${sanitized}</svg>`;
        const retryDoc = parser.parseFromString(wrapped, "image/svg+xml");
        svgEl = retryDoc.querySelector("svg");
        if (!svgEl) {
          setError(true);
          setLoading(false);
          return;
        }
      }

      svgEl.removeAttribute("width");
      svgEl.removeAttribute("height");
      svgEl.setAttribute("width", "100%");
      svgEl.setAttribute("height", "100%");
      // Tailwind's [&_svg] rules can't pierce a shadow root, so replicate
      // the sizing they provided (block display + capped width) inline.
      svgEl.style.display = "block";
      svgEl.style.maxWidth = "100%";
      svgEl.style.height = "auto";
      injectSvgTheme(svgEl, vars);

      // Render inside a shadow root so any <style> in the SVG — including the
      // theme block injected above — is fully encapsulated. Without this, a
      // <style> inside an inline <svg> leaks document-wide (e.g. `html, body`
      // or `:root` rules change the whole app's font/colors). CSS custom
      // properties still inherit across the shadow boundary, so the visual
      // keeps its theme-awareness.
      //
      // NOTE: inside the shadow root the theme block's `:root`/`html`/`body`
      // selectors match nothing (only `svg` does), which is exactly why they
      // are harmless here. Do NOT "simplify" this back to light-DOM rendering.
      const shadow =
        container.shadowRoot ?? container.attachShadow({ mode: "open" });
      shadow.replaceChildren(svgEl);
      setLoading(false);
    } catch {
      setError(true);
      setLoading(false);
    }
  }, [content]);

  if (error) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-destructive/20 bg-destructive/5 p-6 text-sm text-destructive">
        Could not render this SVG visual. There may be a syntax error in the generated code.
      </div>
    );
  }

  return (
    <div className="relative">
      {loading && (
        <div className="flex items-center justify-center bg-transparent p-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}
      <div
        ref={containerRef}
        className={cn(
          "w-full bg-transparent",
          loading && "hidden",
          className,
        )}
        style={{ minHeight: loading ? 0 : 100, background: "transparent" }}
      />
    </div>
  );
}

// ─── HTML Iframe Renderer ────────────────────────────────────────────

function HtmlRenderer({
  content,
  width,
  height: heightProp,
}: {
  content: string;
  width: string;
  height: string;
}) {
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
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!doc) {
        setLoadError(true);
        setLoading(false);
        return;
      }

      const vars = readChatThemeVars();
      const themeStyle = `<style data-chat-theme="1">${themeCssBlock(vars)}</style>`;

      let htmlToWrite = content;
      const lower = content.toLowerCase();
      if (/<!doctype\s+html|<html[\s>]/i.test(lower)) {
        if (/<\/head>/i.test(content)) {
          htmlToWrite = content.replace(/<\/head>/i, `${themeStyle}</head>`);
        } else if (/<body[\s>]/i.test(content)) {
          htmlToWrite = content.replace(
            /<body([\s>])/i,
            `<head>${themeStyle}</head><body$1`,
          );
        } else {
          htmlToWrite = `${themeStyle}${content}`;
        }
      } else {
        htmlToWrite = `<!DOCTYPE html><html><head><meta charset="utf-8">${themeStyle}</head><body>${content}</body></html>`;
      }

      doc.open();
      doc.write(htmlToWrite);
      doc.close();

      try {
        doc.documentElement.style.background = "transparent";
        doc.documentElement.style.backgroundColor = "transparent";
        if (doc.body) {
          doc.body.style.background = "transparent";
          doc.body.style.backgroundColor = "transparent";
        }
      } catch {
        // ignore
      }

      const measure = () => {
        if (!iframe.contentWindow?.document.body) return;
        const body = iframe.contentWindow.document.body;
        const html = iframe.contentWindow.document.documentElement;
        const contentHeight = Math.max(
          body.scrollHeight,
          html?.scrollHeight ?? 0,
          body.offsetHeight,
          html?.offsetHeight ?? 0,
        );
        if (contentHeight > 0) setIframeHeight(contentHeight);
        setLoading(false);
      };

      setTimeout(measure, 100);
      if (doc.fonts?.ready) doc.fonts.ready.then(measure);
    } catch {
      setLoadError(true);
      setLoading(false);
    }
  }, [content]);

  if (loadError) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-destructive/20 bg-destructive/5 p-6 text-sm text-destructive">
        Could not render this visual. There was an error loading the content.
      </div>
    );
  }

  const displayHeight = iframeHeight ? `${iframeHeight + 8}px` : heightProp;

  return (
<iframe
  ref={iframeRef}
  title="Visual content"
  className={cn(
    "w-full overflow-hidden border-0 bg-transparent transition-opacity duration-300",
    loading ? "pointer-events-none absolute opacity-0" : "opacity-100",
  )}
  style={{
    width,
    height: displayHeight !== "auto" ? displayHeight : undefined,
    minHeight: displayHeight === "auto" ? 100 : undefined,
    background: "transparent",
    colorScheme: "normal",
  }}
  sandbox="allow-same-origin"
  referrerPolicy="no-referrer"
/>
  );
}

// ─── Main VisualCard Component ────────────────────────────────────────

export function VisualCard({ data }: { data: unknown }) {
  const [userAlign] = useState<VisualAlign | null>(null);

  if (!data || typeof data !== "object") return null;

  const visual = data as Record<string, unknown>;
  if (visual.type !== "visual") return null;

  const {
    visualType,
    content,
    width,
    height,
    caption,
    align: alignFromData,
  } = visual as unknown as VisualData;

  const align = userAlign ?? alignFromData ?? "center";
  const alignClass =
    align === "left" ? "mr-auto" : align === "right" ? "ml-auto" : "mx-auto";

  if (!content) {
    return (
      <div className="rounded-xl border border-border/40 bg-transparent p-6 text-center">
        <Eye className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">Visual content is empty.</p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "group w-full max-w-3xl bg-transparent transition-all duration-200",
        alignClass,
      )}
    >
      <div className="overflow-hidden rounded-xl bg-transparent">
        <div className="w-full overflow-x-auto bg-transparent">
          {visualType === "svg" ? (
            <SvgRenderer content={content} />
          ) : (
            <HtmlRenderer content={content} width={width} height={height} />
          )}
        </div>

        {caption && (
          <div className="border-t border-border/20 px-4 py-2 text-center">
            <p className="text-[11px] italic leading-relaxed text-muted-foreground/70">
              {caption}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
