import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTenantSchoolId } from '@/lib/school-helper';

export async function GET(req: NextRequest) {
  try {
    const date = req.nextUrl.searchParams.get('date') || new Date().toISOString().split('T')[0];
    const schoolId = await getTenantSchoolId(req);

    const [todaySubstitutions, allSubstitutions, schoolTeachers, schedules] = await Promise.all([
      db.substitution.findMany({
        where: {
          date,
          ...(schoolId ? { absentTeacher: { schoolId } } : {}),
        },
        include: { absentTeacher: true, substitute: true },
      }),
      db.substitution.findMany({
        where: schoolId ? { absentTeacher: { schoolId } } : {},
        include: { absentTeacher: true, substitute: true },
        orderBy: { date: 'desc' },
        take: 200,
      }),
      db.teacher.findMany({
        where: schoolId ? { schoolId } : {},
        select: { id: true, name: true, subject: true },
      }),
      db.schedule.findMany({
        where: schoolId ? { schoolId } : {},
        select: { id: true, teacherId: true, subject: true, period: true, day: true },
      }),
    ]);

    const totalToday = todaySubstitutions.length;
    const resolvedToday = todaySubstitutions.filter(s => s.status === 'completed' || s.status === 'assigned').length;
    const pendingToday = todaySubstitutions.filter(s => s.status === 'pending').length;
    const coverageRate = totalToday > 0 ? Math.round((resolvedToday / totalToday) * 100) : 100;

    // 1. Compute Department Breakdown from real teachers in DB
    const deptMap: Record<string, number> = {};
    for (const t of schoolTeachers) {
      const dept = t.subject || 'General';
      deptMap[dept] = (deptMap[dept] || 0) + 1;
    }
    const deptBreakdown = Object.entries(deptMap).map(([dept, count]) => ({
      name: dept,
      teachersCount: count,
    }));

    // 2. Compute Top Subjects needing substitution
    const subjectSubsMap: Record<string, number> = {};
    for (const s of allSubstitutions) {
      const sub = s.subject || 'General';
      subjectSubsMap[sub] = (subjectSubsMap[sub] || 0) + 1;
    }
    const topSubjects = Object.entries(subjectSubsMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([subject, count]) => ({ subject, count }));

    // 3. Compute Top Absent Teachers
    const teacherAbsenceMap: Record<string, { name: string; count: number; subject: string }> = {};
    for (const s of allSubstitutions) {
      if (s.absentTeacher) {
        const id = s.absentTeacher.id;
        if (!teacherAbsenceMap[id]) {
          teacherAbsenceMap[id] = { name: s.absentTeacher.name, subject: s.absentTeacher.subject, count: 0 };
        }
        teacherAbsenceMap[id].count += 1;
      }
    }
    const topAbsentTeachers = Object.values(teacherAbsenceMap)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // 4. Compute Peak Substitution Hours (Periods)
    const periodCountMap: Record<number, number> = {};
    for (const s of allSubstitutions) {
      if (s.period) {
        periodCountMap[s.period] = (periodCountMap[s.period] || 0) + 1;
      }
    }
    const peakHours = Object.entries(periodCountMap).map(([period, count]) => ({
      period: `Period ${period}`,
      count,
    }));

    // 5. Compute Weekly Trends from real DB substitution records
    const weeklyTrends = [
      {
        week: 'Current Week',
        total: allSubstitutions.length,
        aiAssigned: allSubstitutions.filter(s => s.status === 'assigned' || s.status === 'completed').length,
        manualAssigned: allSubstitutions.filter(s => s.source === 'manual').length,
        sameSubject: allSubstitutions.filter(s => s.substitute && s.absentTeacher && s.substitute.subject === s.absentTeacher.subject).length,
        crossSubject: allSubstitutions.filter(s => s.substitute && s.absentTeacher && s.substitute.subject !== s.absentTeacher.subject).length,
      },
    ];

    return NextResponse.json({
      success: true,
      data: {
        weeklyTrends,
        topSubjects,
        topAbsentTeachers,
        coverageRate,
        sameSubjectRate: allSubstitutions.length > 0
          ? Math.round((allSubstitutions.filter(s => s.substitute && s.absentTeacher && s.substitute.subject === s.absentTeacher.subject).length / allSubstitutions.length) * 100)
          : 100,
        totalToday,
        resolvedToday,
        pendingToday,
        deptBreakdown,
        peakHours,
        totalFaculty: schoolTeachers.length,
        totalSchedules: schedules.length,
      },
    });
  } catch (error) {
    console.error('[ANALYTICS ERROR]', error);
    return NextResponse.json({ success: false, error: 'Failed to load analytics' }, { status: 500 });
  }
}
