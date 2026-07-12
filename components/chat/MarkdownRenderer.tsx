import React, { useRef } from "react";
import Markdown from "markdown-to-jsx";
import hljs from "highlight.js";
import { cn } from "@/lib/utils";

interface MarkdownRendererProps {
  content: string;
  className?: string;
  /** When true, shows a streaming cursor and disables copy buttons on
   *  unclosed code blocks (they may still be receiving tokens). */
  isStreaming?: boolean;
}

/**
 * Renders markdown text with full GFM support and syntax-highlighted code
 * blocks. Uses `markdown-to-jsx` which handles incomplete streaming content
 * gracefully without crashing.
 *
 * When `isStreaming` is true, a blinking cursor is shown at the end of the
 * rendered content and copy buttons on code blocks are hidden.
 */
export function MarkdownRenderer({ content, className, isStreaming }: MarkdownRendererProps) {
  return (
    <div className={cn("markdown-body relative text-sm", className)}>
      <Markdown
        options={{
          // Safely handle streaming HTML — don't try to parse incomplete tags
          optimizeForStreamingHtml: true,
          // Force block mode for full markdown parsing
          forceBlock: true,
          // Wrap plain text in a <div> rather than a <p> so we don't get
          // nested <p> tags from react-markdown's old behavior
          wrapper: "div",
          overrides: {
            // -- Links open in new tab with security attributes
            a: ({ href, children, ...props }: any) => (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                {...props}
              >
                {children}
              </a>
            ),

            // -- Code blocks with language badge + copy button
            pre: ({ children, ...props }: any) => {
              // Try to extract language from the <code> child's className
              const lang = extractLanguage(children);
              return (
                <div className="group relative">
                  {lang && (
                    <span className="absolute left-3 top-2 select-none rounded bg-muted-foreground/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
                      {lang}
                    </span>
                  )}
                  <pre {...props} className="custom-scrollbar">
                    {children}
                  </pre>
                  {!isStreaming && (
                    <CopyButton>
                      {extractCodeContent(children)}
                    </CopyButton>
                  )}
                </div>
              );
            },

            // -- Inline & block code
            code: ({ className: cls, children, ...props }: any) => {
              // markdown-to-jsx passes language as "lang-xxx" on <code> inside <pre>
              // We convert it to "language-xxx hljs" for highlight.js CSS
              const lang = cls?.replace(/^lang-/, "language-");
              const isBlock = !!lang;

              if (isBlock) {
                return (
                  <code className={`${lang} hljs`} {...props}>
                    {children}
                  </code>
                );
              }

              // Inline code
              return (
                <code
                  className="break-words rounded bg-muted px-1.5 py-0.5 text-[13px] font-mono text-foreground before:content-none after:content-none"
                  {...props}
                >
                  {children}
                </code>
              );
            },

            // -- Tables
            table: ({ children, ...props }: any) => (
              <div className="custom-scrollbar overflow-x-auto">
                <table className="w-full border-collapse text-sm" {...props}>
                  {children}
                </table>
              </div>
            ),
            th: ({ children, ...props }: any) => (
              <th
                className="border border-border bg-muted px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                {...props}
              >
                {children}
              </th>
            ),
            td: ({ children, ...props }: any) => (
              <td className="border border-border px-3 py-2" {...props}>
                {children}
              </td>
            ),

            // -- Blockquotes
            blockquote: ({ children, ...props }: any) => (
              <blockquote
                className="border-l-3 border-muted-foreground/25 pl-4 italic text-muted-foreground"
                {...props}
              >
                {children}
              </blockquote>
            ),

            // -- Images
            img: ({ src, alt, ...props }: any) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={src}
                alt={alt ?? ""}
                className="max-w-full rounded-lg border border-border/50"
                loading="lazy"
                {...props}
              />
            ),

            // -- Horizontal rules
            hr: () => (
              <hr className="my-4 border-t border-border/50" />
            ),
          },
        }}
      >
        {content}
      </Markdown>

      {/* Streaming cursor — a subtle blinking caret after the last token */}
      {isStreaming && (
        <span className="inline-block h-[1em] w-[2px] animate-streaming-cursor bg-foreground/70 align-text-bottom ml-0.5" />
      )}
    </div>
  );
}

/**
 * Extract the language identifier from a `<pre>` child's grandchild `<code>`
 * element's className (e.g. "lang-js" → "js").
 */
function extractLanguage(children: React.ReactNode): string | null {
  const firstChild = React.Children.toArray(children)[0];
  if (React.isValidElement<{ className?: string }>(firstChild)) {
    const cls = firstChild.props.className ?? "";
    const match = cls.match(/^lang-(\w+)/);
    if (match) return match[1];
  }
  return null;
}

/**
 * Extract the text content from a `<code>` element's children so we can
 * display it in the copy button's label (and copy it to clipboard).
 */
function extractCodeContent(children: React.ReactNode): string {
  let text = "";
  React.Children.forEach(children, (child) => {
    if (typeof child === "string" || typeof child === "number") {
      text += child;
    } else if (React.isValidElement<{ children?: React.ReactNode }>(child)) {
      text += extractCodeContent(child.props.children);
    }
  });
  return text;
}

/** A small copy-to-clipboard button that appears on hover over code blocks. */
function CopyButton({ children: code }: { children: string }) {
  const [copied, setCopied] = React.useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API not available — silently fail
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      className="absolute right-2 top-2 rounded-md bg-muted/80 px-2 py-1 text-[10px] font-medium text-muted-foreground opacity-0 transition-all duration-150 group-hover:opacity-100 hover:bg-muted hover:text-foreground"
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}
