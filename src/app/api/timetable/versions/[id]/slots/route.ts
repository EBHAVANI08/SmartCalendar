import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const slotSchema = z.object({ schoolId: z.string(), classSectionId: z.string(), subjectId: z.string().nullable().optional(), teacherId: z.string().nullable().optional(), roomId: z.string().nullable().optional(), dayOfWeek: z.number().int().min(1).max(7), period: z.number().int().min(1), lessonType: z.string().default('teaching'), topic: z.string().optional(), locked: z.boolean().default(false), fixedReason: z.string().optional() });

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params; const schoolId = new URL(request.url).searchParams.get('schoolId');
  if (!schoolId) return NextResponse.json({ error: 'schoolId is required' }, { status: 400 });
  const slots = await db.timetableSlot.findMany({ where: { schoolId, timetableVersionId: id }, orderBy: [{ classSectionId: 'asc' }, { dayOfWeek: 'asc' }, { period: 'asc' }] });
  return NextResponse.json({ success: true, slots });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params; const parsed = slotSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: 'Invalid timetable slot', details: parsed.error.flatten() }, { status: 400 });
  const version = await db.timetableVersion.findFirst({ where: { id, schoolId: parsed.data.schoolId } });
  if (!version || version.status === 'published' || version.status === 'archived') return NextResponse.json({ error: 'Only an editable draft can be changed.' }, { status: 409 });
  try { const slot = await db.timetableSlot.create({ data: { ...parsed.data, timetableVersionId: id } }); return NextResponse.json({ success: true, slot }, { status: 201 }); }
  catch { return NextResponse.json({ error: 'Class, teacher or room is already occupied in this period.' }, { status: 409 }); }
}
