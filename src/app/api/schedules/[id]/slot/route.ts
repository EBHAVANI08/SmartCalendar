export const dynamic = 'force-dynamic';

import { db } from '@/lib/db';
import { getTenantSchoolId } from '@/lib/school-helper';
import { getDayConfig } from '@/lib/timetable-config';
import { checkSlotConflicts } from '@/lib/timetable-constraints';
import { NextResponse } from 'next/server';
import { requireCapability } from '@/lib/authz';

type Ctx = { params: Promise<{ id: string }> };

/** Versions whose rows must not be edited in place. */
const LOCKED = ['approved', 'published', 'archived', 'superseded'];

async function loadSlot(id: string, schoolId: string) {
  const slot = await db.schedule.findFirst({ where: { id, schoolId } });
  if (!slot) return { slot: null, version: null };
  const version = slot.timetableVersionId
    ? await db.timetableVersion.findUnique({ where: { id: slot.timetableVersionId } }).catch(() => null)
    : null;
  return { slot, version };
}

function lockedResponse(version: { version: number; status: string; id: string }) {
  return NextResponse.json(
    {
      error: `This timetable is ${version.status} (v${version.version}) and cannot be edited directly. Create a revision, change it there, then approve and publish.`,
      code: 'VERSION_LOCKED',
      versionId: version.id,
    },
    { status: 409 }
  );
}

/**
 * Edit one draft slot: change its subject, or move it to another day/period.
 *
 * Every change runs the same shared constraint service the generator uses, so a
 * manual edit can never introduce a clash that generation would have rejected.
 */
export async function PATCH(request: Request, ctx: Ctx) {
  const denied = requireCapability(request, 'timetable.write');
  if (denied) return denied;

  const schoolId = await getTenantSchoolId(request);
  if (!schoolId) {
    return NextResponse.json({ error: 'No school context. Please sign in again.' }, { status: 401 });
  }
  const { id } = await ctx.params;
  const { slot, version } = await loadSlot(id, schoolId);
  if (!slot) return NextResponse.json({ error: 'Timetable slot not found.' }, { status: 404 });
  if (version && LOCKED.includes(version.status)) return lockedResponse(version);

  const body = await request.json().catch(() => ({}));
  const nextSubject = body.subject !== undefined ? String(body.subject).trim() : slot.subject;
  const nextDay = body.day !== undefined ? String(body.day) : slot.day;
  const nextPeriod = body.period !== undefined ? Number(body.period) : slot.period;

  if (!nextSubject) {
    return NextResponse.json({ error: 'Subject cannot be empty.' }, { status: 400 });
  }
  if (/\S+@\S+/.test(nextSubject)) {
    return NextResponse.json(
      { error: `"${nextSubject}" is an email address, not a subject.` },
      { status: 400 }
    );
  }

  const moving = nextDay !== slot.day || nextPeriod !== slot.period;
  const config = await getDayConfig(schoolId);

  // Moving the slot revalidates the class, the teacher and the day's period
  // bounds at the destination.
  if (moving) {
    const versionScope = slot.timetableVersionId
      ? { timetableVersionId: slot.timetableVersionId }
      : { OR: [{ timetableVersionId: null }, { timetableVersionId: { isSet: false } }] };

    const targetSlot = await db.schedule.findFirst({
      where: {
        schoolId,
        grade: slot.grade,
        section: slot.section,
        day: nextDay,
        period: nextPeriod,
        ...versionScope,
        NOT: { id },
      },
    });

    if (targetSlot) {
      // SWAP scenario: Destination slot is already occupied by another subject in the same class
      // Validate teacher availability for moving slot into (nextDay, nextPeriod)
      if (slot.teacherId) {
        const t1Clash = await db.schedule.findFirst({
          where: {
            schoolId,
            day: nextDay,
            period: nextPeriod,
            teacherId: slot.teacherId,
            ...versionScope,
            NOT: { id: { in: [id, targetSlot.id] } },
          },
          select: { grade: true, section: true, subject: true },
        });
        if (t1Clash) {
          return NextResponse.json(
            {
              error: `Teacher is already assigned to ${t1Clash.grade} ${t1Clash.section} (${t1Clash.subject}) at ${nextDay} Period ${nextPeriod}.`,
              code: 'TEACHER_DOUBLE_BOOKED',
            },
            { status: 409 }
          );
        }
      }

      // Validate teacher availability for moving targetSlot into (slot.day, slot.period)
      if (targetSlot.teacherId) {
        const t2Clash = await db.schedule.findFirst({
          where: {
            schoolId,
            day: slot.day,
            period: slot.period,
            teacherId: targetSlot.teacherId,
            ...versionScope,
            NOT: { id: { in: [id, targetSlot.id] } },
          },
          select: { grade: true, section: true, subject: true },
        });
        if (t2Clash) {
          return NextResponse.json(
            {
              error: `Teacher is already assigned to ${t2Clash.grade} ${t2Clash.section} (${t2Clash.subject}) at ${slot.day} Period ${slot.period}.`,
              code: 'TEACHER_DOUBLE_BOOKED',
            },
            { status: 409 }
          );
        }
      }

      // Perform atomic swap with temporary period to avoid compound unique index conflict
      await db.schedule.update({
        where: { id: slot.id },
        data: { period: 9999 },
      });
      await db.schedule.update({
        where: { id: targetSlot.id },
        data: { day: slot.day, period: slot.period },
      });
      const updated = await db.schedule.update({
        where: { id: slot.id },
        data: {
          subject: nextSubject,
          day: nextDay,
          period: nextPeriod,
          ...(body.roomId !== undefined ? { roomId: String(body.roomId) || null } : {}),
        },
      });

      await db.auditLog
        .create({
          data: {
            schoolId,
            actorId: request.headers.get('x-user-id') || 'unknown',
            actorRole: request.headers.get('x-user-role') || 'unknown',
            action: 'timetable.swap_slots',
            entityType: 'Schedule',
            entityId: id,
            before: { slot, targetSlot },
            after: { slot: updated, targetSlot: { ...targetSlot, day: slot.day, period: slot.period } },
            reason: body.reason ? String(body.reason) : null,
          },
        })
        .catch(() => null);

      return NextResponse.json({
        success: true,
        message: `Swapped ${slot.subject} (${slot.day} P${slot.period}) with ${targetSlot.subject} (${nextDay} P${nextPeriod}).`,
        slot: updated,
      });
    }

    // Standard move into an empty cell
    const check = await checkSlotConflicts({
      schoolId,
      grade: slot.grade,
      section: slot.section,
      day: nextDay,
      period: nextPeriod,
      teacherId: slot.teacherId,
      timetableVersionId: slot.timetableVersionId,
      ignoreScheduleId: id,
      config: config.configured ? config : undefined,
    });
    if (!check.ok) {
      return NextResponse.json(
        { error: check.message, code: check.code, conflictWith: check.conflictWith },
        { status: 409 }
      );
    }
  }

  const updated = await db.schedule.update({
    where: { id },
    data: {
      subject: nextSubject,
      ...(moving ? { day: nextDay, period: nextPeriod } : {}),
      ...(body.roomId !== undefined ? { roomId: String(body.roomId) || null } : {}),
    },
  });

  await db.auditLog
    .create({
      data: {
        schoolId,
        actorId: request.headers.get('x-user-id') || 'unknown',
        actorRole: request.headers.get('x-user-role') || 'unknown',
        action: moving ? 'timetable.move_slot' : 'timetable.change_subject',
        entityType: 'Schedule',
        entityId: id,
        before: { subject: slot.subject, day: slot.day, period: slot.period },
        after: { subject: nextSubject, day: nextDay, period: nextPeriod },
        reason: body.reason ? String(body.reason) : null,
      },
    })
    .catch(() => null);

  return NextResponse.json({
    success: true,
    message: moving
      ? `Moved ${slot.grade} ${slot.section} ${nextSubject} to ${nextDay} period ${nextPeriod}.`
      : `${slot.grade} ${slot.section} ${slot.day} P${slot.period} is now ${nextSubject}.`,
    slot: updated,
  });
}

/** Delete a draft slot. Published timetables are never edited in place. */
export async function DELETE(request: Request, ctx: Ctx) {
  const denied = requireCapability(request, 'timetable.write');
  if (denied) return denied;

  const schoolId = await getTenantSchoolId(request);
  if (!schoolId) {
    return NextResponse.json({ error: 'No school context. Please sign in again.' }, { status: 401 });
  }
  const { id } = await ctx.params;
  const { slot, version } = await loadSlot(id, schoolId);
  if (!slot) return NextResponse.json({ error: 'Timetable slot not found.' }, { status: 404 });
  if (version && LOCKED.includes(version.status)) return lockedResponse(version);

  // A slot that history depends on is never casually removed. The force
  // escape hatch is a platform-owner recovery mechanism, not something a
  // school admin can reach - deleting a covered period would orphan the
  // substitution record that references it.
  const covers = await db.substitution.count({ where: { scheduleId: id } });
  if (covers > 0) {
    const isOwner = request.headers.get('x-user-role') === 'superadmin';
    const forced = isOwner && new URL(request.url).searchParams.get('force') === 'true';
    if (!forced) {
      return NextResponse.json(
        {
          error: `This slot has ${covers} related record(s) and cannot be deleted normally.`,
          code: 'HAS_SUBSTITUTIONS',
          substitutions: covers,
          hint: 'Remove the substitution records first, or ask your platform administrator.',
        },
        { status: 409 }
      );
    }
  }

  await db.schedule.delete({ where: { id } });

  await db.auditLog
    .create({
      data: {
        schoolId,
        actorId: request.headers.get('x-user-id') || 'unknown',
        actorRole: request.headers.get('x-user-role') || 'unknown',
        action: 'timetable.delete_slot',
        entityType: 'Schedule',
        entityId: id,
        before: {
          grade: slot.grade, section: slot.section, day: slot.day,
          period: slot.period, subject: slot.subject, teacherId: slot.teacherId,
        },
      },
    })
    .catch(() => null);

  return NextResponse.json({
    success: true,
    message: `Removed ${slot.subject} from ${slot.grade} ${slot.section} ${slot.day} period ${slot.period}.`,
  });
}

