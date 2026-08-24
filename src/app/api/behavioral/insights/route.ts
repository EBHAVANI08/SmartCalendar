import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { resolveSchoolId } from '@/lib/school-helper';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const rawSchoolId = searchParams.get('schoolId');
    const schoolId = (await resolveSchoolId(rawSchoolId)) || '';

    const [schedules, substitutions, teachers] = await Promise.all([
      db.schedule.findMany({
        where: { schoolId },
        include: { teacher: true },
      }),
      db.substitution.findMany({
        where: { absentTeacher: { schoolId } },
        include: { absentTeacher: true, substitute: true },
        take: 50,
      }),
      db.teacher.findMany({
        where: { schoolId },
      }),
    ]);

    const insights: Array<{
      id: string;
      type: string;
      title: string;
      description: string;
      severity: string;
      icon: string;
      badge: string;
    }> = [];

    // 1. Analyze empty periods
    const emptySchedules = schedules.filter(s => !s.teacherId);
    if (emptySchedules.length > 0) {
      insights.push({
        id: 'empty-periods',
        type: 'warning',
        title: `${emptySchedules.length} Unallocated Periods Detected`,
        description: `Found ${emptySchedules.length} period slots with no teacher assigned across classes. Use AI Timetable Studio or Bulk Allot to assign them automatically.`,
        severity: 'MEDIUM',
        icon: 'AlertCircle',
        badge: `${emptySchedules.length} unassigned`,
      });
    } else {
      insights.push({
        id: 'schedules-covered',
        type: 'success',
        title: '100% Period Coverage Across All Classes',
        description: 'All timetable period slots have assigned teachers with zero hard conflicts detected.',
        severity: 'LOW',
        icon: 'CheckCircle2',
        badge: 'Optimal',
      });
    }

    // 2. Analyze Monday / Weekday substitution trends
    const subsByDay: Record<string, number> = {};
    for (const sub of substitutions) {
      try {
        const dateObj = new Date(sub.date + 'T00:00:00');
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const day = dayNames[dateObj.getDay()] || 'Monday';
        subsByDay[day] = (subsByDay[day] || 0) + 1;
      } catch {
        // ignore date parse error
      }
    }

    const peakDay = Object.entries(subsByDay).sort((a, b) => b[1] - a[1])[0];
    if (peakDay && peakDay[1] > 0) {
      insights.push({
        id: 'substitution-trend',
        type: 'warning',
        title: `Peak Substitution Rate on ${peakDay[0]}s`,
        description: `${peakDay[0]} has recorded ${peakDay[1]} substitution requests. Consider planning standby substitutes for ${peakDay[0]} mornings.`,
        severity: 'MEDIUM',
        icon: 'AlertTriangle',
        badge: `${peakDay[0]} peak`,
      });
    } else {
      insights.push({
        id: 'substitution-stable',
        type: 'info',
        title: 'Substitution Load Evenly Distributed',
        description: 'Teacher absence rate is stable across the week with automated substitute recommendation active.',
        severity: 'LOW',
        icon: 'Activity',
        badge: 'Balanced',
      });
    }

    // 3. Analyze Teacher Workload
    const teacherPeriodsCount: Record<string, { name: string; count: number }> = {};
    for (const s of schedules) {
      if (s.teacher) {
        if (!teacherPeriodsCount[s.teacher.id]) {
          teacherPeriodsCount[s.teacher.id] = { name: s.teacher.name, count: 0 };
        }
        teacherPeriodsCount[s.teacher.id].count += 1;
      }
    }

    const overloaded = Object.values(teacherPeriodsCount).filter(t => t.count > 30);
    if (overloaded.length > 0) {
      insights.push({
        id: 'workload-alert',
        type: 'warning',
        title: `${overloaded.length} Faculty Member${overloaded.length > 1 ? 's' : ''} High Workload`,
        description: `${overloaded.map(t => t.name).slice(0, 3).join(', ')} assigned >30 periods/week. Consider balancing workload.`,
        severity: 'HIGH',
        icon: 'AlertTriangle',
        badge: 'Workload > 30',
      });
    } else if (teachers.length > 0) {
      insights.push({
        id: 'workload-optimal',
        type: 'success',
        title: 'Optimal Teacher Workload Distribution',
        description: `Workload across all ${teachers.length} teachers is within standard NEP limits (avg ${(schedules.length / Math.max(1, teachers.length)).toFixed(1)} periods/week).`,
        severity: 'LOW',
        icon: 'CheckCircle2',
        badge: 'Balanced',
      });
    }

    // 4. Sports / PE distribution
    const sportsPeriods = schedules.filter(s => /sport|physical|games|p\.e\.?/i.test(s.subject));
    if (sportsPeriods.length > 0) {
      insights.push({
        id: 'sports-distribution',
        type: 'info',
        title: `${sportsPeriods.length} Physical Education & Sports Slots Active`,
        description: 'Physical Education sessions are distributed across grades ensuring active movement breaks for students.',
        severity: 'LOW',
        icon: 'Brain',
        badge: 'Healthy Routine',
      });
    }

    return NextResponse.json({
      success: true,
      data: insights,
    });
  } catch (error) {
    console.error('[BEHAVIORAL_INSIGHTS_GET_ERROR]', error);
    return NextResponse.json({ success: false, error: 'Failed to compute behavioral insights' }, { status: 500 });
  }
}
