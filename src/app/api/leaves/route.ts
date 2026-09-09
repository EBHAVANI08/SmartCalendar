import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTenantSchoolId } from '@/lib/school-helper';
import { affectedPeriodsForLeave, syncSubstitutionsForLeave, type AffectedPeriod } from '@/lib/substitution-service';
import { requireCapability } from '@/lib/authz';
import { ownTeacherId } from '@/lib/teacher-scope';

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
    const body = await req.json();
    const { id, status, approvedBy } = body;

    if (!id || !status) {
      return NextResponse.json({ success: false, error: 'id and status required' }, { status: 400 });
    }

    const updated = await db.leaveApplication.update({
      where: { id },
      data: { status, approvedBy: approvedBy || 'Admin' },
    });

    // Approving a leave immediately surfaces the periods that need cover in
    // Substitution Management. The Admin never re-enters the absent teacher's
    // timetable by hand. Idempotent, so re-approving creates no duplicates.
    let substitutions:
      | { created: number; existing: number; affectedPeriods: number; affected: AffectedPeriod[] }
      | { error: string }
      | null = null;
    if (status === 'approved') {
      try {
        const { created, existing, affected } = await syncSubstitutionsForLeave(id);
        substitutions = { created, existing, affectedPeriods: affected.length, affected };
      } catch (err) {
        console.error('[LEAVES] failed to sync substitutions', err);
        substitutions = { error: 'Leave saved, but affected periods could not be generated.' };
      }
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

