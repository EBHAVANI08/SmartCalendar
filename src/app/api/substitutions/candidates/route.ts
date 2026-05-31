import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const requestId = req.nextUrl.searchParams.get('requestId');
    if (!requestId) return NextResponse.json({ success: false, error: 'requestId required' }, { status: 400 });

    const request = await db.substitutionRequest.findUnique({
      where: { id: requestId },
      include: { schedule: { include: { timeSlot: true, subject: true, grade: true, section: true } }, subject: true },
    });

    if (!request) return NextResponse.json({ success: false, error: 'Request not found' }, { status: 404 });

    const dayOfWeek = new Date(request.date + 'T00:00:00').getDay();
    const scheduleDay = dayOfWeek >= 1 && dayOfWeek <= 5 ? dayOfWeek : 1;

    // Get week boundaries for workload calculation
    const weekStart = getWeekStart(request.date);
    const weekEndDate = new Date(weekStart + 'T00:00:00');
    weekEndDate.setDate(weekEndDate.getDate() + 4);
    const weekEnd = weekEndDate.toISOString().split('T')[0];

    // Find teachers who are ACTUALLY free during this time slot
    const busyTeacherIds = await db.schedule.findMany({
      where: { timeSlotId: request.schedule.timeSlotId, dayOfWeek: scheduleDay },
      select: { teacherId: true },
    });
    const busySet = new Set(busyTeacherIds.map(s => s.teacherId));
    busySet.add(request.originalTeacherId);

    // Get leaves for this date
    const leaves = await db.leave.findMany({
      where: { status: 'APPROVED', startDate: { lte: request.date }, endDate: { gte: request.date } },
      select: { teacherId: true },
    });
    leaves.forEach(l => busySet.add(l.teacherId));

    // Same subject teachers first - with consistent scoring
    const sameSubjectTeachers = await db.teacherSubject.findMany({
      where: { subjectId: request.subjectId },
      include: { teacher: { include: { schedules: { where: { dayOfWeek: scheduleDay }, include: { timeSlot: true } }, substitutionsAsSubstitute: { where: { status: 'ACCEPTED', createdAt: { gte: new Date(weekStart), lte: new Date(weekEnd + 'T23:59:59') } } } } }, subject: true },
    });

    const candidates: any[] = [];
    const subjectInfo = request.subject;

    for (const ts of sameSubjectTeachers) {
      if (busySet.has(ts.teacherId)) continue;
      if (!ts.teacher.isActive) continue;

      const classesToday = ts.teacher.schedules.length;
      const freePeriods = Math.max(0, 8 - classesToday);
      const weeklySubs = ts.teacher.substitutionsAsSubstitute.length;

      // Consistent scoring with AI agent
      let score = 0;
      const reasons: string[] = [];

      // Same subject scoring
      if (ts.isPrimary) {
        score = 95;
        reasons.push('Primary teacher for this subject & grade');
      } else {
        score = 80;
        reasons.push('Teaches the same subject');
      }

      // Same department bonus
      if (subjectInfo?.category && ts.teacher.department === subjectInfo.category) {
        score += 15;
        reasons.push('Same department');
      }

      // Weekly workload balancing
      if (weeklySubs === 0) {
        score += 15;
        reasons.push('No substitutions this week');
      } else if (weeklySubs <= 2) {
        score += 8;
        reasons.push('Minimal substitution load');
      } else if (weeklySubs <= 4) {
        score -= 5;
        reasons.push('Moderate substitution load');
      } else {
        score -= (weeklySubs * 5);
        reasons.push(`Heavy load: ${weeklySubs} subs this week`);
      }

      // Schedule lightness
      if (classesToday <= 3) {
        score += 10;
        reasons.push(`Light schedule today (${classesToday}/8 classes)`);
      } else if (classesToday <= 5) {
        score += 5;
        reasons.push(`Moderate schedule today (${classesToday}/8 classes)`);
      }

      if (freePeriods >= 4) {
        score += 5;
        reasons.push('Many free periods');
      }

      // Designation bonus
      if (ts.teacher.designation?.includes('HOD')) {
        score += 10;
        reasons.push('Head of Department');
      } else if (ts.teacher.designation?.includes('Senior')) {
        score += 5;
        reasons.push('Senior teacher');
      }

      candidates.push({
        teacherId: ts.teacherId,
        teacherName: ts.teacher.name,
        employeeId: ts.teacher.employeeId,
        department: ts.teacher.department || '',
        designation: ts.teacher.designation || '',
        score,
        reasons,
        teachesSameSubject: true,
        isPrimaryMatch: ts.isPrimary,
        currentLoad: classesToday,
        freePeriods,
        weeklySubCount: weeklySubs,
      });
    }

    // Cross-subject available teachers
    const allTeachers = await db.teacher.findMany({
      where: { isActive: true, id: { notIn: Array.from(busySet) } },
      include: {
        teacherSubjects: { include: { subject: true } },
        schedules: { where: { dayOfWeek: scheduleDay }, include: { timeSlot: true } },
        substitutionsAsSubstitute: { where: { status: 'ACCEPTED', createdAt: { gte: new Date(weekStart), lte: new Date(weekEnd + 'T23:59:59') } } },
      },
    });

    for (const teacher of allTeachers) {
      if (candidates.some(c => c.teacherId === teacher.id)) continue;

      const classesToday = teacher.schedules.length;
      const freePeriods = Math.max(0, 8 - classesToday);
      const weeklySubs = teacher.substitutionsAsSubstitute.length;

      // Consistent cross-subject scoring
      let score = 30;
      const reasons: string[] = [];
      reasons.push('Available (cross-subject - can supervise)');

      // Same department
      if (subjectInfo?.category && teacher.department === subjectInfo.category) {
        score += 15;
        reasons.push('Same department');
      }

      // Workload balancing
      if (weeklySubs === 0) {
        score += 15;
        reasons.push('No substitutions this week');
      } else if (weeklySubs <= 2) {
        score += 8;
        reasons.push('Minimal substitution load');
      } else if (weeklySubs <= 4) {
        score -= 5;
        reasons.push('Moderate substitution load');
      } else {
        score -= (weeklySubs * 5);
        reasons.push(`Heavy load: ${weeklySubs} subs this week`);
      }

      // Schedule lightness
      if (classesToday <= 3) {
        score += 10;
        reasons.push(`Light schedule today (${classesToday}/8 classes)`);
      } else if (classesToday <= 5) {
        score += 5;
      }

      if (freePeriods >= 4) {
        score += 5;
        reasons.push('Many free periods');
      }

      const taughtSubjects = teacher.teacherSubjects.map(ts => ts.subject.name);

      candidates.push({
        teacherId: teacher.id,
        teacherName: teacher.name,
        employeeId: teacher.employeeId,
        department: teacher.department || '',
        designation: teacher.designation || '',
        score,
        reasons,
        teachesSameSubject: false,
        currentLoad: classesToday,
        freePeriods,
        weeklySubCount: weeklySubs,
        subjects: taughtSubjects,
      });
    }

    candidates.sort((a, b) => {
      if (a.teachesSameSubject !== b.teachesSameSubject) return a.teachesSameSubject ? -1 : 1;
      if (a.isPrimaryMatch !== b.isPrimaryMatch) return a.isPrimaryMatch ? -1 : 1;
      return b.score - a.score;
    });

    return NextResponse.json({ success: true, data: candidates.slice(0, 20) });
  } catch (error) {
    console.error('[CANDIDATES ERROR]', error);
    return NextResponse.json({ success: false, error: 'Failed' }, { status: 500 });
  }
}

function getWeekStart(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  const day = date.getDay();
  const diff = day === 0 ? 6 : day - 1;
  date.setDate(date.getDate() - diff);
  return date.toISOString().split('T')[0];
}
