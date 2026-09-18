// Browser regression coverage. Run after npm run playwright:install:
// node scripts/test-question-panel.mjs
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "node:http";
import { build } from "esbuild";
import { chromium } from "playwright";

const root = path.resolve(".");
const directory = await mkdtemp(path.join(tmpdir(), "remi-question-panel-"));
let browser;
let server;
try {
  const entry = path.join(directory, "entry.tsx");
  await writeFile(entry, `
    import React from ${JSON.stringify(path.join(root, "node_modules/react/index.js"))};
    import { createRoot } from ${JSON.stringify(path.join(root, "node_modules/react-dom/client.js"))};
    import { ActiveQuestionsPanel } from ${JSON.stringify(path.join(root, "components/chat/ActiveQuestionsPanel.tsx"))};
    const data = { type: "questions", title: "Setup", count: 3, questions: [
      { id: "single", question: "Choose", options: ["A", "B"], allowCustom: true, type: "single_select" },
      { id: "multi", question: "Features", options: ["one", "two"], allowCustom: true, type: "multi_select" },
      { id: "text", question: "Details", options: [], allowCustom: true, type: "free_text" },
    ], instruction: "Answer" };
    window.submissions = [];
    window.failNext = false;
    const root = createRoot(document.getElementById("root"));
    window.mount = () => root.render(<ActiveQuestionsPanel key={Math.random()} data={data} toolCallId="call-1" onSubmit={async (submission) => {
      window.submissions.push(submission);
      await new Promise((resolve) => setTimeout(resolve, 120));
      if (window.failNext) { window.failNext = false; throw new Error("Network failed; retry"); }
    }} />);
    window.mount();
  `);
  await build({ entryPoints: [entry], outfile: path.join(directory, "bundle.js"), bundle: true, platform: "browser", nodePaths: [path.join(root, "node_modules")], jsx: "automatic", tsconfig: path.join(root, "tsconfig.json"), define: { "process.env.NODE_ENV": '"development"' } });
  server = createServer(async (request, response) => {
    if (request.url === "/bundle.js") {
      response.setHeader("content-type", "text/javascript");
      response.end(await readFile(path.join(directory, "bundle.js")));
    } else response.end('<html><body><div id="root"></div><script src="/bundle.js"></script></body></html>');
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const next = () => page.getByRole("button", { name: "Next", exact: true });
  const send = () => page.getByRole("button", { name: "Send", exact: true });
  const skip = () => page.getByRole("button", { name: "Skip", exact: true });
  await next().waitFor();
  assert.equal(await next().isDisabled(), true);
  await page.getByRole("button", { name: /^1\s*A$/ }).click();
  assert.equal(await page.getByText("Choose", { exact: true }).isVisible(), true);
  await next().click();
  await page.getByRole("button", { name: "one", exact: true }).click();
  await page.getByRole("button", { name: "two", exact: true }).click();
  await page.getByPlaceholder("Other…").fill("Custom feature");
  await page.getByRole("button", { name: "Previous question", exact: true }).click();
  assert.equal(await next().isEnabled(), true);
  await next().click();
  await next().click();
  await page.getByPlaceholder("Type your answer...").fill("Free answer");
  await page.evaluate(() => { window.failNext = true; });
  await send().click();
  await page.getByRole("alert").waitFor();
  assert.match(await page.getByRole("alert").textContent(), /Network failed/);
  assert.equal(await page.getByPlaceholder("Type your answer...").inputValue(), "Free answer");
  await send().click();
  await page.getByText("Answers submitted", { exact: true }).waitFor();
  const submissions = await page.evaluate(() => window.submissions);
  assert.equal(submissions.length, 2);
  assert.equal(submissions[0].submissionId, submissions[1].submissionId);
  assert.deepEqual(submissions[1].answers, [
    { questionId: "single", value: "A" }, { questionId: "multi", value: ["one", "two"], custom: "Custom feature" }, { questionId: "text", custom: "Free answer" },
  ]);
  console.log("✓ explicit Next, last-question Send, retained answers, and idempotent retry");

  await page.evaluate(() => window.mount());
  await skip().click();
  await skip().click();
  await skip().click();
  await page.getByText("Answers submitted", { exact: true }).waitFor();
  assert.deepEqual(await page.evaluate(() => window.submissions.at(-1).answers), [
    { questionId: "single", skipped: true }, { questionId: "multi", skipped: true }, { questionId: "text", skipped: true },
  ]);
  console.log("✓ every question can be explicitly skipped, including final submission");
  assert.deepEqual(errors, []);
  console.log("✅ Question panel browser tests passed.");
} finally {
  await browser?.close();
  if (server) await new Promise((resolve) => server.close(resolve));
  await rm(directory, { recursive: true, force: true });
}
