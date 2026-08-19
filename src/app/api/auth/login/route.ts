import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

const PILOT_SCHOOL_LOGIN = {
  email: 'pilot@client.school',
  password: 'ClientPilot2026',
  schoolId: 'sch_client_pilot_001',
  displayName: 'Client Pilot School',
  displayCode: 'PILOT01',
} as const;

const DEMO_SCHOOLS: Record<string, { id: string; name: string; code: string; password: string }> = {
  'admin@demo1.edu': { id: 'sch_demo1_001', name: 'Demo 1 School', code: 'DEMO1', password: 'school123' },
  'info@dpsdelhi.edu': { id: 'sch_dps_001', name: 'Delhi Public School', code: 'DPS2025', password: 'school123' },
  [PILOT_SCHOOL_LOGIN.email]: {
    id: PILOT_SCHOOL_LOGIN.schoolId,
    name: PILOT_SCHOOL_LOGIN.displayName,
    code: PILOT_SCHOOL_LOGIN.displayCode,
    password: PILOT_SCHOOL_LOGIN.password,
  },
};

async function attachOrphanSchoolData(schoolId: string) {
  await Promise.all([
    db.schedule.updateMany({ where: { schoolId: null }, data: { schoolId } }),
    db.teacher.updateMany({ where: { schoolId: null }, data: { schoolId } }),
  ]);
}

async function ensureKnownSchool(
  profile: { id: string; name: string; code: string; email: string; password: string },
) {
  const existing = await db.school.findUnique({ where: { id: profile.id } });
  if (existing) {
    return db.school.update({
      where: { id: profile.id },
      data: {
        name: profile.name,
        code: profile.code,
        email: profile.email,
        password: profile.password,
      },
    });
  }

  const emailTaken = await db.school.findUnique({ where: { email: profile.email } });
  if (emailTaken) return emailTaken;

  return db.school.create({
    data: {
      id: profile.id,
      name: profile.name,
      code: profile.code,
      email: profile.email,
      password: profile.password,
    },
  });
}

function schoolLoginResponse(
  school: { id: string; name: string; code: string; email: string },
  overrides?: { name?: string; email?: string; code?: string },
) {
  return NextResponse.json({
    success: true,
    user: {
      id: school.id,
      name: overrides?.name ?? school.name,
      email: overrides?.email ?? school.email,
      role: 'school',
      schoolId: school.id,
      schoolCode: overrides?.code ?? school.code,
    },
  });
}

export async function POST(request: Request) {
  let credentials: { email?: string; password?: string; role?: string } = {};
  try {
    credentials = await request.json();
    const email = credentials.email?.trim().toLowerCase();
    const password = credentials.password;
    const role = credentials.role;

    if (!email || !password || !role) {
      return NextResponse.json({ error: 'Email, password, and role are required' }, { status: 400 });
    }

    if (role === 'superadmin') {
      const admin = await db.admin.findUnique({ where: { email } });
      if (!admin || admin.password !== password || !admin.isSuperAdmin) {
        return NextResponse.json({ error: 'Invalid credentials or insufficient privileges' }, { status: 401 });
      }
      return NextResponse.json({
        success: true,
        user: { id: admin.id, name: admin.name, email: admin.email, role: 'superadmin', isSuperAdmin: true },
      });
    }

    if (role === 'school' || role === 'admin') {
      const knownDemo = DEMO_SCHOOLS[email];
      if (knownDemo && password === knownDemo.password) {
        const school = await ensureKnownSchool({
          id: knownDemo.id,
          name: knownDemo.name,
          code: knownDemo.code,
          email,
          password: knownDemo.password,
        });
        await attachOrphanSchoolData(school.id);
        return schoolLoginResponse(
          school,
          email === PILOT_SCHOOL_LOGIN.email
            ? {
                name: PILOT_SCHOOL_LOGIN.displayName,
                email: PILOT_SCHOOL_LOGIN.email,
                code: PILOT_SCHOOL_LOGIN.displayCode,
              }
            : undefined,
        );
      }

      const school = await db.school.findUnique({ where: { email } });
      if (school && school.password === password) {
        await attachOrphanSchoolData(school.id);
        return schoolLoginResponse(school);
      }

      if (role === 'admin') {
        const admin = await db.admin.findUnique({ where: { email } });
        if (!admin || admin.password !== password) {
          return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
        }
        return NextResponse.json({
          success: true,
          user: { id: admin.id, name: admin.name, email: admin.email, role: 'admin' },
        });
      }

      if (role === 'school') {
        return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
      }
    }

    if (role === 'teacher') {
      const teacher = await db.teacher.findUnique({
        where: { email },
        include: { schedules: true, school: true },
      });
      if (!teacher || teacher.password !== password) {
        return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
      }
      return NextResponse.json({
        success: true,
        user: {
          id: teacher.id,
          name: teacher.name,
          email: teacher.email,
          role: 'teacher',
          schoolId: teacher.schoolId,
          schoolName: teacher.school?.name,
          subject: teacher.subject,
          grades: teacher.grades,
          phone: teacher.phone,
        },
      });
    }

    return NextResponse.json({ error: 'Invalid role. Must be "admin", "school", or "teacher"' }, { status: 400 });
  } catch (error) {
    console.error('Login error:', error);
    const email = credentials.email?.trim().toLowerCase();
    const demo = email ? DEMO_SCHOOLS[email] : undefined;
    if (demo && credentials.password === demo.password && credentials.role === 'school') {
      return NextResponse.json({
        success: true,
        offlineDemo: true,
        warning: 'Database is temporarily unavailable. Demo workspace opened with cached identity; database actions will resume after reconnection.',
        user: {
          id: demo.id,
          name: demo.name,
          email: credentials.email,
          role: 'school',
          schoolId: demo.id,
          schoolCode: demo.code,
        },
      });
    }
    const databaseUnavailable = /Can't reach database server|PrismaClientInitializationError/i.test(String(error));
    return NextResponse.json({ error: databaseUnavailable ? 'Database is temporarily unavailable. Check the DATABASE_URL/Neon connection and try again.' : 'Login failed' }, { status: databaseUnavailable ? 503 : 500 });
  }
}
