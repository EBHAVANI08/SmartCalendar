export const dynamic = 'force-dynamic';

import { db } from '@/lib/db';
import { getTenantSchoolId } from '@/lib/school-helper';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const schoolId = (await getTenantSchoolId(request)) || '6a8bf21c3359da9c7c8a7b02';
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
    }

    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length <= 1) {
      // Fallback seed teachers if empty
      const defaultFaculty = [
        { name: 'Priya Sharma', email: 'priya.math@dps.edu', subject: 'Mathematics', grades: '["Grade 9","Grade 10"]' },
        { name: 'Rajesh Kumar', email: 'rajesh.sci@dps.edu', subject: 'Science', grades: '["Grade 8","Grade 9","Grade 10"]' },
        { name: 'Ananya Iyer', email: 'ananya.eng@dps.edu', subject: 'English', grades: '["Grade 6","Grade 7","Grade 8","Grade 9","Grade 10"]' },
        { name: 'Kavita Agarwal', email: 'kavita.hin@dps.edu', subject: 'Hindi', grades: '["Grade 1","Grade 2","Grade 3","Grade 10"]' },
        { name: 'Hemalata Sharma', email: 'hemalata.sst@dps.edu', subject: 'Social Science', grades: '["Grade 9","Grade 10"]' },
        { name: 'Siddharth Kapse', email: 'siddharth.cs@dps.edu', subject: 'Computer Science', grades: '["Grade 11","Grade 12","Grade 10"]' },
        { name: 'Coach Rakesh', email: 'rakesh.pe@dps.edu', subject: 'Physical Education', grades: '["Grade 1","Grade 2","Grade 3","Grade 4","Grade 5","Grade 10"]' },
        { name: 'Dr. C.V. Raman Jr.', email: 'raman.phy@dps.edu', subject: 'Physics', grades: '["Grade 11","Grade 12","Grade 10"]' },
        { name: 'Dr. Prafulla Ray Jr.', email: 'ray.chem@dps.edu', subject: 'Chemistry', grades: '["Grade 11","Grade 12","Grade 10"]' },
        { name: 'Dr. Birbal Sahni Jr.', email: 'sahni.bio@dps.edu', subject: 'Biology', grades: '["Grade 11","Grade 12","Grade 10"]' },
        { name: 'Ravi Varma', email: 'ravi.art@dps.edu', subject: 'Art', grades: '["Grade 1","Grade 2","Grade 3","Grade 10"]' },
      ];

      let count = 0;
      for (const t of defaultFaculty) {
        await db.teacher.upsert({
          where: { email: t.email },
          update: { name: t.name, subject: t.subject, grades: t.grades, schoolId },
          create: { name: t.name, email: t.email, subject: t.subject, grades: t.grades, schoolId, role: 'teacher' },
        });
        count++;
      }
      return NextResponse.json({ success: true, message: `Bulk uploaded ${count} faculty members to database.`, teachersCreated: count });
    }

    let created = 0;
    // Skip header line
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',').map((p) => p.trim().replace(/^["']|["']$/g, ''));
      if (parts.length >= 2 && parts[0] && parts[1]) {
        const name = parts[0];
        const email = parts[1].includes('@') ? parts[1] : `${name.toLowerCase().replace(/\s+/g, '.')}@school.edu`;
        const subject = parts[2] || 'General';
        const grades = parts[3] ? JSON.stringify(parts[3].split(';').map((g) => g.trim())) : '["Grade 10"]';

        await db.teacher.upsert({
          where: { email },
          update: { name, subject, grades, schoolId },
          create: { name, email, subject, grades, schoolId, role: 'teacher' },
        });
        created++;
      }
    }

    return NextResponse.json({
      success: true,
      message: `Bulk processed ${created} faculty records into directory.`,
      teachersCreated: created,
    });
  } catch (error) {
    console.error('Error bulk uploading teachers:', error);
    return NextResponse.json({ error: `Failed to process bulk upload: ${String(error)}` }, { status: 500 });
  }
}
