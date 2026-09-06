import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTenantSchoolId } from '@/lib/school-helper';
import {
  ClashTracker,
  buildPeriodTimings,
  periodsForDay,
  workingDayNames,
  type DayPeriodConfig,
} from '@/lib/timetable-constraints';
import { requireCapability } from '@/lib/authz';

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

const SUBJECT_POOL = [
  'Mathematics', 'Science', 'English', 'Hindi', 'Social Science',
  'Physics', 'Chemistry', 'Biology', 'Computer Science', 'Physical Education'
];

export async function POST(req: NextRequest) {
  const denied = requireCapability(req, 'owner.console');
  if (denied) return denied;

  try {
    const schoolId = await getTenantSchoolId(req);
    if (!schoolId) {
      return NextResponse.json(
        { success: false, error: 'No school context. Please sign in again.' },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const setup = body?.setup ?? body ?? {};

    // This route loads *sample* faculty and timetable data. Running it against
    // a school that already has real records mixes demo names into live data,
    // which is how sample teachers ended up in a production tenant. Require an
    // explicit confirm to seed a non-empty school.
    const [existingTeachers, existingSchedules] = await Promise.all([
      db.teacher.count({ where: { schoolId } }),
      db.schedule.count({ where: { schoolId } }),
    ]);
    if ((existingTeachers > 0 || existingSchedules > 0) && body?.confirmOverwriteExisting !== true) {
      return NextResponse.json(
        {
          success: false,
          error: `This school already has ${existingTeachers} faculty member(s) and ${existingSchedules} timetable row(s). Loading sample data would mix demo records into real data.`,
          code: 'SCHOOL_NOT_EMPTY',
          existingTeachers,
          existingSchedules,
          hint: 'Re-send with confirmOverwriteExisting: true if you really want sample data added to this school.',
        },
        { status: 409 }
      );
    }

    // Day/period shape is configurable; it is never assumed uniform across the
    // week. Saturday in particular is usually shorter than a weekday.
    const config: DayPeriodConfig = {
      workingDays: Number(setup.workingDays) === 5 ? 5 : 6,
      periodsPerDay: Number(setup.periodsPerDay) || 8,
      saturdayPeriods: setup.saturdayPeriods !== undefined ? Number(setup.saturdayPeriods) : 4,
      perDayPeriods: setup.perDayPeriods,
    };
    const timingsByCount = new Map<number, ReturnType<typeof buildPeriodTimings>>();
    const timingsFor = (periods: number) => {
      if (!timingsByCount.has(periods)) {
        timingsByCount.set(
          periods,
          buildPeriodTimings({
            periods,
            startTime: setup.startTime || '08:00',
            endTime: setup.endTime || '15:00',
            breakAfter: Number(setup.breakAfter) || 2,
            breakMinutes: Number(setup.breakMinutes) || 15,
            lunchAfter: Number(setup.lunchAfter) || 4,
            lunchMinutes: Number(setup.lunchMinutes) || 30,
          })
        );
      }
      return timingsByCount.get(periods)!;
    };

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

    // 2. Populate Master Timetable for the seeded grades (Section A)
    let totalSlotsCreated = 0;
    let skippedForClash = 0;
    const gradesToSeed = ['Grade 9', 'Grade 10', 'Grade 11', 'Grade 12'];
    const days = workingDayNames(config);

    // A teacher can only be in one place at a time. Previously this route picked
    // the same subject teacher for every grade, so identical periods across
    // Grades 9-12 all resolved to one person — the assignments it described as
    // "clash-free" were in fact colliding. Seed existing rows too, so we do not
    // collide with timetables that are already in place.
    const tracker = new ClashTracker();
    await tracker.loadExisting(schoolId);

    for (const grade of gradesToSeed) {
      for (const day of days) {
        const periodsToday = periodsForDay(day, config);
        const timings = timingsFor(periodsToday);

        for (const timing of timings) {
          const subjectIdx = (timing.period + days.indexOf(day)) % SUBJECT_POOL.length;
          const subject = SUBJECT_POOL[subjectIdx];

          if (tracker.isClassBusy(grade, 'A', day, timing.period)) continue;

          // Prefer a subject specialist, but fall back to any free teacher
          // rather than double-booking the specialist.
          const preferred = createdTeachers.filter((t) => t.subject === subject);
          const others = createdTeachers.filter((t) => t.subject !== subject);
          const teacher =
            [...preferred, ...others].find(
              (t) => t && !tracker.isTeacherBusy(t.id, day, timing.period)
            ) || null;

          if (!teacher) {
            skippedForClash++;
            continue;
          }

          await db.schedule.create({
            data: {
              schoolId,
              grade,
              section: 'A',
              day,
              period: timing.period,
              subject,
              startTime: timing.startTime,
              endTime: timing.endTime,
              teacherId: teacher.id,
              roomId: subject.includes('Science') || subject.includes('Physics') ? 'Sci-Lab' : `R-${grade.replace('Grade ', '')}A`,
            },
          });
          tracker.reserve({ teacherId: teacher.id, grade, section: 'A', day, period: timing.period });
          totalSlotsCreated++;
        }
      }
    }

    const dayShape = days.map((day) => `${day} ${periodsForDay(day, config)}P`).join(', ');
    return NextResponse.json({
      success: true,
      message: `Sample school data loaded: ${createdTeachers.length} faculty and ${totalSlotsCreated} clash-free slots across Grades 9-12 (${dayShape}).${skippedForClash ? ` ${skippedForClash} slot(s) left unassigned — no free teacher available.` : ''}`,
      teachersCount: createdTeachers.length,
      schedulesCount: totalSlotsCreated,
      unassigned: skippedForClash,
      dayShape,
    });
  } catch (error: any) {
    console.error('[SEED SCHOOL DATA ERROR]', error);
    return NextResponse.json({ success: false, error: error?.message || 'Failed to seed sample school data.' }, { status: 500 });
  }
}
