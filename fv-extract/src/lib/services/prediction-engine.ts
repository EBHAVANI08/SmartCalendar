/**
 * Predictive Absence Engine — Feature 1.1
 *
 * Predicts likely teacher absences 24-48 hours ahead by analyzing:
 * 1. Pattern signals: recurring Monday/Friday leaves in last 90 days
 * 2. Streak fatigue: 6+ consecutive working days without a free period
 * 3. Cluster signal: 3+ teachers from same department on leave in last 14 days
 * 4. Pending leave applications for tomorrow/day-after
 * 5. Meeting calendar conflicts: if a meeting exists during a teacher's class slot
 *
 * Output: AbsencePrediction rows with riskScore (0-100) and signals (JSON)
 */

import { db } from '@/lib/db';

interface PredictionSignal {
  type: string;
  score: number;
  description: string;
}

interface TeacherRiskAssessment {
  teacherId: string;
  teacherName: string;
  department: string | null;
  predictedDate: string;
  riskScore: number;
  signals: PredictionSignal[];
}

/**
 * Run the prediction engine for a specific date.
 * Returns risk assessments for all teachers who might be absent on that date.
 */
export async function predictAbsencesForDate(targetDate: string): Promise<TeacherRiskAssessment[]> {
  const results: TeacherRiskAssessment[] = [];

  // Get all active teachers
  const teachers = await db.teacher.findMany({
    where: { isActive: true },
    include: {
      leaves: true,
      schedules: true,
      substitutionsAsOriginal: true,
    },
  });

  // Get the day of week for the target date
  const targetDayOfWeek = new Date(targetDate + 'T00:00:00').getDay();

  // Only predict for working days
  if (targetDayOfWeek === 0 || targetDayOfWeek === 6) return [];

  // ── Signal 1: Pattern Signal — Recurring Monday/Friday leaves ──
  // Check last 90 days for recurring leaves on the same day of week
  const ninetyDaysAgo = new Date(targetDate + 'T00:00:00');
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const ninetyDaysAgoStr = ninetyDaysAgo.toISOString().split('T')[0];

  const recurringLeaves = await db.leave.findMany({
    where: {
      status: 'APPROVED',
      startDate: { gte: ninetyDaysAgoStr, lte: targetDate },
    },
    include: { teacher: true },
  });

  // Count recurring leaves per teacher per day-of-week
  const teacherDayLeaveCount = new Map<string, number>();
  for (const leave of recurringLeaves) {
    const startDay = new Date(leave.startDate + 'T00:00:00').getDay();
    const endDay = new Date(leave.endDate + 'T00:00:00').getDay();
    // If leave spans the target day of week
    if (startDay === targetDayOfWeek || endDay === targetDayOfWeek ||
        (startDay < targetDayOfWeek && endDay > targetDayOfWeek)) {
      const key = leave.teacherId;
      teacherDayLeaveCount.set(key, (teacherDayLeaveCount.get(key) || 0) + 1);
    }
  }

  // ── Signal 3: Cluster Signal — 3+ teachers from same dept on leave in last 14 days ──
  const fourteenDaysAgo = new Date(targetDate + 'T00:00:00');
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
  const fourteenDaysAgoStr = fourteenDaysAgo.toISOString().split('T')[0];

  const recentLeaves = await db.leave.findMany({
    where: {
      status: 'APPROVED',
      startDate: { gte: fourteenDaysAgoStr, lte: targetDate },
    },
    include: { teacher: true },
  });

  // Count leaves per department
  const deptLeaveCount = new Map<string, number>();
  const deptTeacherIds = new Map<string, Set<string>>();
  for (const leave of recentLeaves) {
    const dept = leave.teacher.department || 'Unknown';
    deptLeaveCount.set(dept, (deptLeaveCount.get(dept) || 0) + 1);
    if (!deptTeacherIds.has(dept)) deptTeacherIds.set(dept, new Set());
    deptTeacherIds.get(dept)!.add(leave.teacherId);
  }

  // Departments with cluster (3+ teachers on leave)
  const clusterDepts = new Set<string>();
  for (const [dept, count] of deptLeaveCount) {
    if (count >= 3) clusterDepts.add(dept);
  }

  // ── Signal 4: Pending leave applications for target date ──
  const pendingLeaves = await db.leave.findMany({
    where: {
      status: 'PENDING',
      startDate: { lte: targetDate },
      endDate: { gte: targetDate },
    },
    include: { teacher: true },
  });

  const pendingLeaveTeacherIds = new Set(pendingLeaves.map(l => l.teacherId));

  // ── Signal 5: Meeting calendar conflicts ──
  const meetings = await db.meeting.findMany({
    where: { date: targetDate },
  });

  // Build a map of teacher → meetings during their class slots
  const teacherMeetingConflicts = new Map<string, string[]>();
  for (const meeting of meetings) {
    const attendeeIds: string[] = JSON.parse(meeting.teacherIds || '[]');
    for (const tid of attendeeIds) {
      if (!teacherMeetingConflicts.has(tid)) teacherMeetingConflicts.set(tid, []);
      teacherMeetingConflicts.get(tid)!.push(meeting.title);
    }
  }

  // ── Signal 2: Streak fatigue — 6+ consecutive working days without a free period ──
  // We check the last 10 working days from the target date
  function getWorkingDaysBefore(dateStr: string, count: number): string[] {
    const days: string[] = [];
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() - 1); // Start from day before
    while (days.length < count) {
      const dow = d.getDay();
      if (dow >= 1 && dow <= 5) {
        days.push(d.toISOString().split('T')[0]);
      }
      d.setDate(d.getDate() - 1);
    }
    return days;
  }

  // Check approved leaves for each teacher in the last 10 working days
  const last10WorkingDays = getWorkingDaysBefore(targetDate, 10);

  // Now evaluate each teacher
  for (const teacher of teachers) {
    // Skip teachers already on approved leave for target date
    const alreadyOnLeave = teacher.leaves.some(
      l => l.status === 'APPROVED' && l.startDate <= targetDate && l.endDate >= targetDate
    );
    if (alreadyOnLeave) continue;

    // Only consider teachers who have classes on the target day of week
    const hasClassesOnDay = teacher.schedules.some(s => s.dayOfWeek === targetDayOfWeek);
    if (!hasClassesOnDay) continue;

    const signals: PredictionSignal[] = [];
    let riskScore = 0;

    // Signal 1: Pattern signal — recurring leaves on same day of week
    const patternCount = teacherDayLeaveCount.get(teacher.id) || 0;
    if (patternCount > 2) {
      const patternScore = Math.min(30, (patternCount - 2) * 15);
      signals.push({
        type: 'PATTERN',
        score: patternScore,
        description: `${patternCount} leaves on ${['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'][targetDayOfWeek]}s in last 90 days (recurring pattern)`,
      });
      riskScore += patternScore;
    }

    // Signal 2: Streak fatigue
    // Count consecutive working days the teacher has been present (not on leave) up to target date
    const teacherLeaveDates = new Set<string>();
    for (const leave of teacher.leaves) {
      if (leave.status === 'APPROVED') {
        const start = new Date(leave.startDate + 'T00:00:00');
        const end = new Date(leave.endDate + 'T00:00:00');
        const current = new Date(start);
        while (current <= end) {
          const dow = current.getDay();
          if (dow >= 1 && dow <= 5) {
            teacherLeaveDates.add(current.toISOString().split('T')[0]);
          }
          current.setDate(current.getDate() + 1);
        }
      }
    }

    let consecutiveDays = 0;
    for (const day of last10WorkingDays) {
      if (!teacherLeaveDates.has(day)) {
        consecutiveDays++;
      } else {
        break; // Streak broken by a leave
      }
    }

    if (consecutiveDays >= 6) {
      const fatigueScore = Math.min(20, (consecutiveDays - 5) * 10);
      signals.push({
        type: 'FATIGUE',
        score: fatigueScore,
        description: `Has worked ${consecutiveDays} consecutive days without a break (fatigue risk)`,
      });
      riskScore += fatigueScore;
    }

    // Signal 3: Cluster signal — same department has many absences
    if (teacher.department && clusterDepts.has(teacher.department)) {
      // Check if this teacher hasn't had a leave in 30+ days (more likely to catch the "bug")
      const thirtyDaysAgo = new Date(targetDate + 'T00:00:00');
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];

      const recentTeacherLeave = teacher.leaves.find(
        l => l.status === 'APPROVED' && l.startDate >= thirtyDaysAgoStr
      );

      if (!recentTeacherLeave) {
        const clusterScore = 20;
        signals.push({
          type: 'CLUSTER',
          score: clusterScore,
          description: `${teacher.department} department has ${deptLeaveCount.get(teacher.department)} absences in last 14 days (flu cluster); this teacher hasn't had a leave in 30+ days`,
        });
        riskScore += clusterScore;
      }
    }

    // Signal 4: Pending leave for target date
    if (pendingLeaveTeacherIds.has(teacher.id)) {
      const pendingLeave = pendingLeaves.find(l => l.teacherId === teacher.id);
      signals.push({
        type: 'PENDING_LEAVE',
        score: 30,
        description: `Has a pending leave application for ${targetDate}: "${pendingLeave?.reason || 'N/A'}"`,
      });
      riskScore += 30;
    }

    // Signal 5: Meeting conflict
    const conflicts = teacherMeetingConflicts.get(teacher.id);
    if (conflicts && conflicts.length > 0) {
      signals.push({
        type: 'MEETING_CONFLICT',
        score: 50,
        description: `Has meeting(s) during class time: ${conflicts.join(', ')}`,
      });
      riskScore += 50;
    }

    // Only include teachers with risk > 0
    if (riskScore > 0) {
      results.push({
        teacherId: teacher.id,
        teacherName: teacher.name,
        department: teacher.department,
        predictedDate: targetDate,
        riskScore: Math.min(100, riskScore),
        signals,
      });
    }
  }

  // Sort by risk score descending
  results.sort((a, b) => b.riskScore - a.riskScore);

  return results;
}

/**
 * Run predictions for tomorrow and day-after, store in DB.
 * Returns the created predictions.
 */
export async function runPredictionEngine(baseDate: string) {
  const dayAfter = new Date(baseDate + 'T00:00:00');
  dayAfter.setDate(dayAfter.getDate() + 1);
  const tomorrow = dayAfter.toISOString().split('T')[0];

  const twoDaysAfter = new Date(baseDate + 'T00:00:00');
  twoDaysAfter.setDate(twoDaysAfter.getDate() + 2);
  const dayAfterTomorrow = twoDaysAfter.toISOString().split('T')[0];

  // Skip weekends for prediction targets
  function nextWorkday(dateStr: string): string | null {
    const dow = new Date(dateStr + 'T00:00:00').getDay();
    if (dow === 0 || dow === 6) return null; // Weekend
    return dateStr;
  }

  const predictions: any[] = [];

  for (const targetDate of [tomorrow, dayAfterTomorrow]) {
    const workday = nextWorkday(targetDate);
    if (!workday) continue;

    // Clear old unresolved predictions for this date
    await db.absencePrediction.deleteMany({
      where: { predictedDate: workday, resolved: false },
    });

    const assessments = await predictAbsencesForDate(workday);

    for (const assessment of assessments) {
      const prediction = await db.absencePrediction.create({
        data: {
          teacherId: assessment.teacherId,
          predictedDate: workday,
          riskScore: assessment.riskScore,
          signals: JSON.stringify(assessment.signals),
        },
      });
      predictions.push({
        ...prediction,
        teacherName: assessment.teacherName,
        department: assessment.department,
        signalsList: assessment.signals,
      });
    }
  }

  return predictions;
}

/**
 * Get predictions for a date, with teacher and schedule info.
 */
export async function getPredictionsForDate(date: string) {
  const predictions = await db.absencePrediction.findMany({
    where: { predictedDate: date, resolved: false },
    include: {
      teacher: {
        include: {
          schedules: {
            where: { dayOfWeek: new Date(date + 'T00:00:00').getDay() },
            include: { subject: true, grade: true, section: true, timeSlot: true },
            orderBy: { timeSlot: { order: 'asc' } },
          },
          teacherSubjects: { include: { subject: true } },
        },
      },
    },
    orderBy: { riskScore: 'desc' },
  });

  return predictions.map(p => ({
    id: p.id,
    teacherId: p.teacherId,
    teacherName: p.teacher.name,
    department: p.teacher.department,
    predictedDate: p.predictedDate,
    riskScore: p.riskScore,
    signals: JSON.parse(p.signals),
    resolved: p.resolved,
    affectedPeriods: p.teacher.schedules
      .filter(s => !s.timeSlot.isBreak)
      .map(s => ({
        scheduleId: s.id,
        subject: s.subject.name,
        subjectColor: s.subject.color,
        grade: s.grade.name,
        gradeLevel: s.grade.level,
        section: s.section.name,
        timeSlot: s.timeSlot.name,
        startTime: s.timeSlot.startTime,
        endTime: s.timeSlot.endTime,
        timeSlotId: s.timeSlotId,
        dayOfWeek: s.dayOfWeek,
      })),
    subjects: p.teacher.teacherSubjects.map(ts => ({
      subjectId: ts.subjectId,
      subjectName: ts.subject.name,
      gradeLevel: ts.gradeLevel,
      isPrimary: ts.isPrimary,
    })),
  }));
}
