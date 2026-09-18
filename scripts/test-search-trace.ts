import assert from "node:assert/strict";
import { extractSearchTrace, isSearchTraceToolPart } from "../lib/chat/search-trace";

const parts = [
  {
    type: "tool-web_search",
    input: { query: "RemiAI" },
    output: {
      result: {
        results: [
          { title: "RemiAI", url: "https://www.example.com/remiai" },
          { title: "Duplicate", url: "https://www.example.com/remiai/#details" },
          { title: "Docs", url: "https://docs.example.com/guide" },
        ],
      },
    },
  },
  { type: "tool-web_fetch", input: { url: "https://docs.example.com/guide" }, output: {} },
  { type: "tool-fc_scrape", input: { url: "https://blog.example.com/post" }, output: {} },
  {
    type: "tool-fc_crawl",
    output: { sources: [{ url: "https://crawl.example.com/root", title: "Crawl root" }] },
  },
  { type: "tool-read_file", input: { path: "README.md" }, output: {} },
  { type: "tool-web_search", input: { query: "empty" }, output: { results: "not-an-array" } },
];

const trace = extractSearchTrace(parts);
assert.equal(trace.length, 4);
assert.deepEqual(
  trace.map((entry) => [entry.title, entry.domain, entry.action, entry.query]),
  [
    ["RemiAI", "example.com", "result", "RemiAI"],
    ["Docs", "docs.example.com", "result", "RemiAI"],
    ["blog.example.com", "blog.example.com", "opened", undefined],
    ["Crawl root", "crawl.example.com", "opened", undefined],
  ],
);
assert.equal(isSearchTraceToolPart(parts[0]), true);
assert.equal(isSearchTraceToolPart(parts[4]), false);

console.log("\n✅ All search trace tests passed.");
