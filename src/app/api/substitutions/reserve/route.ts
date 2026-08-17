import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { z } from 'zod';

// Structural compatibility type prevents stale editor Prisma declarations from
// hiding delegates that are present in the generated runtime client.
const reservationDb = db as unknown as {
  substituteReservation: { findUnique(args: unknown): Promise<any> };
  substitution: { findUnique(args: unknown): Promise<any> };
  $transaction<T>(callback: (tx: {
    substituteReservation: { create(args: unknown): Promise<any> };
    substitution: { update(args: unknown): Promise<unknown> };
    auditLog: { create(args: unknown): Promise<unknown> };
  }) => Promise<T>): Promise<T>;
};

const schema = z.object({ schoolId: z.string(), substitutionId: z.string(), teacherId: z.string(), idempotencyKey: z.string().min(8), actorId: z.string(), responseDueAt: z.string().datetime().optional() });

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: 'Invalid reservation', details: parsed.error.flatten() }, { status: 400 });
  const input = parsed.data;
  const existing = await reservationDb.substituteReservation.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) return NextResponse.json({ success: true, reservation: existing, idempotent: true });
  const substitution = await reservationDb.substitution.findUnique({ where: { id: input.substitutionId } });
  if (!substitution) return NextResponse.json({ error: 'Substitution not found' }, { status: 404 });
  try {
    const reservation = await reservationDb.$transaction(async (tx) => {
      const created = await tx.substituteReservation.create({ data: { schoolId: input.schoolId, substitutionId: input.substitutionId, teacherId: input.teacherId, date: substitution.date, period: substitution.period, idempotencyKey: input.idempotencyKey, responseDueAt: input.responseDueAt ? new Date(input.responseDueAt) : null } });
      await tx.substitution.update({ where: { id: substitution.id }, data: { substituteId: input.teacherId, status: 'offered' } });
      await tx.auditLog.create({ data: { schoolId: input.schoolId, actorId: input.actorId, actorRole: 'school', action: 'RESERVE', entityType: 'Substitution', entityId: substitution.id, after: created } });
      return created;
    });
    return NextResponse.json({ success: true, reservation }, { status: 201 });
  } catch (error) {
    if (String(error).includes('Unique constraint')) return NextResponse.json({ error: 'Teacher is already reserved for that date and period.' }, { status: 409 });
    throw error;
  }
}
