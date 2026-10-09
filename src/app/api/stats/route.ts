export const dynamic = 'force-dynamic';

import { db } from '@/lib/db';
import { getTenantSchoolId } from '@/lib/school-helper';
import { NextResponse } from 'next/server';
import { NOT_ARCHIVED } from '@/lib/soft-delete';
import { requireCapability } from '@/lib/authz';
import { operationalScheduleFilter } from '@/lib/timetable-lifecycle';

export async function GET(request: Request) {
  const denied = requireCapability(request, 'faculty.read');
  if (denied) return denied;
  try {
    const schoolId = await getTenantSchoolId(request);
    if (!schoolId) {
      return NextResponse.json({ error: 'No school context. Please sign in again.' }, { status: 401 });
    }
    const today = new Date().toISOString().split('T')[0];
    // The timetable in use, not every version's copy of it.
    const inUse = await operationalScheduleFilter(schoolId);

    const [totalTeachers, todaySubstitutions, emptyPeriods, classSections] = await Promise.all([
      db.teacher.count({ where: { schoolId } }),
      db.substitution.count({ where: { schoolId, date: today } }),
      db.schedule.count({ where: { ...inUse, teacherId: null } }),
      db.classSection.findMany({ where: { schoolId, AND: [NOT_ARCHIVED] }, select: { studentStrength: true } }).catch(() => []),
    ]);

    const totalStudents = classSections.reduce((sum, section) => sum + (section?.studentStrength || 0), 0);

    const pendingSubstitutions = await db.substitution.count({
      where: { schoolId, date: today, status: 'pending' },
    }).catch(() => 0);

    const assignedSubstitutions = await db.substitution.count({
      where: { schoolId, date: today, status: 'assigned' },
    }).catch(() => 0);

    const totalSchedules = await db.schedule.count({ where: inUse }).catch(() => 0);

    return NextResponse.json({
      totalTeachers,
      totalStudents,
      todaySubstitutions,
      emptyPeriods,
      pendingSubstitutions,
      assignedSubstitutions,
      totalSchedules,
      filledPeriods: totalSchedules - emptyPeriods,
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    return NextResponse.json({
      totalTeachers: 0,
      totalStudents: 0,
      todaySubstitutions: 0,
      emptyPeriods: 0,
      pendingSubstitutions: 0,
      assignedSubstitutions: 0,
      totalSchedules: 0,
      filledPeriods: 0,
    });
  }
}
