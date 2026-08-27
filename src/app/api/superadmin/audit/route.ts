import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { isSuperAdminRequest, unauthorized } from '@/lib/superadmin';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (!isSuperAdminRequest(request)) return unauthorized();
  const { searchParams } = new URL(request.url);
  const limit = Math.min(Number(searchParams.get('limit') || 80), 200);
  const entityType = searchParams.get('entityType');

  const logs = await db.platformAuditLog.findMany({
    where: entityType && entityType !== 'all' ? { entityType } : undefined,
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  return NextResponse.json({ logs });
}
