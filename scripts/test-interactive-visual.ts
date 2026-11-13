import assert from "node:assert/strict";
import { apiUsageVisual } from "../lib/chat/api-usage-visual";
import {
  calculateVisualValues, initialVisualValues, isInteractiveMediaUrl, parseInteractiveVisual,
  resolveVisualPoints, resolveVisualText, visualConditionMatches, type InteractiveVisualSpec,
} from "../lib/chat/interactive-visual";
import { classifyToolGroups } from "../lib/chat/tool-groups";

const decoded = parseInteractiveVisual(JSON.parse(JSON.stringify(apiUsageVisual)));
assert.ok("spec" in decoded);
const { spec } = decoded;
for (const [days, daily, duration, total, minutes] of [[7, 500, 250, 3500, 14.6], [30, 500, 250, 15000, 62.5], [30, 2000, 1000, 60000, 1000]]) {
  const values = calculateVisualValues(spec, new Map(initialVisualValues(spec)).set("days", days).set("daily", daily).set("duration", duration));
  assert.equal(values.get("requests"), total);
  assert.equal(Number(Number(values.get("minutes")).toFixed(1)), minutes);
  const [chart] = spec.blocks.filter((block) => block.type === "chart" && visualConditionMatches(block.when!, values));
  assert.equal(chart.type, "chart");
  const points = resolveVisualPoints(chart, values, (label) => label);
  assert.equal(points?.length, days);
  assert.equal(points?.reduce((sum, point) => sum + point.y, 0), total);
  const copy = spec.blocks.find((block) => block.type === "copy");
  assert.equal(copy?.type, "copy");
  assert.equal(resolveVisualText(copy.lines[3], values, new Map()), `Total requests: ${total.toLocaleString()}`);
}
assert.equal(initialVisualValues(spec).get("days"), 7);

const example: InteractiveVisualSpec = {
  version: 1,
  controls: [{ type: "number", id: "denominator", label: "Denominator", min: 0, max: 10, step: 1, initial: 0 }],
  calculations: [
    { id: "quotient", op: "divide", a: 10, b: "denominator" },
    { id: "rounded", op: "round", a: "quotient", b: 2 },
  ],
  blocks: [{ type: "controls", ids: ["denominator"] }, { type: "text", lines: ["Result {rounded}"] }],
};
assert.ok("spec" in parseInteractiveVisual(example));
const unavailable = calculateVisualValues(example, initialVisualValues(example));
assert.equal(unavailable.get("quotient"), null);
assert.equal(unavailable.get("rounded"), null);
assert.equal(resolveVisualText("Result {rounded}", unavailable, new Map()), "Result Unavailable");
assert.ok("error" in parseInteractiveVisual({ ...example, version: 2 }));
assert.ok("error" in parseInteractiveVisual({ ...example, blocks: [{ type: "controls", ids: ["unknown"] }] }));
assert.ok("error" in parseInteractiveVisual({ ...example, blocks: [...example.blocks, { type: "text", lines: ["{missing}"] }] }));
assert.ok("error" in parseInteractiveVisual({ ...example, calculations: [{ id: "unknown", op: "add", a: "rounded", b: 1 }] }));
assert.ok("error" in parseInteractiveVisual({ ...example, blocks: [...example.blocks, { type: "table", columns: ["A"], rows: [["A", "B"]] }] }));
assert.ok("error" in parseInteractiveVisual({ ...example, blocks: [...example.blocks, { type: "chart", chart: "scatter", points: [{ label: "A", y: 1 }] }] }));
assert.ok("error" in parseInteractiveVisual({ version: 1, blocks: [{ type: "table", columns: ["A"], rows: Array.from({ length: 24 }, () => ["x".repeat(1100)]) }] }));
assert.ok("error" in parseInteractiveVisual({ version: 1, blocks: [{ type: "media", items: [{ kind: "image", label: "Blocked", url: "javascript:alert(1)" }] }] }));

for (const url of ["javascript:alert(1)", "data:image/png;base64,AA", "file:///tmp/test", "//example.com/test", "https://user@example.com/a", "/api/chat/2/session-files/%2e%2e/b", "/api/chat/2/session-files/a%2fb", "/api/auth/status", "/api/chat/2/session-files/image.png"]) {
  assert.equal(isInteractiveMediaUrl(url, 1), false, url);
}
assert.ok(isInteractiveMediaUrl("https://example.com/image.jpg?v=1", 1));
assert.ok(isInteractiveMediaUrl("/api/chat/1/session-files/my%20file.png", 1));
assert.ok(isInteractiveMediaUrl("/api/chat/uploads/1/image.png", 1));
assert.ok(isInteractiveMediaUrl("/api/media/1/media/video.mp4", 1));

for (const prompt of ["Build a calculator", "Create a filterable table", "Show a dashboard", "Make an interactive demo", "Create a media gallery"]) {
  assert.ok(classifyToolGroups(prompt).has("create_visual"), prompt);
}
assert.ok(classifyToolGroups("/canvas build me a calculator").has("canvas"));
console.log("Interactive visual validation, projections, arithmetic, URLs, and tool routing passed.");
