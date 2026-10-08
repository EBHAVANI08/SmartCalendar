import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { TEACHER_PUBLIC_SELECT } from '@/lib/safe-fields';
import { getTenantSchoolId } from '@/lib/school-helper';

export async function GET(req: NextRequest) {
  try {
    const date = req.nextUrl.searchParams.get('date');
    if (!date) return NextResponse.json({ success: false, error: 'Date required' }, { status: 400 });
    const schoolId = await getTenantSchoolId(req);
    if (!schoolId) return NextResponse.json({ success: false, error: 'No school context. Please sign in again.' }, { status: 401 });

    const substitutions = await db.substitution.findMany({
      where: { date, schoolId },
      include: { absentTeacher: { select: TEACHER_PUBLIC_SELECT }, substitute: { select: TEACHER_PUBLIC_SELECT } },
    });

    const leaves = await db.leaveApplication.findMany({
      where: { status: 'approved', startDate: { lte: date }, endDate: { gte: date }, teacher: { schoolId } },
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
