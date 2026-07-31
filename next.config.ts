import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  productionBrowserSourceMaps: false,
  experimental: {
    cpus: 1,
  },
};

export default nextConfig;
