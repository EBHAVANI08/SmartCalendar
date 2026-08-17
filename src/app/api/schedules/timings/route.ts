import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function PATCH(request: Request) {
  try {
    const { grade, section, schoolId, setup = {} } = await request.json();
    if (!grade || !section) return NextResponse.json({ error: 'Grade and section are required.' }, { status: 400 });

    const periods = Math.min(10, Math.max(4, Number(setup.periodsPerDay) || 8));
    const breakAfter = Math.min(periods - 1, Math.max(1, Number(setup.breakAfter) || 2));
    const lunchAfter = Math.min(periods - 1, Math.max(breakAfter + 1, Number(setup.lunchAfter) || 4));
    const breakMinutes = Math.min(30, Math.max(5, Number(setup.breakMinutes) || 15));
    const lunchMinutes = Math.min(90, Math.max(15, Number(setup.lunchMinutes) || 45));
    const parseTime = (value: string, fallback: number) => { const match = /^(\d{1,2}):(\d{2})$/.exec(value || ''); return match ? Number(match[1]) * 60 + Number(match[2]) : fallback; };
    const formatTime = (value: number) => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
    const start = parseTime(setup.startTime, 570);
    const end = parseTime(setup.endTime, setup.schoolLevel === 'primary' ? 900 : 1020);
    const periodMinutes = Math.floor((end - start - breakMinutes - lunchMinutes) / periods);
    if (periodMinutes < 25) return NextResponse.json({ error: 'The selected time range is too short for these periods and breaks.' }, { status: 400 });

    let cursor = start;
    const slots = Array.from({ length: periods }, (_, index) => {
      const period = index + 1; const startTime = formatTime(cursor); cursor += periodMinutes; const endTime = formatTime(cursor);
      if (period === breakAfter) cursor += breakMinutes;
      if (period === lunchAfter) cursor += lunchMinutes;
      return { period, startTime, endTime };
    });
    const whereBase = { grade, section, ...(schoolId ? { schoolId } : {}) };
    const results = await db.$transaction(slots.map((slot) => db.schedule.updateMany({ where: { ...whereBase, period: slot.period }, data: { startTime: slot.startTime, endTime: slot.endTime } })));
    const updated = results.reduce((sum, result) => sum + result.count, 0);
    return NextResponse.json({ success: true, updated, message: `Updated ${updated} existing timetable periods to ${setup.startTime || '09:30'}–${setup.endTime || '17:00'}. Subjects and teacher allotments were not changed.` });
  } catch (error) {
    return NextResponse.json({ error: `Failed to update timetable timings: ${String(error)}` }, { status: 500 });
  }
}
