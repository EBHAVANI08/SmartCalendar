export const dynamic = 'force-dynamic';

import { db } from '@/lib/db';
import { getTenantSchoolId } from '@/lib/school-helper';
import { NextResponse } from 'next/server';

/**
 * The Academic Calendar for one month.
 *
 * The page used to render a hardcoded array of eight invented events. This
 * returns what the school actually has, from three real sources:
 *
 *   school   - CalendarEvent rows the school created
 *   leave    - approved LeaveApplication rows
 *   cover    - Substitution rows
 *
 * Normal teaching periods are deliberately NOT included. A single school week
 * is ~950 Schedule rows; putting them on a month grid would bury the handful of
 * entries an Admin actually needs to see. The timetable already has its own view.
 */

type FeedEntry = {
  id: string;
  title: string;
  date: string;
  category: string;
  source: 'school' | 'leave' | 'cover';
  description?: string;
  time?: string;
  location?: string;
  readOnly: boolean;
};

const ymd = (d: Date) => {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};

export async function GET(request: Request) {
  const schoolId = await getTenantSchoolId(request);
  if (!schoolId) {
    return NextResponse.json({ error: 'No school context. Please sign in again.' }, { status: 401 });
  }

  const url = new URL(request.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  if (!from || !to) {
    return NextResponse.json({ error: 'from and to (YYYY-MM-DD) are required' }, { status: 400 });
  }
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T23:59:59`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return NextResponse.json({ error: 'Invalid date range' }, { status: 400 });
  }

  const entries: FeedEntry[] = [];
  const counts = { school: 0, leave: 0, cover: 0 };

  // 1. Events the school created.
  const events = await db.calendarEvent.findMany({
    where: { schoolId, status: { not: 'cancelled' }, startAt: { lte: end }, endAt: { gte: start } },
    orderBy: { startAt: 'asc' },
  }).catch(() => []);
  for (const e of events) {
    entries.push({
      id: e.id,
      title: e.title,
      date: ymd(e.startAt),
      category: e.category,
      source: 'school',
      description: e.description ?? undefined,
      time: e.allDay ? 'All Day' : `${e.startAt.toTimeString().slice(0, 5)} - ${e.endAt.toTimeString().slice(0, 5)}`,
      readOnly: false,
    });
    counts.school++;
  }

  // 2. Approved leave, which is operationally meaningful - it is why cover exists.
  const leaves = await db.leaveApplication.findMany({
    where: {
      status: 'approved',
      teacher: { schoolId },
      startDate: { lte: to },
      endDate: { gte: from },
    },
    include: { teacher: { select: { name: true } } },
  }).catch(() => []);
  for (const l of leaves) {
    entries.push({
      id: `leave-${l.id}`,
      title: `${l.teacher?.name ?? 'Teacher'} on leave`,
      date: l.startDate,
      category: 'leave',
      source: 'leave',
      description: [l.leaveType, l.reason].filter(Boolean).join(' — ') || undefined,
      time: l.startDate === l.endDate ? 'All Day' : `${l.startDate} to ${l.endDate}`,
      readOnly: true,
    });
    counts.leave++;
  }

  // 3. Cover assignments, grouped per teacher per date so one absence does not
  //    produce eight near-identical calendar entries.
  const subs = await db.substitution.findMany({
    where: { schoolId, absentTeacher: { schoolId }, date: { gte: from, lte: to } },
    include: { absentTeacher: { select: { name: true } }, substitute: { select: { name: true } } },
    orderBy: { period: 'asc' },
  }).catch(() => []);

  const grouped = new Map<string, typeof subs>();
  for (const s of subs) {
    const key = `${s.date}|${s.absentTeacherId}`;
    grouped.set(key, [...(grouped.get(key) ?? []), s]);
  }
  for (const [key, rows] of grouped) {
    const [date] = key.split('|');
    const assigned = rows.filter((r) => r.substituteId).length;
    const first = rows[0];
    entries.push({
      id: `cover-${key}`,
      title: `Cover for ${first.absentTeacher?.name ?? 'teacher'} — ${assigned}/${rows.length} assigned`,
      date,
      category: 'substitution',
      source: 'cover',
      description: rows
        .map((r) => `P${r.period} ${r.grade} ${r.section} ${r.subject}${r.substitute ? ` → ${r.substitute.name}` : ' → unassigned'}`)
        .join(' · '),
      time: `${rows.length} period${rows.length === 1 ? '' : 's'}`,
      readOnly: true,
    });
    counts.cover++;
  }

  entries.sort((a, b) => a.date.localeCompare(b.date));
  return NextResponse.json({ success: true, entries, counts });
}
