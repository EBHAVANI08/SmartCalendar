import type { MetadataRoute } from 'next';
import { getWebsiteSettings } from '@/lib/website';

export const dynamic = 'force-dynamic';

export default async function robots(): Promise<MetadataRoute.Robots> {
  const settings = await getWebsiteSettings();
  const base = (settings.canonicalUrl || 'https://smartcalendar.app').replace(/\/$/, '');
  if (!settings.indexable) {
    return {
      rules: { userAgent: '*', disallow: '/' },
      sitemap: `${base}/sitemap.xml`,
    };
  }
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/landing', '/brochure', '/login'],
        disallow: ['/superadmin', '/dashboard', '/api/', '/teachers', '/timetable', '/settings'],
      },
      { userAgent: 'Googlebot', allow: '/' },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
