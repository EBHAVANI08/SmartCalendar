import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false,
  productionBrowserSourceMaps: false,
  serverExternalPackages: ['pdf-parse', 'xlsx', '@prisma/client', 'prisma'],
  // Type errors must break the build. This was `true`, which hid 20 real errors
  // across middleware, the leave and dedup routes, timetable-config and the
  // teachers page until a manual `tsc --noEmit` surfaced them.
  typescript: {
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
