import assert from "node:assert/strict";
import { normalizeVisualSvg } from "../lib/chat/visual-svg";
import { createVisualTool } from "../lib/tools/create-visual";

async function main() {
  const chart = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 400"><g><text>Release chart</text></g>';
  assert.equal(normalizeVisualSvg(chart), chart + "</svg>");
  assert.equal(normalizeVisualSvg(chart + "</svg>"), chart + "</svg>");
  assert.match(normalizeVisualSvg('<rect width="10" height="10"/>') ?? "", /^<svg xmlns=/);
  assert.match(normalizeVisualSvg('<svg viewBox="0 0 10 10"/>') ?? "", /xmlns="http:\/\/www.w3.org\/2000\/svg"/);
  assert.equal(normalizeVisualSvg('<svg><g>unfinished'), null);
  assert.equal(normalizeVisualSvg('<svg><g></svg>'), null);
  assert.match(normalizeVisualSvg('<svg><text>A & B</text></svg>') ?? "", /A &amp; B/);
  assert.equal(normalizeVisualSvg('<!DOCTYPE svg><svg/>'), null);
  assert.equal(normalizeVisualSvg('plain text'), null);

  const large = '<svg><text>' + '"'.repeat(30_000) + '</text></svg>';
  const result = await createVisualTool.execute({ type: "svg", title: "Large chart", content: large });
  assert.ok("content" in result && result.content?.endsWith("</svg>"));
  assert.equal(normalizeVisualSvg(result.content!), result.content);
  const invalid = await createVisualTool.execute({ type: "svg", title: "Broken chart", content: "<svg><g>" });
  assert.ok("error" in invalid);
  assert.match(invalid.error, /Retry with a complete/);
  console.log("✅ SVG recovery, validation and intact visual output passed.");
}

void main();
