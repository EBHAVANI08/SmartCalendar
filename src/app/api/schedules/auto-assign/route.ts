import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

const MAX_PERIODS_PER_DAY = 8;
const OVERLOAD_THRESHOLD = 5; // Teachers with 5+ periods are considered for overload avoidance

// Related subjects mapping for intelligent fallback
const RELATED_SUBJECTS: Record<string, string[]> = {
  'Mathematics': ['Physics', 'Computer Science', 'Economics'],
  'Physics': ['Mathematics', 'Chemistry', 'Computer Science'],
  'Chemistry': ['Physics', 'Biology', 'Mathematics'],
  'Biology': ['Chemistry', 'Physics', 'Environmental Science'],
  'English': ['Hindi', 'Social Studies', 'History'],
  'Hindi': ['English', 'Sanskrit', 'Social Studies'],
  'Sanskrit': ['Hindi', 'English', 'Social Studies'],
  'History': ['Social Studies', 'Geography', 'Civics', 'English'],
  'Geography': ['Social Studies', 'History', 'Environmental Science', 'Civics'],
  'Civics': ['Social Studies', 'History', 'Geography'],
  'Social Studies': ['History', 'Geography', 'Civics', 'English'],
  'Computer Science': ['Mathematics', 'Physics'],
  'Economics': ['Mathematics', 'Social Studies'],
  'Environmental Science': ['Biology', 'Chemistry', 'Geography'],
  'Physical Education': ['Biology', 'Science'],
  'Art': ['English', 'History'],
  'Music': ['English', 'Hindi'],
};

export async function POST(request: Request) {
  try {
    const { grade, section, day, period } = await request.json();

    if (!grade || !section || !day || !period) {
      return NextResponse.json({ error: 'grade, section, day, and period are required' }, { status: 400 });
    }

    // 1. Find the schedule entry for this grade/section/day/period
    const schedule = await db.schedule.findUnique({
      where: {
        grade_section_day_period: { grade, section, day, period },
      },
      include: { teacher: true },
    });

    if (!schedule) {
      return NextResponse.json({ error: 'Schedule not found' }, { status: 404 });
    }

    // 2. If already has teacher, return error
    if (schedule.teacherId) {
      return NextResponse.json({ error: 'This period already has a teacher assigned' }, { status: 400 });
    }

    // 3. Get ALL teachers with their COMPLETE schedules (all days, not just target day)
    const allTeachers = await db.teacher.findMany({
      include: {
        schedules: true, // ALL schedules for comprehensive workload analysis
      },
    });

    const relatedTo = RELATED_SUBJECTS[schedule.subject] || [];

    // 4. Get all schedules for the target day to find busy teachers at this period
    const daySchedulesAtPeriod = await db.schedule.findMany({
      where: { day, period, teacherId: { not: null } },
    });
    const busyTeacherIdsAtPeriod = new Set(daySchedulesAtPeriod.map(s => s.teacherId!));

    // 5. Score and rank ALL available teachers with enhanced intelligence
    const rankedTeachers = allTeachers
      .filter((t) => {
        // CRITICAL: Not busy at this exact day+period (time clash prevention)
        if (busyTeacherIdsAtPeriod.has(t.id)) return false;

        // Also double-check from teacher's own schedule data
        const isBusyAtPeriod = t.schedules.some((s) => s.day === day && s.period === period);
        if (isBusyAtPeriod) return false;

        // Has < MAX_PERIODS_PER_DAY periods that day
        const dayWorkload = t.schedules.filter((s) => s.day === day).length;
        if (dayWorkload >= MAX_PERIODS_PER_DAY) return false;

        return true;
      })
      .map((t) => {
        const grades = JSON.parse(t.grades || '[]') as string[];
        const teachesSubject = t.subject === schedule.subject;
        const teachesRelatedSubject = relatedTo.includes(t.subject);
        const teachesGrade = grades.includes(grade);
        const teachesSimilarGrade = grades.some(g => {
          const gNum = parseInt(g.replace(/\D/g, ''));
          const targetNum = parseInt(grade.replace(/\D/g, ''));
          return !isNaN(gNum) && !isNaN(targetNum) && Math.abs(gNum - targetNum) <= 1;
        });

        // Comprehensive workload analysis
        const dayWorkload = t.schedules.filter((s) => s.day === day).length;
        const weekWorkload = t.schedules.length;
        const gradeFamiliarity = t.schedules.filter((s) => s.grade === grade).length;

        // Check if teacher has back-to-back periods nearby (fatigue indicator)
        const periodsOnDay = t.schedules
          .filter((s) => s.day === day)
          .map((s) => s.period)
          .sort((a, b) => a - b);
        const hasConsecutiveBefore = periodsOnDay.includes(period - 1);
        const hasConsecutiveAfter = periodsOnDay.includes(period + 1);
        const fatiguePenalty = (hasConsecutiveBefore ? 2 : 0) + (hasConsecutiveAfter ? 2 : 0);

        // Overload avoidance - penalize teachers already at threshold
        const overloadPenalty = dayWorkload >= OVERLOAD_THRESHOLD ? (dayWorkload - OVERLOAD_THRESHOLD + 1) * 8 : 0;

        // Scoring system - enhanced with conflict avoidance
        let score = 0;
        if (teachesSubject) score += 50;           // Same subject = highest priority
        if (teachesGrade) score += 30;              // Same grade = strong priority
        else if (teachesSimilarGrade) score += 15;  // Similar grade = moderate priority
        if (teachesRelatedSubject) score += 20;     // Related subject = good fallback
        score += gradeFamiliarity * 5;              // Class familiarity bonus
        score += Math.max(0, 10 - dayWorkload) * 2; // Lower workload bonus (doubled weight)
        score -= fatiguePenalty;                     // Fatigue penalty
        score -= overloadPenalty;                    // Overload penalty

        // Prefer teachers with continuity (teaching same subject in adjacent periods)
        const adjacentSameSubject = t.schedules.some(
          (s) => s.day === day && Math.abs(s.period - period) === 1 && s.subject === schedule.subject
        );
        if (adjacentSameSubject) score += 8;

        let matchLabel = '';
        if (teachesSubject && teachesGrade) matchLabel = 'Best Match — Same subject & grade';
        else if (teachesSubject) matchLabel = 'Subject Specialist';
        else if (teachesRelatedSubject && teachesGrade) matchLabel = 'Related Subject + Same Grade';
        else if (teachesRelatedSubject) matchLabel = 'Related Subject';
        else if (teachesGrade) matchLabel = 'Same Grade Teacher';
        else if (teachesSimilarGrade) matchLabel = 'Similar Grade Teacher';
        else matchLabel = 'Best Available';

        let workloadWarning = '';
        if (dayWorkload >= OVERLOAD_THRESHOLD) {
          workloadWarning = `Already has ${dayWorkload} periods on ${day} — consider balancing`;
        }

        return {
          teacher: t,
          score,
          teachesSubject,
          teachesRelatedSubject,
          teachesGrade,
          teachesSimilarGrade,
          dayWorkload,
          weekWorkload,
          gradeFamiliarity,
          matchLabel,
          workloadWarning,
        };
      })
      .sort((a, b) => b.score - a.score);

    if (rankedTeachers.length > 0) {
      const best = rankedTeachers[0];

      // FINAL SAFETY CHECK: Verify no conflict before assigning
      const existingAssignment = await db.schedule.findFirst({
        where: {
          teacherId: best.teacher.id,
          day,
          period,
          id: { not: schedule.id },
        },
      });

      if (existingAssignment) {
        // This should never happen, but safety first
        console.error(`CONFLICT DETECTED: ${best.teacher.name} already assigned to ${existingAssignment.grade} ${existingAssignment.section} at ${day} Period ${period}`);
        return NextResponse.json({
          error: `Assignment conflict detected. ${best.teacher.name} is already teaching ${existingAssignment.grade} ${existingAssignment.section} at this time. Please try again or assign manually.`,
        }, { status: 409 });
      }

      const updated = await db.schedule.update({
        where: {
          grade_section_day_period: { grade, section, day, period },
        },
        data: { teacherId: best.teacher.id },
        include: { teacher: true },
      });

      const newDayWorkload = best.dayWorkload + 1;

      return NextResponse.json({
        updated,
        autoAssigned: true,
        matchLabel: best.matchLabel,
        score: best.score,
        message: `AI Auto-assigned ${best.teacher.name} (${best.matchLabel}, score: ${best.score})`,
        workloadStatus: newDayWorkload >= OVERLOAD_THRESHOLD
          ? `Warning: ${best.teacher.name} now has ${newDayWorkload} periods on ${day}. Consider workload balancing.`
          : `${best.teacher.name} now has ${newDayWorkload} periods on ${day}.`,
        teacherDayWorkload: newDayWorkload,
      });
    }

    return NextResponse.json({ error: 'No available teachers found. All teachers are either busy at this time slot or at maximum capacity for the day.' }, { status: 404 });
  } catch (error) {
    console.error('Error auto-assigning teacher:', error);
    return NextResponse.json({ error: 'Failed to auto-assign teacher' }, { status: 500 });
  }
}
