import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const date = req.nextUrl.searchParams.get('date');
    const timeSlotId = req.nextUrl.searchParams.get('timeSlotId');
    const gradeId = req.nextUrl.searchParams.get('gradeId');

    if (!date || !timeSlotId) {
      return NextResponse.json({ success: false, error: 'date and timeSlotId required' }, { status: 400 });
    }

    if (!gradeId) {
      return NextResponse.json({ success: false, error: 'Please select a grade first to find the schedule that needs substitution' }, { status: 400 });
    }

    const dayOfWeek = new Date(date + 'T00:00:00').getDay();
    const scheduleDay = dayOfWeek >= 1 && dayOfWeek <= 5 ? dayOfWeek : 1;

    // Find the specific schedule entry that needs substitution
    const schedule = await db.schedule.findFirst({
      where: { gradeId, timeSlotId, dayOfWeek: scheduleDay },
      include: { subject: true, grade: true, section: true, teacher: true },
    });

    if (!schedule) {
      return NextResponse.json({ success: false, error: 'No schedule found for this grade and time slot', data: { candidates: [], scheduleId: null } });
    }

    // Get the absent teacher's subject info
    const subjectInfo = await db.subject.findUnique({ where: { id: schedule.subjectId } });

    // Get week boundaries for workload calculation
    const weekStart = getWeekStart(date);
    const weekEndDate = new Date(weekStart + 'T00:00:00');
    weekEndDate.setDate(weekEndDate.getDate() + 4);
    const weekEnd = weekEndDate.toISOString().split('T')[0];

    // Get busy teacher IDs for this slot (teaching + absent + already substituted)
    const busyTeacherIds = await db.schedule.findMany({
      where: { timeSlotId, dayOfWeek: scheduleDay },
      select: { teacherId: true },
    });
    const busySet = new Set(busyTeacherIds.map(s => s.teacherId));
    busySet.add(schedule.teacherId); // Add absent teacher

    // Get absent teachers
    const leaves = await db.leave.findMany({
      where: { status: 'APPROVED', startDate: { lte: date }, endDate: { gte: date } },
      select: { teacherId: true },
    });
    leaves.forEach(l => busySet.add(l.teacherId));

    // Get teachers already assigned as substitutes for this time slot today
    // Fix: Use proper query instead of broken include-with-where pattern
    const existingSubRequests = await db.substitutionRequest.findMany({
      where: {
        date,
        status: { in: ['RESOLVED', 'ASSIGNED'] },
        schedule: { timeSlotId, dayOfWeek: scheduleDay },
      },
      select: { id: true },
    });
    const existingSubRequestIds = existingSubRequests.map(r => r.id);

    if (existingSubRequestIds.length > 0) {
      const existingSubs = await db.substitutionAssignment.findMany({
        where: {
          substitutionRequestId: { in: existingSubRequestIds },
          status: 'ACCEPTED',
        },
        select: { substituteTeacherId: true },
      });
      for (const sub of existingSubs) {
        busySet.add(sub.substituteTeacherId);
      }
    }

    // Also check any ACCEPTED assignments created today that might be for manual assignments
    const todayManualSubs = await db.substitutionAssignment.findMany({
      where: {
        status: 'ACCEPTED',
        createdAt: { gte: new Date(date + 'T00:00:00'), lte: new Date(date + 'T23:59:59') },
        assignedBy: 'ADMIN',
      },
      include: {
        substitutionRequest: {
          include: { schedule: { select: { timeSlotId: true, dayOfWeek: true } } },
        },
      },
    });
    for (const sub of todayManualSubs) {
      if (sub.substitutionRequest.schedule?.timeSlotId === timeSlotId) {
        busySet.add(sub.substituteTeacherId);
      }
    }

    // Find available teachers with smart scoring
    const available = await db.teacher.findMany({
      where: { isActive: true, id: { notIn: Array.from(busySet) } },
      include: {
        teacherSubjects: { include: { subject: true } },
        schedules: { where: { dayOfWeek: scheduleDay }, include: { timeSlot: true } },
        substitutionsAsSubstitute: {
          where: { status: 'ACCEPTED', createdAt: { gte: new Date(weekStart), lte: new Date(weekEnd + 'T23:59:59') } },
        },
      },
    });

    // Score each teacher
    const candidates = available.map(t => {
      let score = 0;
      const reasons: string[] = [];

      // Subject match scoring
      const primaryMatch = t.teacherSubjects.find(ts => ts.subjectId === schedule.subjectId && ts.isPrimary);
      const sameSubjectMatch = t.teacherSubjects.find(ts => ts.subjectId === schedule.subjectId);

      if (primaryMatch) {
        score += 50;
        reasons.push('Primary subject teacher for this grade');
      } else if (sameSubjectMatch) {
        score += 40;
        reasons.push('Teaches the same subject');
      }

      // Same department bonus
      if (subjectInfo?.category && t.department === subjectInfo.category) {
        score += 20;
        reasons.push('Same department');
      }

      // Workload balancing
      const weeklySubs = t.substitutionsAsSubstitute.length;
      if (weeklySubs === 0) {
        score += 15;
        reasons.push('No substitutions this week');
      } else if (weeklySubs <= 2) {
        score += 8;
        reasons.push('Light substitution load');
      } else if (weeklySubs <= 4) {
        score -= 5;
        reasons.push('Moderate substitution load');
      } else {
        score -= (weeklySubs * 5);
        reasons.push(`Heavy load: ${weeklySubs} subs this week`);
      }

      // Schedule lightness
      const classesToday = t.schedules.length;
      const freePeriods = Math.max(0, 8 - classesToday);
      if (classesToday <= 3) {
        score += 10;
        reasons.push(`Light schedule today (${classesToday}/8 classes)`);
      } else if (classesToday <= 5) {
        score += 5;
        reasons.push(`Moderate schedule today (${classesToday}/8 classes)`);
      } else {
        score -= 5;
        reasons.push(`Heavy schedule today (${classesToday}/8 classes)`);
      }

      if (freePeriods >= 4) {
        score += 5;
        reasons.push('Many free periods');
      }

      // Senior designation bonus
      if (t.designation?.includes('HOD')) {
        score += 10;
        reasons.push('Head of Department');
      } else if (t.designation?.includes('Senior')) {
        score += 5;
        reasons.push('Senior teacher');
      }

      return {
        teacherId: t.id,
        teacherName: t.name,
        employeeId: t.employeeId,
        department: t.department || '',
        designation: t.designation || '',
        subjects: t.teacherSubjects.map(ts => ts.subject.name),
        score,
        reasons,
        teachesSameSubject: !!sameSubjectMatch,
        isPrimaryMatch: !!primaryMatch,
        currentLoad: classesToday,
        freePeriods,
        weeklySubCount: weeklySubs,
      };
    });

    // Sort: same-subject first, then by score
    candidates.sort((a, b) => {
      if (a.teachesSameSubject !== b.teachesSameSubject) return a.teachesSameSubject ? -1 : 1;
      if (a.isPrimaryMatch !== b.isPrimaryMatch) return a.isPrimaryMatch ? -1 : 1;
      return b.score - a.score;
    });

    // Only return top 10 best-fit teachers
    return NextResponse.json({
      success: true,
      data: {
        candidates: candidates.slice(0, 10),
        scheduleId: schedule.id,
        scheduleInfo: {
          subject: schedule.subject.name,
          subjectColor: schedule.subject.color,
          grade: schedule.grade.name,
          section: schedule.section.name,
          originalTeacher: schedule.teacher.name,
          topic: schedule.topic,
        },
      },
    });
  } catch (error) {
    console.error('[MANUAL ASSIGN GET ERROR]', error);
    return NextResponse.json({ success: false, error: 'Failed' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { scheduleId, teacherId, date, assignedBy } = await req.json();
    if (!scheduleId || !teacherId || !date) {
      return NextResponse.json({ success: false, error: 'scheduleId, teacherId, date required' }, { status: 400 });
    }

    const schedule = await db.schedule.findUnique({
      where: { id: scheduleId },
      include: { subject: true, grade: true, section: true, timeSlot: true, teacher: true },
    });

    if (!schedule) return NextResponse.json({ success: false, error: 'Schedule not found' }, { status: 404 });

    // Create substitution request
    const request = await db.substitutionRequest.create({
      data: {
        scheduleId,
        originalTeacherId: schedule.teacherId,
        subjectId: schedule.subjectId,
        date,
        reason: 'MANUAL',
        status: 'RESOLVED',
      },
    });

    const assignment = await db.substitutionAssignment.create({
      data: {
        substitutionRequestId: request.id,
        substituteTeacherId: teacherId,
        status: 'ACCEPTED',
        assignedBy: assignedBy || 'ADMIN',
        topic: schedule.topic,
      },
    });

    // Notify teacher
    await db.notification.create({
      data: {
        type: 'MANUAL_ASSIGNED',
        title: `Substitution Assignment - ${schedule.subject.name}`,
        message: `You have been assigned as substitute for Grade ${schedule.grade.name} Section ${schedule.section.name} ${schedule.subject.name} class on ${date} (${schedule.timeSlot.startTime}-${schedule.timeSlot.endTime}). Original teacher: ${schedule.teacher.name}. Topic: ${schedule.topic || 'N/A'}`,
        teacherId,
        targetRole: 'TEACHER',
        assignmentId: assignment.id,
        substitutionRequestId: request.id,
      },
    });

    return NextResponse.json({ success: true, data: { requestId: request.id, assignmentId: assignment.id } });
  } catch (error) {
    console.error('[MANUAL ASSIGN POST ERROR]', error);
    return NextResponse.json({ success: false, error: 'Assignment failed' }, { status: 500 });
  }
}

function getWeekStart(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  const day = date.getDay();
  const diff = day === 0 ? 6 : day - 1;
  date.setDate(date.getDate() - diff);
  return date.toISOString().split('T')[0];
}
