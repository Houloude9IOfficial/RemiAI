import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output bundles the server code into a self-contained
  // directory (.next/standalone/) that can be shipped with Electron.
  // In dev mode this flag has no effect.
  output: "standalone",
  devIndicators: false,
  serverExternalPackages: ["better-sqlite3"],
  // Encrypted backups may contain uploaded files and exceed Next's default
  // 10 MB proxy body limit. The backup route still validates the encrypted
  // payload and requires authentication before restoring anything.
  experimental: {
    proxyClientMaxBodySize: "200mb",
  },
  turbopack: {
    root: process.cwd(),
  },
  async headers() {
    return [{
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
    }];
  },
};

export default nextConfig;
