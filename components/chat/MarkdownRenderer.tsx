import React from "react";
import Markdown from "markdown-to-jsx";
import hljs from "highlight.js";
import { cn } from "@/lib/utils";

interface MarkdownRendererProps {
  content: string;
  className?: string;
  /** When true, disables copy buttons on unclosed code blocks (they may
   *  still be receiving tokens). */
  isStreaming?: boolean;
}

/**
 * Renders markdown text with full GFM support and syntax-highlighted code
 * blocks. Uses `markdown-to-jsx` which handles incomplete streaming content
 * gracefully without crashing.
 *
 * When `isStreaming` is true, copy buttons on code blocks are hidden.
 */
export function MarkdownRenderer({ content, className, isStreaming }: MarkdownRendererProps) {
  return (
    <div className={cn("markdown-body relative text-sm", className)}>
      <Markdown
        options={{
          // Safely handle streaming HTML — don't try to parse incomplete tags
          optimizeForStreaming: true,
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
              // Extract language and raw text so we can highlight the code
              const rawText = extractCodeContent(children);
              const lang = extractLanguage(children);

              // Highlight the code if we have a language and it's supported
              let highlighted = rawText;
              try {
                if (lang && hljs.getLanguage(lang)) {
                  highlighted = hljs.highlight(rawText, { language: lang }).value;
                }
              } catch {
                // If highlighting fails (e.g. incomplete code during streaming),
                // fall back to unhighlighted text
              }

              return (
                <div className="group relative">
                  {lang && (
                    <span className="absolute left-3 top-2 select-none rounded bg-muted-foreground/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
                      {lang}
                    </span>
                  )}
                  <pre {...props} className="custom-scrollbar">
                    {/* Render highlighted code as raw HTML */}
                    <code
                      className={`language-${lang ?? ""} hljs`}
                      dangerouslySetInnerHTML={{ __html: highlighted }}
                    />
                  </pre>
                  {!isStreaming && (
                    <CopyButton>
                      {rawText}
                    </CopyButton>
                  )}
                </div>
              );
            },

            // -- Inline code only. Block code (inside <pre>) must preserve its
            // language class so the pre override can detect it for highlighting.
            // markdown-to-jsx uses className="language-js lang-js" for fenced blocks.
            code: ({ className: cls, children, ...props }: any) => {
              // Block code inside <pre> — preserve language class for pre override
              if (cls?.includes("lang-")) {
                return <code className={cls} {...props}>{children}</code>;
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

            // -- Tables (clean, spacious, clearly separated grid)
            table: ({ children, ...props }: any) => (
              <div className="custom-scrollbar my-4 overflow-x-auto rounded-lg bg-card first:mt-0 last:mb-0">
                <table className="w-full border-separate border-spacing-0 text-sm" {...props}>
                  {children}
                </table>
              </div>
            ),
            th: ({ children, ...props }: any) => (
              <th
                className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground/80 bg-muted/75 border-b-2 border-border/50 border-r border-border/35 last:border-r-0 whitespace-normal"
                {...props}
              >
                {children}
              </th>
            ),
            tr: ({ children, ...props }: any) => (
              <tr
                className="transition-colors duration-150 hover:bg-muted/30 even:bg-muted/10 last:[&>td]:border-b-0"
                {...props}
              >
                {children}
              </tr>
            ),
            td: ({ children, ...props }: any) => (
              <td className="px-5 py-3 border-b border-border/30 border-r border-border/25 last:border-r-0 leading-relaxed align-top whitespace-normal" {...props}>
                {children}
              </td>
            ),

            // -- Headings
            h1: ({ children, ...props }: any) => (
              <h1 className="text-xl font-bold leading-tight mt-6 mb-3" {...props}>{children}</h1>
            ),
            h2: ({ children, ...props }: any) => (
              <h2 className="text-lg font-bold leading-tight mt-5 mb-2" {...props}>{children}</h2>
            ),
            h3: ({ children, ...props }: any) => (
              <h3 className="text-base font-semibold leading-tight mt-4 mb-2" {...props}>{children}</h3>
            ),

            // -- Lists
            ul: ({ children, ...props }: any) => (
              <ul className="list-disc pl-5 my-2 space-y-1" {...props}>{children}</ul>
            ),
            ol: ({ children, ...props }: any) => (
              <ol className="list-decimal pl-5 my-2 space-y-1" {...props}>{children}</ol>
            ),
            li: ({ children, ...props }: any) => (
              <li className="leading-relaxed" {...props}>{children}</li>
            ),

            // -- Blockquotes
            blockquote: ({ children, ...props }: any) => (
              <blockquote
                className="border-l-4 border-muted-foreground/20 pl-4 italic text-muted-foreground my-3"
                {...props}
              >
                {children}
              </blockquote>
            ),

            // -- Paragraphs
            p: ({ children, ...props }: any) => (
              <p className="mb-3 last:mb-0 leading-relaxed" {...props}>{children}</p>
            ),

            // -- Images
            img: ({ src, alt, ...props }: any) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={src}
                alt={alt ?? ""}
                className="max-w-full rounded-lg border border-border/50 my-3"
                loading="lazy"
                {...props}
              />
            ),

            // -- Horizontal rules
            hr: () => (
              <hr className="my-5 border-t border-border/50" />
            ),
          },
        }}
      >
        {content}
      </Markdown>

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
    // match-to-jsx outputs "language-js lang-js" for fenced blocks
    const match = cls.match(/lang-(\w+)/);
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
