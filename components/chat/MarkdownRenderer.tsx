import React from "react";
import Markdown from "markdown-to-jsx";
import hljs from "highlight.js";
import { cn } from "@/lib/utils";
import { ImagePreview } from "./ImagePreview";
import {
  normalizeUrlKey,
  type CitationRef,
} from "@/lib/chat/citations";

type MarkdownLinkProps = React.ComponentPropsWithoutRef<"a">;
type MarkdownPreProps = React.ComponentPropsWithoutRef<"pre">;
type MarkdownCodeProps = React.ComponentPropsWithoutRef<"code">;
type MarkdownTableProps = React.ComponentPropsWithoutRef<"table">;
type MarkdownTableCellProps = React.ComponentPropsWithoutRef<"th">;
type MarkdownRowProps = React.ComponentPropsWithoutRef<"tr">;
type MarkdownDataCellProps = React.ComponentPropsWithoutRef<"td">;
type MarkdownHeadingProps = React.ComponentPropsWithoutRef<"h1">;
type MarkdownListProps = React.ComponentPropsWithoutRef<"ul">;
type MarkdownOrderedListProps = React.ComponentPropsWithoutRef<"ol">;
type MarkdownListItemProps = React.ComponentPropsWithoutRef<"li">;
type MarkdownQuoteProps = React.ComponentPropsWithoutRef<"blockquote">;
type MarkdownParagraphProps = React.ComponentPropsWithoutRef<"p">;
type MarkdownImageProps = Omit<React.ComponentPropsWithoutRef<"img">, "src"> & {
  src?: string;
};

interface MarkdownRendererProps {
  content: string;
  className?: string;
  /** When true, disables copy buttons on unclosed code blocks (they may
   *  still be receiving tokens). */
  isStreaming?: boolean;
  /** Normalized URL → citation ref. Links whose destination matches a key
   *  render as a numbered Nexus-style chip instead of a plain link. */
  citations?: Map<string, CitationRef> | null;
}

/**
 * Renders markdown text with full GFM support and syntax-highlighted code
 * blocks. Uses `markdown-to-jsx` which handles incomplete streaming content
 * gracefully without crashing.
 *
 * When `isStreaming` is true, copy buttons on code blocks are hidden.
 */
export function MarkdownRenderer({ content, className, isStreaming, citations }: MarkdownRendererProps) {
  // While streaming, the caller injects raw HTML (animated <span>s) that must
  // be parsed. Once streaming is done, escape raw HTML outside of code fences
  // so stray JSX/HTML in message content renders as literal text instead of
  // being parsed into DOM nodes — which produced invalid-nesting warnings and
  // React 19 string-ref crashes in the past.
  const safeContent = isStreaming ? content : escapeRawHtml(content);

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
            // -- Links: destinations matching a retrieved source render as a
            // numbered citation chip; everything else opens in a new tab.
            a: ({ href, children, ...props }: MarkdownLinkProps) => {
              const citation =
                typeof href === "string" && citations?.size
                  ? citations.get(normalizeUrlKey(href))
                  : undefined;
              if (citation) {
                return <CitationChip citation={citation} />;
              }
              return (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  {...props}
                >
                  {children}
                </a>
              );
            },

            // -- Code blocks with language badge + copy button
            pre: ({ children, ...props }: MarkdownPreProps) => {
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
            code: ({ className: cls, children, ...props }: MarkdownCodeProps) => {
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
            table: ({ children, ...props }: MarkdownTableProps) => (
              <div className="markdown-table-scroll custom-scrollbar overflow-x-auto">
                <table className="markdown-table w-max min-w-full border-separate border-spacing-0 text-sm" {...props}>
                  {children}
                </table>
              </div>
            ),
            th: ({ children, ...props }: MarkdownTableCellProps) => (
              <th
                className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground/80 bg-muted/75 border-b-2 border-border/50 border-r border-border/35 last:border-r-0 whitespace-nowrap"
                {...props}
              >
                {children}
              </th>
            ),
            tr: ({ children, ...props }: MarkdownRowProps) => (
              <tr
                className="transition-colors duration-150 hover:bg-muted/30 even:bg-muted/10 last:[&>td]:border-b-0"
                {...props}
              >
                {children}
              </tr>
            ),
            td: ({ children, ...props }: MarkdownDataCellProps) => (
              <td className="px-5 py-3 border-b border-border/30 border-r border-border/25 last:border-r-0 leading-relaxed align-top whitespace-nowrap" {...props}>
                {children}
              </td>
            ),

            // -- Headings
            h1: ({ children, ...props }: MarkdownHeadingProps) => (
              <h1 className="text-xl font-bold leading-tight mt-6 mb-3" {...props}>{children}</h1>
            ),
            h2: ({ children, ...props }: MarkdownHeadingProps) => (
              <h2 className="text-lg font-bold leading-tight mt-5 mb-2" {...props}>{children}</h2>
            ),
            h3: ({ children, ...props }: MarkdownHeadingProps) => (
              <h3 className="text-base font-semibold leading-tight mt-4 mb-2" {...props}>{children}</h3>
            ),

            // -- Lists
            ul: ({ children, ...props }: MarkdownListProps) => (
              <ul className="list-disc pl-5 my-2 space-y-1" {...props}>{children}</ul>
            ),
            ol: ({ children, ...props }: MarkdownOrderedListProps) => (
              <ol className="list-decimal pl-5 my-2 space-y-1" {...props}>{children}</ol>
            ),
            li: ({ children, ...props }: MarkdownListItemProps) => (
              <li className="leading-relaxed" {...props}>{children}</li>
            ),

            // -- Blockquotes
            blockquote: ({ children, ...props }: MarkdownQuoteProps) => (
              <blockquote
                className="border-l-4 border-muted-foreground/20 pl-4 italic text-muted-foreground my-3"
                {...props}
              >
                {children}
              </blockquote>
            ),

            // -- Paragraphs
            // markdown-to-jsx passes `className: undefined` in props for plain
            // paragraphs (and real classes for raw HTML <p class="...">).
            // Destructure it OUT so the spread below cannot clobber our own
            // className — previously the styling was silently dropped and the
            // rendered element showed className={undefined}.
            p: ({ children, className: _pClassName, ...props }: MarkdownParagraphProps) => (
              <p className="mb-3 last:mb-0 leading-relaxed" {...props}>{children}</p>
            ),

            // -- Images — rendered with download / copy / open-in-new-tab controls
            img: ({ src, alt }: MarkdownImageProps) => (
              <ImagePreview
                src={src ?? ""}
                alt={alt ?? ""}
                className="my-3"
                imgClassName="max-w-full rounded-lg border border-border/50"
              />
            ),

            // -- Horizontal rules
            hr: () => (
              <hr className="my-5 border-t border-border/50" />
            ),
          },
        }}
      >
        {safeContent}
      </Markdown>

    </div>
  );
}

/**
 * Escapes `<` characters outside of fenced code blocks and inline code spans
 * so raw HTML/JSX in message content is displayed as literal text instead of
 * being parsed as DOM elements by markdown-to-jsx.
 *
 * markdown-to-jsx parses raw HTML by design (including custom tags like
 * `<MessageBubble>`). When an assistant message contains unfenced
 * JSX/component source code, that parsing produces:
 *  - "X is using incorrect casing" / "unrecognized in this browser" warnings
 *  - invalid nesting warnings (`<div>` inside `<p>`, nested `<p>`)
 *  - "React does not recognize the `prop` prop on a DOM element" warnings
 *  - "Expected ref to be a function..." crashes (React 19 string refs)
 *
 * Fenced code blocks and inline code are preserved verbatim — the markdown
 * renderer already escapes those, so re-escaping them here would corrupt them.
 */
function escapeRawHtml(text: string): string {
  const lines = text.split("\n");
  let inFence = false;
  const out = lines.map((line) => {
    // Also matches blockquote-prefixed fences (e.g. `> ```js`)
    const fence = /^\s*(>\s?)*(```|~~~)/.exec(line)?.[2];
    if (fence) {
      inFence = !inFence;
      return line; // Keep the fence marker as-is
    }
    if (inFence) return line; // Code — already escaped by the renderer
    return escapeInlineCode(line);
  });
  return out.join("\n");
}

/** Escapes `<` outside of inline code spans (backtick runs) on a single line. */
function escapeInlineCode(line: string): string {
  let out = "";
  let i = 0;
  while (i < line.length) {
    if (line[i] === "`") {
      // Copy the code span verbatim (find the closing run of the same length)
      let j = i + 1;
      while (j < line.length && line[j] === "`") j++;
      const run = line.slice(i, j);
      const close = line.indexOf(run, j);
      if (close === -1) {
        // Unterminated backtick — treat the rest as literal text
        out += line.slice(i);
        return out;
      }
      out += line.slice(i, close + run.length);
      i = close + run.length;
    } else if (line[i] === "<") {
      out += "&lt;";
      i++;
    } else {
      out += line[i];
      i++;
    }
  }
  return out;
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

/**
 * Favicon cache — host → resolved data URL. Streaming re-renders rebuild the
 * markdown tree and remount citation chips, and a freshly mounted <img> with
 * a remote src visibly reloads. Once a favicon has been fetched it is cached
 * as a data URL, so remounted chips paint instantly with no flash.
 */
const faviconDataUrlCache = new Map<string, string>();
const faviconInflight = new Set<string>();
const faviconFailed = new Set<string>();

function googleFaviconFor(url: string): { src: string; host: string } {
  try {
    const host = new URL(url).hostname;
    if (!host) return { src: "", host: "" };
    return {
      src: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32`,
      host,
    };
  } catch {
    return { src: "", host: "" };
  }
}

/**
 * Best available favicon src for `url`. Reads the module cache (populated by
 * previous mounts — this is what makes streaming remounts paint instantly)
 * and, from an effect, primes the cache with a one-off background fetch.
 *
 * Render stays PURE: the fetch lives in an effect. Kicking it off during
 * render made renders impure, which sent Next.js dev/Fast Refresh into
 * constant full-page reloads.
 */
function useCachedFavicon(url: string): string {
  const { src, host } = googleFaviconFor(url);
  // Snapshot per mount — later remounts re-run the initializer and pick up
  // anything the cache gained in between. No state updates needed afterwards:
  // the already-rendered <img> keeps its remote src, which never flashes.
  const [cached] = React.useState(() =>
    host ? faviconDataUrlCache.get(host) ?? null : null,
  );

  React.useEffect(() => {
    if (!host || !src) return;
    if (
      faviconDataUrlCache.has(host) ||
      faviconInflight.has(host) ||
      faviconFailed.has(host)
    ) {
      return;
    }
    faviconInflight.add(host);
    void fetch(src)
      .then((res) =>
        res.ok ? res.blob() : Promise.reject(new Error(String(res.status))),
      )
      .then(
        (blob) =>
          new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
          }),
      )
      .then((dataUrl) => {
        faviconDataUrlCache.set(host, dataUrl);
      })
      .catch(() => {
        // Fetch can fail (offline, CORS) — the <img> keeps using the remote
        // src, which loads without CORS anyway. Don't retry every mount.
        faviconFailed.add(host);
      })
      .finally(() => {
        faviconInflight.delete(host);
      });
  }, [host, src]);

  return cached ?? src;
}

/**
 * Citation chip — a light pill (favicon + source title) that replaces inline
 * links to sources the model actually retrieved. Hovering reveals a preview
 * card (site favicon + domain, full title, publish date); clicking opens the
 * page.
 */
function CitationChip({ citation }: { citation: CitationRef }) {
  let siteLabel = "";
  try {
    siteLabel = new URL(citation.url).hostname.replace(/^www\./, "");
  } catch {
    siteLabel = citation.url;
  }
  const favicon = useCachedFavicon(citation.url);
  const dateLabel = formatCitationDate(citation.publishedAt);

  return (
    <span className="group/chip relative mx-0.5 inline-flex h-7.5 align-middle">
      <a
        href={citation.url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Source: ${citation.title}`}
        className="citation-chip inline-flex max-w-[200px] items-center gap-1.5 rounded-full bg-secondary py-[3px] pr-2.5 pl-[9px] text-[11px] leading-none font-medium text-primary no-underline transition-colors hover:bg-border"
      >
        {favicon && (
          // eslint-disable-next-line @next/next/no-img-element -- tiny favicon from a dynamic third-party URL; next/image needs remote-pattern config for no benefit
          <img
            src={favicon}
            alt=""
            loading="lazy"
            className="h-4.5 w-4.5 shrink-0 rounded-full bg-background"
          />
        )}
        {/* leading must exceed the font's ascent+descent (≈1.12em) or the
            truncate span's overflow-hidden clips descenders (g, y, p, …). */}
        <span className="truncate leading-[1.3]">{citation.title}</span>
      </a>

      {/* Hover preview card — pure CSS, no portal needed. pointer-events-none
          keeps it from flickering when the cursor slides across it. */}
      <span
        aria-hidden="true"
        className="pointer-events-none invisible absolute top-full left-0 z-50 mt-0 w-72 max-w-[min(80vw,18rem)] rounded-xl border border-border/60 bg-background px-3.5 py-2.5 text-left opacity-0 shadow-xl transition-opacity duration-150 group-hover/chip:visible group-hover/chip:opacity-100"
      >
        <span className="flex items-center gap-0.5">
          {favicon && (
            // eslint-disable-next-line @next/next/no-img-element -- dynamic third-party favicon, see above
            <img
              src={favicon}
              alt=""
              loading="lazy"
              className="h-4 w-4 shrink-0 rounded-full bg-muted object-contain"
            />
          )}
          <span className="truncate text-[11px] ml-2 text-foreground/70">{siteLabel}</span>
        </span>
        <span className="mt-0.1 line-clamp-3 block text-[13px] leading-snug font-medium text-foreground">
          {citation.title}
        </span>
        {dateLabel && (
          <span className="mt-1.5 block text-[11px] text-muted-foreground">
            {dateLabel}
          </span>
        )}
      </span>
    </span>
  );
}

/**
 * Format a source's publish date for the hover card. Parseable values render
 * as "August 15, 2026" (en-US hardcoded so SSR and client agree); relative
 * ages from search results ("2 days ago") pass through as-is.
 */
function formatCitationDate(publishedAt?: string): string | null {
  const value = publishedAt?.trim();
  if (!value) return null;
  const ms = Date.parse(value);
  if (Number.isFinite(ms)) {
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(ms);
  }
  return value;
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
