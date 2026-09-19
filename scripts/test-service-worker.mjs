/**
 * Regression test for the PWA service worker's cache boundary.
 *
 * POST /api/chat used to enter CacheStorage matching, which can reject
 * non-GET requests and synthesize a 500 before the chat route runs.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const listeners = new Map();
const context = vm.createContext({
  URL,
  Promise,
  console,
  self: {
    addEventListener(type, callback) {
      listeners.set(type, callback);
    },
    skipWaiting() {},
    clients: { claim() {}, matchAll: async () => [] },
    registration: { showNotification: async () => {} },
    location: { origin: "http://127.0.0.1:3456" },
  },
  caches: {
    match: async () => undefined,
    open: async () => ({ addAll: async () => {} }),
    keys: async () => [],
    delete: async () => true,
  },
  fetch: async () => new Response("network"),
  Response,
});

vm.runInContext(fs.readFileSync("public/sw.js", "utf8"), context, {
  filename: "public/sw.js",
});

const onFetch = listeners.get("fetch");
assert.equal(typeof onFetch, "function", "service worker registers fetch handler");

function dispatch(method, pathname, accept = "") {
  let responsePromise;
  onFetch({
    request: {
      method,
      url: `http://127.0.0.1:3456${pathname}`,
      mode: "cors",
      headers: { get: (name) => (name.toLowerCase() === "accept" ? accept : null) },
    },
    respondWith(value) {
      responsePromise = Promise.resolve(value);
    },
  });
  return responsePromise;
}

assert.equal(dispatch("POST", "/api/chat"), undefined, "chat POST bypasses CacheStorage");
assert.equal(dispatch("POST", "/api/chat/start"), undefined, "start POST bypasses CacheStorage");
assert.equal(dispatch("GET", "/api/chat/1/stream/status"), undefined, "chat API GET bypasses CacheStorage");
assert.equal(dispatch("GET", "/_next/static/app.js"), undefined, "Next assets remain browser-owned");
assert.ok(dispatch("GET", "/manifest.json"), "safe static GET is cache-handled");

console.log("✅ Service worker preserves live chat/API traffic and caches only safe static GET requests.");
