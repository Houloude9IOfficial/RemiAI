/**
 * Regression tests for lib/chat/error-payload.ts.
 *
 * Covers the "server doesn't send the actual provider error" bug: the
 * normalized payload must carry the provider's REAL message (`detail`) and
 * the actual response body (`rawBody`), and the display path must show that
 * real message instead of the generic category text produced by keyword
 * detection.
 *
 * Run with: `npm test` (npx tsx scripts/test-error-payload.ts)
 */
import assert from "node:assert/strict";
import {
  normalizeStreamError,
  encodeStreamError,
  decodeStreamError,
  errorToDisplayMessage,
  type StreamErrorPayload,
} from "../lib/chat/error-payload";

let passed = 0;
function ok(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

async function main() {
  console.log("\nnormalizeStreamError — carries the provider's actual error");

  // 1. OpenAI-style: `{"error":{"message":"...","type":"...","code":"..."}}`
  ok("extracts OpenAI error.message into detail", () => {
    const payload = normalizeStreamError({
      name: "AI_APICallError",
      message: "[POST https://api.openai.com/v1/chat/completions] [429] 429",
      statusCode: 429,
      url: "https://api.openai.com/v1/chat/completions",
      responseBody: JSON.stringify({
        error: {
          message: "You are sending requests too quickly. Please pace your requests.",
          type: "rate_limit_exceeded",
          code: "rate_limit_exceeded",
        },
      }),
      isRetryable: false,
    });

    assert.equal(
      payload.detail,
      "You are sending requests too quickly. Please pace your requests.",
    );
    assert.ok(payload.rawBody?.includes("rate_limit_exceeded"));
    assert.equal(payload.statusCode, 429);
    assert.equal(payload.providerCode, "rate_limit_exceeded");
    assert.equal(payload.category, "rate_limit");
    // The friendly message is only a fallback — the real one is in `detail`.
    assert.notEqual(payload.message, payload.detail);
    assert.equal(payload.retryable, true);
  });

  // 2. Anthropic-style: `{"type":"error","error":{"type":"rate_limit_error","message":"..."}}`
  ok("extracts Anthropic error.message into detail", () => {
    const payload = normalizeStreamError({
      name: "AI_APICallError",
      message: "[POST https://api.anthropic.com/v1/messages] [529] 529",
      statusCode: 529,
      responseBody: JSON.stringify({
        type: "error",
        error: {
          type: "overloaded_error",
          message: "Overloaded: the server is experiencing high load.",
        },
      }),
    });

    assert.equal(payload.detail, "Overloaded: the server is experiencing high load.");
    assert.equal(payload.providerCode, "overloaded_error");
  });

  // 3. Mistral-style: `{"object":"error","message":"...","type":"..."}`
  ok("extracts Mistral top-level message into detail", () => {
    const payload = normalizeStreamError({
      name: "AI_APICallError",
      message: "[POST https://api.mistral.ai/v1/chat/completions] [401] 401",
      statusCode: 401,
      responseBody: JSON.stringify({
        object: "error",
        message: "Incorrect API key provided.",
        type: "authentication_error",
      }),
    });

    assert.equal(payload.detail, "Incorrect API key provided.");
    assert.equal(payload.category, "auth");
    assert.equal(payload.retryable, false);
  });

  // 4. No response body — fall back to the cleaned top-level message.
  ok("falls back to the cleaned top-level message", () => {
    const payload = normalizeStreamError({
      name: "AI_APICallError",
      message: "[POST https://api.example.com/v1/chat/completions] [500] Internal server error",
      statusCode: 500,
    });

    assert.equal(payload.detail, "Internal server error");
    assert.equal(payload.category, "provider");
  });

  // 5. Nested retry errors (AI_RetryError style) — message from errors[].
  ok("pulls detail from nested retry errors", () => {
    const payload = normalizeStreamError({
      name: "AI_RetryError",
      message: "Retry failed",
      errors: [
        {
          name: "AI_APICallError",
          message: "[POST https://api.example.com] [503] upstream unavailable",
          statusCode: 503,
        },
      ],
    });

    assert.ok(payload.detail);
    assert.equal(payload.statusCode, 503);
  });

  // 6. A plain message with no envelope is used as-is.
  ok("uses a plain message as the detail", () => {
    const payload = normalizeStreamError(new Error("Connection lost"));
    assert.equal(payload.detail, "Connection lost");
  });

  // 7. The SDK can ship the error ALREADY JSON-serialized (the exact shape
  //    seen in the wild: a stringified AI_RetryError around an ECONNREFUSED
  //    AI_APICallError). The real message must still be extracted instead of
  //    falling back to the generic "connection dropped" text.
  ok("digs the real message out of a serialized AI_RetryError string", () => {
    const serialized = JSON.stringify({
      error: {
        name: "AI_RetryError",
        reason: "maxRetriesExceeded",
        errors: [
          {
            name: "AI_APICallError",
            cause: { code: "ECONNREFUSED" },
            url: "http://localhost:11434/v1/chat/completions",
            requestBodyValues: { model: "ornith:9b", max_tokens: 4096 },
          },
        ],
      },
    });

    const payload = normalizeStreamError(serialized);
    assert.equal(
      payload.detail,
      "Failed to connect to http://localhost:11434/v1/chat/completions (ECONNREFUSED)",
    );
    assert.equal(payload.category, "network");
    assert.equal(payload.statusCode, undefined);
    // The serialized blob stays in `technical` for debugging.
    assert.ok(payload.technical?.includes("AI_RetryError"));

    // And the display path surfaces it.
    const displayed = errorToDisplayMessage(new Error(encodeStreamError(payload)));
    assert.equal(
      displayed.message,
      "Failed to connect to http://localhost:11434/v1/chat/completions (ECONNREFUSED)",
    );
  });

  // 8b. A LIVE AI_RetryError instance (the screenshot case) whose message is
  //     the noisy "Failed after N attempts…" wrapper — the deepest cause
  //     (cause.code + url) must win, and it must classify as a network error.
  ok("live retry error: deepest cause beats the wrapper message", () => {
    const apiCallErr = new Error("Cannot connect to API: ");
    Object.assign(apiCallErr, {
      name: "AI_APICallError",
      url: "http://localhost:11434/v1/chat/completions",
      cause: { code: "ECONNREFUSED" },
    });
    const retryErr = new Error(
      "Failed after 4 attempts. Last error: AI_APIcallError: Cannot connect to API: ",
    );
    Object.assign(retryErr, {
      name: "AI_RetryError",
      errors: [apiCallErr],
      retryable: true,
      shouldResume: true,
    });

    const payload = normalizeStreamError(retryErr);
    assert.equal(
      payload.detail,
      "Failed to connect to http://localhost:11434/v1/chat/completions (ECONNREFUSED)",
    );
    assert.equal(payload.category, "network");
    assert.equal(payload.title, "Connection interrupted");
    assert.equal(payload.retryable, true);
    assert.equal(payload.shouldResume, true);
  });

  // 8. A serialized error that carries a real `message` field prefers it.
  ok("prefers a message field inside a serialized error", () => {
    // No cause/url here — the real message field must be dug out on its own.
    const serialized = JSON.stringify({
      error: {
        name: "AI_APICallError",
        message: "Cannot connect to API: connect ECONNREFUSED 127.0.0.1:11434",
      },
    });
    const payload = normalizeStreamError(serialized);
    assert.equal(
      payload.detail,
      "Cannot connect to API: connect ECONNREFUSED 127.0.0.1:11434",
    );
  });

  console.log("\nerrorToDisplayMessage / encode-decode — real message wins");

  // 7. The display path shows `detail`, not the generic category message.
  ok("errorToDisplayMessage prefers detail over the friendly message", () => {
    const payload: StreamErrorPayload = normalizeStreamError({
      name: "AI_APICallError",
      message: "[POST https://api.example.com] [500] boom",
      statusCode: 500,
      responseBody: JSON.stringify({ error: { message: "The real provider message" } }),
    });
    const encoded = encodeStreamError(payload);
    const decoded = decodeStreamError(encoded);
    assert.ok(decoded);
    assert.equal(decoded!.detail, "The real provider message");

    const displayed = errorToDisplayMessage(new Error(encoded));
    assert.equal(displayed.message, "The real provider message");
    assert.notEqual(displayed.message, payload.message);
    assert.equal(displayed.retryable, true);
    assert.equal(displayed.shouldResume, true);
  });

  // 9. With no real message at all, the friendly category message is the fallback.
  ok("falls back to the friendly message when no detail exists", () => {
    const payload = normalizeStreamError({ statusCode: 520 });
    assert.equal(payload.detail, undefined);
    const displayed = errorToDisplayMessage(new Error(encodeStreamError(payload)));
    assert.equal(displayed.message, payload.message);
  });

  // 9. decodeStreamError round-trips the new fields.
  ok("encode/decode round-trips detail and rawBody", () => {
    const payload: StreamErrorPayload = {
      version: 1,
      category: "provider",
      title: "Provider service error",
      message: "friendly",
      detail: "real detail",
      rawBody: '{"error":{"message":"real detail"}}',
      technical: "status=500",
      statusCode: 500,
      retryable: true,
      shouldResume: true,
    };
    const decoded = decodeStreamError(encodeStreamError(payload));
    assert.deepEqual(decoded, payload);
  });

  console.log(`\n✅ All ${passed} error-payload tests passed.`);
}

main().catch((err) => {
  console.error("\n❌ Test run failed:", err);
  process.exit(1);
});
