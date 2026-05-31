import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

const MAX_PERIODS_PER_DAY = 8;

// Get available substitute teachers for a specific substitution
export async function POST(request: Request) {
  try {
    const { substitutionId, date, period, subject, grade, absentTeacherId } = await request.json();

    let targetDate = date;
    let targetPeriod = period;
    let targetSubject = subject;
    let targetGrade = grade;
    let absentId = absentTeacherId;

    // If substitutionId provided, fetch from DB
    if (substitutionId) {
      const sub = await db.substitution.findUnique({
        where: { id: substitutionId },
        include: { absentTeacher: true },
      });
      if (!sub) {
        return NextResponse.json({ error: 'Substitution not found' }, { status: 404 });
      }
      targetDate = sub.date;
      targetPeriod = sub.period;
      targetSubject = sub.subject;
      targetGrade = sub.grade;
      absentId = sub.absentTeacherId;
    }

    if (!targetDate || !targetPeriod || !targetSubject || !targetGrade || !absentId) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    // Get day of week
    const dateObj = new Date(targetDate + 'T00:00:00');
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayName = dayNames[dateObj.getDay()];

    // Get all teachers with their schedules
    const allTeachers = await db.teacher.findMany({
      include: {
        schedules: {
          where: { day: dayName },
        },
      },
    });

    // Get already-assigned substitutions for today
    const todayAssignedSubs = await db.substitution.findMany({
      where: { date: targetDate, status: 'assigned' },
    });

    const availableTeachers = [];

    for (const teacher of allTeachers) {
      if (teacher.id === absentId) continue;

      // Check biometric status — skip absent teachers
      const bioRecord = await db.biometricAttendance.findUnique({
        where: { date_teacherId: { date: targetDate, teacherId: teacher.id } },
      });
      if (bioRecord && (bioRecord.status === 'absent' || bioRecord.status === 'half-day')) continue;

      // Check if busy at this period (regular schedule)
      const isBusyAtPeriod = teacher.schedules.some(s => s.period === targetPeriod);
      if (isBusyAtPeriod) continue;

      // Check if already assigned as substitute at this period
      const alreadySubbing = todayAssignedSubs.some(
        s => s.substituteId === teacher.id && s.period === targetPeriod
      );
      if (alreadySubbing) continue;

      // Count total workload
      const regularPeriods = teacher.schedules.length;
      const substitutionPeriods = todayAssignedSubs.filter(
        s => s.substituteId === teacher.id
      ).length;
      const totalWorkload = regularPeriods + substitutionPeriods;

      if (totalWorkload >= MAX_PERIODS_PER_DAY) continue;

      // Scoring
      const teacherGrades = JSON.parse(teacher.grades || '[]') as string[];
      const teachesSubject = teacher.subject === targetSubject;
      const teachesGrade = teacherGrades.includes(targetGrade);
      const hasClassFamiliarity = teacher.schedules.some(
        s => s.grade === targetGrade
      );

      let score = 0;
      if (teachesSubject) score += 40;
      if (teachesGrade) score += 25;
      if (hasClassFamiliarity) score += 10;
      score += Math.round((1 - totalWorkload / MAX_PERIODS_PER_DAY) * 10);

      let recommendation: string;
      if (teachesSubject && teachesGrade) {
        recommendation = 'Best Match — Same subject & grade';
      } else if (teachesSubject) {
        recommendation = 'Recommended — Subject specialist';
      } else if (teachesGrade) {
        recommendation = 'Good Match — Teaches this grade';
      } else if (hasClassFamiliarity) {
        recommendation = 'Available — Familiar with class';
      } else {
        recommendation = 'Available — No subject/grade match';
      }

      availableTeachers.push({
        id: teacher.id,
        name: teacher.name,
        subject: teacher.subject,
        grades: teacherGrades,
        teachesSubject,
        teachesGrade,
        hasClassFamiliarity,
        totalWorkload,
        regularPeriods,
        substitutionPeriods,
        score,
        recommendation,
      });
    }

    // Sort by score
    availableTeachers.sort((a, b) => b.score - a.score);

    return NextResponse.json({
      success: true,
      totalAvailable: availableTeachers.length,
      teachers: availableTeachers,
    });
  } catch (error) {
    console.error('Error fetching available teachers:', error);
    return NextResponse.json({ error: 'Failed to fetch available teachers' }, { status: 500 });
  }
}
