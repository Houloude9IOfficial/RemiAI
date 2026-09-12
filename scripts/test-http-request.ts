import assert from "node:assert/strict";
import { buildHttpRequestTool } from "../lib/tools/http-request";
import { classifyToolGroups } from "../lib/chat/tool-groups";

const originalFetch = globalThis.fetch;
const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  calls.push({ input, init });
  const body = String(input).includes("/long") ? "0123456789" : JSON.stringify({ ok: true });
  return new Response(body, {
    status: 201,
    headers: { "content-type": "application/json", "x-test": "yes" },
  });
}) as typeof fetch;

async function main() {
  const tool = buildHttpRequestTool({ mode: "full" });
  for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"] as const) {
    const result = await tool.execute({ method, url: "http://127.0.0.1/test" }) as Record<string, any>;
    assert.equal(result.status, 201);
    assert.equal(calls.at(-1)?.init?.method, method);
  }

  await tool.execute({
    method: "POST",
    url: "http://127.0.0.1/test",
    headers: { Authorization: "Bearer test" },
    body: { hello: "world" },
  });
  const last = calls.at(-1)?.init;
  assert.equal(last?.body, JSON.stringify({ hello: "world" }));
  assert.equal((last?.headers as Record<string, string>)["Content-Type"], "application/json");
  assert.equal((last?.headers as Record<string, string>).Authorization, "Bearer test");

  const raw = await tool.execute({ method: "POST", url: "http://127.0.0.1/test", body: "raw body" }) as Record<string, any>;
  assert.equal(raw.body, JSON.stringify({ ok: true }));

  const truncated = await tool.execute({ method: "GET", url: "http://127.0.0.1/long", maxChars: 5 }) as Record<string, any>;
  assert.equal(truncated.truncated, true);
  assert.match(truncated.body, /^01234/);

  const blocked = await buildHttpRequestTool({ mode: "sandboxed" }).execute({
    method: "GET",
    url: "http://127.0.0.1/test",
  }) as Record<string, any>;
  assert.match(blocked.error, /private|local|link-local/i);

  const planTool = buildHttpRequestTool({ mode: "full", allowMutations: false });
  const planRead = await planTool.execute({ method: "GET", url: "http://127.0.0.1/test" }) as Record<string, any>;
  assert.equal(planRead.status, 201);
  const planWrite = await planTool.execute({ method: "POST", url: "http://127.0.0.1/test" }) as Record<string, any>;
  assert.match(planWrite.error, /read-only/i);

  assert.ok(classifyToolGroups("POST JSON data to this API").has("http_request"));

  globalThis.fetch = (async () => { throw new Error("connection refused"); }) as typeof fetch;
  const failed = await tool.execute({ method: "GET", url: "http://127.0.0.1/test" }) as Record<string, any>;
  assert.match(failed.error, /connection refused/i);

  console.log("✅ HTTP request tool tests passed");
}

main().finally(() => {
  globalThis.fetch = originalFetch;
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
