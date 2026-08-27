import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { actorFrom, isSuperAdminRequest, unauthorized, writeAudit } from '@/lib/superadmin';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (!isSuperAdminRequest(request)) return unauthorized();
  const { searchParams } = new URL(request.url);
  const schoolId = searchParams.get('schoolId');
  const messages = await db.tenantMessage.findMany({
    where: schoolId ? { schoolId } : undefined,
    include: { school: { select: { name: true, code: true } } },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  return NextResponse.json({ messages });
}

export async function POST(request: Request) {
  if (!isSuperAdminRequest(request)) return unauthorized();
  const body = await request.json();
  if (!body.schoolId || !body.subject || !body.body) {
    return NextResponse.json({ error: 'schoolId, subject and body are required' }, { status: 400 });
  }
  const actor = actorFrom(request);
  const message = await db.tenantMessage.create({
    data: {
      schoolId: body.schoolId,
      direction: 'outbound',
      channel: body.channel || 'message',
      subject: body.subject,
      body: body.body,
      fromName: actor.email,
      fromRole: 'superadmin',
      fromEmail: actor.email,
    },
  });
  await writeAudit(request, 'message.send', 'tenantMessage', message.id, { schoolId: body.schoolId, channel: message.channel });
  return NextResponse.json({ success: true, message }, { status: 201 });
}
