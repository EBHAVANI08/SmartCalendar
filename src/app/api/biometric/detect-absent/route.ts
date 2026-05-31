import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

// AI-powered absence detection — OPTIMIZED with batch queries
export async function POST(request: Request) {
  try {
    const { date } = await request.json();
    const detectDate = date || new Date().toISOString().split('T')[0];

    // Get day of week
    const dateObj = new Date(detectDate + 'T00:00:00');
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayName = dayNames[dateObj.getDay()];

    if (dateObj.getDay() === 0 || dateObj.getDay() === 6) {
      return NextResponse.json({ error: 'Cannot detect absences on weekends', isWeekend: true }, { status: 400 });
    }

    // ── BATCH QUERIES (no N+1) ──
    const yesterday = new Date(dateObj);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayDay = dayNames[yesterday.getDay()];

    // 1. Get all affected records
    const [absentRecords, lateRecords, halfDayRecords] = await Promise.all([
      db.biometricAttendance.findMany({ where: { date: detectDate, status: 'absent' }, include: { teacher: true } }),
      db.biometricAttendance.findMany({ where: { date: detectDate, status: 'late' }, include: { teacher: true } }),
      db.biometricAttendance.findMany({ where: { date: detectDate, status: 'half-day' }, include: { teacher: true } }),
    ]);

    const affectedTeachers = [...absentRecords, ...lateRecords, ...halfDayRecords];

    if (affectedTeachers.length === 0) {
      return NextResponse.json({
        success: true, date: detectDate,
        message: 'No absent teachers detected from biometric data',
        absentTeachers: [], createdSubstitutions: 0,
      });
    }

    const affectedTeacherIds = affectedTeachers.map(r => r.teacherId);

    // 2. Batch load: leave applications, today's schedules, yesterday's schedules
    const [leaveApplications, todaySchedules, yesterdaySchedules, lessonPlans, curriculumTopics] = await Promise.all([
      db.leaveApplication.findMany({
        where: { teacherId: { in: affectedTeacherIds }, startDate: { lte: detectDate }, endDate: { gte: detectDate }, status: 'approved' },
      }),
      db.schedule.findMany({ where: { teacherId: { in: affectedTeacherIds }, day: dayName }, orderBy: { period: 'asc' } }),
      db.schedule.findMany({ where: { teacherId: { in: affectedTeacherIds }, day: yesterdayDay }, orderBy: { period: 'asc' } }),
      db.lessonPlan.findMany({ where: { teacherId: { in: affectedTeacherIds } } }),
      db.curriculumTopic.findMany({ where: { board: 'CBSE' }, take: 50, orderBy: { sequenceOrder: 'asc' } }),
    ]);

    // 3. Batch load existing substitutions to avoid duplicates
    const existingSubs = await db.substitution.findMany({
      where: { date: detectDate, source: 'biometric' },
    });
    const existingSubKeys = new Set(existingSubs.map(s => `${s.period}_${s.absentTeacherId}_${s.grade}_${s.section}`));

    // Reset any previously assigned biometric substitutions back to pending for re-assignment
    // This allows the AI to re-evaluate and potentially find better substitutes
    const assignedSubs = existingSubs.filter(s => s.status === 'assigned');
    if (assignedSubs.length > 0) {
      await db.substitution.updateMany({
        where: {
          id: { in: assignedSubs.map(s => s.id) },
        },
        data: {
          status: 'pending',
          substituteId: null,
        },
      });
      console.log(`[Detect-Absent] Reset ${assignedSubs.length} previously assigned substitutions back to pending for re-assignment`);
    }

    // Also batch check recent attendance for AI analysis pattern detection
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const recentAttendance = await db.biometricAttendance.findMany({
      where: { teacherId: { in: affectedTeacherIds }, date: { gte: thirtyDaysAgo } },
    });

    // Build lookup maps
    const leaveByTeacher = new Map<string, typeof leaveApplications[0]>();
    leaveApplications.forEach(la => leaveByTeacher.set(la.teacherId, la));

    const todaySchedulesByTeacher = new Map<string, typeof todaySchedules>();
    todaySchedules.forEach(s => {
      const list = todaySchedulesByTeacher.get(s.teacherId!) || [];
      list.push(s);
      todaySchedulesByTeacher.set(s.teacherId!, list);
    });

    const yesterdaySchedulesByTeacher = new Map<string, typeof yesterdaySchedules>();
    yesterdaySchedules.forEach(s => {
      const list = yesterdaySchedulesByTeacher.get(s.teacherId!) || [];
      list.push(s);
      yesterdaySchedulesByTeacher.set(s.teacherId!, list);
    });

    const recentAbsencesByTeacher = new Map<string, number>();
    recentAttendance.filter(r => r.status === 'absent').forEach(r => {
      recentAbsencesByTeacher.set(r.teacherId, (recentAbsencesByTeacher.get(r.teacherId) || 0) + 1);
    });

    // ── PROCESS EACH AFFECTED TEACHER ──
    const absentTeachersInfo = [];
    const newSubstitutionsData = [];

    for (const record of affectedTeachers) {
      const teacher = record.teacher;
      const leaveApplication = leaveByTeacher.get(teacher.id);

      // ── INTELLIGENT REASON DETECTION ──
      let reason: string;
      let reasonSource: string;
      let leaveType: string | null = null;
      let isEmergency = false;

      if (leaveApplication) {
        leaveType = leaveApplication.leaveType;
        isEmergency = leaveApplication.isEmergency;
        reasonSource = 'leave_portal';
        const leaveTypeLabels: Record<string, string> = {
          sick: 'Sick Leave', personal: 'Personal Leave', casual: 'Casual Leave',
          maternity: 'Maternity Leave', official_duty: 'Official Duty', training: 'Training/Workshop',
          family_emergency: 'Family Emergency', medical_appointment: 'Medical Appointment',
        };
        const typeLabel = leaveTypeLabels[leaveType] || leaveType;
        reason = `${typeLabel} — ${leaveApplication.reason}`;
        if (isEmergency) reason = `EMERGENCY: ${reason}`;
      } else if (record.status === 'late') {
        const checkIn = record.checkInTime;
        if (checkIn) {
          const [hours, minutes] = checkIn.split(':').map(Number);
          const totalMinutes = hours * 60 + minutes;
          if (totalMinutes <= 570) reason = `Late Arrival (Biometric) — Checked in at ${checkIn}, likely traffic/delay`;
          else if (totalMinutes <= 630) reason = `Late Arrival (Biometric) — Checked in at ${checkIn}, significant delay`;
          else reason = `Late Arrival (Biometric) — Checked in at ${checkIn}, very late arrival`;
        } else {
          reason = 'Late Arrival (Biometric) — No check-in recorded yet';
        }
        reasonSource = 'biometric';
      } else if (record.status === 'half-day') {
        reason = `Half-Day (Biometric) — In: ${record.checkInTime || 'N/A'}, Out: ${record.checkOutTime || 'N/A'}`;
        reasonSource = 'biometric';
      } else {
        const recentAbsences = recentAbsencesByTeacher.get(teacher.id) || 0;
        if (recentAbsences >= 3) reason = `Unexcused Absence — No leave application found. Pattern detected: ${recentAbsences} absences in recent days. Requires follow-up.`;
        else if (recentAbsences >= 2) reason = `Unexcused Absence — No leave application found. ${recentAbsences} recent absences noted.`;
        else reason = `Unexcused Absence — No leave application found. No prior pattern. May be emergency.`;
        reasonSource = 'ai_analysis';
      }

      // Get today's schedule from batch
      const todaySchedule = todaySchedulesByTeacher.get(teacher.id) || [];

      // Determine affected periods
      let affectedPeriods = todaySchedule;
      if (record.status === 'half-day' && record.checkOutTime) {
        const [outHour, outMin] = record.checkOutTime.split(':').map(Number);
        const outTotalMin = outHour * 60 + outMin;
        affectedPeriods = todaySchedule.filter(s => {
          const [startH, startM] = s.startTime.split(':').map(Number);
          return startH * 60 + startM >= outTotalMin;
        });
      }
      if (record.status === 'late' && record.checkInTime) {
        const [inHour, inMin] = record.checkInTime.split(':').map(Number);
        const inTotalMin = inHour * 60 + inMin;
        affectedPeriods = todaySchedule.filter(s => {
          const [endH, endM] = s.endTime.split(':').map(Number);
          return endH * 60 + endM <= inTotalMin;
        });
      }

      const yesterdaySchedule = yesterdaySchedulesByTeacher.get(teacher.id) || [];
      const teacherGrades = JSON.parse(teacher.grades || '[]') as string[];

      // Build schedule info
      const scheduleInfo = affectedPeriods.map(s => {
        const yesterdaySamePeriod = yesterdaySchedule.find(ys => ys.period === s.period);
        const yesterdayTopic = yesterdaySamePeriod?.topic || null;
        const lessonPlan = lessonPlans.find(lp => lp.teacherId === teacher.id && lp.grade === s.grade && lp.subject === s.subject);
        const curriculumMatch = curriculumTopics.find(ct => ct.subject === teacher.subject && ct.grade === s.grade);
        return {
          period: s.period, grade: s.grade, section: s.section, subject: s.subject,
          startTime: s.startTime, endTime: s.endTime,
          yesterdayTopic: yesterdayTopic || `Previous ${s.subject} lesson`,
          todayExpectedTopic: s.topic || curriculumMatch?.topic || `${s.subject} — Continuation`,
          yesterdayLessonPlan: lessonPlan ? JSON.parse(lessonPlan.planContent || '{}') : null,
        };
      });

      absentTeachersInfo.push({
        teacherId: teacher.id, teacherName: teacher.name, teacherSubject: teacher.subject, teacherGrades,
        biometricStatus: record.status, checkInTime: record.checkInTime, checkOutTime: record.checkOutTime,
        reason, reasonSource, leaveType, isEmergency,
        hasLeaveApplication: !!leaveApplication,
        leaveDetails: leaveApplication ? { leaveType: leaveApplication.leaveType, reason: leaveApplication.reason, isEmergency: leaveApplication.isEmergency, appliedAt: leaveApplication.appliedAt, teacherNotes: leaveApplication.teacherNotes } : null,
        todayScheduleCount: affectedPeriods.length, totalScheduleCount: todaySchedule.length,
        scheduleDetails: scheduleInfo,
      });

      // Prepare substitution entries (batch create)
      for (const sched of affectedPeriods) {
        const subKey = `${sched.period}_${teacher.id}_${sched.grade}_${sched.section}`;
        if (!existingSubKeys.has(subKey)) {
          const yesterdaySamePeriod = yesterdaySchedule.find(ys => ys.period === sched.period);
          const yesterdayTopic = yesterdaySamePeriod?.topic || `Previous ${sched.subject} lesson`;
          const curriculumMatch = curriculumTopics.find(ct => ct.subject === teacher.subject && ct.grade === sched.grade);
          const todayTopic = sched.topic || curriculumMatch?.topic || `${sched.subject} — Continuation`;

          newSubstitutionsData.push({
            date: detectDate, period: sched.period, absentTeacherId: teacher.id,
            grade: sched.grade, section: sched.section, subject: sched.subject,
            reason, yesterdayTopic, todayTopic, source: 'biometric' as const, status: 'pending' as const,
          });
          existingSubKeys.add(subKey); // Prevent duplicate within this batch
        }
      }
    }

    // ── BATCH CREATE SUBSTITUTIONS ──
    let createdCount = 0;
    if (newSubstitutionsData.length > 0) {
      await db.substitution.createMany({ data: newSubstitutionsData });
      createdCount = newSubstitutionsData.length;
    }

    return NextResponse.json({
      success: true, date: detectDate, dayName,
      totalAbsent: absentRecords.length, totalLate: lateRecords.length, totalHalfDay: halfDayRecords.length,
      absentTeachers: absentTeachersInfo, createdSubstitutions: createdCount,
    });
  } catch (error) {
    console.error('Error detecting absent teachers:', error);
    return NextResponse.json({ error: 'Failed to detect absent teachers' }, { status: 500 });
  }
}
