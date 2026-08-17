import { db } from '@/lib/db';
import * as XLSX from 'xlsx';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const schoolId = new URL(request.url).searchParams.get('schoolId');
  const teacherId = new URL(request.url).searchParams.get('teacherId');
  if (!schoolId) return NextResponse.json({ error: 'schoolId is required' }, { status: 400 });
  const [school, schedules] = await Promise.all([db.school.findUnique({ where: { id: schoolId } }), db.schedule.findMany({ where: { schoolId, ...(teacherId ? { teacherId } : {}) }, include: { teacher: true }, orderBy: [{ grade: 'asc' }, { section: 'asc' }, { day: 'asc' }, { period: 'asc' }] })]);
  if (!school) return NextResponse.json({ error: 'School not found' }, { status: 404 });
  const workbook = XLSX.utils.book_new();
  const masterRows = schedules.map((item) => ({ Grade: item.grade, Section: item.section, Day: item.day, Period: item.period, 'Start Time': item.startTime, 'End Time': item.endTime, Subject: item.subject, Teacher: item.teacher?.name || 'Unallocated', Room: item.roomId || '', Status: item.teacherId ? 'Allocated' : 'Needs teacher' }));
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(masterRows), 'Master Timetable');
  const classKeys = [...new Set(schedules.map((item) => `${item.grade}|${item.section}`))];
  for (const classKey of classKeys.slice(0, 25)) {
    const [grade, section] = classKey.split('|'); const classRows = schedules.filter((item) => item.grade === grade && item.section === section).map((item) => ({ Day: item.day, Period: item.period, Time: `${item.startTime}-${item.endTime}`, Subject: item.subject, Teacher: item.teacher?.name || 'Unallocated', Room: item.roomId || '' }));
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(classRows), `${grade.replace('Grade ', 'G')}-${section}`.slice(0, 31));
  }
  const teacherRows = schedules.filter((item) => item.teacher).map((item) => ({ Teacher: item.teacher!.name, Subject: item.subject, Grade: item.grade, Section: item.section, Day: item.day, Period: item.period, Time: `${item.startTime}-${item.endTime}`, Room: item.roomId || '' }));
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(teacherRows), 'Teacher Timetables');
  const output = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  const safeName = school.name.replace(/[^a-z0-9]+/gi, '_');
  const teacherName = teacherId && schedules[0]?.teacher?.name ? `_${schedules[0].teacher.name.replace(/[^a-z0-9]+/gi, '_')}` : '';
  return new Response(new Uint8Array(output), { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="${safeName}${teacherName}_Timetable.xlsx"`, 'Cache-Control': 'no-store' } });
}
