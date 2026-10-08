import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTenantSchoolId } from '@/lib/school-helper';
import { affectedPeriodsForLeave, syncSubstitutionsForLeave, type AffectedPeriod } from '@/lib/substitution-service';
import { requireCapability } from '@/lib/authz';
import { ownTeacherId } from '@/lib/teacher-scope';
import { dispatchMessage } from '@/lib/notifications/messaging-service';
import { TEACHER_PUBLIC_SELECT } from '@/lib/safe-fields';

/**
 * Leave applications.
 *
 * A teacher sees ONLY their own. Leave records carry a stated reason - medical,
 * family emergency - and a colleague has no business reading it. This route
 * previously returned every leave record in the school to any signed-in user.
 */
export async function GET(req: NextRequest) {
  const denied = requireCapability(req, 'leave.apply.own');
  if (denied) return denied;

  try {
    const schoolId = await getTenantSchoolId(req);
    if (!schoolId) return NextResponse.json({ success: false, error: 'No school in session' }, { status: 401 });

    const status = req.nextUrl.searchParams.get('status') || undefined;
    const limit = parseInt(req.nextUrl.searchParams.get('limit') || '50');

    const mine = await ownTeacherId(req, schoolId);

    const where: any = { teacher: { schoolId } };
    if (mine) where.teacherId = mine;
    if (status) where.status = status;

    const leaves = await db.leaveApplication.findMany({
      where,
      include: {
        teacher: { select: { id: true, name: true, email: true, subject: true, phone: true } },
      },
      orderBy: { appliedAt: 'desc' },
      take: limit,
    });

    // Compute stats
    const todayStr = new Date().toISOString().split('T')[0];
    const scope = { teacher: { schoolId }, ...(mine ? { teacherId: mine } : {}) };
    const [totalPending, totalApproved, totalActive] = await Promise.all([
      db.leaveApplication.count({ where: { ...scope, status: 'pending' } }),
      db.leaveApplication.count({ where: { ...scope, status: 'approved' } }),
      db.leaveApplication.count({ where: { ...scope, status: 'approved', startDate: { lte: todayStr }, endDate: { gte: todayStr } } }),
    ]);

    return NextResponse.json({
      success: true,
      leaves,
      stats: { totalPending, totalApproved, totalActive },
    });
  } catch (error) {
    console.error('[LEAVES LIST ERROR]', error);
    return NextResponse.json({ success: false, error: 'Failed to load leaves' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const denied = requireCapability(req, 'leave.approve');
  if (denied) return denied;

  try {
    const schoolId = await getTenantSchoolId(req);
    const body = await req.json();
    const { id, status, approvedBy } = body;

    if (!id || !status) {
      return NextResponse.json({ success: false, error: 'id and status required' }, { status: 400 });
    }

    const updated = await db.leaveApplication.update({
      where: { id },
      data: { status, approvedBy: approvedBy || 'Admin' },
      include: { teacher: { select: TEACHER_PUBLIC_SELECT } },
    });

    let substitutions:
      | { created: number; existing: number; affectedPeriods: number; affected: AffectedPeriod[] }
      | { error: string }
      | null = null;

    if (status === 'approved') {
      try {
        const { created, existing, affected } = await syncSubstitutionsForLeave(id);
        substitutions = { created, existing, affectedPeriods: affected.length, affected };

        // Mark attendance as on_leave across all dates in this leave range
        const dates = [...new Set(affected.map((a) => a.date))];
        for (const d of dates) {
          await db.biometricAttendance.upsert({
            where: { date_teacherId: { date: d, teacherId: updated.teacherId } },
            create: {
              date: d,
              teacherId: updated.teacherId,
              status: 'on_leave',
              syncSource: 'leave',
              syncedAt: new Date(),
            },
            update: {
              status: 'on_leave',
              syncSource: 'leave',
              syncedAt: new Date(),
            },
          });
        }

        // Create teacher notification in portal
        await db.teacherNotification.create({
          data: {
            teacherId: updated.teacherId,
            type: 'leave_approved',
            referenceId: `leave-${updated.id}`,
            sentBy: approvedBy || 'Admin',
            title: 'Leave Application Approved',
            description: `Your ${updated.leaveType} leave application for ${updated.startDate} to ${updated.endDate} has been approved by ${approvedBy || 'Admin'}. ${affected.length} class periods have been covered for substitution.`,
            isRead: false,
          },
        }).catch(() => null);

        // Dispatch WhatsApp / Email / SMS alert to teacher
        if (updated.teacher) {
          await dispatchMessage({
            recipientName: updated.teacher.name,
            recipientPhone: updated.teacher.phone,
            recipientEmail: updated.teacher.email,
            teacherId: updated.teacher.id,
            schoolId: schoolId || updated.teacher.schoolId,
            channel: 'all',
            template: 'leave_approved',
            parameters: {
              recipientName: updated.teacher.name,
              startDate: updated.startDate,
              endDate: updated.endDate,
            },
          }).catch((notifyErr) => console.warn('Leave approval notification error:', notifyErr));
        }
      } catch (err) {
        console.error('[LEAVES] failed to sync substitutions', err);
        substitutions = { error: 'Leave saved, but affected periods could not be generated.' };
      }
    } else if (status === 'rejected') {
      // Clean up any pending unassigned substitutions for this leave
      await db.substitution.deleteMany({
        where: {
          leaveId: id,
          absentTeacherId: updated.teacherId,
          status: 'pending',
          substituteId: null,
        },
      }).catch(() => null);

      // Create teacher notification in portal
      await db.teacherNotification.create({
        data: {
          teacherId: updated.teacherId,
          type: 'leave_rejected',
          referenceId: `leave-${updated.id}`,
          sentBy: approvedBy || 'Admin',
          title: 'Leave Application Rejected',
          description: `Your ${updated.leaveType} leave application for ${updated.startDate} to ${updated.endDate} was not approved by ${approvedBy || 'Admin'}.`,
          isRead: false,
        },
      }).catch(() => null);
    }

    return NextResponse.json({ success: true, leave: updated, substitutions });
  } catch (error) {
    console.error('[LEAVES PATCH ERROR]', error);
    return NextResponse.json({ success: false, error: 'Failed to update leave' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const denied = requireCapability(req, 'leave.apply.own');
  if (denied) return denied;

  try {
    const schoolId = await getTenantSchoolId(req);
    if (!schoolId) return NextResponse.json({ success: false, error: 'No school in session' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    let id = searchParams.get('id');
    if (!id) {
      const body = await req.json().catch(() => ({}));
      id = body?.id;
    }
    if (!id) return NextResponse.json({ success: false, error: 'id is required' }, { status: 400 });

    const mine = await ownTeacherId(req, schoolId);
    const existing = await db.leaveApplication.findFirst({
      where: {
        id,
        teacher: { schoolId },
        ...(mine ? { teacherId: mine } : {}),
      },
      select: { id: true, status: true },
    });

    if (!existing) {
      return NextResponse.json({ success: false, error: 'Leave application not found' }, { status: 404 });
    }

    // Clean up any pending substitutions created for this leave
    await db.substitution.deleteMany({
      where: { leaveId: id, status: 'pending' },
    }).catch(() => null);

    await db.leaveApplication.delete({ where: { id } });

    return NextResponse.json({ success: true, message: 'Leave application cancelled and removed.' });
  } catch (error) {
    console.error('[LEAVES DELETE ERROR]', error);
    return NextResponse.json({ success: false, error: 'Failed to delete leave application' }, { status: 500 });
  }
}

