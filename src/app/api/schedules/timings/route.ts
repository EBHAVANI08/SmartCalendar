import { db } from '@/lib/db';
import { resolveSchoolId } from '@/lib/school-helper';
import { NextResponse } from 'next/server';

export async function PATCH(request: Request) {
  try {
    const { grade, section, schoolId, setup = {} } = await request.json();
    if (!grade || !section) return NextResponse.json({ error: 'Grade and section are required.' }, { status: 400 });
    const targetSchoolId = schoolId ? await resolveSchoolId(schoolId) : null;

    const currentGradeNumber = Number(String(grade).replace(/\D/g, '') || 0);
    const activeLevel = currentGradeNumber <= 5 ? 'primary' : currentGradeNumber <= 8 ? 'middle' : 'high';
    const effectiveStartTime = (setup.differentSlots && setup[`${activeLevel}Start`]) || setup.startTime || '09:30';
    const effectiveEndTime = (setup.differentSlots && setup[`${activeLevel}End`]) || setup.endTime || '17:00';
    const effectivePeriods = (setup.differentSlots && Number(setup[`${activeLevel}Periods`])) || Number(setup.periodsPerDay) || 8;

    const periods = Math.min(10, Math.max(4, effectivePeriods));
    const breakAfter = Math.min(periods - 1, Math.max(1, Number(setup.breakAfter) || 2));
    const lunchAfter = Math.min(periods - 1, Math.max(breakAfter + 1, Number(setup.lunchAfter) || 4));
    const breakEnabled = setup.breakEnabled !== false && Number(setup.breakMinutes) > 0;
    const lunchEnabled = setup.lunchEnabled !== false && Number(setup.lunchMinutes) > 0;
    const breakMinutes = breakEnabled ? Math.min(30, Math.max(5, Number(setup.breakMinutes) || 15)) : 0;
    const lunchMinutes = lunchEnabled ? Math.min(90, Math.max(15, Number(setup.lunchMinutes) || 45)) : 0;

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

    const start = parseTime(effectiveStartTime, 570);
    const end = parseTime(effectiveEndTime, setup.schoolLevel === 'primary' ? 900 : 1020);

    const teachingMinutes = end - start - breakMinutes - lunchMinutes;
    if (teachingMinutes <= 0) {
      return NextResponse.json({ error: `End time (${effectiveEndTime}) must be after start time (${effectiveStartTime}) with enough time for breaks.` }, { status: 400 });
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

    const cleanGrade = String(grade).replace(/^grade\s+/i, '').trim();
    const gradeVariants = [grade, cleanGrade, `Grade ${cleanGrade}`];

    const whereCondition: Record<string, any> = {
      grade: { in: gradeVariants },
      section: { equals: section, mode: 'insensitive' },
    };
    if (schoolId && schoolId !== 'all') {
      whereCondition.OR = [{ schoolId }, { schoolId: null }];
    }

    const matchingSchedules = await db.schedule.findMany({
      where: whereCondition,
      select: { id: true, period: true },
    });

    const updatePromises = slots.map((slot) =>
      db.schedule.updateMany({
        where: {
          ...whereCondition,
          period: slot.period,
        },
        data: { startTime: slot.startTime, endTime: slot.endTime },
      }),
    );

    const results = await db.$transaction(updatePromises);
    const updated = results.reduce((sum, res) => sum + res.count, 0);

    if (updated === 0 && matchingSchedules.length === 0) {
      const fallbackResults = await db.$transaction(
        slots.map((slot) =>
          db.schedule.updateMany({
            where: { grade, section, period: slot.period },
            data: { startTime: slot.startTime, endTime: slot.endTime },
          }),
        ),
      );
      const fallbackUpdated = fallbackResults.reduce((sum, res) => sum + res.count, 0);
      return NextResponse.json({
        success: true,
        updated: fallbackUpdated,
        message: `Updated ${fallbackUpdated} timetable period entries for ${grade} Section ${section} (${setup.startTime || '09:30'}–${setup.endTime || '17:00'}).`,
      });
    }

    return NextResponse.json({
      success: true,
      updated,
      message: `Updated ${updated} timetable period entries for ${grade} Section ${section} (${setup.startTime || '09:30'}–${setup.endTime || '17:00'}).`,
    });
  } catch (error) {
    console.error('Error updating timetable timings:', error);
    return NextResponse.json({ error: `Failed to update timetable timings: ${String(error)}` }, { status: 500 });
  }
}
