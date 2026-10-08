export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { db } from '@/lib/db';
import { signJwt } from '@/lib/jwt-auth';
import { NextResponse } from 'next/server';
import { hashPassword, verifyPassword } from '@/lib/password';
import { SCHOOL_PUBLIC_SELECT } from '@/lib/safe-fields';

async function createLoginResponse(user: any) {
  user = { ...user, mustChangePassword: Boolean(user.mustChangePassword) };
  try {
    const token = await signJwt({
      userId: user.id,
      email: user.email,
      role: user.role,
      schoolId: user.schoolId || null,
      schoolCode: user.schoolCode || null,
      name: user.name,
      ownerRole: user.ownerRole || null,
      modules: Array.isArray(user.modules) ? JSON.stringify(user.modules) : (user.modules || null),
      accountType: user.accountType,
      // A limited session: middleware lets it reach only the change-password screen.
      ...(user.mustChangePassword ? { mustChangePassword: true } : {}),
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
  } catch (err: any) {
    console.error('createLoginResponse error:', err);
    return NextResponse.json({ error: 'Failed to generate authentication session' }, { status: 500 });
  }
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
          return await createLoginResponse({
            id: employee.id,
            name: employee.name,
            email: employee.email,
            role: 'superadmin',
            ownerRole: employee.role,
            modules,
            isDemo: employee.isDemo,
            schoolName: 'Application Owner Console',
            accountType: 'ownerEmployee',
            mustChangePassword: employee.mustChangePassword,
          });
        }
      }
    } catch (e) {
      console.error('Error querying owner employee during login:', e);
    }

    // ── Platform SuperAdmin (owner console) ──
    // Credentials come from the environment. When unset this branch is skipped
    // entirely and the owner authenticates through the Admin table below, so
    // there is no owner credential in source.
    const SUPERADMIN_EMAIL = (process.env.SUPERADMIN_EMAIL || '').trim().toLowerCase();
    const SUPERADMIN_PASSWORD = process.env.SUPERADMIN_PASSWORD || '';
    if (
      SUPERADMIN_EMAIL &&
      SUPERADMIN_PASSWORD &&
      (cleanEmail === SUPERADMIN_EMAIL || cleanEmail === 'superadmin')
    ) {
      if (password !== SUPERADMIN_PASSWORD) {
        return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
      }
      const hashed = await hashPassword(SUPERADMIN_PASSWORD);
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
      return await createLoginResponse({
        id: 'superadmin-owner',
        name: 'Platform SuperAdmin',
        email: SUPERADMIN_EMAIL,
        role: 'superadmin',
        schoolName: 'Application Owner Console',
      });
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
          return await createLoginResponse({
            id: school.id,
            name: school.name,
            email: school.email,
            role: 'school',
            schoolId: school.id,
            schoolCode: school.code,
            schoolName: school.name,
            accountType: 'school',
            mustChangePassword: school.mustChangePassword,
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
        include: { school: { select: SCHOOL_PUBLIC_SELECT } },
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
          return await createLoginResponse({
            id: member.id,
            name: member.name,
            email: member.email,
            role: mappedRole,
            schoolId: member.schoolId,
            schoolCode: member.school?.code,
            schoolName: member.school?.name,
            modules,
            memberRole: member.role,
            accountType: 'member',
            mustChangePassword: member.mustChangePassword,
          });
        }
      }
    } catch (e) {
      console.error('Error querying workspace member during login:', e);
    }

    // ── 2. Check Teacher Faculty Database ──
    // Email is unique per school, not globally. Every teacher with this email
    // is checked; the first match is never assumed to be the right school.
    try {
      const requestedSchoolCode = String(body?.schoolCode || '').trim().toUpperCase();
      const candidates = await db.teacher.findMany({
        where: {
          OR: [{ email: cleanEmail }, { email }],
          ...(requestedSchoolCode ? { school: { code: requestedSchoolCode } } : {}),
        },
        include: { school: { select: SCHOOL_PUBLIC_SELECT } },
      });

      const verified: typeof candidates = [];
      for (const candidate of candidates) {
        const ok = await verifyPassword(password, candidate.password, async (newHash) => {
          await db.teacher.update({ where: { id: candidate.id }, data: { password: newHash } }).catch(() => null);
        });
        if (ok) verified.push(candidate);
      }

      if (verified.length > 1) {
        // Only schools where this password already verified are listed, so
        // nothing about other schools is disclosed.
        return NextResponse.json(
          {
            error: 'This email is registered at more than one school. Choose your school to continue.',
            code: 'SCHOOL_REQUIRED',
            schools: verified.map((item) => ({ code: item.school?.code || '', name: item.school?.name || 'School' })),
          },
          { status: 409 }
        );
      }

      const teacher = verified[0];
      if (teacher) {
        return await createLoginResponse({
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
          accountType: 'teacher',
          mustChangePassword: teacher.mustChangePassword,
        });
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
          let schoolId: string | undefined = undefined;
          let schoolCode: string | undefined = undefined;
          let schoolName: string | undefined = undefined;

          if (!admin.isSuperAdmin) {
            const matchedSchool = await db.school.findFirst({
              where: {
                OR: [
                  { email: cleanEmail },
                  { email: email },
                  { contactName: admin.name },
                  { name: admin.name },
                ],
              },
            });
            if (matchedSchool) {
              schoolId = matchedSchool.id;
              schoolCode = matchedSchool.code;
              schoolName = matchedSchool.name;
            }
          }

          return await createLoginResponse({
            id: admin.id,
            name: admin.name,
            email: admin.email,
            role: admin.isSuperAdmin ? 'superadmin' : 'admin',
            schoolId,
            schoolCode,
            schoolName,
            accountType: 'admin',
            mustChangePassword: admin.mustChangePassword,
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
