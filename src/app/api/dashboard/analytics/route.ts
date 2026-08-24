import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTenantSchoolId } from '@/lib/school-helper';

export async function GET(req: NextRequest) {
  try {
    const date = req.nextUrl.searchParams.get('date') || new Date().toISOString().split('T')[0];
    const schoolId = await getTenantSchoolId(req);

    const substitutions = await db.substitution.findMany({
      where: {
        date,
        ...(schoolId ? { absentTeacher: { schoolId } } : {}),
      },
      include: { absentTeacher: true, substitute: true },
    });

    const totalToday = substitutions.length;
    const resolvedToday = substitutions.filter(s => s.status === 'completed' || s.status === 'assigned').length;
    const pendingToday = substitutions.filter(s => s.status === 'pending').length;
    const coverageRate = totalToday > 0 ? Math.round((resolvedToday / totalToday) * 100) : 100;

    return NextResponse.json({
      success: true,
      data: {
        weeklyTrends: [
          { week: 'Week 4', total: totalToday, aiAssigned: resolvedToday, manualAssigned: 0, sameSubject: resolvedToday, crossSubject: 0 },
        ],
        topSubjects: [],
        topAbsentTeachers: [],
        coverageRate,
        sameSubjectRate: 100,
        totalToday,
        resolvedToday,
        pendingToday,
        deptBreakdown: [],
        peakHours: [],
        overloadAlerts: [],
        crisisAlerts: [],
      },
    });
  } catch (error) {
    console.error('[ANALYTICS ERROR]', error);
    return NextResponse.json({ success: false, error: 'Failed to load analytics' }, { status: 500 });
  }
}
