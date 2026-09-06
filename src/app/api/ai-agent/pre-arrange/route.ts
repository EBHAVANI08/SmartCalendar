import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireCapability } from '@/lib/authz';
import { getTenantSchoolId } from '@/lib/school-helper';

export async function POST(request: NextRequest) {
  const denied = requireCapability(request, 'substitution.assign');
  if (denied) return denied;

  const tenantSchoolId = await getTenantSchoolId(request);

  try {
    const { scheduleId, date } = await request.json();

    if (!scheduleId || !date) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }

    const schedule = await db.schedule.findUnique({
      where: { id: scheduleId },
    });

    if (!schedule) {
      return NextResponse.json({ success: false, error: 'Schedule not found' }, { status: 404 });
    }

    const substitution = await db.substitution.create({
      data: {
        schoolId: tenantSchoolId,
        date,
        period: schedule.period,
        absentTeacherId: schedule.teacherId || '',
        grade: schedule.grade,
        section: schedule.section,
        subject: schedule.subject,
        reason: 'PREDICTED_ABSENCE',
        source: 'ai-prediction',
        status: 'pending',
      },
    });

    return NextResponse.json({
      success: true,
      data: substitution,
    });
  } catch (error: any) {
    console.error('Pre-arrange error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
