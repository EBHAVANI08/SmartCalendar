import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    const periodStr = searchParams.get('timeSlotId');
    const period = periodStr ? parseInt(periodStr) : 1;

    const teachers = await db.teacher.findMany({
      include: { schedules: true, leaveApplications: true },
    });

    const candidates = teachers.map(teacher => {
      const isBusy = teacher.schedules.some(s => s.period === period);
      const isOnLeave = date ? teacher.leaveApplications.some(l => l.status === 'approved' && l.startDate <= date && l.endDate >= date) : false;

      return {
        teacherId: teacher.id,
        teacherName: teacher.name,
        department: teacher.subject,
        designation: teacher.role,
        isAvailable: !isBusy && !isOnLeave,
        conflicts: isBusy ? ['Busy teaching another class'] : isOnLeave ? ['On approved leave'] : [],
        score: isBusy || isOnLeave ? 0 : 80,
      };
    });

    candidates.sort((a, b) => (a.isAvailable === b.isAvailable ? b.score - a.score : a.isAvailable ? -1 : 1));

    return NextResponse.json({ success: true, data: candidates });
  } catch (error) {
    console.error('[ADMIN AVAILABLE TEACHERS ERROR]', error);
    return NextResponse.json({ success: false, error: 'Failed' }, { status: 500 });
  }
}
