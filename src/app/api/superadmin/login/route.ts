import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password required' }, { status: 400 });
    }

    const admin = await db.admin.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (!admin || admin.password !== password || !admin.isSuperAdmin) {
      return NextResponse.json({ error: 'Invalid credentials or insufficient privileges' }, { status: 401 });
    }

    return NextResponse.json({
      success: true,
      user: {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        role: 'superadmin',
        isSuperAdmin: true,
      },
    });
  } catch (error) {
    console.error('Superadmin login error:', error);
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}
