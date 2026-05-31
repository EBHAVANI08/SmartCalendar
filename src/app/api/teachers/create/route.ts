import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, email, phone, subject, grades, password, role } = body;

    // Validate required fields
    if (!name || typeof name !== 'string' || name.trim() === '') {
      return NextResponse.json({ error: 'name is required and must be a non-empty string' }, { status: 400 });
    }

    if (!email || typeof email !== 'string' || email.trim() === '') {
      return NextResponse.json({ error: 'email is required and must be a non-empty string' }, { status: 400 });
    }

    if (!subject || typeof subject !== 'string' || subject.trim() === '') {
      return NextResponse.json({ error: 'subject is required and must be a non-empty string' }, { status: 400 });
    }

    if (!grades || !Array.isArray(grades) || grades.length === 0) {
      return NextResponse.json(
        { error: 'grades is required and must be a non-empty array of strings (e.g., ["Grade 1", "Grade 2"])' },
        { status: 400 }
      );
    }

    // Validate that all grades are strings
    for (const g of grades) {
      if (typeof g !== 'string' || g.trim() === '') {
        return NextResponse.json(
          { error: 'Each grade must be a non-empty string' },
          { status: 400 }
        );
      }
    }

    // Check for duplicate email
    const existingTeacher = await db.teacher.findUnique({
      where: { email: email.trim().toLowerCase() },
    });

    if (existingTeacher) {
      return NextResponse.json(
        { error: `A teacher with email "${email.trim().toLowerCase()}" already exists`, existingTeacherId: existingTeacher.id },
        { status: 409 }
      );
    }

    // Create the teacher
    const teacher = await db.teacher.create({
      data: {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone || null,
        subject: subject.trim(),
        grades: JSON.stringify(grades),
        password: password || 'teacher123',
        role: role || 'teacher',
        availability: '[]',
      },
    });

    return NextResponse.json({
      success: true,
      teacher: {
        id: teacher.id,
        name: teacher.name,
        email: teacher.email,
        phone: teacher.phone,
        subject: teacher.subject,
        grades: JSON.parse(teacher.grades),
        role: teacher.role,
        createdAt: teacher.createdAt,
      },
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating teacher:', error);
    return NextResponse.json({ error: 'Failed to create teacher: ' + String(error) }, { status: 500 });
  }
}
