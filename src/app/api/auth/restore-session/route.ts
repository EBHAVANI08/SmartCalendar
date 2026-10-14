import { NextResponse } from 'next/server';
import { verifySessionJwt } from '@/lib/jwt-auth';

export const dynamic = 'force-dynamic';

/**
 * "Back to owner console" after viewing a school as the owner.
 *
 * The owner's own session was kept in an httpOnly cookie when impersonation
 * started (never on the page). It is put back as the session unchanged, so it
 * keeps its original expiry: this route never issues a new, longer session,
 * and a token sent in the request body is ignored.
 */

const cookieValue = (request: Request, name: string): string | null => {
  for (const part of (request.headers.get('cookie') || '').split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1 || part.slice(0, separator).trim() !== name) continue;
    const value = decodeURIComponent(part.slice(separator + 1).trim());
    return value || null;
  }
  return null;
};

const ownerUser = (session: NonNullable<Awaited<ReturnType<typeof verifySessionJwt>>>) => ({
  id: session.userId,
  name: session.name || 'SuperAdmin',
  email: session.email,
  role: 'superadmin' as const,
  schoolId: session.schoolId,
  schoolCode: session.schoolCode,
  schoolName: 'Application Owner Console',
  ...(session.mustChangePassword ? { mustChangePassword: true } : {}),
});

const cookieOptions = (maxAge: number) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge,
});

export async function POST(request: Request) {
  const saved = cookieValue(request, 'smart_calendar_impersonator_token');
  if (saved) {
    const session = await verifySessionJwt(saved);
    const response = session?.role === 'superadmin'
      ? NextResponse.json({ success: true, user: ownerUser(session) })
      : NextResponse.json({ error: 'Your owner session has ended. Please sign in again.' }, { status: 401 });
    if (session?.role === 'superadmin') {
      const secondsLeft = Math.max(0, (session.exp ?? 0) - Math.floor(Date.now() / 1000));
      response.cookies.set('smart_calendar_token', saved, cookieOptions(secondsLeft));
    }
    response.cookies.set('smart_calendar_impersonator_token', '', cookieOptions(0));
    return response;
  }

  // Already back in the owner session: nothing to restore, nothing re-issued.
  const current = cookieValue(request, 'smart_calendar_token');
  const session = current ? await verifySessionJwt(current) : null;
  if (session?.role === 'superadmin') return NextResponse.json({ success: true, user: ownerUser(session) });

  return NextResponse.json({ error: 'Your owner session has ended. Please sign in again.' }, { status: 401 });
}
