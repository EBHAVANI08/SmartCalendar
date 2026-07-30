import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const requestId = req.nextUrl.searchParams.get('requestId');
    if (!requestId) return NextResponse.json({ success: false, error: 'requestId required' }, { status: 400 });

    const substitution = await db.substitution.findUnique({
      where: { id: requestId },
      include: { absentTeacher: true },
    });

    if (!substitution) return NextResponse.json({ success: false, error: 'Request not found' }, { status: 404 });

    const teachers = await db.teacher.findMany({
      include: { schedules: true, substituteSubstitutions: true },
    });

    const candidates = teachers
      .filter(t => t.id !== substitution.absentTeacherId)
      .map(t => {
        const teachesSameSubject = t.subject.toLowerCase() === substitution.subject.toLowerCase();
        const isBusy = t.schedules.some(s => s.period === substitution.period);

        let score = 50;
        if (teachesSameSubject) score += 30;
        if (!isBusy) score += 20;

        return {
          teacherId: t.id,
          teacherName: t.name,
          employeeId: t.id,
          department: t.subject,
          designation: t.role,
          score,
          reasons: teachesSameSubject ? ['Teaches same subject'] : ['Available for supervision'],
          teachesSameSubject,
          isAvailable: !isBusy,
          currentLoad: t.schedules.length,
          freePeriods: Math.max(0, 8 - t.schedules.length),
          weeklySubCount: t.substituteSubstitutions.length,
        };
      })
      .sort((a, b) => b.score - a.score);

    return NextResponse.json({ success: true, data: candidates.slice(0, 20) });
  } catch (error) {
    console.error('[CANDIDATES ERROR]', error);
    return NextResponse.json({ success: false, error: 'Failed' }, { status: 500 });
  }
}
