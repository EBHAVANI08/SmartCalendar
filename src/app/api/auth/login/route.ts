import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  let credentials: { email?: string; password?: string; role?: string } = {};
  try {
    credentials = await request.json();
    const { email, password, role } = credentials;

    if (!email || !password || !role) {
      return NextResponse.json({ error: 'Email, password, and role are required' }, { status: 400 });
    }

    if (role === 'school' || role === 'admin') {
      const school = await db.school.findUnique({ where: { email } });
      if (school && school.password === password) {
        return NextResponse.json({
          success: true,
          user: {
            id: school.id,
            name: school.name,
            email: school.email,
            role: 'school',
            schoolId: school.id,
            schoolCode: school.code
          },
        });
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
    const demoSchools: Record<string, { id: string; name: string; code: string }> = {
      'admin@demo1.edu': { id: 'sch_demo1_001', name: 'Demo 1 School', code: 'DEMO1' },
      'info@dpsdelhi.edu': { id: 'sch_dps_001', name: 'Delhi Public School', code: 'DPS2025' },
    };
    const demo = credentials.email ? demoSchools[credentials.email.toLowerCase()] : undefined;
    if (process.env.NODE_ENV === 'development' && demo && credentials.password === 'school123' && credentials.role === 'school') {
      return NextResponse.json({ success: true, offlineDemo: true, warning: 'Database is temporarily unavailable. Demo workspace opened with cached identity; database actions will resume after reconnection.', user: { id: demo.id, name: demo.name, email: credentials.email, role: 'school', schoolId: demo.id, schoolCode: demo.code } });
    }
    const databaseUnavailable = /Can't reach database server|PrismaClientInitializationError/i.test(String(error));
    return NextResponse.json({ error: databaseUnavailable ? 'Database is temporarily unavailable. Check the DATABASE_URL/Neon connection and try again.' : 'Login failed' }, { status: databaseUnavailable ? 503 : 500 });
  }
}
