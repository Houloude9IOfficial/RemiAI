import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output bundles the server code into a self-contained
  // directory (.next/standalone/) that can be shipped with Electron.
  // In dev mode this flag has no effect.
  output: "standalone",
  devIndicators: false,
  serverExternalPackages: ["better-sqlite3"],
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
