import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const date = req.nextUrl.searchParams.get('date');
    if (!date) return NextResponse.json({ success: false, error: 'date required' }, { status: 400 });

    const teachers = await db.teacher.findMany({
      select: { id: true, name: true, subject: true, role: true },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json({
      success: true,
      data: {
        candidates: teachers.map(t => ({
          teacherId: t.id,
          teacherName: t.name,
          department: t.subject,
          designation: t.role,
          score: 80,
          reasons: ['Available teacher'],
        })),
      },
    });
  } catch (error) {
    console.error('[MANUAL ASSIGN GET ERROR]', error);
    return NextResponse.json({ success: false, error: 'Failed' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { scheduleId, teacherId, date, assignedBy } = await req.json();

    const schedule = await db.schedule.findUnique({
      where: { id: scheduleId },
      include: { teacher: true },
    });

    if (!schedule) return NextResponse.json({ success: false, error: 'Schedule not found' }, { status: 404 });

    const substitution = await db.substitution.create({
      data: {
        date: date || new Date().toISOString().split('T')[0],
        period: schedule.period,
        absentTeacherId: schedule.teacherId || '',
        substituteId: teacherId,
        grade: schedule.grade,
        section: schedule.section,
        subject: schedule.subject,
        reason: 'MANUAL',
        source: assignedBy || 'ADMIN',
        status: 'assigned',
      },
    });

    await db.teacherNotification.create({
      data: {
        type: 'curriculum',
        title: `Substitution Assignment - ${schedule.subject}`,
        description: `Manual assignment for Grade ${schedule.grade} ${schedule.section} on ${date}`,
        teacherId,
        referenceId: substitution.id,
      },
    });

    return NextResponse.json({ success: true, data: substitution });
  } catch (error) {
    console.error('[MANUAL ASSIGN POST ERROR]', error);
    return NextResponse.json({ success: false, error: 'Assignment failed' }, { status: 500 });
  }
}
