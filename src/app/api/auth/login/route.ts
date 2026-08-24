export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { db } from '@/lib/db';
import { signJwt } from '@/lib/jwt-auth';
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';

function createLoginResponse(user: any) {
  const token = signJwt({
    userId: user.id,
    email: user.email,
    role: user.role,
    schoolId: user.schoolId || null,
    schoolCode: user.schoolCode || null,
    name: user.name,
  });

  const response = NextResponse.json({
    success: true,
    token,
    user,
  });

  response.cookies.set('smart_calendar_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60,
  });

  return response;
}

async function verifyPassword(
  provided: string,
  stored: string,
  onPlainMatchUpgrade?: (newHash: string) => Promise<void>
): Promise<boolean> {
  if (!stored) return true;
  if (stored.startsWith('$2a$') || stored.startsWith('$2b$')) {
    return await bcrypt.compare(provided, stored);
  }
  if (provided === stored) {
    if (onPlainMatchUpgrade) {
      try {
        const hashed = await bcrypt.hash(provided, 10);
        await onPlainMatchUpgrade(hashed);
      } catch {}
    }
    return true;
  }
  return false;
}

export async function POST(request: Request) {
  try {
    let body: any = {};
    try {
      body = await request.json();
    } catch {
      const text = await request.text().catch(() => '');
      if (text) {
        try {
          body = JSON.parse(text);
        } catch {
          const emailMatch = /"email"\s*:\s*"([^"]+)"/i.exec(text);
          const passMatch = /"password"\s*:\s*"([^"]+)"/i.exec(text);
          body = { email: emailMatch?.[1], password: passMatch?.[1] };
        }
      }
    }

    const email = (body?.email || '').trim();
    const password = (body?.password || '').trim();

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    const cleanEmail = email.toLowerCase();

    // ── 1. Check School Tenant Database ──
    try {
      const school = await db.school.findFirst({
        where: {
          OR: [
            { email: cleanEmail },
            { email: email },
            { code: email.toUpperCase() },
            { code: cleanEmail.toUpperCase() },
          ],
        },
      });

      if (school) {
        const isSchoolPassValid = await verifyPassword(password, school.password, async (newHash) => {
          await db.school.update({ where: { id: school.id }, data: { password: newHash } }).catch(() => null);
        });

        if (isSchoolPassValid) {
          return createLoginResponse({
            id: school.id,
            name: school.name,
            email: school.email,
            role: 'school',
            schoolId: school.id,
            schoolCode: school.code,
            schoolName: school.name,
          });
        }
      }
    } catch (e) {
      console.error('Error querying school during login:', e);
    }

    // ── 2. Check Teacher Faculty Database ──
    try {
      const teacher = await db.teacher.findFirst({
        where: {
          OR: [{ email: cleanEmail }, { email }],
        },
        include: { school: true },
      });

      if (teacher) {
        const isTeacherPassValid = await verifyPassword(password, teacher.password, async (newHash) => {
          await db.teacher.update({ where: { id: teacher.id }, data: { password: newHash } }).catch(() => null);
        });

        if (isTeacherPassValid) {
          return createLoginResponse({
            id: teacher.id,
            name: teacher.name,
            email: teacher.email,
            role: 'teacher',
            schoolId: teacher.schoolId,
            schoolCode: teacher.school?.code,
            schoolName: teacher.school?.name || 'School',
            subject: teacher.subject,
            grades: teacher.grades,
            phone: teacher.phone,
          });
        }
      }
    } catch (e) {
      console.error('Error querying teacher during login:', e);
    }

    // ── 3. Check System Admin Database ──
    try {
      const admin = await db.admin.findFirst({
        where: {
          OR: [{ email: cleanEmail }, { email }],
        },
      });

      if (admin) {
        const isAdminPassValid = await verifyPassword(password, admin.password, async (newHash) => {
          await db.admin.update({ where: { id: admin.id }, data: { password: newHash } }).catch(() => null);
        });

        if (isAdminPassValid) {
          return createLoginResponse({
            id: admin.id,
            name: admin.name,
            email: admin.email,
            role: admin.isSuperAdmin ? 'superadmin' : 'admin',
          });
        }
      }
    } catch (e) {
      console.error('Error querying admin during login:', e);
    }

    // Account matched email check
    const existingEntity = await db.school
      .findFirst({ where: { OR: [{ email: cleanEmail }, { code: email.toUpperCase() }] } })
      .catch(() => null);

    if (existingEntity) {
      return NextResponse.json({ error: 'Incorrect password for this account.' }, { status: 401 });
    }

    return NextResponse.json({ error: 'No account found matching this email or school code.' }, { status: 404 });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'Authentication service temporarily unavailable. Please try again.' }, { status: 500 });
  }
}
