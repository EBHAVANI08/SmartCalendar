import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

const MAX_PERIODS_PER_DAY = 8;

// AI-powered bulk substitution assignment
// Finds the best recommended teachers based on:
// 1. Same subject match (highest priority)
// 2. Same or similar grades taught
// 3. Teacher workload (lowest workload preferred)
// 4. Teacher availability (no clash with other classes at that period)
// 5. Already assigned substitutions that day (avoid overloading)
export async function POST(request: Request) {
  try {
    const { date } = await request.json();
    const assignDate = date || new Date().toISOString().split('T')[0];

    // Get day of week
    const dateObj = new Date(assignDate + 'T00:00:00');
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayName = dayNames[dateObj.getDay()];

    // Get all pending biometric substitutions for this date
    const pendingSubs = await db.substitution.findMany({
      where: {
        date: assignDate,
        source: 'biometric',
        status: 'pending',
      },
      include: {
        absentTeacher: true,
      },
      orderBy: { period: 'asc' },
    });

    if (pendingSubs.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No pending biometric substitutions to assign',
        assigned: 0,
        failed: 0,
        assignments: [],
      });
    }

    // Get all teachers with their schedules for today
    const allTeachers = await db.teacher.findMany({
      include: {
        schedules: {
          where: { day: dayName },
        },
      },
    });

    // Get already-assigned substitutions for today (to track workload)
    const todayAssignedSubs = await db.substitution.findMany({
      where: {
        date: assignDate,
        status: 'assigned',
      },
    });

    // Build a workload map: teacherId -> { regularPeriods: Set, substitutionPeriods: Set }
    const workloadMap = new Map<string, { regularPeriods: Set<number>; substitutionPeriods: Set<number> }>();

    for (const teacher of allTeachers) {
      const regularPeriods = new Set(teacher.schedules.map(s => s.period));
      const substitutionPeriods = new Set<number>();

      // Add periods where this teacher is already assigned as substitute
      for (const sub of todayAssignedSubs) {
        if (sub.substituteId === teacher.id) {
          substitutionPeriods.add(sub.period);
        }
      }

      workloadMap.set(teacher.id, { regularPeriods, substitutionPeriods });
    }

    const assignments = [];
    let assigned = 0;
    let failed = 0;

    // Process substitutions period by period (earliest first)
    for (const sub of pendingSubs) {
      const { period, grade, section, subject, absentTeacherId } = sub;

      // Find eligible teachers
      const eligibleTeachers = [];

      for (const teacher of allTeachers) {
        // Skip absent teacher
        if (teacher.id === absentTeacherId) return;

        const workload = workloadMap.get(teacher.id);
        if (!workload) continue;

        // Check availability: not busy at this period (regular or substitution)
        const isBusyAtPeriod = workload.regularPeriods.has(period) || workload.substitutionPeriods.has(period);
        if (isBusyAtPeriod) continue;

        // Check total workload doesn't exceed max
        const totalWorkload = workload.regularPeriods.size + workload.substitutionPeriods.size;
        if (totalWorkload >= MAX_PERIODS_PER_DAY) continue;

        // Also check if this teacher is absent today
        const biometricRecord = await db.biometricAttendance.findUnique({
          where: { date_teacherId: { date: assignDate, teacherId: teacher.id } },
        });
        if (biometricRecord && (biometricRecord.status === 'absent' || biometricRecord.status === 'half-day')) continue;

        // Scoring system
        const teacherGrades = JSON.parse(teacher.grades || '[]') as string[];
        const teachesSubject = teacher.subject === subject;
        const teachesGrade = teacherGrades.includes(grade);
        const teachesSimilarGrade = teacherGrades.some(g => {
          // Similar grades = same numeric level (e.g., Grade 9 and Grade 10 are similar)
          const gNum = parseInt(g.replace(/\D/g, ''));
          const targetNum = parseInt(grade.replace(/\D/g, ''));
          return Math.abs(gNum - targetNum) <= 1;
        });

        // Calculate score (higher is better)
        let score = 0;

        // Subject match is highest priority (40 points)
        if (teachesSubject) score += 40;

        // Grade match (25 points)
        if (teachesGrade) score += 25;

        // Similar grade (15 points)
        if (!teachesGrade && teachesSimilarGrade) score += 15;

        // Lower workload bonus (up to 10 points)
        const workloadRatio = totalWorkload / MAX_PERIODS_PER_DAY;
        score += Math.round((1 - workloadRatio) * 10);

        // Familiarity with this specific class (10 points)
        const hasClassFamiliarity = teacher.schedules.some(
          s => s.grade === grade && s.section === section
        );
        if (hasClassFamiliarity) score += 10;

        // Already doing substitution today — slight penalty to spread the load
        if (workload.substitutionPeriods.size > 0) {
          score -= workload.substitutionPeriods.size * 2;
        }

        eligibleTeachers.push({
          teacher,
          score,
          teachesSubject,
          teachesGrade,
          teachesSimilarGrade,
          totalWorkload,
          hasClassFamiliarity,
        });
      }

      // Sort by score (highest first)
      eligibleTeachers.sort((a, b) => b.score - a.score);

      if (eligibleTeachers.length > 0) {
        const best = eligibleTeachers[0];

        // Assign the best teacher
        const updated = await db.substitution.update({
          where: { id: sub.id },
          data: {
            substituteId: best.teacher.id,
            status: 'assigned',
          },
          include: {
            absentTeacher: true,
            substitute: true,
          },
        });

        // Update workload map for this teacher (so next assignments consider it)
        const workload = workloadMap.get(best.teacher.id);
        if (workload) {
          workload.substitutionPeriods.add(period);
        }

        assignments.push({
          substitutionId: sub.id,
          period: sub.period,
          grade: sub.grade,
          section: sub.section,
          subject: sub.subject,
          assignedTeacher: best.teacher.name,
          assignedTeacherSubject: best.teacher.subject,
          score: best.score,
          reason: buildAssignmentReason(best),
        });

        assigned++;
      } else {
        failed++;
        assignments.push({
          substitutionId: sub.id,
          period: sub.period,
          grade: sub.grade,
          section: sub.section,
          subject: sub.subject,
          assignedTeacher: null,
          score: 0,
          reason: 'No eligible teacher found — requires manual assignment',
        });
      }
    }

    // Generate substitute context for all assigned substitutions
    for (const assignment of assignments) {
      if (assignment.assignedTeacher) {
        try {
          // Trigger context generation in background (don't await)
          fetch('/api/biometric/generate-sub-context', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ substitutionId: assignment.substitutionId }),
          }).catch(() => {
            // Context generation failure is non-critical
          });
        } catch {
          // Non-critical
        }
      }
    }

    return NextResponse.json({
      success: true,
      date: assignDate,
      totalPending: pendingSubs.length,
      assigned,
      failed,
      assignments,
      message: `AI assigned ${assigned} of ${pendingSubs.length} substitutions${failed > 0 ? `. ${failed} require manual assignment.` : ''}`,
    });
  } catch (error) {
    console.error('Error in AI bulk assignment:', error);
    return NextResponse.json({ error: 'Failed to assign substitutes' }, { status: 500 });
  }
}

function buildAssignmentReason(best: {
  teacher: { subject: string; name: string };
  teachesSubject: boolean;
  teachesGrade: boolean;
  teachesSimilarGrade: boolean;
  totalWorkload: number;
  hasClassFamiliarity: boolean;
}): string {
  const reasons: string[] = [];
  if (best.teachesSubject) reasons.push('Subject specialist match');
  if (best.teachesGrade) reasons.push('Teaches this grade');
  else if (best.teachesSimilarGrade) reasons.push('Teaches similar grade');
  if (best.hasClassFamiliarity) reasons.push('Familiar with this class/section');
  reasons.push(`Workload: ${best.totalWorkload}/${MAX_PERIODS_PER_DAY} periods`);
  return reasons.join(' • ');
}
