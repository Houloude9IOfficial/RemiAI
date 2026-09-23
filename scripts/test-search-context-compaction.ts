import assert from "node:assert/strict";
import type { UIMessage } from "ai";
import {
  optimizeMessageHistory,
  searchEvidenceSummary,
} from "../lib/chat/history-optimizer";

const results = Array.from({ length: 7 }, (_, index) => ({
  title: `Result ${index + 1}`,
  url: `https://example.com/${index + 1}`,
  description: `Detailed result ${index + 1}: ${"x".repeat(500)}`,
  source: "example.com",
}));

const rawOutput = {
  type: "web_search",
  query: "search context compaction",
  category: "general",
  provider: "searxng",
  count: results.length,
  results,
  sources: results.map((result, index) => ({
    id: index + 1,
    url: result.url,
    title: result.title,
    status: "partial",
  })),
};

const message: UIMessage = {
  id: "search-answer",
  role: "assistant",
  parts: [
    { type: "tool-web_search", toolCallId: "search-1", input: { query: rawOutput.query }, output: rawOutput } as never,
    { type: "text", text: "The relevant finding is [Result 7](https://example.com/7)." },
  ],
};

const optimized = optimizeMessageHistory([message]);
const compactedPart = optimized[0].parts[0] as unknown as { output: Record<string, unknown> };
const compacted = compactedPart.output;
const retained = compacted.results as Array<{ title: string; description?: string }>;

assert.equal(compacted._compacted, true);
assert.match(String(compacted._note), /rerun the search/i);
assert.equal(retained.length, 5);
assert.equal(retained[0].title, "Result 7", "cited source is retained before ranked fallback results");
assert.ok((retained[0].description?.length ?? 0) <= 320);
assert.equal((compacted.sources as unknown[]).length, 5);

// The optimizer must never mutate the persisted/UI shape.
assert.equal(rawOutput.results.length, 7);
assert.equal(rawOutput.results[6].description.length, 519);

const fallbackMessage: UIMessage = {
  ...message,
  parts: [
    { type: "tool-web_search", toolCallId: "search-2", input: { query: rawOutput.query }, output: rawOutput } as never,
    { type: "text", text: "Here is the concise answer without links." },
  ],
};
const fallback = optimizeMessageHistory([fallbackMessage]);
const fallbackOutput = (fallback[0].parts[0] as unknown as { output: { results: Array<{ title: string }> } }).output;
assert.deepEqual(fallbackOutput.results.map((result) => result.title), [
  "Result 1", "Result 2", "Result 3", "Result 4", "Result 5",
]);

const evidence = searchEvidenceSummary(rawOutput);
assert.match(evidence, /search context compaction/);
assert.match(evidence, /Result 1/);
assert.match(evidence, /Result 5/);
assert.doesNotMatch(evidence, /Result 6/);

console.log("\n✅ Search context compaction tests passed.");
