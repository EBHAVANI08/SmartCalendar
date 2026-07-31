export const dynamic = 'force-dynamic';

import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get('schoolId');

    const today = new Date().toISOString().split('T')[0];
    const schoolWhere = schoolId ? { schoolId } : {};

    const [totalTeachers, todaySubstitutions, emptyPeriods] = await Promise.all([
      db.teacher.count({ where: schoolWhere }),
      db.substitution.count({ where: { date: today } }),
      db.schedule.count({ where: { ...schoolWhere, teacherId: null } }),
    ]);

    const totalStudents = 1200;

    const pendingSubstitutions = await db.substitution.count({
      where: { date: today, status: 'pending' },
    });

    const assignedSubstitutions = await db.substitution.count({
      where: { date: today, status: 'assigned' },
    });

    const totalSchedules = await db.schedule.count({ where: schoolWhere });

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
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}
