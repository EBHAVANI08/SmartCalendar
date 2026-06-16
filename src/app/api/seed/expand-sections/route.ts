import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { DAYS, TIME_SLOTS, SUBJECTS_BY_GRADE, TOPICS_BY_SUBJECT } from '@/lib/seed-constants';

/**
 * POST /api/seed/expand-sections
 * Additive-only: fills in sections F-J (the UI supports up to J, but the
 * original seed only populated A-E) with schedules + students.
 * Does not delete or modify any existing teachers, students, or schedules.
 * Safe to re-run: skips any grade/section that already has data.
 */
export async function POST() {
  try {
    const NEW_SECTIONS = ['F', 'G', 'H', 'I', 'J'];
    const MAX_PERIODS_PER_DAY = 6;
    const STUDENTS_PER_SECTION = 10;

    const teachers = await db.teacher.findMany();
    if (teachers.length === 0) {
      return NextResponse.json({ error: 'No teachers found. Run /api/seed first.' }, { status: 400 });
    }

    const teacherDataMap = new Map<string, { subject: string; grades: string[] }>();
    for (const t of teachers) {
      teacherDataMap.set(t.id, { subject: t.subject, grades: JSON.parse(t.grades || '[]') as string[] });
    }

    // Load ALL existing schedules (not just F-J) so new assignments don't
    // double-book a teacher already busy in sections A-E.
    const existingSchedules = await db.schedule.findMany({
      select: { teacherId: true, day: true, period: true, grade: true, section: true },
    });

    const teacherAssignments: Map<string, Set<string>> = new Map();
    for (const t of teachers) teacherAssignments.set(t.id, new Set());
    for (const s of existingSchedules) {
      if (s.teacherId) teacherAssignments.get(s.teacherId)?.add(`${s.day}-${s.period}`);
    }

    const isTeacherBusy = (teacherId: string, day: string, period: number): boolean =>
      teacherAssignments.get(teacherId)?.has(`${day}-${period}`) || false;

    const markTeacherBusy = (teacherId: string, day: string, period: number) => {
      teacherAssignments.get(teacherId)?.add(`${day}-${period}`);
    };

    const getTeacherDayCount = (teacherId: string, day: string): number => {
      const assignments = teacherAssignments.get(teacherId);
      if (!assignments) return 0;
      let count = 0;
      for (const key of assignments) if (key.startsWith(`${day}-`)) count++;
      return count;
    };

    // Skip any grade/section that already has schedules (idempotent re-run)
    const existingGradeSections = new Set(existingSchedules.map(s => `${s.grade}|${s.section}`));

    const scheduleDataList: { grade: string; section: string; day: string; period: number; subject: string; teacherId: string | null; topic: string | null; startTime: string; endTime: string; roomId: string }[] = [];

    for (let g = 1; g <= 12; g++) {
      const gradeName = `Grade ${g}`;
      const subjects = SUBJECTS_BY_GRADE[gradeName] || SUBJECTS_BY_GRADE['Grade 1'];

      for (const section of NEW_SECTIONS) {
        if (existingGradeSections.has(`${gradeName}|${section}`)) continue; // already filled, skip

        for (const day of DAYS) {
          for (const timeSlot of TIME_SLOTS) {
            const subjectIndex = (timeSlot.period - 1) % subjects.length;
            const subject = subjects[subjectIndex];
            const topicList = TOPICS_BY_SUBJECT[subject] || ['General Topic'];
            const topic = topicList[(timeSlot.period - 1 + DAYS.indexOf(day)) % topicList.length];

            const isEmpty = Math.random() < 0.08;
            let teacherId: string | null = null;

            if (!isEmpty) {
              const eligibleTeachers = teachers.filter((t) => {
                const data = teacherDataMap.get(t.id);
                return data && data.subject === subject && data.grades.includes(gradeName);
              });

              const sortedEligible = [...eligibleTeachers].sort((a, b) => {
                const aDayCount = getTeacherDayCount(a.id, day);
                const bDayCount = getTeacherDayCount(b.id, day);
                if (aDayCount !== bDayCount) return aDayCount - bDayCount;
                return (teacherAssignments.get(a.id)?.size || 0) - (teacherAssignments.get(b.id)?.size || 0);
              });

              for (const t of sortedEligible) {
                if (!isTeacherBusy(t.id, day, timeSlot.period) && getTeacherDayCount(t.id, day) < MAX_PERIODS_PER_DAY) {
                  teacherId = t.id;
                  markTeacherBusy(t.id, day, timeSlot.period);
                  break;
                }
              }

              if (!teacherId) {
                const subjectTeachers = teachers.filter((t) => teacherDataMap.get(t.id)?.subject === subject);
                const sortedSubject = [...subjectTeachers].sort((a, b) => {
                  const aDayCount = getTeacherDayCount(a.id, day);
                  const bDayCount = getTeacherDayCount(b.id, day);
                  if (aDayCount !== bDayCount) return aDayCount - bDayCount;
                  return (teacherAssignments.get(a.id)?.size || 0) - (teacherAssignments.get(b.id)?.size || 0);
                });
                for (const t of sortedSubject) {
                  if (!isTeacherBusy(t.id, day, timeSlot.period) && getTeacherDayCount(t.id, day) < MAX_PERIODS_PER_DAY) {
                    teacherId = t.id;
                    markTeacherBusy(t.id, day, timeSlot.period);
                    break;
                  }
                }
              }
            }

            scheduleDataList.push({
              grade: gradeName,
              section,
              day,
              period: timeSlot.period,
              subject,
              teacherId,
              topic: topic || null,
              startTime: timeSlot.start,
              endTime: timeSlot.end,
              roomId: `R-${g}${section}-${timeSlot.period}`,
            });
          }
        }
      }
    }

    for (let i = 0; i < scheduleDataList.length; i += 100) {
      const chunk = scheduleDataList.slice(i, i + 100);
      await db.$transaction(chunk.map((s) => db.schedule.create({ data: s })));
    }

    // Students for new sections - skip grade/section combos that already have students
    const existingStudents = await db.student.findMany({ select: { grade: true, section: true } });
    const existingStudentGradeSections = new Set(existingStudents.map(s => `${s.grade}|${s.section}`));

    const firstNames = ['Aarav', 'Vivaan', 'Aditya', 'Vihaan', 'Arjun', 'Sai', 'Reyansh', 'Krishna', 'Ishaan', 'Shaurya', 'Ananya', 'Diya', 'Myra', 'Sara', 'Aadhya', 'Ishita', 'Saavi', 'Kiara', 'Riya', 'Priya', 'Rohan', 'Aryan', 'Kabir', 'Rahul', 'Amit', 'Sumit', 'Nikhil', 'Varun', 'Dhruv', 'Harsh', 'Pooja', 'Neha', 'Simran', 'Kavya', 'Meera', 'Shreya', 'Tanya', 'Nisha', 'Divya', 'Pallavi', 'Arun', 'Raj', 'Manish', 'Gaurav', 'Deepak', 'Ashok', 'Suresh', 'Vijay', 'Pradeep', 'Mohan'];
    const lastNames = ['Sharma', 'Kumar', 'Gupta', 'Patel', 'Singh', 'Reddy', 'Nair', 'Joshi', 'Iyer', 'Agarwal', 'Verma', 'Rao', 'Chopra', 'Malhotra', 'Bhatia', 'Chadha', 'Mehta', 'Shah', 'Das', 'Mukherjee', 'Banerjee', 'Chatterjee', 'Bhattacharya', 'Ghosh', 'Pillai', 'Menon', 'Nambiar', 'Subramanian', 'Krishnan', 'Venkatesh'];

    const studentDataList: { name: string; grade: string; section: string; rollNo: number }[] = [];
    let nameCounter = 0;

    for (let g = 1; g <= 12; g++) {
      const gradeName = `Grade ${g}`;
      for (const section of NEW_SECTIONS) {
        if (existingStudentGradeSections.has(`${gradeName}|${section}`)) continue;
        for (let r = 1; r <= STUDENTS_PER_SECTION; r++) {
          const fn = firstNames[nameCounter % firstNames.length];
          const ln = lastNames[nameCounter % lastNames.length];
          studentDataList.push({ name: `${fn} ${ln}`, grade: gradeName, section, rollNo: r });
          nameCounter++;
        }
      }
    }

    for (let i = 0; i < studentDataList.length; i += 100) {
      const chunk = studentDataList.slice(i, i + 100);
      await db.$transaction(chunk.map((s) => db.student.create({ data: s })));
    }

    const totalTeachers = teachers.length;
    const totalSchedules = await db.schedule.count();
    const totalStudents = await db.student.count();

    return NextResponse.json({
      success: true,
      message: 'Sections F-J expanded successfully (existing data untouched)',
      added: {
        schedules: scheduleDataList.length,
        students: studentDataList.length,
      },
      totals: {
        teachers: totalTeachers,
        schedules: totalSchedules,
        students: totalStudents,
      },
    });
  } catch (error) {
    console.error('Error expanding sections:', error);
    return NextResponse.json({ error: 'Failed to expand sections', details: String(error) }, { status: 500 });
  }
}
