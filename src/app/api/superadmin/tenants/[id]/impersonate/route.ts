import { db } from '@/lib/db';
import { signJwt } from '@/lib/jwt-auth';
import { NextResponse } from 'next/server';
import { isSuperAdminRequest, unauthorized, writeAudit } from '@/lib/superadmin';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  if (!isSuperAdminRequest(request)) return unauthorized();
  const { id } = await ctx.params;

  const school = await db.school.findUnique({ where: { id } });
  if (!school) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
  if (school.status === 'suspended') {
    return NextResponse.json({ error: 'Cannot access a suspended tenant. Activate it first.' }, { status: 403 });
  }

  const user = {
    id: school.id,
    name: school.contactName || school.name,
    email: school.email,
    role: 'admin' as const,
    schoolId: school.id,
    schoolCode: school.code,
    schoolName: school.name,
  };

  const token = signJwt({
    userId: user.id,
    email: user.email,
    role: user.role,
    schoolId: user.schoolId,
    schoolCode: user.schoolCode,
    name: user.name,
  });

  await writeAudit(request, 'tenant.impersonate', 'school', id, { school: school.name });

  const response = NextResponse.json({ success: true, token, user, impersonating: true });
  response.cookies.set('smart_calendar_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60,
  });
  return response;
}
