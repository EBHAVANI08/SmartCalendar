import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { TEACHER_PUBLIC_SELECT } from '@/lib/safe-fields';
import { getTenantSchoolId } from '@/lib/school-helper';
import { ownTeacherId } from '@/lib/teacher-scope';

export async function GET(req: NextRequest) {
  try {
    const teacherId = req.nextUrl.searchParams.get('teacherId');
    const date = req.nextUrl.searchParams.get('date');

    if (!teacherId || !date) {
      return NextResponse.json({ success: false, error: 'teacherId and date required' }, { status: 400 });
    }
    const schoolId = await getTenantSchoolId(req);
    if (!schoolId) return NextResponse.json({ success: false, error: 'No school context. Please sign in again.' }, { status: 401 });
    // The teacher must belong to the caller's school, and a teacher may only
    // read their own day.
    const mine = await ownTeacherId(req, schoolId);
    if (mine && mine !== teacherId) {
      return NextResponse.json({ success: false, error: 'You can only view your own schedule.' }, { status: 403 });
    }
    const owned = await db.teacher.findFirst({ where: { id: teacherId, schoolId }, select: { id: true } });
    if (!owned) return NextResponse.json({ success: false, error: 'Teacher not found in this school.' }, { status: 404 });

    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayOfWeek = new Date(date + 'T00:00:00').getDay();
    const dayName = days[dayOfWeek] || 'Monday';

    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return NextResponse.json({ success: true, data: { schedules: [], substitutions: [], isWeekend: true } });
    }

    const schedules = await db.schedule.findMany({
      where: { teacherId, day: dayName, schoolId },
      orderBy: { period: 'asc' },
    });

    const substitutions = await db.substitution.findMany({
      where: { substituteId: teacherId, date, schoolId },
      include: { absentTeacher: { select: TEACHER_PUBLIC_SELECT } },
    });

    const notifications = await db.teacherNotification.findMany({
      where: { teacherId, isRead: false },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return NextResponse.json({
      success: true,
      data: {
        schedules,
        substitutions,
        notifications,
        isWeekend: false,
      },
    });
  } catch (error) {
    console.error('[TEACHER SCHEDULE ERROR]', error);
    return NextResponse.json({ success: false, error: 'Failed to load schedule' }, { status: 500 });
  }
}
