export const dynamic = 'force-dynamic';

import { db } from '@/lib/db';
import { getTenantSchoolId } from '@/lib/school-helper';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const schoolId = await getTenantSchoolId(request);
    const today = new Date().toISOString().split('T')[0];
    const schoolWhere = schoolId ? { schoolId } : {};

    const [totalTeachers, todaySubstitutions, emptyPeriods, classSections] = await Promise.all([
      db.teacher.count({ where: schoolWhere }),
      db.substitution.count({ where: { date: today } }),
      db.schedule.count({ where: { ...schoolWhere, teacherId: null } }),
      schoolId
        ? db.classSection.findMany({ where: { schoolId }, select: { studentStrength: true } }).catch(() => [])
        : Promise.resolve([]),
    ]);

    const totalStudents = classSections.reduce((sum, section) => sum + (section?.studentStrength || 0), 0);

    const pendingSubstitutions = await db.substitution.count({
      where: { date: today, status: 'pending' },
    }).catch(() => 0);

    const assignedSubstitutions = await db.substitution.count({
      where: { date: today, status: 'assigned' },
    }).catch(() => 0);

    const totalSchedules = await db.schedule.count({ where: schoolWhere }).catch(() => 0);

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
