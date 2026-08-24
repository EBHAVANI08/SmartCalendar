import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  productionBrowserSourceMaps: false,
  serverExternalPackages: ['pdf-parse', 'xlsx', '@prisma/client', 'prisma'],
  experimental: {
    cpus: 1,
    workerThreads: false,
  },
  output: 'standalone',
  async rewrites() {
    return [
      { source: '/dashboard', destination: '/' },
      { source: '/calendar', destination: '/' },
      { source: '/substitutions', destination: '/' },
      { source: '/teachers', destination: '/' },
      { source: '/analytics', destination: '/' },
      { source: '/portal', destination: '/' },
      { source: '/teacher-portal', destination: '/' },
      { source: '/curriculum', destination: '/' },
    ];
  },
};

export default nextConfig;
