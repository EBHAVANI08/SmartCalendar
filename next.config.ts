import type { NextConfig } from "next";
import path from 'path';

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  outputFileTracingRoot: path.join(__dirname, './'),
  transpilePackages: ['z-ai-web-dev-sdk'],
  turbopack: {
    resolveAlias: {
      '@/lib': path.join(__dirname, './src/lib'),
      '@/components': path.join(__dirname, './src/components'),
      '@/hooks': path.join(__dirname, './src/hooks'),
      '@/app': path.join(__dirname, './src/app'),
    },
    root: path.join(__dirname, './'),
  },
};

export default nextConfig;
