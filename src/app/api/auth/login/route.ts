import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { email, password, role } = await request.json();

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
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}
