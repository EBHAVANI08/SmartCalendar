import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';

const schema = z.object({
  name: z.string().trim().min(3).max(120),
  code: z.string().trim().min(2).max(20).regex(/^[A-Za-z0-9_-]+$/),
  email: z.string().trim().email(),
  password: z.string().min(8).max(72),
});

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: 'Enter a valid school name, code, email and password of at least 8 characters.', details: parsed.error.flatten() }, { status: 400 });
    const input = parsed.data; const email = input.email.toLowerCase(); const code = input.code.toUpperCase();
    const duplicate = await db.school.findFirst({ where: { OR: [{ email }, { code }] }, select: { email: true, code: true } });
    if (duplicate) return NextResponse.json({ error: duplicate.email === email ? 'A school account already exists with this email.' : 'This school code is already in use.' }, { status: 409 });
    const hashedPassword = await bcrypt.hash(input.password, 10);
    const school = await db.school.create({ data: { name: input.name, code, email, password: hashedPassword } });
    return NextResponse.json({ success: true, user: { id: school.id, name: school.name, email: school.email, role: 'school', schoolId: school.id, schoolCode: school.code } }, { status: 201 });
  } catch (error) {
    console.error('School registration failed:', error);
    return NextResponse.json({ error: 'School account could not be created. Please try again.' }, { status: 500 });
  }
}
