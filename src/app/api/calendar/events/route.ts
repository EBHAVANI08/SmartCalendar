import { db } from '@/lib/db';
import { getTenantSchoolId } from '@/lib/school-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireCapability } from '@/lib/authz';

// Keep this route usable while an editor still has the pre-migration Prisma
// declaration cached. Runtime delegates are provided by the generated client.
const calendarDb = db as unknown as {
  calendarEvent: {
    findMany(args: unknown): Promise<unknown[]>;
    findFirst(args: unknown): Promise<any>;
    count(args: unknown): Promise<number>;
    update(args: unknown): Promise<any>;
    delete(args: unknown): Promise<any>;
  };
  $transaction<T>(callback: (tx: {
    calendarEvent: { create(args: unknown): Promise<any> };
    auditLog: { create(args: unknown): Promise<unknown> };
  }) => Promise<T>): Promise<T>;
};

const eventSchema = z.object({ academicYearId: z.string().optional(), academicTermId: z.string().optional(), campusId: z.string().optional(), title: z.string().min(1), description: z.string().optional(), category: z.string().min(1), source: z.string().default('school'), status: z.enum(['draft', 'review', 'published', 'cancelled']).default('draft'), startAt: z.string().datetime(), endAt: z.string().datetime(), allDay: z.boolean().default(false), timezone: z.string().default('Asia/Kolkata'), recurrenceRule: z.string().optional(), applicableTo: z.unknown().optional(), roomId: z.string().optional(), createdBy: z.string() });

// Both handlers are pinned to the caller's school. schoolId used to arrive from
// the query string / body, so any signed-in user could read another school's
// calendar or create events inside it.
export async function GET(request: Request) {
  const url = new URL(request.url); const schoolId = await getTenantSchoolId(request);
  if (!schoolId) return NextResponse.json({ error: 'No school in session' }, { status: 401 });
  const from = url.searchParams.get('from'); const to = url.searchParams.get('to'); const category = url.searchParams.get('category');
  const events = await calendarDb.calendarEvent.findMany({ where: { schoolId, ...(category ? { category } : {}), ...(from || to ? { startAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } } : {}) }, orderBy: { startAt: 'asc' } });
  return NextResponse.json({ success: true, events });
}

export async function POST(request: Request) {
  const denied = requireCapability(request, 'calendar.write');
  if (denied) return denied;

  const schoolId = await getTenantSchoolId(request);
  if (!schoolId) return NextResponse.json({ error: 'No school in session' }, { status: 401 });
  const parsed = eventSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: 'Invalid event', details: parsed.error.flatten() }, { status: 400 });
  const input = { ...parsed.data, schoolId }; const startAt = new Date(input.startAt); const endAt = new Date(input.endAt);
  if (endAt <= startAt) return NextResponse.json({ error: 'Event end must be after its start.' }, { status: 400 });
  const conflicts = input.roomId ? await calendarDb.calendarEvent.count({ where: { schoolId: input.schoolId, roomId: input.roomId, status: { not: 'cancelled' }, startAt: { lt: endAt }, endAt: { gt: startAt } } }) : 0;
  if (conflicts) return NextResponse.json({ error: 'The selected room is already booked during this time.' }, { status: 409 });
  const event = await calendarDb.$transaction(async (tx) => {
    const created = await tx.calendarEvent.create({ data: { ...input, startAt, endAt, applicableTo: input.applicableTo as object | undefined } });
    await tx.auditLog.create({ data: { schoolId: input.schoolId, actorId: input.createdBy, actorRole: 'school', action: 'CREATE', entityType: 'CalendarEvent', entityId: created.id, after: created } });
    return created;
  });
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

  const existing = await calendarDb.calendarEvent.findFirst({
    where: { id, schoolId },
  });
  if (!existing) {
    return NextResponse.json({ error: 'Calendar event not found' }, { status: 404 });
  }

  const updatedStart = startAt ? new Date(startAt) : existing.startAt;
  const updatedEnd = endAt ? new Date(endAt) : existing.endAt;
  if (updatedEnd <= updatedStart) {
    return NextResponse.json({ error: 'Event end must be after its start.' }, { status: 400 });
  }

  const updated = await calendarDb.calendarEvent.update({
    where: { id },
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

  const existing = await calendarDb.calendarEvent.findFirst({
    where: { id, schoolId },
  });
  if (!existing) {
    return NextResponse.json({ error: 'Calendar event not found in this school' }, { status: 404 });
  }

  await calendarDb.calendarEvent.delete({ where: { id } });

  return NextResponse.json({ success: true, message: `Event "${existing.title}" deleted successfully.` });
}

