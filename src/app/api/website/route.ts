import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { getWebsiteSettings, publicWebsitePayload } from '@/lib/website';

export const dynamic = 'force-dynamic';

export async function GET() {
  const settings = await getWebsiteSettings();
  const media = await db.websiteMedia.findMany({ orderBy: { createdAt: 'desc' }, take: 24 }).catch(() => []);
  return NextResponse.json({
    ...publicWebsitePayload(settings),
    media: media.filter((m) => m.kind === 'gallery' || m.kind === 'banner'),
  });
}
