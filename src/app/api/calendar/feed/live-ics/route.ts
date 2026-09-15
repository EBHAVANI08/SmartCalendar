export const dynamic = 'force-dynamic';

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

const escapeIcs = (value: string) =>
  String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
    .replace(/\n/g, '\\n');

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const teacherId = searchParams.get('teacherId');
    const schoolId = searchParams.get('schoolId');
    const token = searchParams.get('token');

    // Find teacher or school
    let resolvedSchoolId = schoolId;
    let teacherName = 'All Faculty';

    if (teacherId) {
      const teacher = await db.teacher.findUnique({
        where: { id: teacherId },
        select: { id: true, name: true, schoolId: true },
      });
      if (!teacher) {
        return new NextResponse('Teacher not found', { status: 404 });
      }
      resolvedSchoolId = teacher.schoolId || resolvedSchoolId;
      teacherName = teacher.name;
    }

    if (!resolvedSchoolId) {
      return new NextResponse('schoolId or teacherId is required', { status: 400 });
    }

    // 1. Fetch recurring timetable schedules
    const schedules = await db.schedule.findMany({
      where: {
        schoolId: resolvedSchoolId,
        ...(teacherId ? { teacherId } : {}),
      },
      include: { teacher: true },
      orderBy: [{ day: 'asc' }, { period: 'asc' }],
    });

    // 2. Fetch school calendar events & academic holidays
    const calendarEvents = await db.calendarEvent.findMany({
      where: {
        schoolId: resolvedSchoolId,
        status: { not: 'cancelled' },
      },
      orderBy: { startAt: 'asc' },
      take: 100,
    });

    const dayOffsets: Record<string, number> = {
      Monday: 0,
      Tuesday: 1,
      Wednesday: 2,
      Thursday: 3,
      Friday: 4,
      Saturday: 5,
      Sunday: 6,
    };

    const base = new Date('2026-06-01T00:00:00');
    const icsEvents: string[] = [];

    // Map weekly timetable slots
    for (const slot of schedules) {
      const date = new Date(base);
      date.setDate(base.getDate() + (dayOffsets[slot.day] ?? 0));
      const ymd = date.toISOString().slice(0, 10).replace(/-/g, '');
      const start = (slot.startTime || '08:00').replace(':', '') + '00';
      const end = (slot.endTime || '08:45').replace(':', '') + '00';

      icsEvents.push(
        [
          'BEGIN:VEVENT',
          `UID:slot_${slot.id}@learnx.smartcalendar`,
          `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
          `DTSTART;TZID=Asia/Kolkata:${ymd}T${start}`,
          `DTEND;TZID=Asia/Kolkata:${ymd}T${end}`,
          `RRULE:FREQ=WEEKLY;UNTIL=20270531T235959Z`,
          `SUMMARY:${escapeIcs(`${slot.subject} — ${slot.grade} ${slot.section}`)}`,
          `DESCRIPTION:${escapeIcs(`Faculty: ${slot.teacher?.name || teacherName}\\nPeriod: ${slot.period}\\nTopic: ${slot.topic || 'Standard Curriculum'}`)}`,
          `LOCATION:${escapeIcs(slot.roomId || 'Assigned Classroom')}`,
          'STATUS:CONFIRMED',
          'END:VEVENT',
        ].join('\r\n')
      );
    }

    // Map school events & holidays
    for (const event of calendarEvents) {
      const dtStart = event.allDay
        ? `DTSTART;VALUE=DATE:${event.startAt.toISOString().slice(0, 10).replace(/-/g, '')}`
        : `DTSTART;TZID=Asia/Kolkata:${event.startAt.toISOString().replace(/[-:]/g, '').slice(0, 15)}`;
      const dtEnd = event.allDay
        ? `DTEND;VALUE=DATE:${event.endAt.toISOString().slice(0, 10).replace(/-/g, '')}`
        : `DTEND;TZID=Asia/Kolkata:${event.endAt.toISOString().replace(/[-:]/g, '').slice(0, 15)}`;

      icsEvents.push(
        [
          'BEGIN:VEVENT',
          `UID:event_${event.id}@learnx.smartcalendar`,
          `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
          dtStart,
          dtEnd,
          `SUMMARY:${escapeIcs(event.title)}`,
          `DESCRIPTION:${escapeIcs(event.description || `${event.category.toUpperCase()} Event`)}`,
          `LOCATION:${escapeIcs(event.roomId || 'Campus')}`,
          'STATUS:CONFIRMED',
          'END:VEVENT',
        ].join('\r\n')
      );
    }

    const calendarBody = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//LearnX Technologies//AI Smart Calendar Feed//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      `X-WR-CALNAME:${escapeIcs(`Smart Calendar — ${teacherName}`)}`,
      'X-WR-TIMEZONE:Asia/Kolkata',
      'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
      'X-PUBLISHED-TTL:PT1H',
      ...icsEvents,
      'END:VCALENDAR',
    ].join('\r\n');

    return new NextResponse(calendarBody, {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `inline; filename="calendar_feed.ics"`,
        'Cache-Control': 'no-cache, no-store, max-age=0, must-revalidate',
      },
    });
  } catch (error: any) {
    return new NextResponse(`Error generating calendar feed: ${error?.message || error}`, { status: 500 });
  }
}
