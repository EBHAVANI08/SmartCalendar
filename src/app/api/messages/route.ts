import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { getTenantSchoolId } from '@/lib/school-helper';
import { requireCapability } from '@/lib/authz';

export const dynamic = 'force-dynamic';

async function resolveSchool(request: Request): Promise<string | null> {
  let schoolId = await getTenantSchoolId(request, false);
  if (schoolId) return schoolId;

  const email = request.headers.get('x-user-email');
  if (email) {
    const cleanEmail = email.trim().toLowerCase();
    const teacher = await db.teacher.findFirst({
      where: { email: cleanEmail },
      select: { schoolId: true },
    });
    if (teacher?.schoolId) return teacher.schoolId;

    const member = await db.workspaceMember.findFirst({
      where: { email: cleanEmail },
      select: { schoolId: true },
    });
    if (member?.schoolId) return member.schoolId;

    const school = await db.school.findFirst({
      where: {
        OR: [{ email: cleanEmail }, { code: cleanEmail.toUpperCase() }],
      },
      select: { id: true },
    });
    if (school?.id) return school.id;
  }
  return null;
}

export async function GET(request: Request) {
  const schoolId = await resolveSchool(request);
  if (!schoolId) return NextResponse.json({ messages: [] });
  const messages = await db.tenantMessage.findMany({
    where: { schoolId },
    orderBy: { createdAt: 'desc' },
    take: 80,
  });
  return NextResponse.json({ messages });
}

export async function POST(request: Request) {
  const denied = requireCapability(request, 'support.write');
  if (denied) return denied;

  const schoolId = await resolveSchool(request);
  if (!schoolId) return NextResponse.json({ error: 'No school context' }, { status: 400 });
  const body = await request.json().catch(() => ({}));
  if (!body.subject || !body.body) {
    return NextResponse.json({ error: 'Subject and body are required' }, { status: 400 });
  }
  const email = request.headers.get('x-user-email') || 'user';
  const role = request.headers.get('x-user-role') || 'school';
  const name = request.headers.get('x-user-name') || email;
  const message = await db.tenantMessage.create({
    data: {
      schoolId,
      direction: 'inbound',
      channel: 'message',
      subject: body.subject.trim(),
      body: body.body.trim(),
      fromName: name,
      fromRole: role,
      fromEmail: email,
    },
  });
  return NextResponse.json({ success: true, message }, { status: 201 });
}
