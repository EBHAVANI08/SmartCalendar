import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const today = new Date().toISOString().split('T')[0];

    const [totalTeachers, todaySubstitutions, emptyPeriods] = await Promise.all([
      db.teacher.count(),
      db.substitution.count({ where: { date: today } }),
      db.schedule.count({ where: { teacherId: null } }),
    ]);

    const totalStudents = 25000; // DPS has 25,000 students - hardcoded for practical purposes

    const pendingSubstitutions = await db.substitution.count({
      where: { date: today, status: 'pending' },
    });

    const assignedSubstitutions = await db.substitution.count({
      where: { date: today, status: 'assigned' },
    });

    const totalSchedules = await db.schedule.count();

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
