export const dynamic = 'force-dynamic';

import { db } from '@/lib/db';
import { getTenantSchoolId } from '@/lib/school-helper';
import { dispatchMessage } from '@/lib/notifications/messaging-service';
import { NextResponse } from 'next/server';
import { requireCapability, ownTeacherId } from '@/lib/authz';

export async function GET(request: Request) {
  try {
    // Substitution has no schoolId column, so the tenant boundary is the
    // absent teacher's school. This used to fall through to `{}` when no
    // tenant resolved, returning every school's cover list; it now fails
    // closed for everyone except the platform owner.
    const schoolId = await getTenantSchoolId(request);
    const isOwner = request.headers.get('x-user-role') === 'superadmin';
    if (!schoolId && !isOwner) return NextResponse.json([]);
    // Explicit tenant column, with the relation kept as defence in depth.
    // A teacher sees only cover they are part of - either standing in, or the
    // absent teacher being covered. Not the whole school's absence list.
    const mine = schoolId ? await ownTeacherId(request, schoolId) : null;
    const where = schoolId
      ? {
          schoolId,
          absentTeacher: { schoolId },
          ...(mine ? { OR: [{ substituteId: mine }, { absentTeacherId: mine }] } : {}),
        }
      : {};

    const substitutions = await db.substitution.findMany({
      where,
      include: {
        absentTeacher: true,
        substitute: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(substitutions || []);
  } catch (error) {
    console.error('Error fetching substitutions:', error);
    return NextResponse.json([]);
  }
}

export async function PATCH(request: Request) {
  const denied = requireCapability(request, 'substitution.assign');
  if (denied) return denied;

  try {
    const { substitutionId, substituteId } = await request.json();

    if (!substitutionId || !substituteId) {
      return NextResponse.json({ error: 'substitutionId and substituteId are required' }, { status: 400 });
    }

    const schoolId = await getTenantSchoolId(request);
    if (!schoolId) return NextResponse.json({ error: 'No school in session' }, { status: 401 });

    // Both the substitution and the proposed substitute must belong to the
    // caller's school. Previously the substitution was looked up by id alone,
    // so an Admin could assign cover inside another school's timetable.
    const substitution = await db.substitution.findFirst({
      where: { id: substitutionId, schoolId, absentTeacher: { schoolId } },
      include: { absentTeacher: true, substitute: true },
    });

    if (!substitution) {
      return NextResponse.json({ error: 'Substitution not found' }, { status: 404 });
    }

    const substituteTeacher = await db.teacher.findFirst({
      where: { id: substituteId, schoolId },
      select: { id: true },
    });
    if (!substituteTeacher) {
      return NextResponse.json({ error: 'Substitute teacher not found in this school' }, { status: 404 });
    }

    if (substitution.status === 'assigned' && substitution.substituteId) {
      return NextResponse.json({ error: 'Substitution already has a substitute assigned' }, { status: 400 });
    }

    // Verify the substitute teacher is not the absent teacher
    if (substituteId === substitution.absentTeacherId) {
      return NextResponse.json({ error: 'Cannot assign the absent teacher as substitute' }, { status: 400 });
    }

    // Verify the substitute teacher is free at that period
    const dateObj = new Date(substitution.date + 'T00:00:00');
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const day = dayNames[dateObj.getDay()];

    const teacherSchedules = await db.schedule.findMany({
      where: { schoolId, teacherId: substituteId, day },
    });

    const isBusy = teacherSchedules.some((s) => s.period === substitution.period);
    if (isBusy) {
      return NextResponse.json({ error: 'This teacher is busy at the required period' }, { status: 400 });
    }

    const dayWorkload = teacherSchedules.length;
    if (dayWorkload >= 8) {
      return NextResponse.json({ error: 'This teacher has reached the maximum workload for the day' }, { status: 400 });
    }

    // Assign the substitute
    const updated = await db.substitution.update({
      where: { id: substitutionId },
      data: {
        substituteId,
        status: 'assigned',
      },
      include: {
        absentTeacher: true,
        substitute: true,
      },
    });

    // Automatic WhatsApp / SMS alert dispatch
    if (updated.substitute) {
      try {
        await dispatchMessage({
          recipientName: updated.substitute.name,
          recipientPhone: updated.substitute.phone,
          recipientEmail: updated.substitute.email,
          teacherId: updated.substitute.id,
          schoolId: updated.absentTeacher?.schoolId || null,
          channel: 'whatsapp',
          template: 'substitution_assigned',
          parameters: {
            recipientName: updated.substitute.name,
            absentTeacherName: updated.absentTeacher?.name,
            date: updated.date,
            period: updated.period,
            grade: updated.grade,
            section: updated.section,
            subject: updated.subject,
          },
        });
      } catch (dispatchErr) {
        console.warn('WhatsApp alert dispatch non-blocking error:', dispatchErr);
      }
    }

    return NextResponse.json({
      success: true,
      substitution: updated,
      message: `Assigned ${updated.substitute?.name} as substitute (WhatsApp alert dispatched)`,
    });
  } catch (error) {
    console.error('Error updating substitution:', error);
    return NextResponse.json({ error: 'Failed to update substitution' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const denied = requireCapability(request, 'substitution.assign');
  if (denied) return denied;

  try {
    const { absentTeacherId, date, reason } = await request.json();

    if (!absentTeacherId || !date) {
      return NextResponse.json({ error: 'absentTeacherId and date are required' }, { status: 400 });
    }

    const schoolId = await getTenantSchoolId(request);
    if (!schoolId) return NextResponse.json({ error: 'No school in session' }, { status: 401 });

    // The absent teacher must be ours. Without this an Admin could raise cover
    // against another school's faculty and read their timetable in the process.
    const absentTeacher = await db.teacher.findFirst({
      where: { id: absentTeacherId, schoolId },
      select: { id: true },
    });
    if (!absentTeacher) {
      return NextResponse.json({ error: 'Teacher not found in this school' }, { status: 404 });
    }

    // Get the day of the week from the date
    const dateObj = new Date(date + 'T00:00:00');
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const day = dayNames[dateObj.getDay()];

    if (day === 'Sunday' || day === 'Saturday') {
      return NextResponse.json({ error: 'Cannot create substitutions for weekends' }, { status: 400 });
    }

    // Find all schedules for the absent teacher on that day
    const teacherSchedules = await db.schedule.findMany({
      where: {
        schoolId,
        teacherId: absentTeacherId,
        day,
      },
    });

    if (teacherSchedules.length === 0) {
      return NextResponse.json({ error: 'No schedules found for this teacher on the given day' }, { status: 404 });
    }

    // Create a Substitution entry for each schedule period
    const substitutions: any[] = [];
    for (const sched of teacherSchedules) {
      const sub = await db.substitution.create({
        data: {
          schoolId,
          date,
          period: sched.period,
          absentTeacherId,
          grade: sched.grade,
          section: sched.section,
          subject: sched.subject,
          reason: reason || 'Not specified',
          status: 'pending',
        },
        include: {
          absentTeacher: true,
          substitute: true,
        },
      });
      substitutions.push(sub);
    }

    return NextResponse.json({
      success: true,
      message: `Created ${substitutions.length} substitution entries for ${day}`,
      substitutions,
    });
  } catch (error) {
    console.error('Error creating substitutions:', error);
    return NextResponse.json({ error: 'Failed to create substitutions' }, { status: 500 });
  }
}
