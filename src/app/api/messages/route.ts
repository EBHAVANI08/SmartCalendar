import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { getTenantSchoolId } from '@/lib/school-helper';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const schoolId = await getTenantSchoolId(request, false);
  if (!schoolId) return NextResponse.json({ error: 'No school context' }, { status: 400 });
  const messages = await db.tenantMessage.findMany({
    where: { schoolId },
    orderBy: { createdAt: 'desc' },
    take: 80,
  });
  return NextResponse.json({ messages });
}

export async function POST(request: Request) {
  const schoolId = await getTenantSchoolId(request, false);
  if (!schoolId) return NextResponse.json({ error: 'No school context' }, { status: 400 });
  const body = await request.json();
  if (!body.subject || !body.body) {
    return NextResponse.json({ error: 'subject and body are required' }, { status: 400 });
  }
  const email = request.headers.get('x-user-email') || 'user';
  const role = request.headers.get('x-user-role') || 'school';
  const message = await db.tenantMessage.create({
    data: {
      schoolId,
      direction: 'inbound',
      channel: 'message',
      subject: body.subject,
      body: body.body,
      fromName: email,
      fromRole: role,
      fromEmail: email,
    },
  });
  return NextResponse.json({ success: true, message }, { status: 201 });
}
