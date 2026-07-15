import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  async rewrites() {
    return [
      {
        source: '/:path(favicon\.ico)',
        destination: '/api/favicon',
      },
    ];
  },
};

export default nextConfig;
