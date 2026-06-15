import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const teachers = await db.teacher.findMany({
      include: { schedules: true },
    });

    const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

    // Build per-teacher daily workload
    const workloadData = teachers.map((teacher) => {
      const dailyPeriods: Record<string, number> = {};
      let totalPeriods = 0;

      for (const day of DAYS) {
        const dayPeriods = teacher.schedules.filter((s) => s.day === day).length;
        dailyPeriods[day] = dayPeriods;
        totalPeriods += dayPeriods;
      }

      const avgPeriods = totalPeriods / DAYS.length;
      const maxDay = DAYS.reduce((max, day) => dailyPeriods[day] > dailyPeriods[max] ? day : max, DAYS[0]);
      const minDay = DAYS.reduce((min, day) => dailyPeriods[day] < dailyPeriods[min] ? day : min, DAYS[0]);

      return {
        teacherId: teacher.id,
        teacherName: teacher.name,
        subject: teacher.subject,
        dailyPeriods,
        totalPeriods,
        avgPeriods: Math.round(avgPeriods * 100) / 100,
        maxDay,
        minDay,
        maxDayPeriods: dailyPeriods[maxDay],
        minDayPeriods: dailyPeriods[minDay],
        isOverloaded: Object.values(dailyPeriods).some((p) => p > 6),
        overloadDays: DAYS.filter((day) => dailyPeriods[day] > 6),
      };
    });

    // Distribution: how many teachers have X periods per day
    const distribution: Record<number, number> = {};
    for (const teacher of workloadData) {
      for (const day of DAYS) {
        const p = teacher.dailyPeriods[day];
        distribution[p] = (distribution[p] || 0) + 1;
      }
    }

    // Weekly summary
    const allAvgs = workloadData.map((t) => t.avgPeriods);
    const overallAvg = allAvgs.length > 0 ? allAvgs.reduce((a, b) => a + b, 0) / allAvgs.length : 0;
    const maxAvg = allAvgs.length > 0 ? Math.max(...allAvgs) : 0;
    const minAvg = allAvgs.length > 0 ? Math.min(...allAvgs) : 0;
    const stdDev = allAvgs.length > 0
      ? Math.sqrt(allAvgs.reduce((sum, val) => sum + Math.pow(val - overallAvg, 2), 0) / allAvgs.length)
      : 0;

    const overloadedTeachers = workloadData.filter((t) => t.isOverloaded);

    return NextResponse.json({
      workloadData,
      distribution,
      weeklySummary: {
        overallAvg: Math.round(overallAvg * 100) / 100,
        maxAvg: Math.round(maxAvg * 100) / 100,
        minAvg: Math.round(minAvg * 100) / 100,
        stdDev: Math.round(stdDev * 100) / 100,
        totalTeachers: teachers.length,
      },
      overloadedTeachers,
    });
  } catch (error) {
    console.error('Error fetching workload analytics:', error);
    return NextResponse.json({ error: 'Failed to fetch workload analytics' }, { status: 500 });
  }
}
