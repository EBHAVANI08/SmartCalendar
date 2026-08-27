import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { signJwt, verifyJwt } from '@/lib/jwt-auth';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const token = body.token as string | undefined;
  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 });

  const session = verifyJwt(token);
  if (!session || session.role !== 'superadmin') {
    return NextResponse.json({ error: 'Invalid owner session' }, { status: 401 });
  }

  const fresh = signJwt({
    userId: session.userId,
    email: session.email,
    role: 'superadmin',
    schoolId: session.schoolId,
    schoolCode: session.schoolCode,
    name: session.name,
  });

  const admin = await db.admin.findFirst({ where: { isSuperAdmin: true } }).catch(() => null);
  const user = {
    id: session.userId,
    name: session.name || admin?.name || 'SuperAdmin',
    email: session.email,
    role: 'superadmin' as const,
    schoolId: session.schoolId,
    schoolCode: session.schoolCode,
    schoolName: 'Application Owner Console',
  };

  const response = NextResponse.json({ success: true, token: fresh, user });
  response.cookies.set('smart_calendar_token', fresh, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60,
  });
  return response;
}
