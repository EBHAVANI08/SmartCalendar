import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { signJwt, verifyJwt } from '@/lib/jwt-auth';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  let token = (body.token as string | undefined)?.trim();

  // If token was not provided in request body, inspect cookies
  if (!token) {
    const cookieHeader = request.headers.get('cookie') || '';
    for (const part of cookieHeader.split(';')) {
      const sep = part.indexOf('=');
      if (sep === -1) continue;
      const key = part.slice(0, sep).trim();
      const val = part.slice(sep + 1).trim();
      if (key === 'smart_calendar_impersonator_token') {
        token = decodeURIComponent(val);
        break;
      }
    }
  }

  // Fallback: check if the existing token in smart_calendar_token is already superadmin
  if (!token) {
    const cookieHeader = request.headers.get('cookie') || '';
    for (const part of cookieHeader.split(';')) {
      const sep = part.indexOf('=');
      if (sep === -1) continue;
      const key = part.slice(0, sep).trim();
      const val = part.slice(sep + 1).trim();
      if (key === 'smart_calendar_token') {
        const candidate = decodeURIComponent(val);
        const check = await verifyJwt(candidate);
        if (check && check.role === 'superadmin') {
          token = candidate;
        }
        break;
      }
    }
  }

  if (!token) {
    return NextResponse.json({ error: 'SuperAdmin session token not found' }, { status: 400 });
  }

  const session = await verifyJwt(token);
  if (!session || session.role !== 'superadmin') {
    return NextResponse.json({ error: 'Invalid owner session. Please log in as SuperAdmin.' }, { status: 401 });
  }

  const fresh = await signJwt({
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

  // Expire the impersonation backup cookie
  response.cookies.set('smart_calendar_impersonator_token', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });

  return response;
}
