export const dynamic = 'force-dynamic';

import { db } from '@/lib/db';
import { getTenantSchoolId } from '@/lib/school-helper';
import { dispatchMessage } from '@/lib/notifications/messaging-service';
import { NextResponse } from 'next/server';
import { requireCapability } from '@/lib/authz';
import { ownTeacherId } from '@/lib/teacher-scope';
import { TEACHER_PUBLIC_SELECT } from '@/lib/safe-fields';

export async function GET(request: Request) {
  try {
    const schoolId = await getTenantSchoolId(request);
    const isOwner = request.headers.get('x-user-role') === 'superadmin';
    if (!schoolId && !isOwner) return NextResponse.json([]);

    const url = new URL(request.url);
    const dateParam = url.searchParams.get('date');

    // Auto-clean unassigned pending substitutions for teachers marked 'present' on this date
    if (dateParam && schoolId) {
      try {
        const presentRecords = await db.biometricAttendance.findMany({
          where: {
            date: dateParam,
            status: 'present',
            teacher: { schoolId },
          },
          select: { teacherId: true },
        });

        if (presentRecords.length > 0) {
          const presentTeacherIds = presentRecords.map((r) => r.teacherId);
          await db.substitution.deleteMany({
            where: {
              schoolId,
              date: dateParam,
              absentTeacherId: { in: presentTeacherIds },
              status: 'pending',
              substituteId: null,
            },
          });
        }
      } catch (cleanErr) {
        console.warn('Auto-cleanup of present teacher substitutions non-blocking error:', cleanErr);
      }
    }

    const mine = schoolId ? await ownTeacherId(request, schoolId) : null;
    const where: any = schoolId
      ? {
          schoolId,
          absentTeacher: { schoolId },
          ...(dateParam ? { date: dateParam } : {}),
          ...(mine ? { OR: [{ substituteId: mine }, { absentTeacherId: mine }] } : {}),
        }
      : {
          ...(dateParam ? { date: dateParam } : {}),
        };

    const substitutions = await db.substitution.findMany({
      where,
      include: {
        absentTeacher: { select: TEACHER_PUBLIC_SELECT },
        substitute: { select: TEACHER_PUBLIC_SELECT },
      },
      orderBy: [{ period: 'asc' }, { createdAt: 'desc' }],
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
      include: { absentTeacher: { select: TEACHER_PUBLIC_SELECT }, substitute: { select: TEACHER_PUBLIC_SELECT } },
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
        absentTeacher: { select: TEACHER_PUBLIC_SELECT },
        substitute: { select: TEACHER_PUBLIC_SELECT },
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
          absentTeacher: { select: TEACHER_PUBLIC_SELECT },
          substitute: { select: TEACHER_PUBLIC_SELECT },
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

export async function DELETE(request: Request) {
  const denied = requireCapability(request, 'substitution.assign');
  if (denied) return denied;

  try {
    const schoolId = await getTenantSchoolId(request);
    if (!schoolId) return NextResponse.json({ error: 'No school in session' }, { status: 401 });

    const url = new URL(request.url);
    const clearAll = url.searchParams.get('clearAll') === 'true';
    const dateParam = url.searchParams.get('date');

    if (clearAll && dateParam) {
      const deleted = await db.substitution.deleteMany({
        where: {
          schoolId,
          date: dateParam,
          status: 'pending',
          substituteId: null,
        },
      });
      return NextResponse.json({
        success: true,
        message: `Cleared ${deleted.count} pending substitution records for ${dateParam}.`,
        deletedCount: deleted.count,
      });
    }

    let id = url.searchParams.get('id');
    if (!id) {
      const body = await request.json().catch(() => ({}));
      id = body?.id;
    }
    if (!id) return NextResponse.json({ error: 'Substitution ID is required' }, { status: 400 });

    const existing = await db.substitution.findFirst({
      where: { id, schoolId },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Substitution not found in this school' }, { status: 404 });
    }

    await db.substitution.delete({ where: { id } });

    return NextResponse.json({ success: true, message: 'Substitution removed successfully.' });
  } catch (error) {
    console.error('Error deleting substitution:', error);
    return NextResponse.json({ error: 'Failed to delete substitution' }, { status: 500 });
  }
}

