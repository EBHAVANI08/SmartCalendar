import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// Flat schema has no admin-targeted notification table; admins see the
// combined feed of all teacher notifications instead.
export async function GET(req: NextRequest) {
  try {
    const limit = parseInt(req.nextUrl.searchParams.get('limit') || '50');

    const notifications = await db.teacherNotification.findMany({
      include: { teacher: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return NextResponse.json({ success: true, data: notifications });
  } catch (error) {
    console.error('[ADMIN NOTIFICATIONS ERROR]', error);
    return NextResponse.json({ success: false, error: 'Failed' }, { status: 500 });
  }
}
