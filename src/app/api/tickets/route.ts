import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { getTenantSchoolId } from '@/lib/school-helper';

export const dynamic = 'force-dynamic';

function actor(request: Request) {
  return {
    id: request.headers.get('x-user-id') || '',
    email: request.headers.get('x-user-email') || 'user',
    role: request.headers.get('x-user-role') || 'school',
    name: request.headers.get('x-user-email') || 'User',
  };
}

export async function GET(request: Request) {
  const schoolId = await getTenantSchoolId(request, false);
  if (!schoolId && request.headers.get('x-user-role') !== 'superadmin') {
    return NextResponse.json({ error: 'No school context' }, { status: 400 });
  }
  const tickets = await db.supportTicket.findMany({
    where: schoolId ? { schoolId } : { createdByEmail: actor(request).email },
    include: { replies: { orderBy: { createdAt: 'asc' } } },
    orderBy: { createdAt: 'desc' },
    take: 80,
  });
  return NextResponse.json({ tickets });
}

export async function POST(request: Request) {
  const schoolId = await getTenantSchoolId(request, false);
  const body = await request.json();
  if (!body.subject || !body.body) {
    return NextResponse.json({ error: 'subject and message body are required' }, { status: 400 });
  }
  const a = actor(request);
  const ticket = await db.supportTicket.create({
    data: {
      schoolId: schoolId || undefined,
      createdById: a.id,
      createdByName: a.name,
      createdByEmail: a.email,
      createdByRole: a.role,
      category: body.category || 'general',
      subject: body.subject,
      priority: body.priority || 'normal',
      replies: {
        create: {
          authorName: a.name,
          authorEmail: a.email,
          authorRole: a.role,
          body: body.body,
        },
      },
    },
    include: { replies: true },
  });
  return NextResponse.json({ success: true, ticket }, { status: 201 });
}
