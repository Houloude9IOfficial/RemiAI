import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output bundles the server code into a self-contained
  // directory (.next/standalone/) that can be shipped with Electron.
  // In dev mode this flag has no effect.
  output: "standalone",
  // Guarantee the SQLite migration files are copied into the standalone
  // output. db/index.ts runs migrations at runtime (process.cwd() is
  // .next/standalone in the packaged app) and skips them during `next build`,
  // so we can't rely on Turbopack's automatic file tracing alone.
  // (scripts/prune-standalone.mjs — run by `npm run build` — also keeps
  // db/migrations, so this is a belt-and-braces safety net.)
  outputFileTracingIncludes: {
    "/**": [
      "./db/migrations/**",
      // The Browser Automation tool imports `playwright` (traced), but its
      // CLI entry (cli.js) is not imported by the app — the Docker image
      // uses it to install Chromium + system deps for the exact same
      // playwright version at build time.
      "./node_modules/playwright/cli.js",
      // The media tools spawn ffmpeg/ffprobe as subprocesses — the binaries
      // (ffmpeg-static / ffprobe-static) are not traced by Turbopack, so they
      // must be copied explicitly into the standalone output or the packaged
      // app would ship without them.
      "./node_modules/ffmpeg-static/**",
      "./node_modules/ffprobe-static/**",
    ],
  },
  devIndicators: false,
  // Native/heavy modules that must stay require()-able at runtime instead of
  // being bundled by Turbopack: better-sqlite3 (.node binary), and the
  // transcription engine's @huggingface/transformers + onnxruntime-node
  // (native .node binaries + ~200 MB of WASM/JS that would break bundling).
  serverExternalPackages: [
    "better-sqlite3",
    "@huggingface/transformers",
    "onnxruntime-node",
  ],
  // Encrypted backups may contain uploaded files and exceed Next's default
  // 10 MB proxy body limit. The backup route still validates the encrypted
  // payload and requires authentication before restoring anything.
  experimental: {
    proxyClientMaxBodySize: "10000mb",
  },
  turbopack: {
    root: process.cwd(),
  },
  async headers() {
    return [
      // Canvas live preview — served from /api/chat/{id}/session-files/... and
      // rendered inside an in-app <iframe>. The global policy (below) denies
      // framing entirely, so these serving routes relax frame restrictions to
      // same-origin only (the app may embed them; no other site can). Everything
      // else is identical to the global suite (kept inline so no header is lost).
      {
        source: "/api/chat/:conversationId([0-9]+)/session-files/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Content-Security-Policy", value: "default-src 'self'; base-uri 'self'; frame-ancestors 'self'; form-action 'self'; img-src 'self' data: blob: https: http:; media-src 'self' blob:; connect-src 'self' https: http://localhost:* http://127.0.0.1:*; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'" },
          ...(process.env.NODE_ENV === "production" ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }] : []),
        ],
      },
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Content-Security-Policy", value: "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data: blob: https: http:; media-src 'self' blob:; connect-src 'self' https: http://localhost:* http://127.0.0.1:*; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'" },
          ...(process.env.NODE_ENV === "production" ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }] : []),
        ],
      },
    ];
  },
};

export default nextConfig;
