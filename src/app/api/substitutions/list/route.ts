import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const limit = parseInt(req.nextUrl.searchParams.get('limit') || '100');
    const date = req.nextUrl.searchParams.get('date');

    const where: any = {};
    if (date) where.date = date;

    const substitutions = await db.substitution.findMany({
      where,
      include: {
        absentTeacher: { select: { id: true, name: true, subject: true } },
        substitute: { select: { id: true, name: true, subject: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return NextResponse.json({ success: true, data: substitutions });
  } catch (error) {
    console.error('[SUBSTITUTIONS LIST ERROR]', error);
    return NextResponse.json({ success: false, error: 'Failed to load' }, { status: 500 });
  }
}
