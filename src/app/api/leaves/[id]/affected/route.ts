export const dynamic = 'force-dynamic';

import { db } from '@/lib/db';
import { getTenantSchoolId } from '@/lib/school-helper';
import { affectedPeriodsForLeave, syncSubstitutionsForLeave } from '@/lib/substitution-service';
import { NextResponse } from 'next/server';
import { requireCapability } from '@/lib/authz';

type Ctx = { params: Promise<{ id: string }> };

/**
 * The classes a leave actually affects, resolved from the timetable.
 *
 * The Admin never re-enters the absent teacher's periods by hand: this reads
 * the same Schedule rows the timetable serves, matched to each date in the
 * leave range.
 */
export async function GET(request: Request, ctx: Ctx) {
  const schoolId = await getTenantSchoolId(request);
  if (!schoolId) {
    return NextResponse.json({ error: 'No school context. Please sign in again.' }, { status: 401 });
  }
  const { id } = await ctx.params;

  const { leave, schoolId: leaveSchoolId, affected } = await affectedPeriodsForLeave(id);
  if (!leave) return NextResponse.json({ error: 'Leave not found.' }, { status: 404 });
  if (leaveSchoolId !== schoolId) {
    return NextResponse.json({ error: 'Leave not found in this school.' }, { status: 404 });
  }

  // Which of those periods already have a substitution record, and its state.
  const existing = await db.substitution.findMany({
    where: { absentTeacherId: leave.teacherId, date: { in: [...new Set(affected.map((a) => a.date))] } },
    select: { id: true, date: true, period: true, grade: true, section: true, status: true, substituteId: true },
  });
  const key = (d: string, p: number, g: string, s: string) => `${d}|${p}|${g}|${s}`;
  const byKey = new Map(existing.map((e) => [key(e.date, e.period, e.grade, e.section), e]));

  return NextResponse.json({
    success: true,
    leave: {
      id: leave.id,
      status: leave.status,
      startDate: leave.startDate,
      endDate: leave.endDate,
      leaveType: leave.leaveType,
    },
    affected: affected.map((a) => {
      const sub = byKey.get(key(a.date, a.period, a.grade, a.section));
      return {
        ...a,
        substitutionId: sub?.id ?? null,
        substitutionStatus: sub?.status ?? null,
        hasSubstitute: Boolean(sub?.substituteId),
      };
    }),
    coveredCount: affected.filter((a) => byKey.get(key(a.date, a.period, a.grade, a.section))?.substituteId).length,
  });
}

/** Re-sync: create substitution records for any affected period that lacks one. */
export async function POST(request: Request, ctx: Ctx) {
  const denied = requireCapability(request, 'leave.approve');
  if (denied) return denied;

  const schoolId = await getTenantSchoolId(request);
  if (!schoolId) {
    return NextResponse.json({ error: 'No school context. Please sign in again.' }, { status: 401 });
  }
  const { id } = await ctx.params;

  const { leave, schoolId: leaveSchoolId } = await affectedPeriodsForLeave(id);
  if (!leave) return NextResponse.json({ error: 'Leave not found.' }, { status: 404 });
  if (leaveSchoolId !== schoolId) {
    return NextResponse.json({ error: 'Leave not found in this school.' }, { status: 404 });
  }
  if (leave.status !== 'approved') {
    return NextResponse.json(
      { error: 'Only an approved leave can be sent to Substitution.', code: 'NOT_APPROVED' },
      { status: 409 }
    );
  }

  const { created, existing, affected } = await syncSubstitutionsForLeave(id);
  return NextResponse.json({
    success: true,
    message: `${affected.length} affected period(s): ${created} sent to Substitution, ${existing} already there.`,
    created,
    existing,
    affectedPeriods: affected.length,
  });
}
