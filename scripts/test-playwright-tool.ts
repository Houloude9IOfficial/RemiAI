#!/usr/bin/env tsx
/**
 * Manual E2E test for the native Playwright Browser Automation tool.
 *
 * Exercises the full tool surface (browser_open → click/fill/extract →
 * screenshot → interact → close) against a real Chromium, exactly as the
 * chat route would call it (via buildPlaywrightTools). Requires Chromium:
 * `npm run playwright:install` (or the desktop app's bundled browser).
 *
 * The tool's `playwright` tool_config is enabled for the duration of the
 * test and removed afterwards, so the dev database is left untouched.
 *
 * Usage:
 *   npx tsx scripts/test-playwright-tool.ts
 */
import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { toolConfigs } from "@/db/schema";
import { buildPlaywrightTools } from "@/lib/tools/playwright";
import { SESSION_FILES_DIR } from "@/lib/paths";

// Throwaway conversation id (no real conversation exists — the session-file
// sandbox is created on demand).
const CONVERSATION_ID = 999999;

// Tool results are truncated to JSON by truncateToolResult — declare the
// fields this test asserts on.
interface OpenResult {
  opened?: boolean;
  title?: string;
  url?: string;
  text?: string;
  textLength?: number;
}
interface ExtractResult {
  selector?: string;
  text?: string;
  textLength?: number;
}
interface ShotResult {
  saved?: boolean;
  path?: string;
  size?: number;
  url?: string;
  markdown?: string;
}
interface InteractResult {
  output?: string;
  returnValue?: number;
}
interface CloseResult {
  closed?: boolean;
}

function expect(cond: boolean, label: string): void {
  if (!cond) throw new Error(`Assertion failed: ${label}`);
  console.log(`  ✓ ${label}`);
}

async function main(): Promise<void> {
  console.log("[test] Enabling playwright tool config…");
  await db.delete(toolConfigs).where(eq(toolConfigs.toolId, "playwright")).run();
  await db.insert(toolConfigs).values({
    toolId: "playwright",
    enabled: true,
  });

  try {
    const tools = await buildPlaywrightTools(CONVERSATION_ID);
    const names = Object.keys(tools);
    console.log("[test] Registered tools:", names.join(", "));
    expect(names.length === 7, "all 7 browser tools registered");

    // ── browser_open ─────────────────────────────────────────────
    console.log("[test] browser_open example.com…");
    const open = (await tools.browser_open.execute({
      url: "https://example.com",
      timeout: 45_000,
    })) as OpenResult;
    expect(open.opened === true, "browser_open returned opened:true");
    expect(typeof open.title === "string" && open.title.length > 0, "page title present");
    expect(
      (open.text ?? "").includes("Example Domain"),
      "rendered text extracted",
    );

    // ── browser_extract (selector) ───────────────────────────────
    console.log("[test] browser_extract h1…");
    const extract = (await tools.browser_extract.execute({
      selector: "h1",
      timeout: 30_000,
    })) as ExtractResult;
    expect(
      (extract.text ?? "").includes("Example Domain"),
      "selector extraction works",
    );

    // ── browser_screenshot → session files ───────────────────────
    console.log("[test] browser_screenshot…");
    const shot = (await tools.browser_screenshot.execute({
      path: "browser/test.png",
      timeout: 30_000,
    })) as ShotResult;
    expect(shot.saved === true, "screenshot saved");
    expect(typeof shot.url === "string" && shot.url.startsWith("/api/chat/"), "canonical URL returned");
    expect(
      (shot.markdown ?? "").includes("![test.png]"),
      "markdown embed returned",
    );
    const abs = path.join(
      SESSION_FILES_DIR,
      String(CONVERSATION_ID),
      shot.path ?? "",
    );
    expect(fs.existsSync(abs) && fs.statSync(abs).size > 0, "PNG actually written to disk");

    // ── browser_interact (escape hatch) ──────────────────────────
    console.log("[test] browser_interact…");
    const interact = (await tools.browser_interact.execute({
      code: "const t = await page.title(); console.log('TITLE:', t); return t.length;",
      timeout: 60_000,
    })) as InteractResult;
    expect(String(interact.output).includes("TITLE:"), "console output captured");
    expect((interact.returnValue ?? -1) > 0, "return value captured");

    // ── browser_close ────────────────────────────────────────────
    console.log("[test] browser_close…");
    const closed = (await tools.browser_close.execute({})) as CloseResult;
    expect(closed.closed === true, "session closed");

    console.log("\n[test] ✅ ALL CHECKS PASSED");
  } finally {
    console.log("[test] Cleaning up tool config + sandbox…");
    await db.delete(toolConfigs).where(eq(toolConfigs.toolId, "playwright")).run();
    fs.rmSync(path.join(SESSION_FILES_DIR, String(CONVERSATION_ID)), {
      recursive: true,
      force: true,
    });
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[test] ❌ FAILED:", err);
    process.exit(1);
  });
