import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const subject = searchParams.get('subjectId');
    const date = searchParams.get('date');
    const periodStr = searchParams.get('timeSlotId');
    const period = periodStr ? parseInt(periodStr) : 1;

    const teachers = await db.teacher.findMany({
      include: {
        schedules: true,
        leaveApplications: true,
      },
    });

    const availableTeachers = [];
    const unavailableTeachers = [];

    for (const teacher of teachers) {
      const isSameSubject = !subject || teacher.subject.toLowerCase() === subject.toLowerCase();
      const isBusy = teacher.schedules.some(s => s.period === period);
      const isOnLeave = date ? teacher.leaveApplications.some(l => l.status === 'approved' && l.startDate <= date && l.endDate >= date) : false;

      const teacherData = {
        teacherId: teacher.id,
        teacherName: teacher.name,
        email: teacher.email,
        subject: teacher.subject,
        role: teacher.role,
        isAvailable: !isBusy && !isOnLeave,
        isSameSubject,
      };

      if (!isBusy && !isOnLeave) {
        availableTeachers.push(teacherData);
      } else {
        unavailableTeachers.push(teacherData);
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        availableCount: availableTeachers.length,
        unavailableCount: unavailableTeachers.length,
        availableTeachers,
        unavailableTeachers,
      },
    });
  } catch (error) {
    console.error('[TEACHERS AVAILABLE ERROR]', error);
    return NextResponse.json({ success: false, error: 'Failed' }, { status: 500 });
  }
}
