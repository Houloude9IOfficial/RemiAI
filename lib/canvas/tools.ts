import path from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { truncateToolResult } from "@/lib/utils";
import {
  buildSessionFileUrl,
  uploadSessionFile,
} from "@/lib/session-files/storage";
import { withFreshPage } from "@/lib/tools/playwright";
import {
  createCanvas,
  getCanvas,
  listCanvases,
  normalizeCanvasPath,
  buildCanvasPreviewUrl,
  type CanvasInfo,
} from "./storage";

/**
 * Canvas tools — let the AI establish a named, self-contained multi-file web
 * project (index.html + style.css + script.js + assets) and open it in the
 * interactive canvas panel (live preview + code editor).
 *
 * The project's files themselves are written with the existing session file
 * tools (session_file_write / session_file_edit / session_file_mkdir)
 * automatically scoped under canvas/{slug}/. canvas_create establishes the
 * project + writes a starter entry file; canvas_open presents it in the panel;
 * canvas_add_file scaffolds a sibling file so the AI can then fill it.
 */

const canvasRefSchema = z
  .string()
  .min(1)
  .max(120)
  .describe("Canvas name or slug to create (for canvas_create) or open (for canvas_open)");

export interface BuildCanvasToolsOptions {
  conversationId: number;
  sourceRunId?: string;
  /**
   * The current request's `Cookie` header (used by canvas_review so the
   * headless render passes the app's session wall when loading the canvas
   * through its real HTTP URL).
   */
  authCookie?: string | null;
}

/** Compact serialisation of a canvas for the model + present card. */
function toModelCanvas(info: CanvasInfo, conversationId: number) {
  return {
    type: "canvas" as const,
    slug: info.slug,
    name: info.name,
    description: info.description,
    entryFile: info.entryFile,
    fileCount: info.files.filter((f) => f.isFile).length,
    files: info.files.map((f) => ({
      path: f.path,
      name: f.name,
      isDirectory: f.isDirectory,
      size: f.isDirectory ? null : f.size,
      // Canonical /api/chat/{conversationId}/session-files/{path} URL so the
      // model can pass it straight to read_file / web_fetch / read_media
      // (bare canvas/… paths are NOT valid URL inputs).
      url: f.isDirectory ? null : buildSessionFileUrl(conversationId, f.path),
    })),
  };
}

export function buildCanvasTools(opts: BuildCanvasToolsOptions) {
  const { conversationId } = opts;

  return {
    canvas_create: {
      description:
        "Create a new interactive canvas — a self-contained multi-file web project (HTML/CSS/JS) that opens in a live-preview + code-editor panel the user can run and edit. " +
        "Use for buildable, interactive deliverables: websites, small apps, calculators, games, dashboards, interactive docs, prototypes. " +
        "This establishes the project (starter HTML entry file + manifest). The actual content (index.html, style.css, script.js, assets) is then written " +
        "with session_file_write / session_file_edit using paths under the canvas/{slug}/... prefix. " +
        "After writing the files, call the canvas_open tool to present it in the panel.",
      inputSchema: z.object({
        name: canvasRefSchema.describe("User-visible name for the canvas (also becomes its folder slug under canvas/)."),
        description: z
          .string()
          .max(300)
          .optional()
          .describe("Short description of what the canvas is/does."),
        entryFile: z
          .string()
          .max(200)
          .optional()
          .describe("Entry file relative path (default: index.html)."),
      }),
      execute: async ({
        name,
        description,
        entryFile,
      }: {
        name: string;
        description?: string;
        entryFile?: string;
      }) => {
        const info = await createCanvas(conversationId, {
          name,
          description,
          entryFile,
        });
        return truncateToolResult({
          ...toModelCanvas(info, conversationId),
          message: `Created canvas "${info.name}".`,
          note:
            "Write the project files with session_file_write / session_file_edit under the canvas/" +
            info.slug +
            "/ prefix (e.g. canvas/" +
            info.slug +
            "/index.html, canvas/" +
            info.slug +
            "/style.css, canvas/" +
            info.slug +
            "/script.js). Then call canvas_open to present it in the panel.",
        });
      },
    },

    canvas_add_file: {
      description:
        "Scaffold a new (likely empty) file inside an existing canvas project under canvas/{slug}/. " +
        "Creates the file if it doesn't exist (parents included) so you can then fill it with session_file_edit. " +
        "Usually unnecessary — session_file_write creates files directly. Use when you want to establish a placeholder " +
        "the user expects (e.g. style.css, script.js) before writing it.",
      inputSchema: z.object({
        slug: z.string().min(1).describe("Canvas slug (the folder name under canvas/)."),
        name: z.string().min(1).describe("File name relative to the canvas root, e.g. style.css."),
      }),
      execute: async ({ slug, name }: { slug: string; name: string }) => {
        const info = await getCanvas(conversationId, slug);
        if (!info) {
          return truncateToolResult({ error: `No canvas found for "${slug}". Call canvas_create first.` });
        }
        const path = normalizeCanvasPath(info.slug, name);
        return truncateToolResult({ slug, path, created: true });
      },
    },

    canvas_review: {
      description:
        "Render a canvas in a real headless browser and return a text diagnostics report: console errors, broken images, failed network requests (dead image hosts), unloaded CSS/JS, and horizontal overflow. " +
        "Call AFTER writing or editing a canvas's files and BEFORE canvas_open, so you can catch broken visuals (e.g. posters that fail to load because the placeholder service is offline) and fix them first. " +
        "Keep calling it after each round of edits until the report is clean. " +
        "To ALSO judge the visual design (not just brokenness), pass saveScreenshot: true — the rendered page is then captured, saved into the session sandbox, and ATTACHED to this tool's result as an image you can see, so you can inspect layout, spacing, and polish with your vision encoder. " +
        "The render is a point-in-time snapshot of the files AS THEY ARE when this tool runs: always call it AFTER your last edit, and if you edit again afterwards, re-run it — never present an earlier review's screenshot as the current state. Each run with saveScreenshot saves a new timestamped PNG and returns its URL.",
      inputSchema: z.object({
        slug: z
          .string()
          .min(1)
          .optional()
          .describe(
            "Canvas slug to review (defaults to the most recently updated canvas in this conversation).",
          ),
        saveScreenshot: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            "When true, screenshot the rendered page, save the PNG into the session sandbox (browser/…), and return it to you as a visible image attached to this result. Use it to judge aesthetics — does the page look rich and polished, or plain/ugly? — not just to catch broken assets. Default false.",
          ),
        fullPage: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            "When true (and saveScreenshot is true), capture the ENTIRE scrollable page instead of only the first viewport. Use for long landing pages, feeds, or grids that need scrolling. Default false.",
          ),
      }),
      execute: async ({
        slug,
        saveScreenshot,
        fullPage,
      }: {
        slug?: string;
        saveScreenshot?: boolean;
        fullPage?: boolean;
      }) => {
        return reviewCanvas(conversationId, {
          slug,
          saveScreenshot: saveScreenshot === true,
          fullPage: fullPage === true,
          authCookie: opts.authCookie ?? null,
        });
      },
      // Tell the AI SDK this tool can return an SDK v7 "content" output
      // (text diagnostics + screenshot image file part) rather than plain
      // JSON — otherwise the screenshot bytes would be re-serialized as a
      // base64 JSON blob and the model could never see the rendered page.
      toModelOutput: async ({ output }: { output: unknown }) => output,
    },

    canvas_list: {
      description:
        "List every canvas project in this conversation: name, slug, entry file, and file count. " +
        "Use to find an existing canvas to iterate on before canvas_open.",
      inputSchema: z.object({}),
      execute: async () => {
        const canvases = await listCanvases(conversationId);
        return truncateToolResult({
          count: canvases.length,
          canvases: canvases.map((c) => ({
            slug: c.slug,
            name: c.name,
            description: c.description,
            entryFile: c.entryFile,
            fileCount: c.files.filter((f) => f.isFile).length,
          })),
        });
      },
    },

    canvas_open: {
      description:
        "Open an existing canvas in the interactive panel (live preview + code editor). " +
        "Call AFTER creating a canvas and writing its files with session_file_* under canvas/{slug}/. " +
        "Pass the canvas slug or name. The panel opens with the entry file previewed; the user can edit code and re-run.",
      inputSchema: z.object({
        slug: canvasRefSchema.describe("Canvas slug or name to open."),
      }),
      execute: async ({ slug }: { slug: string }) => {
        const info = await getCanvas(conversationId, slug);
        if (!info) {
          return truncateToolResult({
            error: `No canvas found for "${slug}".`,
            available: (await listCanvases(conversationId)).map((c) => c.slug),
          });
        }
        return truncateToolResult({
          ...toModelCanvas(info, conversationId),
          message: `Opened canvas "${info.name}" in the panel.`,
        });
      },
    },
  };
}

// ---------------------------------------------------------------------------
// canvas_review — render a canvas in a headless browser and return TEXT
// diagnostics the model can act on (broken images, console errors, dead
// hosts, overflow…). The model works blind otherwise: it writes files and
// declares victory without ever seeing that every poster is a broken image.
//
// With saveScreenshot the tool ALSO captures the rendered page: the PNG is
// saved into the session sandbox (so the user can view it) and the pixels are
// attached to the tool result as an SDK v7 file part — vision-capable models
// then see the actual page and can judge aesthetics, not just brokenness.
// ---------------------------------------------------------------------------

const MAX_REVIEW_ITEMS = 12;

/**
 * Dynamically load sharp (a native CJS module). With esModuleInterop,
 * dynamic `import("sharp")` wraps it as `{ default: sharpFn }`.
 * Return type is explicitly the calling signature so the caller can
 * invoke it as `sharp(input)`.
 */
async function importSharp(): Promise<(input?: string | Buffer) => any> {
  const mod = await import("sharp");
  const fn = (mod as any).default ?? mod;
  return fn as (input?: string | Buffer) => any;
}

async function reviewCanvas(
  conversationId: number,
  opts: {
    slug?: string;
    saveScreenshot?: boolean;
    fullPage?: boolean;
    authCookie?: string | null;
  },
) {
  const { saveScreenshot = false, fullPage = false, authCookie = null } = opts;

  // Resolve the canvas: explicit slug, else the most recently updated one.
  let canvas: CanvasInfo | null = null;
  if (opts.slug) {
    canvas = await getCanvas(conversationId, opts.slug);
  } else {
    const all = await listCanvases(conversationId);
    canvas = all[0] ?? null;
  }
  if (!canvas) {
    const available = (await listCanvases(conversationId)).map((c) => c.slug);
    return truncateToolResult({
      error: "No canvas found to review.",
      hint: "Call canvas_create first, then write the project files, then canvas_review.",
      available,
    });
  }

  const files = canvas.files.filter((f) => f.isFile);
  const entryRef = `${canvas.prefix}/${canvas.entryFile}`;
  const entryExists = files.some(
    (f) => f.path === entryRef || f.path.endsWith(`/${canvas.entryFile}`),
  );

  // Render through the SAME http URL the user's live preview iframe loads, so
  // the review reflects exactly what the user sees. The session-files route
  // is local, unauthenticated, and serves relative assets with MIME types.
  const port = process.env.PORT || "3000";
  const relativeUrl = buildCanvasPreviewUrl(
    conversationId,
    canvas.slug,
    canvas.entryFile,
  );
  // Cache-bust the document load: the review must always render the files
  // exactly as they are NOW, never a previously-cached response (any HTTP
  // layer between this process and the browser must not be able to serve an
  // older revision of the page). The file fallback below needs no busting —
  // it reads the sandbox directory straight from disk.
  const reviewUrl = new URL(`http://127.0.0.1:${port}${relativeUrl}`);
  reviewUrl.searchParams.set("cv", String(Date.now()));
  const url = reviewUrl.toString();

  try {
    return await withFreshPage(
      async (page) => {
        const consoleErrors: string[] = [];
        const pageErrors: string[] = [];
        const failedRequests: Array<{ type: string; url: string; reason: string }> = [];
        const httpErrors: Array<{ type: string; url: string; status: number }> = [];

        page.on("console", (msg) => {
          if (msg.type() === "error") {
            const text = msg.text().trim().slice(0, 300);
            if (text && consoleErrors.length < MAX_REVIEW_ITEMS) consoleErrors.push(text);
          }
        });
        page.on("pageerror", (err) => {
          const text = String(err?.message ?? err).slice(0, 300);
          if (text && pageErrors.length < MAX_REVIEW_ITEMS) pageErrors.push(text);
        });
        page.on("requestfailed", (req) => {
          const rurl = req.url();
          if (!/^https?:/i.test(rurl)) return;
          if (/favicon\.ico$/i.test(rurl)) return;
          const type = req.resourceType() || "other";
          if (failedRequests.length < MAX_REVIEW_ITEMS) {
            failedRequests.push({
              type,
              url: rurl.slice(0, 240),
              reason: req.failure()?.errorText ?? "failed",
            });
          }
        });
        page.on("response", (res) => {
          if (res.status() < 400) return;
          const type = res.request().resourceType() || "other";
          const rurl = res.url();
          if (/favicon\.ico$/i.test(rurl)) return;
          if (["image", "stylesheet", "script", "fetch", "xhr", "document", "font", "media"].includes(type)) {
            if (httpErrors.length < MAX_REVIEW_ITEMS) {
              httpErrors.push({ type, url: rurl.slice(0, 240), status: res.status() });
            }
          }
        });

        let loadError: string | null = null;
        let renderedVia: "http" | "file" = "http";
        try {
          let docResponse = await page
            .goto(url, {
              waitUntil: "domcontentloaded",
              timeout: 20_000,
            })
            .catch(() => null);
          // The /api/chat/… file URLs sit behind the app's session-cookie
          // wall. With the caller's cookie forwarded this normally succeeds;
          // if it still 401s (or the cookie has Secure set over plain http),
          // fall back to rendering the local files directly from disk.
          if (docResponse && (docResponse.status() === 401 || docResponse.status() === 403)) {
            renderedVia = "file";
            // Discard the noise the rejected request produced (401 console
            // errors, the failed document request) before the fallback load.
            consoleErrors.length = 0;
            pageErrors.length = 0;
            failedRequests.length = 0;
            httpErrors.length = 0;
            docResponse = await page
              .goto(pathToFileURL(path.join(canvas.dir, canvas.entryFile)).href, {
                waitUntil: "domcontentloaded",
                timeout: 20_000,
              })
              .catch(() => null);
          }
          // Let async JS render + images settle before the diagnostics pass.
          // Brief fixed pause first, then (best-effort) wait for the network
          // to quiet down so slow-loading canvases (fonts, images, late
          // CSS/JS) are actually painted before the screenshot + DOM pass.
          // Bounded so pages that never go idle (polls, websockets) can't
          // hang the review — the fixed pause above is the floor.
          await page.waitForTimeout(700);
          await page
            .waitForLoadState("networkidle", { timeout: 2_500 })
            .catch(() => {});
        } catch (err) {
          loadError = err instanceof Error ? err.message : String(err);
        }

        // Screenshot capture: viewport by default, full scrollable page when
        // fullPage is set. The full-resolution PNG is saved into the session
        // sandbox (user-visible); the model additionally receives a compact
        // re-encoded JPEG (attached as a file part below) so the pixels fit
        // comfortably inside its context window.
        let screenshotSaved: {
          path: string;
          url: string;
          filename: string;
          viewport: string;
          fullPage: boolean;
          // Compact re-encoded buffer attached to the model's tool result.
          attachBuffer: Buffer | null;
          attachMediaType: "image/jpeg" | "image/png";
        } | null = null;
        if (saveScreenshot) {
          try {
            const pngBuffer = await page.screenshot({
              type: "png",
              ...(fullPage ? { fullPage: true as const } : {}),
            });
            // Timestamp the filename: every review is a distinct artifact, so
            // an earlier review's URL can never silently change meaning (and
            // the model can't accidentally present a stale iteration).
            const filename = `canvas-${canvas.slug}-review-${Date.now()}${fullPage ? "-full" : ""}.png`;
            const entry = await uploadSessionFile(
              conversationId,
              filename,
              pngBuffer,
              "browser",
            );
            // Downscale to ~1280px wide and re-encode as JPEG (screenshots
            // have no transparency) so the base64 stays compact in context.
            let attachBuffer: Buffer | null = null;
            let attachMediaType: "image/jpeg" | "image/png" = "image/jpeg";
            try {
              const sharp = await importSharp();
              attachBuffer = await sharp(pngBuffer)
                .resize({
                  width: 1280,
                  withoutEnlargement: true,
                  fit: "inside",
                })
                .jpeg({ quality: 85 })
                .toBuffer();
            } catch {
              // sharp unavailable/failed — attach the original PNG instead;
              // viewport shots are bounded and acceptable.
              if (!fullPage) {
                attachBuffer = pngBuffer;
                attachMediaType = "image/png";
              }
            }
            screenshotSaved = {
              path: entry.path,
              url: buildSessionFileUrl(conversationId, entry.path),
              filename,
              viewport: `${page.viewportSize()?.width ?? 1280}x${page.viewportSize()?.height ?? 900}`,
              fullPage,
              attachBuffer,
              attachMediaType,
            };
          } catch {
            // Screenshot is optional — never fail the review because of it.
          }
        }

        if (loadError) {
          return truncateToolResult({
            slug: canvas.slug,
            name: canvas.name,
            entryFile: canvas.entryFile,
            error: `Could not load the canvas page (${loadError.slice(0, 200)}).`,
            hint: "The entry file may reference missing local files or hang on an unreachable host. Check the files under canvas/" + canvas.slug + "/ and retry.",
            url,
          });
        }

        // Synchronous DOM + layout pass inside the page.
        interface RenderState {
          title: string;
          textLength: number;
          viewportWidth: number;
          scrollWidth: number;
          overflow: number;
          overflowCulprits: string[];
          totalImages: number;
          brokenImages: Array<{ alt: string | null; src: string }>;
          headings: number;
          buttons: number;
          links: number;
          inputs: number;
          error?: string;
        }
        const EMPTY_STATE: RenderState = {
          title: "",
          textLength: 0,
          viewportWidth: 0,
          scrollWidth: 0,
          overflow: 0,
          overflowCulprits: [],
          totalImages: 0,
          brokenImages: [],
          headings: 0,
          buttons: 0,
          links: 0,
          inputs: 0,
        };
        let state: RenderState = EMPTY_STATE;
        try {
          state = await page.evaluate(() => {
            const doc = document.documentElement;
            const imgs = Array.from(document.images);
            const broken = imgs.filter((i) => i.complete && i.naturalWidth === 0);
            const textLength = (document.body?.innerText ?? "").trim().length;
            const overflow = Math.max(0, doc.scrollWidth - window.innerWidth);
            const overflowCulprits: string[] = [];
            if (overflow > 0) {
              const all = Array.from(document.querySelectorAll<HTMLElement>("body *"));
              const offenders = all
                .map((el) => {
                  const r = el.getBoundingClientRect();
                  return { el, right: r.right, width: r.width };
                })
                .filter((x) => x.right > window.innerWidth + 1 && x.width > 8)
                .sort((a, b) => b.right - a.right)
                .slice(0, 5);
              for (const o of offenders) {
                const el = o.el;
                const tag = el.tagName.toLowerCase();
                const cls =
                  typeof el.className === "string" && el.className
                    ? `.${el.className.trim().split(/\s+/).slice(0, 2).join(".")}`
                    : "";
                overflowCulprits.push(
                  `${tag}${cls} (spans to ${Math.round(o.right)}px)`,
                );
              }
            }
            return {
              title: document.title,
              textLength,
              viewportWidth: window.innerWidth,
              scrollWidth: doc.scrollWidth,
              overflow,
              overflowCulprits,
              totalImages: imgs.length,
              brokenImages: broken.map((i) => ({
                alt: i.alt || null,
                src: (i.currentSrc || i.src).slice(0, 200),
              })),
              headings: document.querySelectorAll("h1,h2,h3,h4").length,
              buttons: document.querySelectorAll("button").length,
              links: document.querySelectorAll("a[href]").length,
              inputs: document.querySelectorAll("input,select,textarea").length,
            };
          });
        } catch (err) {
          state = {
            ...EMPTY_STATE,
            error: err instanceof Error ? err.message : String(err),
          };
        }

        const issues: string[] = [];
        const broken = state.brokenImages ?? [];
        if (broken.length > 0) {
          issues.push(
            `Broken images (${broken.length}/${state.totalImages}): ${broken
              .slice(0, 5)
              .map((b) => `"${b.alt ?? b.src}" (${b.src})`)
              .join("; ")}${broken.length > 5 ? `; +${broken.length - 5} more` : ""}. ` +
              "Fix: the image URL is unreachable — replace it with a working host or, better, generate the visual with CSS/SVG so the page never depends on an external service.",
          );
        }
        if (failedRequests.length > 0) {
          issues.push(
            `Failed network requests (${failedRequests.length}): ${failedRequests
              .slice(0, 5)
              .map((f) => `[${f.type}] ${f.url} (${f.reason})`)
              .join("; ")}${failedRequests.length > 5 ? `; +${failedRequests.length - 5} more` : ""}.`,
          );
        }
        if (httpErrors.length > 0) {
          issues.push(
            `HTTP errors (${httpErrors.length}): ${httpErrors
              .slice(0, 5)
              .map((h) => `[${h.type}] ${h.url} → ${h.status}`)
              .join("; ")}${httpErrors.length > 5 ? `; +${httpErrors.length - 5} more` : ""}. ` +
              "A stylesheet/script/image returning 404 usually means a file referenced in the HTML was never written — create it.",
          );
        }
        for (const msg of consoleErrors) issues.push(`Console error: ${msg}`);
        for (const msg of pageErrors) issues.push(`Uncaught JS error: ${msg}`);
        if (state.overflow > 0) {
          issues.push(
            `Horizontal overflow: page is ${state.overflow}px wider than the viewport (${state.viewportWidth}px). Culprits: ${state.overflowCulprits.join("; ") || "unknown"}. ` +
              "Fix with max-width: 100%, overflow-x: clip, or fluid widths.",
          );
        }
        if (!entryExists) {
          issues.push(
            `Entry file ${canvas.entryFile} does not exist yet under canvas/${canvas.slug}/ — write it first.`,
          );
        }
        if ((state.textLength ?? 0) === 0 && files.length > 0) {
          issues.push(
            "The page renders no visible text — a JS error, an empty entry file, or content injected into a container that never got filled.",
          );
        }
        if (files.length === 0) {
          issues.push("The canvas has no files yet — write index.html (and css/js) under canvas/" + canvas.slug + "/ first.");
        }

        const clean = issues.length === 0;
        const statsText =
          `page: title="${state.title ?? ""}", bodyText=${state.textLength ?? 0} chars, ` +
          `viewport=${state.viewportWidth ?? 0}px, imagesLoaded=${(state.totalImages ?? 0) - (state.brokenImages?.length ?? 0)}/${state.totalImages ?? 0}, ` +
          `headings=${state.headings ?? 0}, buttons=${state.buttons ?? 0}, links=${state.links ?? 0}, inputs=${state.inputs ?? 0}, files=${files.length}`;
        // A clean technical report is NOT the same as a good-looking page.
        // These notes push the model to judge the actual design, not just the
        // diagnostics above.
        const plainNote = clean
          ? "No broken images, console errors, failed requests, or overflow detected. Technical review is clean — but clean is not the same as good-looking: to check the actual design yourself (imperfections, spacing, polish, whether it visually matches the user's request), re-run canvas_review with saveScreenshot: true and inspect the attached image before canvas_open."
          : "Fix every issue above (broken images usually mean a dead or blocked image host), re-run canvas_review until it reports clean, then judge the visuals with saveScreenshot: true before calling canvas_open.";

        // When a screenshot was captured AND its bytes are attachable, return
        // an SDK v7 "content" output: the text report plus the screenshot as a
        // visible image file part. Vision-capable models then actually SEE the
        // rendered page and can judge aesthetics — layout, spacing, hierarchy,
        // visual richness — not just brokenness.
        if (screenshotSaved?.attachBuffer) {
          const attach = screenshotSaved.attachBuffer;
          const ext = screenshotSaved.attachMediaType === "image/jpeg" ? "jpg" : "png";
          const attachNote = clean
            ? "No broken images, console errors, failed requests, or overflow detected — the technical report above is clean. That does NOT mean the page is good: complete the VISUAL SELF-REVIEW below before presenting it."
            : "Fix every issue flagged above first, then re-run canvas_review with a fresh screenshot and complete the VISUAL SELF-REVIEW below before presenting the result.";
          const textParts = [
            `Canvas review: "${canvas.name}" (slug ${canvas.slug}, entry ${canvas.entryFile})`,
            `url: ${url}`,
            `render: ${renderedVia}`,
            `verdict: ${clean ? "clean" : `${issues.length} issue(s) found`}`,
            ...issues.map((i) => `- ${i}`),
            statsText,
            `screenshot (ATTACHED as an image below — you can see it): ${screenshotSaved.url} (${screenshotSaved.viewport}${screenshotSaved.fullPage ? ", full page" : ""})`,
            "## VISUAL SELF-REVIEW — REQUIRED before you finish\n" +
              "This render is a point-in-time snapshot of the files as they are NOW, and the screenshot is attached so YOU can see the actual page. Do not skip this step: models that never look ship pages that are plain, broken-looking, or full of small imperfections. Actually inspect the image and hunt for problems:\n" +
              "1. IMPERFECTIONS & VISUAL BUGS — misaligned or overlapping elements, uneven or missing spacing, text cut off or overflowing its card, inconsistent fonts/colors, ugly default styling, low-contrast or unreadable text, empty-looking areas where a visual belongs, anything that looks unfinished or cheap.\n" +
              "2. DESIGN QUALITY VS THE REQUEST — is the page as rich and polished as the user implied? A 'Netflix-like' page needs hero/backdrops and rich cards with real-looking visuals, not a bare text grid. Check layout, hierarchy, spacing rhythm, typography, color, and hover/interactive states.\n" +
              "3. WHAT COULD BE BETTER — name at least 3-5 concrete improvements you can SEE (element + fix), e.g. 'poster slots are empty — add gradient/SVG art', 'cards have no hover effect', 'header is plain — add a hero section', 'spacing between cards is uneven'.\n" +
              "Then fix every issue you found (and everything flagged above) with session_file_edit, and re-run canvas_review so a fresh screenshot PROVES the fixes. Never present THIS screenshot if you change anything after it. When the final review is clean AND genuinely looks the part, embed THIS run's URL as ![review screenshot](" +
              screenshotSaved.url +
              ") in your final reply so the user sees it too, then call canvas_open.",
            attachNote,
          ];
          const value: any[] = [{ type: "text", text: textParts.join("\n") }];
          value.push({
            type: "file",
            filename: `canvas-${canvas.slug}-review.${ext}`,
            mediaType: screenshotSaved.attachMediaType,
            data: { type: "data", data: attach.toString("base64") },
          });
          return { type: "content", value };
        }

        const result: Record<string, unknown> = {
          slug: canvas.slug,
          name: canvas.name,
          entryFile: canvas.entryFile,
          url,
          render: renderedVia,
          verdict: clean ? "clean" : "issues-found",
          issueCount: issues.length,
          ...(issues.length > 0 ? { issues: issues.slice(0, MAX_REVIEW_ITEMS) } : {}),
          stats: {
            title: state.title ?? "",
            bodyTextLength: state.textLength ?? 0,
            viewport: `${state.viewportWidth ?? 0}px`,
            overflowPx: state.overflow ?? 0,
            imagesLoaded: (state.totalImages ?? 0) - (state.brokenImages?.length ?? 0),
            imagesTotal: state.totalImages ?? 0,
            headings: state.headings ?? 0,
            buttons: state.buttons ?? 0,
            links: state.links ?? 0,
            inputs: state.inputs ?? 0,
            files: files.length,
          },
          ...(screenshotSaved ? { screenshot: { path: screenshotSaved.path, url: screenshotSaved.url } } : {}),
          note: plainNote,
        };
        return truncateToolResult(result);
      },
      { viewport: { width: 1280, height: 900 }, cookieHeader: authCookie },
    );
  } catch (err) {
    return truncateToolResult({
      slug: canvas.slug,
      error: "canvas_review could not start a headless browser.",
      detail: err instanceof Error ? err.message : String(err),
      hint: "Install the browser runtime once: npm run playwright:install (dev) — the packaged desktop app already bundles it.",
    });
  }
}

// Re-export so callers can reference the slug helper without importing storage.
export { slugify } from "./storage";