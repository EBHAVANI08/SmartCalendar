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

async function verifyPassword(provided: string, stored: string, onPlainMatchUpgrade?: (newHash: string) => Promise<void>): Promise<boolean> {
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
  let credentials: { email?: string; password?: string; role?: string } = {};
  let rawText = '';
  try {
    rawText = await request.text();
    if (rawText) {
      try {
        credentials = JSON.parse(rawText);
      } catch {
        // Fallback regex extraction for escaped payloads
      }
    }
    let email = credentials.email;
    let password = credentials.password;
    let role = credentials.role;

    if (!email || !password || !role) {
      const emailMatch = /"email"\s*:\s*"([^"]+)"/i.exec(rawText);
      const passMatch = /"password"\s*:\s*"([^"]+)"/i.exec(rawText);
      const roleMatch = /"role"\s*:\s*"([^"]+)"/i.exec(rawText);
      email = email || emailMatch?.[1];
      password = password || passMatch?.[1];
      role = role || roleMatch?.[1];
    }

    if (!email || !password || !role) {
      return NextResponse.json({ error: 'Email, password, and role are required' }, { status: 400 });
    }

    const cleanEmail = email.trim().toLowerCase();

    if (role === 'school') {
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

      if (!school) {
        return NextResponse.json({ error: 'School account not found for provided email or code' }, { status: 404 });
      }

      const isValid = await verifyPassword(password, school.password, async (newHash) => {
        await db.school.update({ where: { id: school.id }, data: { password: newHash } });
      });

      if (!isValid) {
        return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
      }

      return createLoginResponse({
        id: school.id,
        name: school.name,
        email: school.email,
        role: 'school',
        schoolId: school.id,
        schoolCode: school.code,
      });
    }

    if (role === 'admin' || role === 'superadmin') {
      const admin = await db.admin.findFirst({
        where: {
          OR: [{ email: cleanEmail }, { email }],
        },
      });

      if (!admin) {
        // Also check if admin is logging in as school administrator
        const schoolAdmin = await db.school.findFirst({
          where: {
            OR: [{ email: cleanEmail }, { email }, { code: email.toUpperCase() }],
          },
        });

        if (schoolAdmin) {
          const isValidSchoolPass = await verifyPassword(password, schoolAdmin.password, async (newHash) => {
            await db.school.update({ where: { id: schoolAdmin.id }, data: { password: newHash } });
          });
          if (isValidSchoolPass) {
            return createLoginResponse({
              id: schoolAdmin.id,
              name: schoolAdmin.name,
              email: schoolAdmin.email,
              role: 'school',
              schoolId: schoolAdmin.id,
              schoolCode: schoolAdmin.code,
            });
          }
        }

        return NextResponse.json({ error: 'Administrator account not found' }, { status: 404 });
      }

      const isValid = await verifyPassword(password, admin.password, async (newHash) => {
        await db.admin.update({ where: { id: admin.id }, data: { password: newHash } });
      });

      if (!isValid) {
        return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
      }

      return createLoginResponse({
        id: admin.id,
        name: admin.name,
        email: admin.email,
        role: admin.isSuperAdmin ? 'superadmin' : 'admin',
      });
    }

    if (role === 'teacher') {
      const teacher = await db.teacher.findFirst({
        where: {
          OR: [{ email: cleanEmail }, { email }],
        },
        include: { schedules: true, school: true },
      });

      if (!teacher) {
        return NextResponse.json({ error: 'Teacher account not found with provided email' }, { status: 404 });
      }

      const isValid = await verifyPassword(password, teacher.password, async (newHash) => {
        await db.teacher.update({ where: { id: teacher.id }, data: { password: newHash } });
      });

      if (!isValid) {
        return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
      }

      return createLoginResponse({
        id: teacher.id,
        name: teacher.name,
        email: teacher.email,
        role: 'teacher',
        schoolId: teacher.schoolId,
        schoolName: teacher.school?.name || 'School',
        subject: teacher.subject,
        grades: teacher.grades,
        phone: teacher.phone,
      });
    }

    return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ error: `Login failed: ${String(error)}` }, { status: 500 });
  }
}
