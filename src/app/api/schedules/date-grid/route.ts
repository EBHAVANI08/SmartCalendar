import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const date = req.nextUrl.searchParams.get('date');
    if (!date) return NextResponse.json({ success: false, error: 'Date required' }, { status: 400 });

    const substitutions = await db.substitution.findMany({
      where: { date },
      include: { absentTeacher: true, substitute: true },
    });

    const leaves = await db.leaveApplication.findMany({
      where: { status: 'approved', startDate: { lte: date }, endDate: { gte: date } },
    });

    return NextResponse.json({
      success: true,
      data: { substitutions, leaves },
    });
  } catch (error) {
    console.error('[DATE GRID ERROR]', error);
    return NextResponse.json({ success: false, error: 'Failed to load grid' }, { status: 500 });
  }
}
