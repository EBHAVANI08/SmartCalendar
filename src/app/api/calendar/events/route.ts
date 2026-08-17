import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { z } from 'zod';

// Keep this route usable while an editor still has the pre-migration Prisma
// declaration cached. Runtime delegates are provided by the generated client.
const calendarDb = db as unknown as {
  calendarEvent: {
    findMany(args: unknown): Promise<unknown[]>;
    count(args: unknown): Promise<number>;
  };
  $transaction<T>(callback: (tx: {
    calendarEvent: { create(args: unknown): Promise<any> };
    auditLog: { create(args: unknown): Promise<unknown> };
  }) => Promise<T>): Promise<T>;
};

const eventSchema = z.object({ schoolId: z.string(), academicYearId: z.string().optional(), academicTermId: z.string().optional(), campusId: z.string().optional(), title: z.string().min(1), description: z.string().optional(), category: z.string().min(1), source: z.string().default('school'), status: z.enum(['draft', 'review', 'published', 'cancelled']).default('draft'), startAt: z.string().datetime(), endAt: z.string().datetime(), allDay: z.boolean().default(false), timezone: z.string().default('Asia/Kolkata'), recurrenceRule: z.string().optional(), applicableTo: z.unknown().optional(), roomId: z.string().optional(), createdBy: z.string() });

export async function GET(request: Request) {
  const url = new URL(request.url); const schoolId = url.searchParams.get('schoolId');
  if (!schoolId) return NextResponse.json({ error: 'schoolId is required' }, { status: 400 });
  const from = url.searchParams.get('from'); const to = url.searchParams.get('to'); const category = url.searchParams.get('category');
  const events = await calendarDb.calendarEvent.findMany({ where: { schoolId, ...(category ? { category } : {}), ...(from || to ? { startAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } } : {}) }, orderBy: { startAt: 'asc' } });
  return NextResponse.json({ success: true, events });
}

export async function POST(request: Request) {
  const parsed = eventSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: 'Invalid event', details: parsed.error.flatten() }, { status: 400 });
  const input = parsed.data; const startAt = new Date(input.startAt); const endAt = new Date(input.endAt);
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
