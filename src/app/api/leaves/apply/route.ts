import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTenantSchoolId } from '@/lib/school-helper';
import { requireCapability } from '@/lib/authz';

export async function POST(request: NextRequest) {
  // Teachers may file their own leave; admins may file for anyone. The
  // teacherId is validated against the caller's school below either way.
  const denied = requireCapability(request, 'leave.apply.own');
  if (denied) return denied;

  try {
    const body = await request.json();
    const { teacherId, type, startDate, endDate, reason, periods } = body;

    // The teacher must belong to the caller's school. Without this an Admin
    // could file leave against another school's faculty.
    const schoolId = await getTenantSchoolId(request);
    if (!schoolId) {
      return NextResponse.json({ success: false, error: 'No school in session' }, { status: 401 });
    }

    // Partial-day leave: only the listed periods need cover. Stored in
    // coveringInfo, which the affected-period lookup already honours.
    const periodList = Array.isArray(periods)
      ? periods.map((p: unknown) => Number(p)).filter((p: number) => Number.isFinite(p) && p > 0)
      : [];

    if (!teacherId || !startDate || !endDate) {
      return NextResponse.json({ success: false, error: 'Teacher ID, start date, and end date are required' }, { status: 400 });
    }
    if (endDate < startDate) {
      return NextResponse.json({ success: false, error: 'The end date cannot be before the start date' }, { status: 400 });
    }

    const teacher = await db.teacher.findFirst({ where: { id: teacherId, schoolId }, select: { id: true } });
    if (!teacher) {
      return NextResponse.json({ success: false, error: 'Teacher not found in this school' }, { status: 404 });
    }

    // Partial-day leave applies to one date only - a period number means nothing
    // across a multi-day range, where each day can have a different period count.
    if (periodList.length && startDate !== endDate) {
      return NextResponse.json(
        { success: false, error: 'Partial-day leave must start and end on the same date.' },
        { status: 400 }
      );
    }

    const leave = await db.leaveApplication.create({
      data: {
        teacherId,
        leaveType: type || 'casual',
        startDate,
        endDate,
        reason: reason || 'Not specified',
        ...(periodList.length ? { coveringInfo: JSON.stringify({ periods: periodList }) } : {}),
        status: body.status === 'pending' ? 'pending' : 'approved',
      },
    });

    return NextResponse.json({
      success: true,
      data: leave,
    });
  } catch (error) {
    console.error('[LEAVES APPLY ERROR]', error);
    return NextResponse.json({ success: false, error: 'Failed to apply leave' }, { status: 500 });
  }
}
