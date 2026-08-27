import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { isSuperAdminRequest, unauthorized, writeAudit, actorFrom } from '@/lib/superadmin';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (!isSuperAdminRequest(request)) return unauthorized();
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const schoolId = searchParams.get('schoolId');
  const tickets = await db.supportTicket.findMany({
    where: {
      ...(status && status !== 'all' ? { status } : {}),
      ...(schoolId ? { schoolId } : {}),
    },
    include: { school: { select: { name: true, code: true } }, replies: { orderBy: { createdAt: 'asc' } } },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  return NextResponse.json({ tickets });
}

export async function POST(request: Request) {
  if (!isSuperAdminRequest(request)) return unauthorized();
  const body = await request.json();
  const actor = actorFrom(request);
  if (!body.subject) return NextResponse.json({ error: 'subject required' }, { status: 400 });
  const ticket = await db.supportTicket.create({
    data: {
      schoolId: body.schoolId || undefined,
      createdByName: actor.email,
      createdByEmail: actor.email,
      createdByRole: 'superadmin',
      category: body.category || 'general',
      subject: body.subject,
      priority: body.priority || 'normal',
      status: 'open',
      replies: body.body ? {
        create: {
          authorName: actor.email,
          authorEmail: actor.email,
          authorRole: 'superadmin',
          body: body.body,
        },
      } : undefined,
    },
    include: { replies: true },
  });
  await writeAudit(request, 'ticket.create', 'ticket', ticket.id);
  return NextResponse.json({ success: true, ticket }, { status: 201 });
}

export async function PATCH(request: Request) {
  if (!isSuperAdminRequest(request)) return unauthorized();
  const body = await request.json();
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const ticket = await db.supportTicket.update({
    where: { id: body.id },
    data: { status: body.status, priority: body.priority },
  });
  await writeAudit(request, 'ticket.update', 'ticket', ticket.id, { status: ticket.status });
  return NextResponse.json({ success: true, ticket });
}
