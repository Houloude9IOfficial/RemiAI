// Run after npm run build. Uses a disposable app database and a mock model.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";

const directory = await mkdtemp(path.join(await realpath(tmpdir()), "remi-visual-browser-"));
const portProbe = createServer();
await new Promise((resolve) => portProbe.listen(0, "127.0.0.1", resolve));
const port = portProbe.address().port;
await new Promise((resolve) => portProbe.close(resolve));
const url = `http://127.0.0.1:${port}`;
const prompt = "Create an interactive API Usage Dashboard calculator with adjustable values and a chart.";
const fixtures = {
  version: 1,
  controls: [
    { id: "query", type: "text", label: "Filter plans", initial: "" },
    { id: "quantity", type: "number", label: "Quantity", initial: 2, min: 0, max: 10, step: 1 },
    { id: "plan", type: "select", label: "Plan", initial: "Basic",
      options: [{ label: "Basic", value: "Basic" }, { label: "Pro", value: "Pro" }] },
  ],
  calculations: [{ id: "result", op: "multiply", a: "quantity", b: 5 }],
  blocks: [
    { type: "controls", ids: ["query", "quantity", "plan"] },
    { type: "metrics", items: [{ title: "Amount", value: "result" }] },
    { type: "table", title: "Compare plans", columns: ["Plan", "Price"], rows: [["Basic", "5"], ["Pro", "10"]],
      filter: { source: "query", column: 0, mode: "contains" } },
    { type: "cards", items: [{ title: "Current plan", description: "{plan}", icon: "dashboard" }] },
    { type: "steps", items: [{ title: "First", icon: "message" }, { title: "Second", icon: "cursor" }] },
    { type: "text", title: "Specification", lines: ["Selected {plan}"], copyLabel: "Copy specification" },
    { type: "chart", chart: "line", title: "Trend", points: [{ label: "January", y: 2 }, { label: "February", y: "result" }] },
    { type: "chart", chart: "scatter", title: "Scatter", points: [{ label: "Sample", x: 5, y: 8 }, { label: "Another", x: 11, y: 3 }] },
    { type: "chart", chart: "pie", title: "Breakdown", points: [{ label: "Basic", y: 2 }, { label: "Pro", y: 5 }] },
    { type: "map", title: "Places", places: [
      { label: "Nicosia", latitude: 35.17, longitude: 33.36 }, { label: "Limassol", latitude: 34.68, longitude: 33.04 },
    ] },
    { type: "media", title: "Gallery", items: [
      { kind: "image", label: "Example image", url: "https://example.com/fail.png" },
      { kind: "video", label: "Example video", url: "https://example.com/fail.mp4" },
    ] },
  ],
};
const canvasPrompt = "/canvas create a simple test website";
let canvasStage = 0;
let generated = false;
let createVisualExposed = false;
const mock = createServer(async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ data: [{ id: "mock", object: "model" }] }));
    return;
  }
  let raw = "";
  for await (const chunk of req) raw += chunk;
  const body = JSON.parse(raw);
  const sendTools = !generated && body.messages.some((message) => message.role === "user" &&
    JSON.stringify(message.content).includes(prompt)) &&
    body.tools?.some((tool) => tool.function?.name === "create_visual");
  res.writeHead(200, { "content-type": "text/event-stream" });
  const emit = (delta, reason = null) => res.write(`data: ${JSON.stringify({
    id: "mock-completion", object: "chat.completion.chunk", created: 1, model: "mock",
    choices: [{ index: 0, delta, finish_reason: reason }],
  })}\n\n`);
  if (sendTools) {
    generated = true;
    createVisualExposed = true;
    emit({ role: "assistant", content: "Here is the interactive dashboard.\n\n" });
    const outputs = [
      { type: "interactive", title: "API Usage Dashboard", preset: "api_usage" },
      { type: "interactive", title: "Second dashboard", preset: "api_usage" },
      { type: "interactive", title: "Widget examples", spec: fixtures },
      { type: "bar", title: "Legacy bar", data: [{ label: "One", value: 1 }] },
    ];
    emit({ tool_calls: outputs.map((output, index) => ({
      index, id: `visual-test-${index}`, type: "function",
      function: { name: "create_visual", arguments: JSON.stringify(output) },
    })) });
    emit({}, "tool_calls");
  } else if (body.messages.some((message) => message.role === "user" && JSON.stringify(message.content).includes(canvasPrompt))) {
    const tool = canvasStage === 0 ? "canvas_create" : "canvas_open";
    if (canvasStage < 2 && body.tools?.some((entry) => entry.function?.name === tool)) {
      const args = canvasStage === 0 ? { name: "Canvas regression" } : { slug: "canvas-regression" };
      canvasStage += 1;
      emit({ role: "assistant", tool_calls: [{ index: 0, id: `canvas-test-${canvasStage}`, type: "function",
        function: { name: tool, arguments: JSON.stringify(args) } }] });
      emit({}, "tool_calls");
    } else {
      emit({ role: "assistant", content: "Canvas ready." });
      emit({}, "stop");
    }
  } else {
    emit({ role: "assistant", content: "Dashboard ready." });
    emit({}, "stop");
  }
  res.end("data: [DONE]\n\n");
});
await new Promise((resolve) => mock.listen(0, "127.0.0.1", resolve));

const env = { ...process.env, REMI_DATA_DIR: directory, DEMO: "false", NODE_ENV: "production" };
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], { env });
let logs = "";
server.stdout.on("data", (chunk) => { logs += chunk; });
server.stderr.on("data", (chunk) => { logs += chunk; });

let browser;
try {
  const deadline = Date.now() + 45_000;
  while (!logs.includes("✓ Ready")) {
    assert.ok(server.exitCode === null && Date.now() < deadline, logs);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: ["clipboard-read", "clipboard-write"] });
  const request = context.request;
  assert.ok((await request.get(`${url}/api/auth/status`)).ok());
  const code = logs.match(/signup code: ([A-F0-9]+)/)[1];
  const signup = await request.post(`${url}/api/auth/signup`, { data: {
    email: "visuals@example.com", password: "visual-test-password", displayName: "Visual test", code,
  } });
  assert.ok(signup.ok(), await signup.text());

  // Seed only provider and conversation metadata. The actual chat route writes
  // the messages and the UI renders the streamed and reopened tool results.
  const { default: Database } = await import("better-sqlite3");
  const sqlite = new Database(path.join(directory, "remiai.sqlite"));
  const providerId = sqlite.prepare("INSERT INTO providers (kind, label, base_url, api_key, is_preset) VALUES (?, ?, ?, ?, 0) RETURNING id")
    .get("openai-compatible", "Visual mock", `http://127.0.0.1:${mock.address().port}/v1`, "test").id;
  const conversationId = sqlite.prepare("INSERT INTO conversations (title, provider_id, model_id, memory_enabled) VALUES (?, ?, ?, 1) RETURNING id")
    .get("Visual browser test", providerId, "mock").id;
  sqlite.close();

  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // Third-party resources are stubbed to keep the test deterministic and offline.
  await page.route("https://example.com/**", (route) => route.fulfill({ status: 404 }));
  await page.route("https://www.openstreetmap.org/**", (route) => route.fulfill({ contentType: "text/html", body: "<p>Map fixture</p>" }));
  await page.goto(`${url}/chat/${conversationId}`);
  const composer = page.locator("textarea").first();
  await composer.fill(prompt);
  await page.getByRole("button", { name: "Send message" }).click();

  const dashboard = page.getByRole("region", { name: "API Usage Dashboard", exact: true });
  const second = page.getByRole("region", { name: "Second dashboard" });
  await dashboard.getByText("3,500", { exact: true }).waitFor({ timeout: 45_000 });
  assert.ok(createVisualExposed);
  await dashboard.getByText("14.6m", { exact: true }).waitFor();
  await dashboard.getByRole("button", { name: "30 days" }).click();
  await dashboard.getByText("15,000", { exact: true }).waitFor();
  await dashboard.getByText("62.5m", { exact: true }).waitFor();
  await second.getByText("3,500", { exact: true }).waitFor();

  await dashboard.getByRole("slider", { name: "Requests per day" }).press("ArrowRight");
  await dashboard.getByText("15,750", { exact: true }).waitFor();
  await dashboard.getByRole("slider", { name: "Average execution duration" }).press("ArrowRight");
  await dashboard.getByText("72.2m", { exact: true }).waitFor();
  await dashboard.getByRole("checkbox", { name: "Show calculation details" }).uncheck();
  await dashboard.getByText(/^Runtime:/).waitFor({ state: "detached" });
  await dashboard.getByRole("checkbox", { name: "Show calculation details" }).press("Space");
  await dashboard.getByText(/^Runtime:/).waitFor();

  await dashboard.getByRole("button", { name: "Copy results" }).click();
  assert.match(await page.evaluate(() => navigator.clipboard.readText()), /Total requests: 15,750/);

  const widgets = page.getByRole("region", { name: "Widget examples" });
  await widgets.getByRole("textbox", { name: "Filter plans" }).fill("pro");
  assert.equal(await widgets.getByRole("cell", { name: "Basic" }).count(), 0);
  await widgets.getByRole("cell", { name: "Pro" }).waitFor();
  await widgets.getByRole("spinbutton", { name: "Quantity" }).fill("3");
  await widgets.getByRole("definition").filter({ hasText: /^15$/ }).waitFor();
  await widgets.getByRole("combobox", { name: "Plan", exact: true }).selectOption("1");
  await widgets.getByText("Selected Pro", { exact: true }).waitFor();
  await widgets.getByText("Second", { exact: true }).waitFor();
  await widgets.getByRole("button", { name: "Copy specification" }).press("Tab");
  await widgets.getByText("January · 2", { exact: true }).waitFor();
  assert.equal(await widgets.getByRole("img", { name: "January: 2" }).evaluate((el) => el.matches(":focus-visible")), true);
  await widgets.getByRole("img", { name: "Sample: 5, 8" }).hover();
  await widgets.getByText("Sample · 5, 8", { exact: true }).waitFor();
  await widgets.getByRole("img", { name: "Basic: 2" }).waitFor();
  await widgets.getByRole("combobox", { name: "Place" }).selectOption("1");
  assert.match(await widgets.locator("iframe").getAttribute("src"), /marker=34\.68%2C33\.04/);
  await widgets.getByText("Failed to load media: Example image", { exact: true }).waitFor();
  await widgets.getByText("Failed to load media: Example video", { exact: true }).waitFor();
  await page.getByText("Legacy bar", { exact: true }).waitFor();
  await page.getByText("Dashboard ready.", { exact: true }).waitFor();

  await page.reload();
  await dashboard.getByText("3,500", { exact: true }).waitFor();
  assert.ok(await dashboard.getByRole("checkbox", { name: "Show calculation details" }).isChecked());
  assert.equal(await widgets.getByRole("textbox", { name: "Filter plans" }).inputValue(), "");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  const detailsToggle = dashboard.getByRole("checkbox", { name: "Show calculation details" });
  assert.equal(await detailsToggle.evaluate((element) => getComputedStyle(element).transitionProperty), "none");
  await detailsToggle.uncheck();
  await dashboard.getByText(/^Runtime:/).waitFor({ state: "detached" });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  for (const theme of ["light", "dark"]) {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.evaluate((name) => localStorage.setItem("theme", name), theme);
    await page.reload();
    await dashboard.getByText("3,500", { exact: true }).waitFor();
    const box = await dashboard.boundingBox();
    assert.ok(box && box.x >= 0 && box.x + box.width <= 376, JSON.stringify(box));
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains("dark")), theme === "dark");
    if (process.env.VISUAL_TEST_SCREENSHOTS) {
      await dashboard.screenshot({ path: path.join(process.env.VISUAL_TEST_SCREENSHOTS, `remiai-dashboard-${theme}.png`) });
    }
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await composer.fill(canvasPrompt);
  await page.getByRole("button", { name: "Send message" }).click();
  await page.getByText("Canvas ready.", { exact: true }).waitFor({ timeout: 12_000 });
  assert.equal(canvasStage, 2);
  await page.getByRole("button", { name: /^(Open|Reopen) canvas$/ }).waitFor();
  const canvasEntry = await readFile(path.join(directory, "session-files", String(conversationId), "canvas", "canvas-regression", "index.html"), "utf8");
  assert.match(canvasEntry, /<title>Canvas regression<\/title>/);
  assert.deepEqual(errors, []);
  console.log("Interactive visual chat browser checks passed.");
} catch (error) {
  console.error(logs.replace(/signup code: [A-F0-9]+/g, "signup code: [test code]"));
  throw error;
} finally {
  await browser?.close();
  if (server.exitCode === null) {
    server.kill();
    await new Promise((resolve) => server.once("exit", resolve));
  }
  mock.closeAllConnections();
  await new Promise((resolve) => mock.close(resolve));
  await rm(directory, { recursive: true, force: true });
}
