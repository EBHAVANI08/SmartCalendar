import { db } from '@/lib/db';
import { signJwt } from '@/lib/jwt-auth';
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password required' }, { status: 400 });
    }

    const cleanEmail = email.trim().toLowerCase();
    const admin = await db.admin.findUnique({ where: { email: cleanEmail } });
    if (!admin || !admin.isSuperAdmin) {
      return NextResponse.json({ error: 'Invalid credentials or insufficient privileges' }, { status: 401 });
    }

    let valid = false;
    if (admin.password.startsWith('$2a$') || admin.password.startsWith('$2b$')) {
      valid = await bcrypt.compare(password, admin.password);
    } else if (admin.password === password) {
      valid = true;
      // Upgrade plain text to bcrypt
      const hashed = await bcrypt.hash(password, 10);
      await db.admin.update({ where: { id: admin.id }, data: { password: hashed } }).catch(() => null);
    }

    if (!valid) {
      return NextResponse.json({ error: 'Invalid credentials or insufficient privileges' }, { status: 401 });
    }

    const token = await signJwt({
      userId: admin.id,
      email: admin.email,
      role: 'superadmin',
      name: admin.name,
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
