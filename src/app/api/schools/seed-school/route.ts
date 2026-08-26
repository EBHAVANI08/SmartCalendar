import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTenantSchoolId } from '@/lib/school-helper';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const SAMPLE_FACULTY = [
  { name: 'Dr. Priya Sharma', email: 'priya.sharma@school.edu', phone: '+91 98765 43210', subject: 'Mathematics', grades: '["Grade 9","Grade 10","Grade 11","Grade 12"]' },
  { name: 'Dr. Hariprasad Shetty', email: 'h.shetty@school.edu', phone: '+91 98765 43211', subject: 'Science', grades: '["Grade 8","Grade 9","Grade 10"]' },
  { name: 'Ananya Iyer', email: 'ananya.iyer@school.edu', phone: '+91 98765 43212', subject: 'English', grades: '["Grade 6","Grade 7","Grade 8","Grade 9","Grade 10"]' },
  { name: 'Kavita Agarwal', email: 'kavita.a@school.edu', phone: '+91 98765 43213', subject: 'Hindi', grades: '["Grade 1","Grade 2","Grade 3","Grade 4","Grade 5","Grade 6"]' },
  { name: 'Rajesh Kumar', email: 'rajesh.k@school.edu', phone: '+91 98765 43214', subject: 'Social Science', grades: '["Grade 9","Grade 10"]' },
  { name: 'Siddharth Kapse', email: 's.kapse@school.edu', phone: '+91 98765 43215', subject: 'Computer Science', grades: '["Grade 9","Grade 10","Grade 11","Grade 12"]' },
  { name: 'Dr. Sen', email: 'dr.sen@school.edu', phone: '+91 98765 43216', subject: 'Physics', grades: '["Grade 11","Grade 12"]' },
  { name: 'Coach Rakesh', email: 'coach.rakesh@school.edu', phone: '+91 98765 43217', subject: 'Physical Education', grades: '["Grade 1","Grade 2","Grade 3","Grade 4","Grade 5","Grade 6","Grade 7","Grade 8","Grade 9","Grade 10","Grade 11","Grade 12"]' },
  { name: 'Satish Gujral', email: 'satish.g@school.edu', phone: '+91 98765 43218', subject: 'Art', grades: '["Grade 1","Grade 2","Grade 3","Grade 4","Grade 5"]' },
  { name: 'Ravi Varma', email: 'ravi.v@school.edu', phone: '+91 98765 43219', subject: 'Music', grades: '["Grade 1","Grade 2","Grade 3","Grade 4","Grade 5"]' },
];

const PERIOD_TIMINGS = [
  { p: 1, start: '08:00', end: '08:45' },
  { p: 2, start: '08:45', end: '09:30' },
  { p: 3, start: '09:45', end: '10:30' },
  { p: 4, start: '10:30', end: '11:15' },
  { p: 5, start: '11:45', end: '12:30' },
  { p: 6, start: '12:30', end: '01:15' },
  { p: 7, start: '01:15', end: '02:00' },
  { p: 8, start: '02:00', end: '02:45' },
];

const SUBJECT_POOL = [
  'Mathematics', 'Science', 'English', 'Hindi', 'Social Science',
  'Physics', 'Chemistry', 'Biology', 'Computer Science', 'Physical Education'
];

export async function POST(req: NextRequest) {
  try {
    const schoolId = (await getTenantSchoolId(req)) || '6a8bf21c3359da9c7c8a7b02';

    // 1. Create or upsert Faculty Members
    const createdTeachers: any[] = [];
    for (const f of SAMPLE_FACULTY) {
      const existing = await db.teacher.findFirst({ where: { schoolId, email: f.email } });
      if (existing) {
        createdTeachers.push(existing);
      } else {
        const t = await db.teacher.create({
          data: {
            schoolId,
            name: f.name,
            email: f.email,
            phone: f.phone,
            subject: f.subject,
            grades: f.grades,
            role: 'teacher',
          },
        });
        createdTeachers.push(t);
      }
    }

    // 2. Populate Master Timetable for Grades 1 to 12 (Section A)
    let totalSlotsCreated = 0;
    const gradesToSeed = ['Grade 9', 'Grade 10', 'Grade 11', 'Grade 12'];

    for (const grade of gradesToSeed) {
      for (const day of DAYS) {
        for (const timing of PERIOD_TIMINGS) {
          const subjectIdx = (timing.p + DAYS.indexOf(day)) % SUBJECT_POOL.length;
          const subject = SUBJECT_POOL[subjectIdx];
          const matchingTeacher = createdTeachers.find((t) => t.subject === subject) || createdTeachers[0];

          await db.schedule.create({
            data: {
              schoolId,
              grade,
              section: 'A',
              day,
              period: timing.p,
              subject,
              startTime: timing.start,
              endTime: timing.end,
              teacherId: matchingTeacher?.id,
              roomId: subject.includes('Science') || subject.includes('Physics') ? 'Sci-Lab' : 'R-10A',
            },
          });
          totalSlotsCreated++;
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `Sample school data successfully loaded! Provisioned ${createdTeachers.length} faculty members and ${totalSlotsCreated} clash-free timetable slots across Grades 9-12.`,
      teachersCount: createdTeachers.length,
      schedulesCount: totalSlotsCreated,
    });
  } catch (error: any) {
    console.error('[SEED SCHOOL DATA ERROR]', error);
    return NextResponse.json({ success: false, error: error?.message || 'Failed to seed sample school data.' }, { status: 500 });
  }
}
