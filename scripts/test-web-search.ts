import assert from "node:assert/strict";
import { buildWebSearchTool } from "../lib/tools/web-search";
import { buildIntegrationTools } from "../lib/tools/integrations";

const originalFetch = globalThis.fetch;

async function main() {
  delete process.env.SEARXNG;

  const integrationTools = await buildIntegrationTools();
  assert.equal(typeof integrationTools.web_search, "object");
  assert.equal(typeof integrationTools.web_search.execute, "function");
  assert.equal("description" in integrationTools, false);
  assert.equal("inputSchema" in integrationTools, false);
  assert.equal("execute" in integrationTools, false);

  const calls: string[] = [];
  globalThis.fetch = (async (input: string | URL) => {
    const url = String(input);
    calls.push(url);
    if (url.startsWith("http://127.0.0.1:3105")) {
      return new Response(JSON.stringify({
        results: [{
          title: "SearX result",
          url: "https://example.com/searx",
          content: "From SearXNG",
        }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    throw new Error(`Unexpected request: ${url}`);
  }) as typeof fetch;

  const search = buildWebSearchTool({ braveApiKey: "brave-key" });
  const result = await search.execute({ query: "test", count: 1, category: "general" }) as {
    provider: string;
    results: Array<{ url: string }>;
  };
  assert.equal(result.provider, "searxng");
  assert.equal(result.results[0].url, "https://example.com/searx");
  assert.equal(calls.length, 1);

  calls.length = 0;
  globalThis.fetch = (async (input: string | URL) => {
    const url = String(input);
    calls.push(url);
    if (url.startsWith("http://127.0.0.1:3105")) {
      return new Response("unavailable", { status: 503 });
    }
    if (url.includes("api.search.brave.com/res/v1/web/search")) {
      return new Response(JSON.stringify({
        web: { results: [{ title: "Brave result", url: "https://example.com/brave", description: "From Brave" }] },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    throw new Error(`Unexpected request: ${url}`);
  }) as typeof fetch;

  const fallback = await search.execute({ query: "fallback", count: 1, category: "general" }) as {
    provider: string;
    fallback: boolean;
    results: Array<{ url: string }>;
  };
  assert.equal(fallback.provider, "brave");
  assert.equal(fallback.fallback, true);
  assert.equal(fallback.results[0].url, "https://example.com/brave");
  assert.equal(calls.length, 2);
  assert.match(calls[0], /127\.0\.0\.1:3105/);
  assert.match(calls[1], /api\.search\.brave\.com/);

  process.env.SEARXNG = "false";
  calls.length = 0;
  const disabled = await search.execute({ query: "disabled", count: 1, category: "general" }) as {
    provider: string | null;
    results: Array<{ url: string }>;
  };
  assert.equal(disabled.provider, "brave");
  assert.equal(calls.length, 1);
  assert.match(calls[0], /api\.search\.brave\.com/);
  delete process.env.SEARXNG;

  globalThis.fetch = originalFetch;
  console.log("\nAll unified web search fallback tests passed.");
}

main().catch((error) => {
  globalThis.fetch = originalFetch;
  console.error("\nUnified web search test failed:", error);
  process.exit(1);
});
