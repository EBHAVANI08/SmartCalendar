export const dynamic = 'force-dynamic';

import { db } from '@/lib/db';
import { getTenantSchoolId } from '@/lib/school-helper';
import { assignSubstitute, substituteCandidates } from '@/lib/substitution-service';
import { NextResponse } from 'next/server';
import { requireCapability } from '@/lib/authz';

type Ctx = { params: Promise<{ id: string }> };

async function assertTenant(request: Request, substitutionId: string) {
  const schoolId = await getTenantSchoolId(request);
  if (!schoolId) return { error: NextResponse.json({ error: 'No school context. Please sign in again.' }, { status: 401 }) };

  const sub = await db.substitution.findUnique({
    where: { id: substitutionId },
    include: { absentTeacher: { select: { schoolId: true } } },
  });
  if (!sub) return { error: NextResponse.json({ error: 'Substitution not found.' }, { status: 404 }) };
  if (sub.absentTeacher?.schoolId !== schoolId) {
    return { error: NextResponse.json({ error: 'Substitution not found in this school.' }, { status: 404 }) };
  }
  return { schoolId };
}

/** Recommended substitutes plus the full searchable faculty list. */
export async function GET(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const guard = await assertTenant(request, id);
  if (guard.error) return guard.error;

  const { substitution, candidates } = await substituteCandidates(id);
  if (!substitution) return NextResponse.json({ error: 'Substitution not found.' }, { status: 404 });

  return NextResponse.json({
    success: true,
    substitution: {
      id: substitution.id,
      date: substitution.date,
      period: substitution.period,
      grade: substitution.grade,
      section: substitution.section,
      subject: substitution.subject,
      status: substitution.status,
      substituteId: substitution.substituteId,
    },
    recommended: candidates.filter((c) => c.available && c.qualifiedSubject).slice(0, 5),
    candidates,
  });
}

/**
 * Assign a substitute for this one date.
 *
 * This never touches the Schedule row - the permanent timetable keeps naming
 * the regular teacher. Only a timetable revision changes staffing for good.
 */
export async function POST(request: Request, ctx: Ctx) {
  const denied = requireCapability(request, 'substitution.assign');
  if (denied) return denied;

  const { id } = await ctx.params;
  const guard = await assertTenant(request, id);
  if (guard.error) return guard.error;

  const body = await request.json().catch(() => ({}));
  const substituteId = String(body.substituteId ?? '');
  if (!substituteId) {
    return NextResponse.json({ error: 'substituteId is required.' }, { status: 400 });
  }

  const result = await assignSubstitute({
    substitutionId: id,
    substituteId,
    manualOverride: body.manualOverride === true,
    overrideReason: body.overrideReason,
    assignedBy: request.headers.get('x-user-email') || request.headers.get('x-user-id') || 'admin',
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.message,
        code: result.code,
        requiresOverride: result.requiresOverride ?? false,
        conflict: result.conflict ?? null,
      },
      { status: 409 }
    );
  }

  const updated = await db.substitution.findUnique({
    where: { id },
    include: {
      substitute: { select: { id: true, name: true } },
      absentTeacher: { select: { id: true, name: true } },
    },
  });

  if (result.manualOverride && guard.schoolId) {
    await db.auditLog
      .create({
        data: {
          schoolId: guard.schoolId,
          actorId: request.headers.get('x-user-id') || 'unknown',
          actorRole: request.headers.get('x-user-role') || 'unknown',
          action: 'substitution.assign.override',
          entityType: 'Substitution',
          entityId: id,
          after: { substituteId, date: updated?.date, period: updated?.period },
          reason: `Manual override: substitute is not mapped to ${updated?.subject}.${body.overrideReason ? ' ' + String(body.overrideReason) : ''}`,
        },
      })
      .catch(() => null);
  }

  return NextResponse.json({
    success: true,
    manualOverride: result.manualOverride ?? false,
    message: `${updated?.substitute?.name} will cover ${updated?.grade} ${updated?.section} period ${updated?.period} on ${updated?.date}.`,
    substitution: updated,
  });
}
