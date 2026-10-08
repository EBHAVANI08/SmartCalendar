export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { signJwt, verifySessionJwt } from '@/lib/jwt-auth';
import { readSessionToken } from '@/lib/session';
import { getStoredPassword, setStoredPassword } from '@/lib/accounts';
import { hashPassword, verifyPassword } from '@/lib/password';

const MIN_PASSWORD_LENGTH = 6; // Same rule as profile and setup-password.

/**
 * Sets a new password for the signed-in account and clears a pending forced
 * change. This is the only API a limited (mustChangePassword) session can use.
 * /api/auth/* bypasses middleware, so the session is verified here.
 */
export async function POST(request: Request) {
  const token = readSessionToken(request);
  const session = token ? await verifySessionJwt(token).catch(() => null) : null;
  if (!session || !session.accountType) {
    return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const newPassword = String(body?.newPassword || '').trim();
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.` }, { status: 400 });
  }

  const stored = await getStoredPassword(session.accountType, session.userId);
  if (stored === null) {
    return NextResponse.json({ error: 'Account not found. Please sign in again.' }, { status: 401 });
  }
  // A normal session must prove the current password; a limited session
  // already proved it at login moments ago.
  if (!session.mustChangePassword) {
    const current = String(body?.currentPassword || '');
    if (!(await verifyPassword(current, stored))) {
      return NextResponse.json({ error: 'Current password is incorrect.' }, { status: 400 });
    }
  }
  if (await verifyPassword(newPassword, stored)) {
    return NextResponse.json({ error: 'Choose a password different from the current one.' }, { status: 400 });
  }

  const updated = await setStoredPassword(session.accountType, session.userId, await hashPassword(newPassword), false);
  if (!updated) {
    return NextResponse.json({ error: 'Account not found. Please sign in again.' }, { status: 401 });
  }

  // Replace the limited session with a full one.
  const { iat: _iat, exp: _exp, mustChangePassword: _limited, ...claims } = session;
  const fresh = await signJwt(claims);
  const response = NextResponse.json({ success: true, token: fresh });
  response.cookies.set('smart_calendar_token', fresh, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60,
  });
  return response;
}
