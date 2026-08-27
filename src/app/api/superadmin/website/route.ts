import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { isSuperAdminRequest, unauthorized, writeAudit } from '@/lib/superadmin';
import { getWebsiteSettings } from '@/lib/website';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (!isSuperAdminRequest(request)) return unauthorized();
  const settings = await getWebsiteSettings();
  const media = await db.websiteMedia.findMany({ orderBy: { createdAt: 'desc' } });
  return NextResponse.json({ settings, media });
}

export async function PUT(request: Request) {
  if (!isSuperAdminRequest(request)) return unauthorized();
  const body = await request.json();
  const allowed = [
    'siteName', 'tagline', 'heroBadge', 'heroTitle', 'heroSubtitle', 'ctaPrimary', 'ctaSecondary',
    'announcement', 'announcementEnabled', 'maintenanceMode',
    'seoTitle', 'seoDescription', 'seoKeywords', 'canonicalUrl',
    'ogImageUrl', 'heroImageUrl', 'logoUrl',
    'gaMeasurementId', 'gtmContainerId', 'googleSiteVerification', 'googleAdsId', 'indexable',
  ];
  const data: Record<string, unknown> = {};
  for (const key of allowed) {
    if (body[key] !== undefined) data[key] = body[key];
  }
  const settings = await db.websiteSettings.upsert({
    where: { key: 'default' },
    create: { key: 'default', ...data },
    update: data,
  });
  await writeAudit(request, 'website.update', 'website', settings.id, { fields: Object.keys(data) });
  return NextResponse.json({ success: true, settings });
}
