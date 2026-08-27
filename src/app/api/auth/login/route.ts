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
    ownerRole: user.ownerRole || null,
    modules: Array.isArray(user.modules) ? JSON.stringify(user.modules) : (user.modules || null),
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

    // ── Owner team employees (sales, support, demo, finance) ──
    try {
      const employee = await db.ownerEmployee.findFirst({
        where: { email: cleanEmail, status: 'active' },
      });
      if (employee) {
        const ok = await verifyPassword(password, employee.password, async (newHash) => {
          await db.ownerEmployee.update({ where: { id: employee.id }, data: { password: newHash } }).catch(() => null);
        });
        if (ok) {
          let modules: string[] = [];
          try { modules = JSON.parse(employee.modules || '[]'); } catch { modules = []; }
          return createLoginResponse({
            id: employee.id,
            name: employee.name,
            email: employee.email,
            role: 'superadmin',
            ownerRole: employee.role,
            modules,
            isDemo: employee.isDemo,
            schoolName: 'Application Owner Console',
          });
        }
      }
    } catch (e) {
      console.error('Error querying owner employee during login:', e);
    }

    // ── Platform SuperAdmin (owner console) ──
    const SUPERADMIN_EMAIL = 'sp@kamglobalai.com';
    const SUPERADMIN_PASSWORD = 'P@ssw0rd123';
    if (cleanEmail === SUPERADMIN_EMAIL || cleanEmail === 'superadmin') {
      if (password !== SUPERADMIN_PASSWORD) {
        return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
      }
      const hashed = await bcrypt.hash(SUPERADMIN_PASSWORD, 10);
      await db.admin.upsert({
        where: { email: SUPERADMIN_EMAIL },
        update: { password: hashed, isSuperAdmin: true, name: 'Platform SuperAdmin', role: 'superadmin' },
        create: {
          email: SUPERADMIN_EMAIL,
          password: hashed,
          isSuperAdmin: true,
          name: 'Platform SuperAdmin',
          role: 'superadmin',
        },
      }).catch(() => null);
      return createLoginResponse({
        id: 'superadmin-owner',
        name: 'Platform SuperAdmin',
        email: SUPERADMIN_EMAIL,
        role: 'superadmin',
        schoolName: 'Application Owner Console',
      });
    }

    // ── Takshila School dummy tenant (1-click Admin / Teacher) ──
    const takshilaSchool = await db.school.findFirst({
      where: {
        OR: [
          { code: 'TAKSHILA2025' },
          { email: 'admin@takshilaschool.edu' },
        ],
      },
    }).catch(() => null);

    if (takshilaSchool) {
      const isTakshilaAdmin =
        cleanEmail === 'admin@takshilaschool.edu' ||
        cleanEmail === takshilaSchool.email.toLowerCase() ||
        email.toUpperCase() === 'TAKSHILA2025';

      if (isTakshilaAdmin) {
        return createLoginResponse({
          id: takshilaSchool.id,
          name: takshilaSchool.contactName || 'Takshila School Principal',
          email: takshilaSchool.email,
          role: 'admin',
          schoolId: takshilaSchool.id,
          schoolCode: takshilaSchool.code,
          schoolName: takshilaSchool.name,
        });
      }

      const DEMO_TEACHER_EMAIL = 'afreen.deshmukh@takshilaschool.edu';
      if (cleanEmail === DEMO_TEACHER_EMAIL) {
        const takshilaTeacher = await db.teacher.findFirst({
          where: { schoolId: takshilaSchool.id, email: DEMO_TEACHER_EMAIL },
        }).catch(() => null);

        if (takshilaTeacher) {
          return createLoginResponse({
            id: takshilaTeacher.id,
            name: takshilaTeacher.name,
            email: takshilaTeacher.email,
            role: 'teacher',
            schoolId: takshilaSchool.id,
            schoolCode: takshilaSchool.code,
            schoolName: takshilaSchool.name,
            subject: takshilaTeacher.subject,
            grades: takshilaTeacher.grades,
            phone: takshilaTeacher.phone,
          });
        }
      }
    }

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

    // ── 1b. Tenant workspace members (role-based logins) ──
    try {
      const member = await db.workspaceMember.findFirst({
        where: { email: cleanEmail, status: 'active' },
        include: { school: true },
      });
      if (member) {
        const ok = await verifyPassword(password, member.password, async (newHash) => {
          await db.workspaceMember.update({ where: { id: member.id }, data: { password: newHash } }).catch(() => null);
        });
        if (ok) {
          if (member.school?.status === 'suspended') {
            return NextResponse.json({ error: 'This school workspace is suspended.' }, { status: 403 });
          }
          let modules: string[] = [];
          try { modules = JSON.parse(member.modules || '[]'); } catch { modules = []; }
          const mappedRole = ['teacher'].includes(member.role) ? 'teacher' : 'admin';
          return createLoginResponse({
            id: member.id,
            name: member.name,
            email: member.email,
            role: mappedRole,
            schoolId: member.schoolId,
            schoolCode: member.school?.code,
            schoolName: member.school?.name,
            modules,
            memberRole: member.role,
          });
        }
      }
    } catch (e) {
      console.error('Error querying workspace member during login:', e);
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

    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'Authentication service error.' }, { status: 500 });
  }
}
