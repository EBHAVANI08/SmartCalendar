import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false,
  productionBrowserSourceMaps: false,
  serverExternalPackages: ['pdf-parse', 'xlsx', '@prisma/client', 'prisma'],
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
