import type { MetadataRoute } from 'next';
import { getWebsiteSettings } from '@/lib/website';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const settings = await getWebsiteSettings();
  const base = (settings.canonicalUrl || 'https://smartcalendar.app').replace(/\/$/, '');
  const lastModified = 'updatedAt' in settings ? settings.updatedAt : new Date();
  return [
    { url: `${base}/`, lastModified, changeFrequency: 'weekly', priority: 1 },
    { url: `${base}/landing`, lastModified, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${base}/brochure`, lastModified, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${base}/login`, lastModified, changeFrequency: 'monthly', priority: 0.6 },
  ];
}
