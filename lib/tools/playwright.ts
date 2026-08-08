import { z } from "zod";
import fs from "node:fs";
import { eq } from "drizzle-orm";
import { chromium, type Browser, type Page } from "playwright";
import { db } from "@/db";
import { toolConfigs } from "@/db/schema";
import { truncateToolResult } from "@/lib/utils";
import {
  uploadSessionFile,
  buildSessionFileUrl,
} from "@/lib/session-files/storage";

// ---------------------------------------------------------------------------
// Native Playwright browser automation
//
// Drives a real headless Chromium from the server process (the SAME process
// in the website and the packaged Electron app — Electron spawns this exact
// Next.js server), so the tool works natively in both.
//
// Browser binary resolution (in order):
//   1. Playwright's Chromium — bundled inside the Electron installer
//      (build/playwright-browsers → resources/playwright-browsers, selected
//      via PLAYWRIGHT_BROWSERS_PATH), or downloaded with `npm run
//      playwright:install` in dev / the Docker image.
//   2. The user's system Google Chrome (channel: "chrome").
//   3. The user's system Microsoft Edge (channel: "msedge").
//
// Sessions: each conversation gets ONE browser session (created lazily on the
// first call). browser_open navigates, then browser_click / browser_fill /
// browser_extract / browser_screenshot operate on the same page, and
// browser_interact is the escape hatch for anything the primitives can't do.
// Sessions idle out after 5 minutes; the cap (4) protects low-memory machines.
//
// The tool is togglable (Settings > Tools > Browser Automation). When
// disabled no browser tools are registered at all. It only runs when the
// user explicitly enabled it — same trust model as Code Execution.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Session registry
// ---------------------------------------------------------------------------

interface BrowserSession {
  browser: Browser;
  page: Page;
  lastUsedAt: number;
}

const SESSIONS = new Map<number, BrowserSession>();
// In-flight session creations per conversation. The AI SDK executes parallel
// tool calls within one step, so two browser tools for the same conversation
// could both miss the existing-session check and launch a browser each — the
// second would overwrite the first in the map and orphan it forever. This
// cache makes creation atomic per conversation.
const PENDING_CREATION = new Map<number, Promise<BrowserSession>>();
const SESSION_IDLE_MS = 5 * 60_000;
const MAX_SESSIONS = 4;

/** Cap extracted page text so one heavy page can't flood the context. */
const MAX_TEXT_CHARS = 40_000;

/** Close sessions that have been idle for SESSION_IDLE_MS. */
const idleTimer = setInterval(() => {
  const now = Date.now();
  for (const [conversationId, session] of SESSIONS) {
    if (now - session.lastUsedAt > SESSION_IDLE_MS) {
      void closeSession(conversationId);
    }
  }
}, 60_000);
// Never keep the server process alive just for cleanup.
idleTimer.unref?.();

async function closeSession(conversationId: number): Promise<void> {
  const session = SESSIONS.get(conversationId);
  if (!session) return;
  SESSIONS.delete(conversationId);
  try {
    await session.browser.close();
  } catch {
    // Best-effort — the process may have died already.
  }
}

// ---------------------------------------------------------------------------
// Browser launch (bundled Chromium → system Chrome → system Edge)
// ---------------------------------------------------------------------------

/**
 * True when Playwright's own Chromium binary is present (bundled in the
 * installer via PLAYWRIGHT_BROWSERS_PATH, or installed via `npm run
 * playwright:install`). executablePath() returns the expected path without
 * throwing; launch() would throw — so we pre-check to fail fast and skip a
 * ~2s launch attempt when nothing is installed.
 */
function bundledChromiumAvailable(): boolean {
  try {
    return fs.existsSync(chromium.executablePath());
  } catch {
    return false;
  }
}

async function launchBrowser(): Promise<Browser> {
  const attempts: Array<{ label: string; launch: () => Promise<Browser> }> = [
    ...(bundledChromiumAvailable()
      ? [
          {
            label: "Playwright Chromium",
            launch: () => chromium.launch({ headless: true }),
          },
        ]
      : []),
    {
      label: "system Google Chrome",
      launch: () => chromium.launch({ headless: true, channel: "chrome" }),
    },
    {
      label: "system Microsoft Edge",
      launch: () => chromium.launch({ headless: true, channel: "msedge" }),
    },
    // Last resort: containers (Docker) and some restricted Linux setups run
    // without a usable SUID sandbox, which makes Chromium fail to start.
    {
      label: "Playwright Chromium (no sandbox)",
      launch: () =>
        chromium.launch({
          headless: true,
          args: ["--no-sandbox", "--disable-setuid-sandbox"],
        }),
    },
  ];

  const errors: string[] = [];
  for (const attempt of attempts) {
    try {
      return await attempt.launch();
    } catch (err) {
      errors.push(
        `${attempt.label}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  throw new Error(
    "Playwright could not start a Chromium browser. No bundled Chromium was " +
      "found and no system Chrome/Edge is available. Fix: run `npm run " +
      "playwright:install` (or `npx playwright install chromium`) once on this " +
      "machine, or reinstall the desktop app (it bundles Chromium). Details:\n" +
      errors.join("\n"),
  );
}

// ---------------------------------------------------------------------------
// Session helpers
// ---------------------------------------------------------------------------

async function getOrCreateSession(
  conversationId: number,
): Promise<BrowserSession> {
  const existing = SESSIONS.get(conversationId);
  if (
    existing &&
    existing.browser.isConnected() &&
    !existing.page.isClosed()
  ) {
    existing.lastUsedAt = Date.now();
    return existing;
  }
  if (existing) {
    await closeSession(conversationId).catch(() => {});
  }

  // Reuse an in-flight creation (parallel tool calls in one step) so a
  // conversation never launches two browsers.
  const inFlight = PENDING_CREATION.get(conversationId);
  if (inFlight) return inFlight;

  const creating = createSession(conversationId);
  PENDING_CREATION.set(conversationId, creating);
  try {
    return await creating;
  } finally {
    PENDING_CREATION.delete(conversationId);
  }
}

/** Create a brand-new browser session for a conversation. */
async function createSession(conversationId: number): Promise<BrowserSession> {
  const browser = await launchBrowser();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    locale: "en-US",
  });
  const page = await context.newPage();

  const session: BrowserSession = { browser, page, lastUsedAt: Date.now() };

  // Enforce the session cap by evicting the least-recently-used session.
  if (SESSIONS.size >= MAX_SESSIONS) {
    const lru = [...SESSIONS.entries()].sort(
      (a, b) => a[1].lastUsedAt - b[1].lastUsedAt,
    )[0];
    if (lru) await closeSession(lru[0]).catch(() => {});
  }

  SESSIONS.set(conversationId, session);
  return session;
}

/** Error thrown when an operation exceeds its time budget. */
class PlaywrightTimeoutError extends Error {}

/**
 * Run a browser operation with a hard timeout. On timeout the whole session
 * is closed (the page may be wedged on a slow request) and the error tells
 * the model to browser_open again.
 */
async function withSessionTimeout<T>(
  conversationId: number,
  timeoutMs: number,
  fn: (session: BrowserSession) => Promise<T>,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      // Free the wedged browser in the background, then report the timeout.
      void closeSession(conversationId);
      reject(
        new PlaywrightTimeoutError(
          `The browser operation timed out after ${Math.round(timeoutMs / 1000)}s. ` +
            "The browser session was closed — call browser_open again to continue.",
        ),
      );
    }, timeoutMs);
  });
  try {
    // The race covers session CREATION too (launch can hang on a slow disk
    // or a wedged headless shell) — not just the operation itself.
    return await Promise.race([
      (async () => {
        const session = await getOrCreateSession(conversationId);
        return fn(session);
      })(),
      timeout,
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Page helpers
// ---------------------------------------------------------------------------

/**
 * Extract readable text from the page (or a CSS selector within it).
 * Strips scripts/styles/svg/canvas and collapses blank runs.
 */
async function extractPageText(
  page: Page,
  selector?: string | null,
): Promise<string> {
  return page.evaluate(
    (sel: string | null) => {
      const root = sel ? document.querySelector(sel) : document.body;
      if (!root) return "";
      const clone = root.cloneNode(true) as HTMLElement;
      for (const el of Array.from(
        clone.querySelectorAll("script,style,noscript,svg,canvas,iframe,template"),
      )) {
        el.remove();
      }
      return (clone.innerText ?? clone.textContent ?? "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    },
    selector ?? null,
  );
}

function withTextLimit(text: string): string {
  if (text.length <= MAX_TEXT_CHARS) return text;
  return (
    text.slice(0, MAX_TEXT_CHARS) +
    `\n\n[...truncated: ${(text.length - MAX_TEXT_CHARS).toLocaleString()} more chars — ` +
    "call browser_extract with a selector or browser_interact for more]"
  );
}

/** Compact snapshot of the current page state for tool results. */
async function pageSnapshot(page: Page): Promise<{
  title: string;
  url: string;
  text: string;
  textLength: number;
}> {
  const [title, url, rawText] = await Promise.all([
    page.title().catch(() => ""),
    page.url(),
    extractPageText(page),
  ]);
  return {
    title,
    url,
    text: withTextLimit(rawText),
    textLength: rawText.length,
  };
}

const timeoutSchema = (defaultMs: number, maxMs = 120_000) =>
  z
    .number()
    .int()
    .positive()
    .max(maxMs)
    .optional()
    .default(defaultMs)
    .describe(
      `Timeout in ms (default: ${defaultMs / 1000}s, max: ${maxMs / 1000}s)`,
    );

// ---------------------------------------------------------------------------
// Tool builder — chat route registers these only when the user enabled the
// "playwright" tool config (Settings > Tools).
// ---------------------------------------------------------------------------

export async function buildPlaywrightTools(
  conversationId: number,
): Promise<Record<string, any>> {
  const config = await db
    .select()
    .from(toolConfigs)
    .where(eq(toolConfigs.toolId, "playwright"))
    .get();

  if (!config?.enabled) {
    return {};
  }

  const SESSION_HINT =
    "A browser session persists per conversation: browser_open once, then " +
    "click/fill/extract/screenshot on the same page; call browser_close when done.";

  return {
    // ── browser_open ───────────────────────────────────────────────────
    browser_open: {
      description:
        `Open a URL in a real headless Chromium browser (native Playwright) and return the page title, final URL, and extracted readable text. ` +
        `Use this when a page is rendered with JavaScript (SPAs, dashboards, dynamic content) or when you need to interact with a live site — ` +
        `web_fetch returns only the raw HTML. ${SESSION_HINT}`,
      inputSchema: z.object({
        url: z
          .string()
          .url()
          .refine((u) => /^https?:/i.test(u), {
            message: "Only http(s) URLs can be opened",
          })
          .describe("The URL to open (http or https)"),
        waitFor: z
          .string()
          .optional()
          .describe(
            "Optional CSS selector to wait for before extracting (e.g. '#results', '.loaded')",
          ),
        timeout: timeoutSchema(45_000),
      }),
      execute: async ({
        url,
        waitFor,
        timeout,
      }: {
        url: string;
        waitFor?: string | null;
        timeout?: number;
      }) => {
        return withSessionTimeout(conversationId, timeout ?? 45_000, async (session) => {
          const { page } = session;
          await page.goto(url, {
            waitUntil: "domcontentloaded",
            timeout: Math.min(timeout ?? 45_000, 30_000),
          });
          if (waitFor) {
            await page
              .waitForSelector(waitFor, { timeout: 10_000 })
              .catch(() => {});
          }
          return truncateToolResult({
            opened: true,
            note: "Text below is the rendered page content (JavaScript included).",
            ...(await pageSnapshot(page)),
          });
        });
      },
    },

    // ── browser_click ──────────────────────────────────────────────────
    browser_click: {
      description:
        `Click the first element matching a CSS selector on the current browser page (navigate first with browser_open), wait for the page to settle, and return the updated title, URL, and text. ` +
        `Use for links, buttons, checkboxes, and other clickable elements. ${SESSION_HINT}`,
      inputSchema: z.object({
        selector: z
          .string()
          .min(1)
          .describe("CSS selector of the element to click (e.g. 'button.submit', 'a.login')"),
        timeout: timeoutSchema(30_000),
      }),
      execute: async ({
        selector,
        timeout,
      }: {
        selector: string;
        timeout?: number;
      }) => {
        return withSessionTimeout(conversationId, timeout ?? 30_000, async (session) => {
          const { page } = session;
          const locator = page.locator(selector).first();
          await locator.waitFor({ state: "visible", timeout: 10_000 });
          await locator.click({ timeout: 10_000 });
          await page
            .waitForLoadState("domcontentloaded", { timeout: 10_000 })
            .catch(() => {});
          return truncateToolResult({
            clicked: true,
            selector,
            ...(await pageSnapshot(page)),
          });
        });
      },
    },

    // ── browser_fill ───────────────────────────────────────────────────
    browser_fill: {
      description:
        `Fill a text input (or textarea) with a value on the current browser page (navigate first with browser_open). ` +
        `Use before browser_click to submit forms (e.g. fill 'input[name=email]' then click the login button). ${SESSION_HINT}`,
      inputSchema: z.object({
        selector: z
          .string()
          .min(1)
          .describe("CSS selector of the input to fill (e.g. 'input[name=email]')"),
        value: z.string().describe("The text to type into the field"),
        timeout: timeoutSchema(30_000),
      }),
      execute: async ({
        selector,
        value,
        timeout,
      }: {
        selector: string;
        value: string;
        timeout?: number;
      }) => {
        return withSessionTimeout(conversationId, timeout ?? 30_000, async (session) => {
          const { page } = session;
          const locator = page.locator(selector).first();
          await locator.waitFor({ state: "visible", timeout: 10_000 });
          await locator.fill(value, { timeout: 10_000 });
          return truncateToolResult({
            filled: true,
            selector,
            valueLength: value.length,
          });
        });
      },
    },

    // ── browser_extract ────────────────────────────────────────────────
    browser_extract: {
      description:
        `Extract text from the current browser page — the whole page, or a specific region via CSS selector (e.g. 'article', '#main', '.price'). ` +
        `Use to re-read content after interacting, or to pull a focused section that browser_open's full-page text didn't include. ${SESSION_HINT}`,
      inputSchema: z.object({
        selector: z
          .string()
          .min(1)
          .optional()
          .describe("Optional CSS selector to extract text from (defaults to the whole page)"),
        timeout: timeoutSchema(30_000),
      }),
      execute: async ({
        selector,
        timeout,
      }: {
        selector?: string | null;
        timeout?: number;
      }) => {
        return withSessionTimeout(conversationId, timeout ?? 30_000, async (session) => {
          const text = await extractPageText(session.page, selector);
          return truncateToolResult({
            selector: selector ?? "body",
            text: withTextLimit(text),
            textLength: text.length,
          });
        });
      },
    },

    // ── browser_screenshot ─────────────────────────────────────────────
    browser_screenshot: {
      description:
        `Take a screenshot of the current browser page (navigate first with browser_open) and save it into the conversation's session files. ` +
        `Returns the canonical URL — embed it in your reply as ![name](url) so the user sees the actual rendered page. ` +
        `Use for visual verification, design review, or evidence that an automation step worked. ${SESSION_HINT}`,
      inputSchema: z.object({
        path: z
          .string()
          .optional()
          .describe(
            "Optional save path inside the session sandbox (forward slashes, e.g. 'browser/home.png'); defaults to a timestamped file under 'browser/'",
          ),
        fullPage: z
          .boolean()
          .optional()
          .default(false)
          .describe("Capture the full scrollable page (default: just the visible viewport)"),
        width: z
          .number()
          .int()
          .min(320)
          .max(2560)
          .optional()
          .describe("Optional viewport width in px for responsive screenshots (e.g. 375 for mobile)"),
        timeout: timeoutSchema(30_000),
      }),
      execute: async ({
        path,
        fullPage,
        width,
        timeout,
      }: {
        path?: string | null;
        fullPage?: boolean | null;
        width?: number | null;
        timeout?: number;
      }) => {
        return withSessionTimeout(conversationId, timeout ?? 30_000, async (session) => {
          const { page } = session;
          if (!page.url() || page.url() === "about:blank") {
            return truncateToolResult({
              error: "No page to screenshot yet.",
              hint: "Call browser_open({ url }) first to open a page, then browser_screenshot.",
            });
          }
          if (width) {
            const oldSize = page.viewportSize();
            await page.setViewportSize({ width, height: oldSize?.height ?? 800 });
          }
          try {
            const buffer = await page.screenshot({
              fullPage: fullPage ?? false,
              type: "png",
            });

            const parts = (path || `browser/screenshot-${Date.now()}.png`)
              .split("/")
              .filter(Boolean);
            const filename = parts.pop() ?? `screenshot-${Date.now()}.png`;
            const dir = parts.length > 0 ? parts.join("/") : "browser";

            const entry = await uploadSessionFile(
              conversationId,
              filename,
              buffer,
              dir,
            );
            const url = buildSessionFileUrl(conversationId, entry.path);
            return truncateToolResult({
              saved: true,
              path: entry.path,
              size: entry.size,
              width: page.viewportSize()?.width ?? null,
              url,
              markdown: `![${entry.name}](${url})`,
            });
          } finally {
            if (width) {
              // Restore the default viewport for subsequent interactions.
              await page.setViewportSize({ width: 1280, height: 800 }).catch(() => {});
            }
          }
        });
      },
    },

    // ── browser_interact ───────────────────────────────────────────────
    browser_interact: {
      description:
        `Execute a custom Playwright script against the current browser session — the escape hatch for anything browser_click/fill/extract can't express. ` +
        `Write an async IIFE body using the ` + "`page`" + ` and ` + "`browser`" + ` globals (Playwright Page/Browser objects): e.g. "await page.goto('https://x'); const items = await page.locator('.item').allTextContents(); console.log(items); return items.length;". ` +
        `Use console.log for output — captured and returned. Allowed: page.click, page.fill, page.waitForSelector, page.evaluate, page.locator, etc. ` +
        `For a screenshot use browser_screenshot (page.screenshot paths do not persist). ${SESSION_HINT}`,
      inputSchema: z.object({
        code: z
          .string()
          .min(1)
          .describe(
            "Async JavaScript body executed in the server with `page` and `browser` in scope; use console.log for output; the return value is included in the result",
          ),
        timeout: timeoutSchema(60_000),
      }),
      execute: async ({
        code,
        timeout,
      }: {
        code: string;
        timeout?: number;
      }) => {
        return withSessionTimeout(conversationId, timeout ?? 60_000, async (session) => {
          const { page, browser } = session;
          const logs: string[] = [];
          const shim: Record<string, (...args: unknown[]) => void> = {
            log: (...args) => logs.push(args.map(String).join(" ")),
            info: (...args) => logs.push(args.map(String).join(" ")),
            warn: (...args) => logs.push("⚠️ " + args.map(String).join(" ")),
            error: (...args) => logs.push("❌ " + args.map(String).join(" ")),
            debug: (...args) => logs.push(args.map(String).join(" ")),
          };

          // Runs in the server process (trust model: the user explicitly
          // enabled this tool — same as Code Execution). NOTE: new Function
          // creates a REGULAR function, so the IIFE must be returned
          // explicitly — otherwise its promise is discarded and the code
          // never gets awaited.
          const runner = new Function(
            "page",
            "browser",
            "console",
            `return (async () => {\n${code}\n})();`,
          );
          const returnValue = await runner(page, browser, shim);

          let serialized: unknown = returnValue;
          try {
            serialized = JSON.parse(JSON.stringify(returnValue));
          } catch {
            serialized = String(returnValue);
          }

          return truncateToolResult({
            output: logs.join("\n").slice(0, MAX_TEXT_CHARS),
            returnValue: serialized,
            title: await page.title().catch(() => ""),
            url: page.url(),
          });
        });
      },
    },

    // ── browser_close ──────────────────────────────────────────────────
    browser_close: {
      description:
        `Close this conversation's browser session and free its resources. Call when you are done automating, so the browser isn't left running in the background.`,
      inputSchema: z.object({}),
      execute: async () => {
        await closeSession(conversationId);
        return truncateToolResult({ closed: true });
      },
    },
  };
}
