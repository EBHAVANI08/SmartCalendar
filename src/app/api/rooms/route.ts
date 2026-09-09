export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTenantSchoolId } from '@/lib/school-helper';
import { requireCapability } from '@/lib/authz';
import { isKnownRoomType, parseSupportedSubjects, parseUnavailable, suggestRoomType } from '@/lib/room-types';

/**
 * Rooms & facilities.
 *
 * Stage 1: a room can now declare a normalised type, the subjects it serves and
 * the periods it is unavailable. None of that is enforced in scheduling yet -
 * Stage 2 wires it into the shared validator and has not been started.
 *
 * Existing room data is never rewritten. Where a stored type is free text, the
 * response carries a suggestion for an Admin to confirm.
 */

export async function GET(req: NextRequest) {
  const denied = requireCapability(req, 'rooms.read');
  if (denied) return denied;

  try {
    // Fails closed. This previously fell through to `{}` when no tenant
    // resolved, returning every school's rooms.
    const schoolId = await getTenantSchoolId(req);
    if (!schoolId) {
      return NextResponse.json({ success: false, error: 'No school in session' }, { status: 401 });
    }

    const rooms = await db.room.findMany({
      where: { schoolId },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });

    const shaped = rooms.map((r) => {
      const normalised = isKnownRoomType(r.type);
      return {
        id: r.id,
        code: r.code,
        name: r.name,
        type: r.type,
        typeIsNormalised: normalised,
        // A suggestion only, for an Admin to confirm. Nothing is auto-applied.
        suggestedType: normalised ? null : suggestRoomType(r.name, r.code),
        capacity: r.capacity,
        supportedSubjects: parseSupportedSubjects(r.supportedSubjects),
        unavailablePeriods: parseUnavailable(r.unavailablePeriods),
        active: r.active,
      };
    });

    const typeBreakdown = shaped.reduce((acc: Record<string, number>, r) => {
      acc[r.type] = (acc[r.type] || 0) + 1;
      return acc;
    }, {});

    return NextResponse.json({
      success: true,
      rooms: shaped,
      stats: {
        totalRooms: shaped.length,
        activeRooms: shaped.filter((r) => r.active).length,
        needsTypeReview: shaped.filter((r) => !r.typeIsNormalised).length,
        typeBreakdown,
      },
    });
  } catch (error) {
    console.error('[ROOMS LIST ERROR]', error);
    return NextResponse.json({ success: false, error: 'Failed to load rooms' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const denied = requireCapability(req, 'rooms.write');
  if (denied) return denied;

  try {
    // No "first school in the database" fallback: that wrote rooms into
    // whichever tenant happened to come first.
    const schoolId = await getTenantSchoolId(req);
    if (!schoolId) {
      return NextResponse.json({ success: false, error: 'No school in session' }, { status: 401 });
    }

    const body = await req.json();
    const { code, name, type, capacity, supportedSubjects, unavailablePeriods } = body;

    if (!code || !name || !type) {
      return NextResponse.json({ success: false, error: 'code, name, and type are required' }, { status: 400 });
    }
    if (!isKnownRoomType(type)) {
      return NextResponse.json(
        { success: false, error: `"${type}" is not a recognised room type.` },
        { status: 400 }
      );
    }

    const room = await db.room.create({
      data: {
        schoolId,
        code: String(code).trim().toUpperCase(),
        name: String(name).trim(),
        type,
        capacity: Number(capacity) || 30,
        supportedSubjects: Array.isArray(supportedSubjects) && supportedSubjects.length
          ? supportedSubjects.map(String)
          : undefined,
        unavailablePeriods: unavailablePeriods && Object.keys(unavailablePeriods).length
          ? unavailablePeriods
          : undefined,
        active: true,
      },
    });

    return NextResponse.json({ success: true, room }, { status: 201 });
  } catch (error) {
    const err = error as { code?: string; message?: string };
    if (err?.code === 'P2002') {
      return NextResponse.json(
        { success: false, error: 'A room with this code already exists in your school.' },
        { status: 409 }
      );
    }
    console.error('[ROOMS CREATE ERROR]', err?.message || error);
    return NextResponse.json({ success: false, error: 'Failed to create room.' }, { status: 500 });
  }
}

/** Update one room's Stage 1 attributes. Never touches other schools' rows. */
export async function PATCH(req: NextRequest) {
  const denied = requireCapability(req, 'rooms.write');
  if (denied) return denied;

  const schoolId = await getTenantSchoolId(req);
  if (!schoolId) {
    return NextResponse.json({ success: false, error: 'No school in session' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { id, name, code, type, capacity, supportedSubjects, unavailablePeriods, active } = body;
  if (!id) return NextResponse.json({ success: false, error: 'id is required' }, { status: 400 });

  const existing = await db.room.findFirst({ where: { id, schoolId }, select: { id: true, code: true } });
  if (!existing) return NextResponse.json({ success: false, error: 'Room not found' }, { status: 404 });

  if (type !== undefined && !isKnownRoomType(type)) {
    return NextResponse.json({ success: false, error: `"${type}" is not a recognised room type.` }, { status: 400 });
  }

  if (code !== undefined && code.trim().toUpperCase() !== existing.code) {
    const dup = await db.room.findFirst({
      where: { schoolId, code: code.trim().toUpperCase(), NOT: { id } },
      select: { id: true },
    });
    if (dup) {
      return NextResponse.json(
        { success: false, error: 'Another room with this code already exists in your school.' },
        { status: 409 }
      );
    }
  }

  const room = await db.room.update({
    where: { id },
    data: {
      ...(name !== undefined ? { name: String(name).trim() } : {}),
      ...(code !== undefined ? { code: String(code).trim().toUpperCase() } : {}),
      ...(type !== undefined ? { type } : {}),
      ...(capacity !== undefined ? { capacity: Number(capacity) || 0 } : {}),
      ...(supportedSubjects !== undefined ? { supportedSubjects: Array.isArray(supportedSubjects) ? supportedSubjects.map(String) : [] } : {}),
      ...(unavailablePeriods !== undefined ? { unavailablePeriods } : {}),
      ...(active !== undefined ? { active: Boolean(active) } : {}),
    },
  });

  return NextResponse.json({ success: true, room });
}

export async function DELETE(req: NextRequest) {
  const denied = requireCapability(req, 'rooms.write');
  if (denied) return denied;

  const schoolId = await getTenantSchoolId(req);
  if (!schoolId) {
    return NextResponse.json({ success: false, error: 'No school in session' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  let id = searchParams.get('id');
  if (!id) {
    const body = await req.json().catch(() => ({}));
    id = body?.id;
  }
  if (!id) {
    return NextResponse.json({ success: false, error: 'Room id is required' }, { status: 400 });
  }

  const existing = await db.room.findFirst({
    where: { id, schoolId },
    select: { id: true, name: true, code: true },
  });
  if (!existing) {
    return NextResponse.json({ success: false, error: 'Room not found in this school' }, { status: 404 });
  }

  // Check if room is used in timetable schedule
  const scheduleCount = await db.schedule.count({
    where: { roomId: id, schoolId },
  });
  if (scheduleCount > 0) {
    return NextResponse.json(
      {
        success: false,
        error: `Cannot delete room "${existing.name}" because it is currently assigned to ${scheduleCount} timetable period(s). Please unassign it from timetable first or mark it inactive.`,
        code: 'ROOM_IN_USE',
        scheduleCount,
      },
      { status: 409 }
    );
  }

  await db.roomAvailabilitySlot.deleteMany({ where: { roomId: id } }).catch(() => null);
  await db.room.delete({ where: { id } });

  return NextResponse.json({
    success: true,
    message: `Room "${existing.name}" (${existing.code}) deleted successfully.`,
  });
}

