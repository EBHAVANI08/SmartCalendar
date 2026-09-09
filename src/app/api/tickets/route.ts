import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { getTenantSchoolId } from '@/lib/school-helper';
import { requireCapability } from '@/lib/authz';

export const dynamic = 'force-dynamic';

function actor(request: Request) {
  return {
    id: request.headers.get('x-user-id') || '',
    email: request.headers.get('x-user-email') || 'user',
    role: request.headers.get('x-user-role') || 'school',
    name: request.headers.get('x-user-name') || request.headers.get('x-user-email') || 'User',
  };
}

async function resolveSchool(request: Request, actorEmail: string): Promise<string | null> {
  let schoolId = await getTenantSchoolId(request, false);
  if (schoolId) return schoolId;

  if (actorEmail) {
    const cleanEmail = actorEmail.trim().toLowerCase();
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
  const a = actor(request);
  const schoolId = await resolveSchool(request, a.email);

  const tickets = await db.supportTicket.findMany({
    where: schoolId
      ? (a.role === 'teacher' ? { schoolId, createdByEmail: a.email } : { schoolId })
      : { createdByEmail: a.email },
    include: { replies: { orderBy: { createdAt: 'asc' } } },
    orderBy: { createdAt: 'desc' },
    take: 80,
  });
  return NextResponse.json({ tickets });
}

export async function POST(request: Request) {
  const denied = requireCapability(request, 'support.write');
  if (denied) return denied;

  const a = actor(request);
  const schoolId = await resolveSchool(request, a.email);

  const body = await request.json().catch(() => ({}));
  if (!body.subject || !body.body) {
    return NextResponse.json({ error: 'Subject and message details are required' }, { status: 400 });
  }

  const ticket = await db.supportTicket.create({
    data: {
      schoolId: schoolId || undefined,
      createdById: a.id || undefined,
      createdByName: a.name,
      createdByEmail: a.email,
      createdByRole: a.role,
      category: body.category || 'general',
      subject: body.subject.trim(),
      priority: body.priority || 'normal',
      status: 'open',
      replies: {
        create: {
          authorName: a.name,
          authorEmail: a.email,
          authorRole: a.role,
          body: body.body.trim(),
        },
      },
    },
    include: { replies: true },
  });
  return NextResponse.json({ success: true, ticket }, { status: 201 });
}
