import { db } from '@/lib/db';
import { signJwt } from '@/lib/jwt-auth';
import { NextResponse } from 'next/server';
import { verifyPassword } from '@/lib/password';
import { clear, clientIp, pausedFor, record } from '@/lib/rate-limit';
import { LOGIN_FAILURE_WINDOW_MS, LOGIN_MAX_FAILURES_PER_EMAIL, LOGIN_MAX_FAILURES_PER_IP } from '@/lib/security-constants';

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password required' }, { status: 400 });
    }

    const cleanEmail = email.trim().toLowerCase();
    // Failed attempts are limited per email and per network address.
    const emailKey = `superadmin-login:email:${cleanEmail}`;
    const ipKey = `superadmin-login:ip:${clientIp(request)}`;
    const pause = Math.max(pausedFor(emailKey, LOGIN_MAX_FAILURES_PER_EMAIL), pausedFor(ipKey, LOGIN_MAX_FAILURES_PER_IP));
    if (pause) {
      return NextResponse.json({ error: `Too many failed sign-in attempts. Please try again in ${Math.ceil(pause / 60)} minute(s).` }, { status: 429, headers: { 'Retry-After': String(pause) } });
    }
    const fail = () => {
      record(emailKey, LOGIN_FAILURE_WINDOW_MS);
      record(ipKey, LOGIN_FAILURE_WINDOW_MS);
      return NextResponse.json({ error: 'Invalid credentials or insufficient privileges' }, { status: 401 });
    };
    const admin = await db.admin.findUnique({ where: { email: cleanEmail } });
    if (!admin || !admin.isSuperAdmin) return fail();

    const valid = await verifyPassword(password, admin.password, (newHash) =>
      db.admin.update({ where: { id: admin.id }, data: { password: newHash } })
    );

    if (!valid) return fail();
    clear(emailKey);

    const token = await signJwt({
      userId: admin.id,
      email: admin.email,
      role: 'superadmin',
      name: admin.name,
      accountType: 'admin',
      // A password someone else set must be changed first (limited session).
      ...(admin.mustChangePassword ? { mustChangePassword: true } : {}),
    });

    const response = NextResponse.json({
      success: true,
      token,
      user: {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        role: 'superadmin',
        isSuperAdmin: true,
      },
    });

    response.cookies.set('smart_calendar_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60,
    });

    return response;
  } catch (error) {
    console.error('Superadmin login error:', error);
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}
