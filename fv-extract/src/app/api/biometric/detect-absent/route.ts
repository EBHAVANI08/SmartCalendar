import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

// AI-powered absence detection: Pulls biometric data, identifies absent teachers,
// checks leave portal for reasons, gets their schedule + yesterday's topics,
// creates substitution entries with intelligent context
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

    // Get absent teachers from biometric data
    const absentRecords = await db.biometricAttendance.findMany({
      where: { date: detectDate, status: 'absent' },
      include: { teacher: true },
    });

    // Also include late arrivals who haven't checked in by period 1
    const lateRecords = await db.biometricAttendance.findMany({
      where: { date: detectDate, status: 'late' },
      include: { teacher: true },
    });

    // Half-day teachers also need substitution for missed periods
    const halfDayRecords = await db.biometricAttendance.findMany({
      where: { date: detectDate, status: 'half-day' },
      include: { teacher: true },
    });

    const affectedTeachers = [...absentRecords, ...lateRecords, ...halfDayRecords];

    if (affectedTeachers.length === 0) {
      return NextResponse.json({
        success: true,
        date: detectDate,
        message: 'No absent teachers detected from biometric data',
        absentTeachers: [],
        createdSubstitutions: 0,
      });
    }

    // For each absent teacher, get their schedule for today
    const yesterday = new Date(dateObj);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    const yesterdayDay = dayNames[yesterday.getDay()];

    const absentTeachersInfo = [];
    const newSubstitutions = [];

    for (const record of affectedTeachers) {
      const teacher = record.teacher;

      // ── INTELLIGENT REASON DETECTION ──
      // Step 1: Check if teacher applied for leave in the school portal
      const leaveApplication = await db.leaveApplication.findFirst({
        where: {
          teacherId: teacher.id,
          startDate: { lte: detectDate },
          endDate: { gte: detectDate },
          status: 'approved',
        },
      });

      // Step 2: Determine the intelligent reason based on all available data
      let reason: string;
      let reasonSource: string; // Where the reason came from
      let leaveType: string | null = null;
      let isEmergency = false;

      if (leaveApplication) {
        // Teacher has an approved leave — use the actual leave reason
        leaveType = leaveApplication.leaveType;
        isEmergency = leaveApplication.isEmergency;
        reasonSource = 'leave_portal';

        const leaveTypeLabels: Record<string, string> = {
          sick: 'Sick Leave',
          personal: 'Personal Leave',
          casual: 'Casual Leave',
          maternity: 'Maternity Leave',
          official_duty: 'Official Duty',
          training: 'Training/Workshop',
          family_emergency: 'Family Emergency',
          medical_appointment: 'Medical Appointment',
        };

        const typeLabel = leaveTypeLabels[leaveType] || leaveType;
        reason = `${typeLabel} — ${leaveApplication.reason}`;
        if (leaveApplication.isEmergency) {
          reason = `EMERGENCY: ${reason}`;
        }
      } else if (record.status === 'late') {
        // Late arrival — analyze check-in time to give contextual reason
        const checkIn = record.checkInTime;
        if (checkIn) {
          const [hours, minutes] = checkIn.split(':').map(Number);
          const totalMinutes = hours * 60 + minutes;
          if (totalMinutes <= 570) { // Before 9:30
            reason = `Late Arrival (Biometric) — Checked in at ${checkIn}, likely traffic/delay`;
          } else if (totalMinutes <= 630) { // Before 10:30
            reason = `Late Arrival (Biometric) — Checked in at ${checkIn}, significant delay`;
          } else {
            reason = `Late Arrival (Biometric) — Checked in at ${checkIn}, very late arrival`;
          }
        } else {
          reason = 'Late Arrival (Biometric) — No check-in recorded yet';
        }
        reasonSource = 'biometric';
      } else if (record.status === 'half-day') {
        const checkIn = record.checkInTime;
        const checkOut = record.checkOutTime;
        reason = `Half-Day (Biometric) — In: ${checkIn || 'N/A'}, Out: ${checkOut || 'N/A'}`;
        reasonSource = 'biometric';
      } else {
        // Truly absent with no leave — this is an unexcused absence
        // Check biometric history for patterns
        const recentAttendance = await db.biometricAttendance.findMany({
          where: {
            teacherId: teacher.id,
            date: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] },
          },
          orderBy: { date: 'desc' },
          take: 10,
        });

        const recentAbsences = recentAttendance.filter(r => r.status === 'absent').length;

        if (recentAbsences >= 3) {
          reason = `Unexcused Absence — No leave application found. Pattern detected: ${recentAbsences} absences in recent days. Requires follow-up.`;
        } else if (recentAbsences >= 2) {
          reason = `Unexcused Absence — No leave application found. ${recentAbsences} recent absences noted.`;
        } else {
          reason = `Unexcused Absence — No leave application found. No prior pattern. May be emergency.`;
        }
        reasonSource = 'ai_analysis';
      }

      // Get today's schedule for the absent teacher
      const todaySchedule = await db.schedule.findMany({
        where: { teacherId: teacher.id, day: dayName },
        orderBy: { period: 'asc' },
      });

      // For half-day, determine which periods need substitution
      let affectedPeriods = todaySchedule;
      if (record.status === 'half-day' && record.checkOutTime) {
        const [outHour, outMin] = record.checkOutTime.split(':').map(Number);
        const outTotalMin = outHour * 60 + outMin;
        // Only periods that start after checkout need substitution
        affectedPeriods = todaySchedule.filter(s => {
          const [startH, startM] = s.startTime.split(':').map(Number);
          return startH * 60 + startM >= outTotalMin;
        });
      }

      // For late arrival, determine which early periods need substitution
      if (record.status === 'late' && record.checkInTime) {
        const [inHour, inMin] = record.checkInTime.split(':').map(Number);
        const inTotalMin = inHour * 60 + inMin;
        // Periods that end before or at check-in time need substitution
        affectedPeriods = todaySchedule.filter(s => {
          const [endH, endM] = s.endTime.split(':').map(Number);
          return endH * 60 + endM <= inTotalMin;
        });
      }

      // Get yesterday's schedule to find what topics were taught
      const yesterdaySchedule = await db.schedule.findMany({
        where: { teacherId: teacher.id, day: yesterdayDay },
        orderBy: { period: 'asc' },
      });

      // Get yesterday's lesson plans for richer context
      const yesterdayLessonPlans = await db.lessonPlan.findMany({
        where: { teacherId: teacher.id },
      });

      // Get any curriculum topics for context
      const teacherGrades = JSON.parse(teacher.grades || '[]') as string[];
      const curriculumTopics = await db.curriculumTopic.findMany({
        where: {
          subject: teacher.subject,
          board: 'CBSE',
        },
        take: 10,
        orderBy: { sequenceOrder: 'asc' },
      });

      // Build schedule info with yesterday's topics
      const scheduleInfo = affectedPeriods.map(s => {
        // Find yesterday's same period to get what was taught
        const yesterdaySamePeriod = yesterdaySchedule.find(ys => ys.period === s.period);
        const yesterdayTopic = yesterdaySamePeriod?.topic || null;

        // Find matching lesson plan
        const lessonPlan = yesterdayLessonPlans.find(lp =>
          lp.grade === s.grade && lp.subject === s.subject
        );

        // Find matching curriculum topic for today
        const curriculumMatch = curriculumTopics.find(ct =>
          ct.grade === s.grade
        );

        return {
          period: s.period,
          grade: s.grade,
          section: s.section,
          subject: s.subject,
          startTime: s.startTime,
          endTime: s.endTime,
          yesterdayTopic: yesterdayTopic || `Previous ${s.subject} lesson`,
          todayExpectedTopic: s.topic || curriculumMatch?.topic || `${s.subject} — Continuation`,
          yesterdayLessonPlan: lessonPlan ? JSON.parse(lessonPlan.planContent || '{}') : null,
        };
      });

      absentTeachersInfo.push({
        teacherId: teacher.id,
        teacherName: teacher.name,
        teacherSubject: teacher.subject,
        teacherGrades,
        biometricStatus: record.status,
        checkInTime: record.checkInTime,
        checkOutTime: record.checkOutTime,
        reason,
        reasonSource,
        leaveType,
        isEmergency,
        hasLeaveApplication: !!leaveApplication,
        leaveDetails: leaveApplication ? {
          leaveType: leaveApplication.leaveType,
          reason: leaveApplication.reason,
          isEmergency: leaveApplication.isEmergency,
          appliedAt: leaveApplication.appliedAt,
          teacherNotes: leaveApplication.teacherNotes,
        } : null,
        todayScheduleCount: affectedPeriods.length,
        totalScheduleCount: todaySchedule.length,
        scheduleDetails: scheduleInfo,
      });

      // Create substitution entries for each affected period
      for (const sched of affectedPeriods) {
        // Check if substitution already exists
        const existingSub = await db.substitution.findFirst({
          where: {
            date: detectDate,
            period: sched.period,
            absentTeacherId: teacher.id,
            grade: sched.grade,
            section: sched.section,
          },
        });

        if (!existingSub) {
          // Find yesterday's topic
          const yesterdaySamePeriod = yesterdaySchedule.find(ys => ys.period === sched.period);
          const yesterdayTopic = yesterdaySamePeriod?.topic || `Previous ${sched.subject} lesson`;

          // Use AI to determine today's topic from curriculum
          const curriculumMatch = curriculumTopics.find(ct => ct.grade === sched.grade);
          const todayTopic = sched.topic || curriculumMatch?.topic || `${sched.subject} — Continuation`;

          const sub = await db.substitution.create({
            data: {
              date: detectDate,
              period: sched.period,
              absentTeacherId: teacher.id,
              grade: sched.grade,
              section: sched.section,
              subject: sched.subject,
              reason,
              yesterdayTopic,
              todayTopic,
              source: 'biometric',
              status: 'pending',
            },
          });

          newSubstitutions.push(sub);
        }
      }
    }

    return NextResponse.json({
      success: true,
      date: detectDate,
      dayName,
      totalAbsent: absentRecords.length,
      totalLate: lateRecords.length,
      totalHalfDay: halfDayRecords.length,
      absentTeachers: absentTeachersInfo,
      createdSubstitutions: newSubstitutions.length,
      substitutions: newSubstitutions,
    });
  } catch (error) {
    console.error('Error detecting absent teachers:', error);
    return NextResponse.json({ error: 'Failed to detect absent teachers' }, { status: 500 });
  }
}
