import { db } from '@/lib/db';
import { getTenantSchoolId } from '@/lib/school-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireCapability } from '@/lib/authz';

const eventSchema = z.object({
  academicYearId: z.string().optional(),
  academicTermId: z.string().optional(),
  campusId: z.string().optional(),
  title: z.string().min(1, 'Event title is required'),
  description: z.string().optional(),
  category: z.string().min(1, 'Category is required'),
  source: z.string().default('school'),
  status: z.enum(['draft', 'review', 'published', 'cancelled']).default('published'),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  allDay: z.boolean().default(false),
  timezone: z.string().default('Asia/Kolkata'),
  recurrenceRule: z.string().optional(),
  applicableTo: z.unknown().optional(),
  roomId: z.string().optional(),
  createdBy: z.string().default('school-admin'),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const schoolId = await getTenantSchoolId(request);
  if (!schoolId) return NextResponse.json({ error: 'No school in session' }, { status: 401 });

  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const category = url.searchParams.get('category');

  const events = await db.calendarEvent.findMany({
    where: {
      schoolId,
      ...(category && category !== 'all' ? { category } : {}),
      ...(from || to
        ? {
            startAt: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(to) } : {}),
            },
          }
        : {}),
    },
    orderBy: { startAt: 'asc' },
  });

  return NextResponse.json({ success: true, events });
}

export async function POST(request: Request) {
  const denied = requireCapability(request, 'calendar.write');
  if (denied) return denied;

  const schoolId = await getTenantSchoolId(request);
  if (!schoolId) return NextResponse.json({ error: 'No school in session' }, { status: 401 });

  const rawBody = await request.json().catch(() => ({}));
  const actorEmail = request.headers.get('x-user-email') || 'school-admin';
  if (!rawBody.createdBy) {
    rawBody.createdBy = actorEmail;
  }

  const parsed = eventSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid event parameters', details: parsed.error.flatten() }, { status: 400 });
  }

  const input = { ...parsed.data, schoolId };
  const startAt = new Date(input.startAt);
  const endAt = new Date(input.endAt);
  if (endAt < startAt) {
    return NextResponse.json({ error: 'Event end must be at or after its start.' }, { status: 400 });
  }

  const conflicts = input.roomId
    ? await db.calendarEvent.count({
        where: {
          schoolId: input.schoolId,
          roomId: input.roomId,
          status: { not: 'cancelled' },
          startAt: { lt: endAt },
          endAt: { gt: startAt },
        },
      })
    : 0;

  if (conflicts > 0) {
    return NextResponse.json({ error: 'The selected room/venue is already booked during this time.' }, { status: 409 });
  }

  const event = await db.calendarEvent.create({
    data: {
      ...input,
      startAt,
      endAt,
      applicableTo: input.applicableTo as object | undefined,
    },
  });

  try {
    await db.auditLog.create({
      data: {
        schoolId: input.schoolId,
        actorId: input.createdBy,
        actorRole: 'school',
        action: 'CREATE',
        entityType: 'CalendarEvent',
        entityId: event.id,
        after: event,
      },
    });
  } catch {}

  return NextResponse.json({ success: true, event }, { status: 201 });
}

export async function PATCH(request: Request) {
  const denied = requireCapability(request, 'calendar.write');
  if (denied) return denied;

  const schoolId = await getTenantSchoolId(request);
  if (!schoolId) return NextResponse.json({ error: 'No school in session' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { id, title, description, category, startAt, endAt, roomId, allDay } = body;
  if (!id) return NextResponse.json({ error: 'Event id is required' }, { status: 400 });

  // Handle multi-day composite feed IDs like "${e.id}-${dStr}"
  const cleanId = String(id).split('-')[0].trim();

  const existing = await db.calendarEvent.findFirst({
    where: { id: cleanId, schoolId },
  });
  if (!existing) {
    return NextResponse.json({ error: 'Calendar event not found' }, { status: 404 });
  }

  const updatedStart = startAt ? new Date(startAt) : existing.startAt;
  const updatedEnd = endAt ? new Date(endAt) : existing.endAt;
  if (updatedEnd < updatedStart) {
    return NextResponse.json({ error: 'Event end must be at or after its start.' }, { status: 400 });
  }

  const updated = await db.calendarEvent.update({
    where: { id: cleanId },
    data: {
      ...(title ? { title: String(title).trim() } : {}),
      ...(description !== undefined ? { description: String(description).trim() || null } : {}),
      ...(category ? { category: String(category).trim() } : {}),
      ...(startAt ? { startAt: updatedStart } : {}),
      ...(endAt ? { endAt: updatedEnd } : {}),
      ...(roomId !== undefined ? { roomId: roomId ? String(roomId) : null } : {}),
      ...(allDay !== undefined ? { allDay: Boolean(allDay) } : {}),
    },
  });

  return NextResponse.json({ success: true, event: updated });
}

export async function DELETE(request: Request) {
  const denied = requireCapability(request, 'calendar.write');
  if (denied) return denied;

  const schoolId = await getTenantSchoolId(request);
  if (!schoolId) return NextResponse.json({ error: 'No school in session' }, { status: 401 });

  const url = new URL(request.url);
  let id = url.searchParams.get('id');
  if (!id) {
    const body = await request.json().catch(() => ({}));
    id = body?.id;
  }
  if (!id) return NextResponse.json({ error: 'Event id is required' }, { status: 400 });

  // Handle multi-day composite feed IDs like "${e.id}-${dStr}"
  const cleanId = String(id).split('-')[0].trim();

  const existing = await db.calendarEvent.findFirst({
    where: { id: cleanId, schoolId },
  });
  if (!existing) {
    return NextResponse.json({ error: 'Calendar event not found in this school' }, { status: 404 });
  }

  await db.calendarEvent.delete({ where: { id: cleanId } });

  return NextResponse.json({ success: true, message: `Event "${existing.title}" deleted successfully.` });
}
