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

    const parseTime = (value: string, fallback: number) => {
      if (!value) return fallback;
      const match = /^(\d{1,2}):(\d{2})\s*(am|pm)?$/i.exec(String(value).trim());
      if (!match) return fallback;
      let hours = Number(match[1]);
      const minutes = Number(match[2]);
      const ampm = match[3]?.toLowerCase();
      if (ampm === 'pm' && hours < 12) hours += 12;
      if (ampm === 'am' && hours === 12) hours = 0;
      if (!ampm && hours >= 1 && hours <= 6) hours += 12;
      return hours * 60 + minutes;
    };

    const formatTime = (value: number) => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;

    const start = parseTime(setup.startTime, 570);
    const end = parseTime(setup.endTime, setup.schoolLevel === 'primary' ? 900 : 1020);

    const teachingMinutes = end - start - breakMinutes - lunchMinutes;
    if (teachingMinutes <= 0) {
      return NextResponse.json({ error: `End time (${setup.endTime || '17:00'}) must be after start time (${setup.startTime || '09:30'}) with enough time for breaks.` }, { status: 400 });
    }

    const periodMinutes = Math.floor(teachingMinutes / periods);
    const extraPeriodMinutes = teachingMinutes % periods;

    if (periodMinutes < 15) {
      return NextResponse.json({ error: 'The selected time range is too short for these periods and breaks.' }, { status: 400 });
    }

    let cursor = start;
    const slots = Array.from({ length: periods }, (_, index) => {
      const period = index + 1;
      const startTime = formatTime(cursor);
      cursor += periodMinutes + (index < extraPeriodMinutes ? 1 : 0);
      const endTime = formatTime(cursor);
      if (period === breakAfter) cursor += breakMinutes;
      if (period === lunchAfter) cursor += lunchMinutes;
      return { period, startTime, endTime };
    });

    const whereBase: { grade: string; section: string; schoolId?: string } = { grade, section };
    if (schoolId && schoolId !== 'all') {
      whereBase.schoolId = schoolId;
    }

    const results = await db.$transaction(
      slots.map((slot) =>
        db.schedule.updateMany({
          where: { ...whereBase, period: slot.period },
          data: { startTime: slot.startTime, endTime: slot.endTime },
        })
      )
    );

    const updated = results.reduce((sum, result) => sum + result.count, 0);

    return NextResponse.json({
      success: true,
      updated,
      message: `Updated ${updated} timetable period entries for ${grade} Section ${section} to ${setup.startTime || '09:30'}–${setup.endTime || '17:00'}.`,
    });
  } catch (error) {
    console.error('Error updating timetable timings:', error);
    return NextResponse.json({ error: `Failed to update timetable timings: ${String(error)}` }, { status: 500 });
  }
}
