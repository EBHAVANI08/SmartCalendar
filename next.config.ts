import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false,
  productionBrowserSourceMaps: false,
  // Do not advertise the framework in every response.
  poweredByHeader: false,
  serverExternalPackages: ['pdf-parse', 'xlsx', '@prisma/client', 'prisma'],
  // Type errors must break the build. This was `true`, which hid 20 real errors
  // across middleware, the leave and dedup routes, timetable-config and the
  // teachers page until a manual `tsc --noEmit` surfaced them.
  typescript: {
    ignoreBuildErrors: false,
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          // Browsers use HTTPS only for this site for a year (the site is served over HTTPS).
          { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
        ],
      },
    ];
  },
};

export default nextConfig;
