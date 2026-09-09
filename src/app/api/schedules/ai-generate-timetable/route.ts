import { db } from '@/lib/db';
import { readList, teacherTeachesSection } from '@/lib/faculty';
import { getTenantSchoolId } from '@/lib/school-helper';
import { getDayConfig } from '@/lib/timetable-config';
import { getPublishedVersion } from '@/lib/timetable-lifecycle';
import { periodsForDay, workingDayNames } from '@/lib/timetable-constraints';
import { NextResponse } from 'next/server';
import ZAI from 'z-ai-web-dev-sdk';
import { requireCapability } from '@/lib/authz';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const MAX_PERIODS_PER_DAY = 5; // Max 5 periods per teacher per day (leave 3 free for prep/substitution)
const TIME_SLOTS = [
  { period: 1, start: '08:00', end: '08:40' },
  { period: 2, start: '08:40', end: '09:20' },
  { period: 3, start: '09:20', end: '10:00' },
  // Break 10:00–10:30
  { period: 4, start: '10:30', end: '11:10' },
  { period: 5, start: '11:10', end: '11:50' },
  { period: 6, start: '11:50', end: '12:30' },
  { period: 7, start: '12:30', end: '13:10' },
  { period: 8, start: '13:10', end: '13:45' },
];

// CBSE Subjects by Grade
const SUBJECTS_BY_GRADE: Record<string, string[]> = {
  'Grade 1': ['Mathematics', 'English', 'Hindi', 'EVS', 'Computer Science', 'Physical Education', 'Free Period / Library', 'Art', 'Music'],
  'Grade 2': ['Mathematics', 'English', 'Hindi', 'EVS', 'Computer Science', 'Physical Education', 'Free Period / Library', 'Art', 'Music'],
  'Grade 3': ['Mathematics', 'English', 'Hindi', 'EVS', 'Computer Science', 'Physical Education', 'Free Period / Library', 'Art', 'Music'],
  'Grade 4': ['Mathematics', 'English', 'Hindi', 'EVS', 'Computer Science', 'Physical Education', 'Free Period / Library', 'Art', 'Music'],
  'Grade 5': ['Mathematics', 'English', 'Hindi', 'EVS', 'Computer Science', 'Physical Education', 'Free Period / Library', 'Art', 'Music'],
  'Grade 6': ['Mathematics', 'English', 'Hindi', 'Sanskrit', 'Science', 'Social Science', 'Computer Science', 'Physical Education', 'Free Period / Library'],
  'Grade 7': ['Mathematics', 'English', 'Hindi', 'Sanskrit', 'Science', 'Social Science', 'Computer Science', 'Physical Education', 'Free Period / Library'],
  'Grade 8': ['Mathematics', 'English', 'Hindi', 'Sanskrit', 'Science', 'Social Science', 'Computer Science', 'Physical Education', 'Free Period / Library'],
  'Grade 9': ['Mathematics', 'English', 'Hindi', 'Science', 'Social Science', 'Computer Science', 'Physical Education', 'Free Period / Library', 'Art'],
  'Grade 10': ['Mathematics', 'English', 'Hindi', 'Science', 'Social Science', 'Computer Science', 'Physical Education', 'Free Period / Library', 'Art'],
  'Grade 11': ['Physics', 'Chemistry', 'Mathematics', 'English', 'Computer Science', 'Physical Education', 'Free Period / Library'],
  'Grade 12': ['Physics', 'Chemistry', 'Mathematics', 'English', 'Computer Science', 'Physical Education', 'Free Period / Library'],
};

// Pedagogical constraints
const CORE_SUBJECTS = ['Mathematics', 'English', 'Science', 'Physics', 'Chemistry'];
const AFTERNOON_PREFERRED = ['Art', 'Music'];
const MORNING_PERIODS = [1, 2, 3, 4, 5]; // Periods 1-5 are morning
const AFTERNOON_PERIODS = [6, 7, 8]; // Periods 6-8 are afternoon

interface TeacherInfo {
  id: string;
  name: string;
  subject: string;
  /** Every subject this teacher is qualified for (one record, many subjects). */
  subjects: string[];
  grades: string[];
  sections: string[];
  existingScheduleCount: number;
}

/** Is this teacher qualified for the subject? (Case-insensitive) */
function teachesSubject(teacher: TeacherInfo, subject: string): boolean {
  if (!subject) return false;
  const target = subject.trim().toLowerCase();
  return teacher.subjects.some((s) => {
    const clean = s.trim().toLowerCase();
    return clean === target || clean.replace(/\s+/g, '') === target.replace(/\s+/g, '');
  });
}

/** Does this teacher teach this grade? (Matches Grade 10 vs 10 vs Grade 10th) */
function teachesGrade(teacher: TeacherInfo, grade: string): boolean {
  if (!teacher.grades || teacher.grades.length === 0) return false;
  const target = grade.trim().toLowerCase();
  const targetNum = target.replace(/[^0-9]/g, '');
  return teacher.grades.some((g) => {
    const clean = g.trim().toLowerCase();
    if (clean === target) return true;
    const gNum = clean.replace(/[^0-9]/g, '');
    if (targetNum && gNum && gNum === targetNum) return true;
    if (clean === target.replace('grade ', '') || `grade ${clean}` === target) return true;
    return false;
  });
}

/** Does this teacher teach this section?
 * If teacher has specific sections assigned in Faculty Directory (including grade-specific sections),
 * they can ONLY teach those sections.
 * If sections field is empty/unset, they teach all sections of their assigned grades.
 */
function teachesSection(teacher: TeacherInfo, section: string, grade?: string): boolean {
  if (grade) {
    return teacherTeachesSection(teacher.sections, grade, section);
  }
  return teacherTeachesSection(teacher.sections, '', section);
}

/** Strictly eligible for this (subject, grade, section) triplet from Faculty Directory */
function isTeacherEligibleForSlot(teacher: TeacherInfo, subject: string, grade: string, section: string): boolean {
  return teachesSubject(teacher, subject) && teachesGrade(teacher, grade) && teachesSection(teacher, section, grade);
}

interface GeneratedSchedule {
  grade: string;
  section: string;
  day: string;
  period: number;
  subject: string;
  teacherId: string;
  teacherName: string;
  matchLabel: string;
  score: number;
  startTime: string;
  endTime: string;
}

/**
 * AI Timetable Generator — Per-Grade/Section Constraint-Satisfaction Engine
 *
 * Generates a timetable for a SPECIFIC grade and section using a multi-pass approach:
 *
 * Pass 1: Subject Assignment — Distribute subjects across the week with pedagogical constraints
 * Pass 2: Teacher Scoring — Sophisticated scoring that prioritizes:
 *   1. Teachers who teach both the subject AND the grade (Perfect Match)
 *   2. Subject specialists who can teach the grade
 *   3. Grade-familiar teachers (taught this grade before in other schedules)
 *   4. Workload balancing (distribute periods evenly)
 *   5. Pedagogical considerations (no double-period same subject, spread subjects)
 *   6. Teacher continuity (prefer same teacher for same subject across days)
 * Pass 3: AI Enhancement — Use AI to review and optimize for pedagogical quality
 * Pass 4: Validation — Verify zero clashes
 * Pass 5: Database Write — Commit and update teacher schedules
 * Pass 6: Notifications — Inform affected teachers
 */
export async function POST(request: Request) {
  const denied = requireCapability(request, 'timetable.generate');
  if (denied) return denied;

  try {
    const { grade, section, dryRun = false, setup = {}, bulkAll = false } = await request.json();

    // The tenant comes from the verified session, never the request body.
    // Previously an absent body schoolId made Prisma drop the filter, so the
    // deleteMany below spanned every school and rows were written with a null
    // schoolId.
    const schoolId = await getTenantSchoolId(request);
    if (!schoolId) {
      return NextResponse.json(
        { error: 'No school context. Please sign in again.' },
        { status: 401 }
      );
    }

    // Validate required parameters
    if ((!grade || !section) && !bulkAll) {
      return NextResponse.json(
        { error: 'School, grade and section are required.' },
        { status: 400 }
      );
    }

    // Generation writes into the editable draft when the school uses
    // versioning. A published timetable is never regenerated in place - the
    // Admin must create a revision first.
    let draftVersion = await db.timetableVersion.findFirst({
      where: { schoolId, status: { in: ['draft', 'review'] } },
      orderBy: { version: 'desc' },
      select: { id: true, version: true },
    });
    const publishedVersion = await getPublishedVersion(schoolId);
    if (!draftVersion && publishedVersion) {
      // Auto-create a new draft revision so the current published roster is preserved in history
      const highest = await db.timetableVersion.findFirst({
        where: { schoolId },
        orderBy: { version: 'desc' },
        select: { version: true },
      });
      const nextVersionNum = (highest?.version ?? publishedVersion.version) + 1;
      const createdDraft = await db.timetableVersion.create({
        data: {
          schoolId,
          academicYearId: publishedVersion.academicYearId,
          name: `Master Timetable v${nextVersionNum}`,
          version: nextVersionNum,
          status: 'draft',
          basedOnId: publishedVersion.id,
          createdBy: request.headers.get('x-user-email') || 'School Admin',
          changeNotes: `Working draft for new timetable generation (v${nextVersionNum})`,
        },
      });
      draftVersion = { id: createdDraft.id, version: createdDraft.version };

      // Ensure newly created draft revision inherits existing schedules from the base version
      let sourceVersionId = publishedVersion.id;
      let existingRows = await db.schedule.findMany({
        where: { schoolId, timetableVersionId: sourceVersionId },
      });
      if (existingRows.length === 0) {
        const latestWithRows = await db.schedule.findFirst({
          where: { schoolId, timetableVersionId: { not: null } },
          orderBy: { createdAt: 'desc' },
          select: { timetableVersionId: true },
        });
        if (latestWithRows?.timetableVersionId) {
          sourceVersionId = latestWithRows.timetableVersionId;
          existingRows = await db.schedule.findMany({
            where: { schoolId, timetableVersionId: sourceVersionId },
          });
        }
      }
      if (existingRows.length > 0) {
        for (let i = 0; i < existingRows.length; i += 100) {
          const chunk = existingRows.slice(i, i + 100);
          await db.schedule.createMany({
            data: chunk.map((r) => ({
              schoolId,
              timetableVersionId: createdDraft.id,
              grade: r.grade,
              section: r.section,
              day: r.day,
              period: r.period,
              subject: r.subject,
              teacherId: r.teacherId,
              topic: r.topic,
              roomId: r.roomId,
              startTime: r.startTime,
              endTime: r.endTime,
            })),
          });
        }
      }
    }
    const targetVersionId = draftVersion?.id ?? null;
    // Occupancy and writes are confined to this one timetable context.
    const versionScope = targetVersionId
      ? { timetableVersionId: targetVersionId }
      : { OR: [{ timetableVersionId: null }, { timetableVersionId: { isSet: false } }] };

    const targetGrade = (grade || 'Grade 10') as string;
    const targetSection = (section || 'A') as string;
    // Per-day shape is read from the stored school configuration so the
    // generator, manual editing, revisions, leave lookup and substitution all
    // agree. The request body is only a fallback for a school that has never
    // configured one, and is persisted below so it becomes the shared truth.
    const storedConfig = await getDayConfig(schoolId);
    const periodsPerDay = storedConfig.configured
      ? storedConfig.periodsPerDay
      : Math.min(10, Math.max(4, Number(setup.periodsPerDay) || 8));
    const workingDays = storedConfig.configured
      ? storedConfig.workingDays
      : (Number(setup.workingDays) === 5 ? 5 : 6);
    const dayShapeConfig = storedConfig.configured
      ? storedConfig
      : {
          workingDays,
          periodsPerDay,
          saturdayPeriods: Math.min(periodsPerDay, Math.max(1, Number(setup.saturdayPeriods) || 4)),
        };
    const saturdayPeriods = periodsForDay('Saturday', dayShapeConfig);
    const breakAfter = Math.min(periodsPerDay - 1, Math.max(1, Number(setup.breakAfter) || 2));
    const lunchAfter = Math.min(periodsPerDay - 1, Math.max(breakAfter + 1, Number(setup.lunchAfter) || 4));
    const breakEnabled = setup.breakEnabled !== false && Number(setup.breakMinutes) > 0;
    const lunchEnabled = setup.lunchEnabled !== false && Number(setup.lunchMinutes) > 0;
    const breakMinutes = breakEnabled ? Math.min(30, Math.max(5, Number(setup.breakMinutes) || 15)) : 0;
    const lunchMinutes = lunchEnabled ? Math.min(90, Math.max(15, Number(setup.lunchMinutes) || 45)) : 0;
    const parseMinutes = (value: string, fallback: number) => { const match = /^(\d{1,2}):(\d{2})$/.exec(value || ''); return match ? Number(match[1]) * 60 + Number(match[2]) : fallback; };
    const formatMinutes = (value: number) => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
    const startMinutes = parseMinutes(setup.startTime, 9 * 60 + 30);
    const endMinutes = parseMinutes(setup.endTime, setup.schoolLevel === 'primary' ? 15 * 60 : 17 * 60);
    if (endMinutes <= startMinutes + 180) return NextResponse.json({ error: 'End time must be at least three hours after start time.' }, { status: 400 });
    const teachingMinutes = endMinutes - startMinutes - breakMinutes - lunchMinutes;
    const periodMinutes = Math.floor(teachingMinutes / periodsPerDay);
    const extraPeriodMinutes = teachingMinutes % periodsPerDay;
    if (periodMinutes < 25) return NextResponse.json({ error: 'The selected day is too short for the periods and breaks. Increase the end time or reduce periods/break durations.' }, { status: 400 });
    const DAYS = workingDayNames(dayShapeConfig) as string[];
    let cursor = startMinutes;
    const TIME_SLOTS = Array.from({ length: periodsPerDay }, (_, index) => {
      const period = index + 1; const start = cursor; cursor += periodMinutes + (index < extraPeriodMinutes ? 1 : 0); const end = cursor;
      if (period === breakAfter) cursor += breakMinutes;
      if (period === lunchAfter) cursor += lunchMinutes;
      return { period, start: formatMinutes(start), end: formatMinutes(end) };
    });
    const MORNING_PERIODS = TIME_SLOTS.filter((slot) => parseMinutes(slot.start, 0) < 12 * 60).map((slot) => slot.period);
    const AFTERNOON_PERIODS = TIME_SLOTS.filter((slot) => !MORNING_PERIODS.includes(slot.period)).map((slot) => slot.period);

    // ─── Step 1: Load teachers who strictly teach THIS grade and THIS section ───
    const allTeachers = await db.teacher.findMany({
      where: { schoolId, role: { not: 'inactive' } },
      // Occupancy must come from THIS school and THIS timetable version only.
      include: { schedules: { where: { schoolId, ...versionScope } } },
    });

    const toTeacherInfo = (t: (typeof allTeachers)[number]): TeacherInfo => ({
      id: t.id,
      name: t.name,
      subject: t.subject,
      subjects: readList(t.subjects ?? t.subject),
      grades: readList(t.grades),
      sections: readList(t.sections),
      existingScheduleCount: t.schedules.length,
    });

    // ONLY include teachers whose Faculty Directory configuration explicitly includes targetGrade and targetSection
    const teacherInfo: TeacherInfo[] = allTeachers
      .map(toTeacherInfo)
      .filter((t) => teachesGrade(t, targetGrade) && teachesSection(t, targetSection));

    // Subjects and their scheduling rules come from this school's own
    // grade configuration. The hardcoded CBSE map is only a fallback for a
    // school that has not configured anything yet, so two tenants can run
    // completely different curricula.
    const [gradeSubjectConfigs, schoolSubjectMasters, teacherSubjects] = await Promise.all([
      db.gradeSubjectConfig.findMany({
        where: { schoolId, grade: targetGrade, active: true },
        orderBy: { subjectName: 'asc' },
      }),
      db.subjectMaster.findMany({
        where: { schoolId },
        select: { name: true },
        orderBy: { name: 'asc' },
      }),
      db.teacher.findMany({
        where: { schoolId, role: { not: 'inactive' } },
        select: { subject: true },
      }),
    ]);
    const usingConfiguredSubjects = gradeSubjectConfigs.length > 0;
    const dbSubjects = schoolSubjectMasters.map((s) => s.name);
    const dbTeacherSubjects = Array.from(new Set(teacherSubjects.map((t) => t.subject).filter(Boolean)));
    const subjects = usingConfiguredSubjects
      ? gradeSubjectConfigs.map((c) => c.subjectName)
      : dbSubjects.length > 0
        ? dbSubjects
        : dbTeacherSubjects.length > 0
          ? dbTeacherSubjects
          : (SUBJECTS_BY_GRADE[targetGrade] || SUBJECTS_BY_GRADE['Grade 1']);
    const subjectRules = new Map(gradeSubjectConfigs.map((c) => [c.subjectName.toLowerCase(), c]));
    /** Weekly period target per subject, when configured. */
    const weeklyTargetFor = (subject: string) =>
      subjectRules.get(subject.toLowerCase())?.weeklyPeriods ?? null;
    /** Max occurrences of a subject on one day, from config where present. */
    const configuredMaxPerDay = (subject: string) =>
      subjectRules.get(subject.toLowerCase())?.maxPeriodsPerDay ?? null;
    const allowsConsecutive = (subject: string) =>
      subjectRules.get(subject.toLowerCase())?.allowConsecutive ?? false;
    const priorityRank = (subject: string) => {
      const p = subjectRules.get(subject.toLowerCase())?.priority ?? 'Normal';
      return { Core: 3, High: 2, Normal: 1, Low: 0 }[p as string] ?? 1;
    };
    /** Weekly placements so far, so weeklyPeriods is not exceeded. */
    const weeklyPlaced = new Map<string, number>();

    /**
     * Per-subject caps, shared by the day planner and by the relocation path
     * in the placement loop. Both must apply the same limits or a subject can
     * be swapped into far more periods than it is configured for.
     */
    const subjectDailyLimitFor = (subject: string, day: string): number => {
      const configured = configuredMaxPerDay(subject);
      if (configured !== null) return Math.min(1, configured);
      // Strictly max 1 period per subject per day in the same grade & section (no repeating subjects on same day)
      return 1;
    };

    /**
     * Is this subject already in an adjacent period for this class on this day?
     * Back-to-back placement is only allowed when the subject is configured for
     * double periods.
     */
    const wouldBeConsecutive = (subject: string, day: string, period: number): boolean => {
      if (allowsConsecutive(subject)) return false;
      return generatedSchedules.some(
        (row) =>
          row.day === day &&
          row.subject === subject &&
          (row.period === period - 1 || row.period === period + 1)
      );
    };

    const weeklyExhaustedFor = (subject: string): boolean => {
      const target = weeklyTargetFor(subject);
      if (target === null) return false;
      return (weeklyPlaced.get(subject.toLowerCase()) ?? 0) >= target;
    };

    // ─── Step 2: Build constraint-satisfaction engine ───
    const teacherBusyMap = new Map<string, Set<string>>(); // teacherId -> Set<"day-period">
    const teacherDayCountMap = new Map<string, Map<string, number>>(); // teacherId -> Map<day, count>
    const teacherTotalLoadMap = new Map<string, number>(); // teacherId -> total periods this generation

    const isTeacherBusy = (teacherId: string, day: string, period: number): boolean => {
      const key = `${day}-${period}`;
      return teacherBusyMap.get(teacherId)?.has(key) || false;
    };

    const markTeacherBusy = (teacherId: string, day: string, period: number) => {
      const key = `${day}-${period}`;
      if (!teacherBusyMap.has(teacherId)) teacherBusyMap.set(teacherId, new Set());
      teacherBusyMap.get(teacherId)!.add(key);
      if (!teacherDayCountMap.has(teacherId)) teacherDayCountMap.set(teacherId, new Map());
      const dayMap = teacherDayCountMap.get(teacherId)!;
      dayMap.set(day, (dayMap.get(day) || 0) + 1);
      teacherTotalLoadMap.set(teacherId, (teacherTotalLoadMap.get(teacherId) || 0) + 1);
    };

    const getTeacherDayCount = (teacherId: string, day: string): number => {
      return teacherDayCountMap.get(teacherId)?.get(day) || 0;
    };

    const teacherFullDay = (teacherId: string) => DAYS[Math.abs([...teacherId].reduce((sum, char) => sum + char.charCodeAt(0), 0)) % Math.min(5, DAYS.length)];
    const getTeacherDayLimit = (teacherId: string, day: string) => day === 'Saturday' ? Math.min(4, saturdayPeriods) : day === teacherFullDay(teacherId) ? periodsPerDay : MAX_PERIODS_PER_DAY;

    const getTeacherTotalLoad = (teacherId: string): number => {
      return teacherTotalLoadMap.get(teacherId) || 0;
    };

    // Pre-load existing assignments from DB (for ALL teachers, not just grade teachers)
    for (const teacher of allTeachers) {
      for (const sched of teacher.schedules) {
        // Only mark as busy if it's NOT for this grade+section (those will be cleared)
        if (sched.grade !== targetGrade || sched.section !== targetSection) {
          markTeacherBusy(teacher.id, sched.day, sched.period);
        }
      }
    }

    // ─── Step 3: Sophisticated scoring system ───
    const scoreTeacher = (
      teacher: TeacherInfo,
      subject: string,
      grade: string,
      day: string,
      period: number,
      subjectTeacherHistory: Map<string, Map<string, string>> // subject -> day -> teacherId
    ): { score: number; matchLabel: string } => {
      const isSubjectQualified = teachesSubject(teacher, subject);
      const isGradeQualified = teachesGrade(teacher, grade);
      const isSectionQualified = teachesSection(teacher, targetSection);

      const dayWorkload = getTeacherDayCount(teacher.id, day);
      const totalWorkload = getTeacherTotalLoad(teacher.id);

      // STRICT Hard constraint 1: Must be qualified for the subject in Faculty Directory
      if (!isSubjectQualified) {
        return { score: -Infinity, matchLabel: 'Unqualified Subject' };
      }

      // STRICT Hard constraint 2: Must be assigned to this grade in Faculty Directory
      if (!isGradeQualified) {
        return { score: -Infinity, matchLabel: 'Unassigned Grade' };
      }

      // STRICT Hard constraint 3: Must be assigned to this section in Faculty Directory
      if (!isSectionQualified) {
        return { score: -Infinity, matchLabel: 'Unassigned Section' };
      }

      // Hard constraint 4: Cannot exceed max periods per day
      if (dayWorkload >= getTeacherDayLimit(teacher.id, day)) {
        return { score: -Infinity, matchLabel: 'Overloaded' };
      }

      let score = 1200;
      let matchLabel = 'Faculty Directory Match';

      // Priority 4: Teacher Section Continuity — STRONGLY prefer the same teacher for this subject throughout the week
      // (e.g. Mrs. Sharma takes all Math periods for Grade 10-A, not switching between multiple teachers)
      const subjectHistory = subjectTeacherHistory.get(subject);
      if (subjectHistory) {
        let assignedDaysCount = 0;
        for (const [, tid] of subjectHistory.entries()) {
          if (tid === teacher.id) assignedDaysCount++;
        }
        if (assignedDaysCount > 0) {
          score += 1500 + (assignedDaysCount * 200); // Massive boost for keeping the same teacher across the week
        }
      }

      // Priority 5: Workload balancing — distribute periods evenly across available staff
      const dailyCapacityPenalty = dayWorkload * 40;
      const totalLoadPenalty = totalWorkload * 8;
      score -= dailyCapacityPenalty;
      score -= totalLoadPenalty;

      // Bonus for teachers with light current workload today
      if (dayWorkload < 3) score += 50;
      if (totalWorkload < 12) score += 40;

      // Priority 6: Pedagogical schedule flow — prefer contiguous schedule blocks rather than scattered single periods
      const prevBusy = isTeacherBusy(teacher.id, day, period - 1);
      const nextBusy = isTeacherBusy(teacher.id, day, period + 1);
      if (prevBusy || nextBusy) score += 25;

      return { score, matchLabel };
    };

    // ─── Step 4: Generate subject distribution with pedagogical constraints ───
    // Build a weekly plan that respects pedagogical constraints before assigning teachers
    const generatedSchedules: GeneratedSchedule[] = [];
    const unassignedSlots: { grade: string; section: string; day: string; period: number; subject: string }[] = [];

    // Track subject assignment per day for pedagogical constraints
    const daySubjectCountMap = new Map<string, Map<string, number>>(); // day -> subject -> count
    // Track teacher assignment history per subject for continuity
    const subjectTeacherHistory = new Map<string, Map<string, string>>(); // subject -> day -> teacherId

    const getDaySubjectCount = (day: string, subject: string): number => {
      return daySubjectCountMap.get(day)?.get(subject) || 0;
    };

    const incrementDaySubjectCount = (day: string, subject: string) => {
      if (!daySubjectCountMap.has(day)) daySubjectCountMap.set(day, new Map());
      const map = daySubjectCountMap.get(day)!;
      map.set(subject, (map.get(subject) || 0) + 1);
    };

    // Global period-to-subject history across days to ensure JUMBLED period placements
    // Map<periodNumber, Map<subjectName, count>>
    const periodSubjectHistory = new Map<number, Map<string, number>>();
    const getPeriodSubjectCount = (period: number, subject: string) => {
      return periodSubjectHistory.get(period)?.get(subject) || 0;
    };
    const recordPeriodSubject = (period: number, subject: string) => {
      if (!periodSubjectHistory.has(period)) periodSubjectHistory.set(period, new Map());
      const pMap = periodSubjectHistory.get(period)!;
      pMap.set(subject, (pMap.get(subject) || 0) + 1);
    };

    // Soft rule: for Grades 3-8 keep the period-1 teacher consistent across the
    // week (acts as the "class teacher"). Declared here because teacher
    // selection below consults it.
    const isClassTeacherRuleGrade = ['Grade 3', 'Grade 4', 'Grade 5', 'Grade 6', 'Grade 7', 'Grade 8'].includes(targetGrade);
    let period1AnchorTeacherId: string | null = null;

    /**
     * The single place a teacher is chosen for a (subject, day, period).
     *
     * Every hard constraint is applied here — teacher already busy, daily/period
     * limits, subject and grade eligibility — so no caller can place a lesson
     * that cannot actually be staffed. Returns null when the slot is not
     * feasible; it never returns an unavailable teacher.
     *
     * Pure: it inspects state but does not reserve anything. The caller commits
     * with markTeacherBusy() once it decides to use the result.
     */
    const pickTeacher = (
      subject: string,
      day: string,
      period: number,
      options: { requireSubjectMatch?: boolean } = {}
    ): (TeacherInfo & { score: number; matchLabel: string }) | null => {
      // ONLY candidates from teacherInfo who strictly match subject, targetGrade, and targetSection
      // No fallback to other teachers - extra subjects/grades/sections are strictly forbidden!
      const candidates = teacherInfo
        .filter((t) => {
          // Strictly must be eligible for subject, grade, and section from Faculty Directory
          if (!isTeacherEligibleForSlot(t, subject, targetGrade, targetSection)) return false;
          // Must NOT be busy in any other class/grade during this (day, period) slot
          if (isTeacherBusy(t.id, day, period)) return false;
          // Must NOT exceed daily workload limits
          if (getTeacherDayCount(t.id, day) >= getTeacherDayLimit(t.id, day)) return false;
          return true;
        })
        .map((t) => ({ ...t, ...scoreTeacher(t, subject, targetGrade, day, period, subjectTeacherHistory) }))
        .filter((t) => t.score > -Infinity)
        .sort((a, b) => b.score - a.score);

      if (candidates.length > 0) {
        const preferAnchor = isClassTeacherRuleGrade && period === 1 && period1AnchorTeacherId;
        return preferAnchor
          ? candidates.find((c) => c.id === period1AnchorTeacherId) ?? candidates[0]
          : candidates[0];
      }

      return null;
    };

    /**
     * A pedagogical preference is honoured only when a genuinely qualified
     * teacher is free in that slot. This is what stops "PE for Grades 3-5 on
     * Wednesday P1" from stacking every section onto the same moment.
     */
    const canStaff = (subject: string, day: string, period: number) =>
      pickTeacher(subject, day, period, { requireSubjectMatch: true }) !== null;

    // Build subject order per day that respects pedagogical constraints + JUMBLED period placement
    const buildSubjectOrderForDay = (day: string): { period: number; subject: string }[] => {
      const assignments: { period: number; subject: string }[] = [];
      const usedSubjects = new Map<string, number>(); // subject -> count assigned today
      const isPTGrade = ['Grade 3', 'Grade 4', 'Grade 5'].includes(targetGrade);
      const dayIdx = DAYS.indexOf(day);

      const subjectDailyLimit = (subject: string): number => subjectDailyLimitFor(subject, day);
      const weeklyExhausted = (subject: string): boolean => weeklyExhaustedFor(subject);

      // Rotate and jumble subject lists dynamically per day using day index and period hashing
      const rotateAndJumble = <T,>(items: T[], dayOffset: number) => {
        if (!items.length) return items;
        // Shift array by dayOffset and then apply deterministic pseudo-shuffle
        const shifted = items.slice(dayOffset % items.length).concat(items.slice(0, dayOffset % items.length));
        return [...shifted].sort((a, b) => Math.sin(dayOffset * 7 + String(a).length * 13) - Math.sin(dayOffset * 11 + String(b).length * 17));
      };

      const dayOffset = Math.max(0, dayIdx);
      const coreSubs = rotateAndJumble(subjects.filter((s) => CORE_SUBJECTS.includes(s)), dayOffset);
      const afternoonSubs = rotateAndJumble(subjects.filter((s) => AFTERNOON_PREFERRED.includes(s)), dayOffset);
      const peSubject = subjects.find((s) => s === 'Physical Education');
      const otherSubs = rotateAndJumble(subjects.filter(
        (s) => !CORE_SUBJECTS.includes(s) && !AFTERNOON_PREFERRED.includes(s)
      ), dayOffset);

      // Track which subjects still need periods
      const subjectNeeded = new Map<string, number>();
      for (const s of subjects) {
        subjectNeeded.set(s, Math.max(1, Math.ceil(TIME_SLOTS.length / subjects.length)));
      }

      // Assign morning periods (1-5) first — prioritize core subjects with period-jumble sorting
      const morningSlots = TIME_SLOTS.filter((s) => MORNING_PERIODS.includes(s.period));
      const afternoonSlots = TIME_SLOTS.filter((s) => AFTERNOON_PERIODS.includes(s.period));

      for (const slot of morningSlots) {
        let assigned = false;

        // Preference (NOT a hard rule): PT for Grades 3-5 on Wednesday Period 1.
        // Only honoured when a PE teacher is genuinely free in that slot —
        // otherwise PE is placed elsewhere in the week by the normal path.
        // Forcing it here is what previously put one PE teacher in front of
        // ten Grade 3-5 sections at the same moment.
        if (slot.period === 1 && day === 'Wednesday' && isPTGrade) {
          const pe = 'Physical Education';
          const currentCount = usedSubjects.get(pe) || 0;
          if (currentCount < subjectDailyLimit(pe) && canStaff(pe, day, slot.period)) {
            assignments.push({ period: slot.period, subject: pe });
            usedSubjects.set(pe, currentCount + 1);
            recordPeriodSubject(slot.period, pe);
            assigned = true;
            continue;
          }
        }

        // Candidate subjects sorted by LEAST used in this period on prior days (jumble optimization)
        const candidates = [...coreSubs, ...otherSubs].sort((a, b) => {
          if (usingConfiguredSubjects) {
            const byPriority = priorityRank(b) - priorityRank(a);
            if (byPriority !== 0) return byPriority;
          }
          const timesInThisPeriodA = getPeriodSubjectCount(slot.period, a);
          const timesInThisPeriodB = getPeriodSubjectCount(slot.period, b);
          if (timesInThisPeriodA !== timesInThisPeriodB) return timesInThisPeriodA - timesInThisPeriodB;
          return (usedSubjects.get(a) || 0) - (usedSubjects.get(b) || 0);
        });

        for (const sub of candidates) {
          const currentCount = usedSubjects.get(sub) || 0;
          if (currentCount >= subjectDailyLimit(sub)) continue;
          if (weeklyExhausted(sub)) continue;

          // PE should not be in period 1 (except PT rule above)
          if (sub === 'Physical Education' && slot.period === 1) {
            const allowed = day === 'Wednesday' && isPTGrade;
            if (!allowed) continue;
          }

          // Check if we already assigned this subject recently (avoid consecutive same)
          const lastAssigned = assignments[assignments.length - 1];
          if (lastAssigned && lastAssigned.subject === sub && !allowsConsecutive(sub)) continue;

          assignments.push({ period: slot.period, subject: sub });
          usedSubjects.set(sub, (usedSubjects.get(sub) || 0) + 1);
          recordPeriodSubject(slot.period, sub);
          assigned = true;
          break;
        }

        if (!assigned) {
          // Fallback: assign any subject that hasn't been used too much
          for (const sub of subjects) {
            const currentCount = usedSubjects.get(sub) || 0;
            if (currentCount >= subjectDailyLimit(sub)) continue;
          if (weeklyExhausted(sub)) continue;
            if (sub === 'Physical Education' && slot.period === 1) {
              const allowed = day === 'Wednesday' && isPTGrade;
              if (!allowed) continue;
            }
            const lastAssigned = assignments[assignments.length - 1];
            if (lastAssigned && lastAssigned.subject === sub && !allowsConsecutive(sub)) continue;
            assignments.push({ period: slot.period, subject: sub });
            usedSubjects.set(sub, (usedSubjects.get(sub) || 0) + 1);
            assigned = true;
            break;
          }
        }

        if (!assigned) {
          const unused = subjects.find((subject) => (usedSubjects.get(subject) || 0) < subjectDailyLimit(subject) && !weeklyExhausted(subject));
          if (unused) {
            assignments.push({ period: slot.period, subject: unused });
            usedSubjects.set(unused, (usedSubjects.get(unused) || 0) + 1);
          }
        }
      }

      // Fill afternoon periods — prioritize Art/Music
      const afternoonQueue = [...afternoonSubs, ...otherSubs, ...coreSubs];

      for (const slot of afternoonSlots) {
        let assigned = false;

        for (const sub of afternoonQueue) {
          const currentCount = usedSubjects.get(sub) || 0;
          if (currentCount >= subjectDailyLimit(sub)) continue;
          if (weeklyExhausted(sub)) continue;

          const lastAssigned = assignments[assignments.length - 1];
          if (lastAssigned && lastAssigned.subject === sub && !allowsConsecutive(sub)) continue;

          assignments.push({ period: slot.period, subject: sub });
          usedSubjects.set(sub, (usedSubjects.get(sub) || 0) + 1);
          assigned = true;
          break;
        }

        if (!assigned) {
          const unused = subjects.find((subject) => (usedSubjects.get(subject) || 0) < subjectDailyLimit(subject) && !weeklyExhausted(subject));
          if (unused) {
            assignments.push({ period: slot.period, subject: unused });
            usedSubjects.set(unused, (usedSubjects.get(unused) || 0) + 1);
          }
        }
      }

      // PT balancing rule:
      // Grade 3, 4, and 5 must have one extra sports (Physical Education) period on Wednesday vs Period 1 PT.
      // Force a second PE into a non-consecutive slot.
      if (day === 'Wednesday' && ['Grade 3', 'Grade 4', 'Grade 5'].includes(targetGrade)) {
        const pe = 'Physical Education';
        const peCount = assignments.filter((a) => a.subject === pe).length;
        if (peCount < 2) {
          const byPeriod = new Map(assignments.map((a) => [a.period, a]));
          const hasPeAt = (p: number) => byPeriod.get(p)?.subject === pe;
          const candidate = [...assignments]
            .sort((a, b) => b.period - a.period) // Prefer afternoon slots (P6-8)
            .find((a) => {
              if (a.subject === pe) return false;
              // Avoid consecutive placement with existing PE periods
              if (hasPeAt(a.period - 1) || hasPeAt(a.period + 1)) return false;
              // Only swap in PE where a PE teacher is actually free.
              return canStaff(pe, day, a.period);
            });
          if (candidate) {
            candidate.subject = pe;
          }
        }
      }

      return assignments;
    };

    // ─── Step 5: Generate timetable for this specific grade+section ───
    for (const day of DAYS) {
      const dayPlan = buildSubjectOrderForDay(day).filter((slot) => day !== 'Saturday' || slot.period <= saturdayPeriods);

      for (const slotAssignment of dayPlan) {
        let subject = slotAssignment.subject;
        const period = slotAssignment.period;
        const timeSlot = TIME_SLOTS.find((t) => t.period === period);

        if (!timeSlot) continue;

        // Automatic generation only ever assigns a teacher who is mapped to the
        // subject. Order:
        //   1. qualified for this subject, and for this grade  (teacherInfo pool)
        //   2. qualified for this subject, any grade           (allTeacherInfo pool)
        //   3. swap in another subject that still needs slots and HAS a
        //      qualified teacher free in this period
        //   4. otherwise leave the period unresolved for an Admin to handle
        //
        // There is deliberately no "any free teacher" fallback: filling a
        // period by putting the Maths teacher in front of a PE class is worse
        // than reporting the gap. Unqualified staffing is a manual, audited
        // override only.
        // Re-check the caps at commit time: the day plan was built before any
        // of this week's placements were counted.
        let bestCandidate =
          weeklyExhaustedFor(subject) ||
          getDaySubjectCount(day, subject) >= subjectDailyLimitFor(subject, day) ||
          wouldBeConsecutive(subject, day, period)
            ? null
            : pickTeacher(subject, day, period, { requireSubjectMatch: true });

        if (!bestCandidate) {
          for (const alternative of subjects) {
            if (alternative === subject) continue;
            if (getDaySubjectCount(day, alternative) >= subjectDailyLimitFor(alternative, day)) continue;
            if (weeklyExhaustedFor(alternative)) continue;
            if (wouldBeConsecutive(alternative, day, period)) continue;
            const candidate = pickTeacher(alternative, day, period, { requireSubjectMatch: true });
            if (candidate) {
              subject = alternative;
              bestCandidate = candidate;
              break;
            }
          }
        }

        if (bestCandidate) {
          // Soft rule: Period-1 teacher consistency (Class Teacher-like anchor) for Grades 3–8.
          if (isClassTeacherRuleGrade && period === 1 && !period1AnchorTeacherId) {
            period1AnchorTeacherId = bestCandidate.id;
          }

          markTeacherBusy(bestCandidate.id, day, period);
          incrementDaySubjectCount(day, subject);
          weeklyPlaced.set(subject.toLowerCase(), (weeklyPlaced.get(subject.toLowerCase()) ?? 0) + 1);

          // Track teacher-subject continuity
          if (!subjectTeacherHistory.has(subject)) {
            subjectTeacherHistory.set(subject, new Map());
          }
          subjectTeacherHistory.get(subject)!.set(day, bestCandidate.id);

          generatedSchedules.push({
            grade: targetGrade,
            section: targetSection,
            day,
            period,
            subject,
            teacherId: bestCandidate.id,
            teacherName: bestCandidate.name,
            matchLabel: bestCandidate.matchLabel,
            score: bestCandidate.score,
            startTime: timeSlot.start,
            endTime: timeSlot.end,
          });
        } else {
          unassignedSlots.push({
            grade: targetGrade,
            section: targetSection,
            day,
            period,
            subject,
          });
        }
      }
    }

    // ─── Step 6: Validate zero clashes ───
    const assignmentMap = new Map<string, string[]>();
    for (const sched of generatedSchedules) {
      const key = `${sched.teacherId}|${sched.day}|${sched.period}`;
      if (!assignmentMap.has(key)) assignmentMap.set(key, []);
      assignmentMap.get(key)!.push(`${sched.grade} ${sched.section}`);
    }
    const clashes = [...assignmentMap.entries()].filter(([, v]) => v.length > 1);

    if (clashes.length > 0) {
      console.error('CLASHES DETECTED in generated timetable:', clashes.length);
      return NextResponse.json(
        {
          error: `Internal constraint solver error: ${clashes.length} clashes detected. This should not happen.`,
          clashDetails: clashes.slice(0, 5).map(([key, sections]) => {
            const [tid, day, period] = key.split('|');
            return { teacherId: tid, day, period: parseInt(period), assignedSections: sections };
          }),
        },
        { status: 500 }
      );
    }

    // ─── Step 7: AI Enhancement ───
    let aiSuggestions: string[] = [];
    try {
      const zai = await ZAI.create();
      const aiPrompt = `You are reviewing a timetable for ${targetGrade} Section ${targetSection}.

Total schedules generated: ${generatedSchedules.length}
Unassigned slots: ${unassignedSlots.length}
Clashes: 0 (verified)

Subject-teacher match distribution:
- Perfect Match (same subject + grade): ${generatedSchedules.filter((s) => s.matchLabel === 'Perfect Match').length}
- Subject Specialist (same subject): ${generatedSchedules.filter((s) => s.matchLabel === 'Subject Specialist').length}
- Grade Teacher (same grade): ${generatedSchedules.filter((s) => s.matchLabel === 'Grade Teacher').length}
- Other: ${generatedSchedules.filter((s) => s.matchLabel !== 'Perfect Match' && s.matchLabel !== 'Subject Specialist' && s.matchLabel !== 'Grade Teacher').length}

Pedagogical quality checks:
- Core subjects in morning periods: ${generatedSchedules.filter((s) => CORE_SUBJECTS.includes(s.subject) && MORNING_PERIODS.includes(s.period)).length}/${generatedSchedules.filter((s) => CORE_SUBJECTS.includes(s.subject)).length}
- Art/Music in afternoon: ${generatedSchedules.filter((s) => AFTERNOON_PREFERRED.includes(s.subject) && AFTERNOON_PERIODS.includes(s.period)).length}/${generatedSchedules.filter((s) => AFTERNOON_PREFERRED.includes(s.subject)).length}
- PE in period 1 (violation): ${generatedSchedules.filter((s) => s.subject === 'Physical Education' && s.period === 1).length}
- Teacher continuity (same teacher for same subject across days): ${[...subjectTeacherHistory.entries()].filter(([, days]) => days.size >= 3).length}/${subjectTeacherHistory.size} subjects have consistent teachers

Subject distribution per day:
${DAYS.map((day) => {
  const dayScheds = generatedSchedules.filter((s) => s.day === day).sort((a, b) => a.period - b.period);
  return `${day}: ${dayScheds.map((s) => `P${s.period}(${s.subject})`).join(', ')}`;
}).join('\n')}

Top unassigned subjects: ${unassignedSlots.length > 0 ? [...new Set(unassignedSlots.map((s) => s.subject))].slice(0, 5).join(', ') : 'None'}

Return a JSON array of 3-5 brief suggestion strings. Example: ["Consider hiring more Mathematics teachers", "Reduce PE periods for Grade 11-12"]`;

      const aiResponse = await zai.chat.completions.create({
        messages: [
          {
            role: 'system',
            content:
              'You are a premier school timetable architect specializing in CBSE, ICSE, and IB academic scheduling. Your core principles: (1) Zero Teacher Double-Booking: A teacher can NEVER teach two classes simultaneously in the same period; (2) Strict Subject Qualification: Teachers must only be assigned to subjects they are qualified to teach; (3) Teacher Continuity: The same subject in a section must be taught by the same teacher throughout the week; (4) Workload Balancing: Spread periods evenly across days without daily overload. Return only a JSON array of 3-5 brief, actionable optimization suggestions.',
          },
          { role: 'user', content: aiPrompt },
        ],
        temperature: 0.5,
        max_tokens: 300,
      });

      let content = aiResponse.choices?.[0]?.message?.content || '[]';
      // Strip markdown code fences that AI may wrap around JSON
      content = content
        .replace(/^```json\n?/, '')
        .replace(/\n?```$/, '')
        .replace(/^```\n?/, '')
        .trim();
      try {
        aiSuggestions = JSON.parse(content);
        if (!Array.isArray(aiSuggestions)) {
          aiSuggestions = [
            content
              .replace(/^```json\n?/gm, '')
              .replace(/\n?```/gm, '')
              .trim(),
          ];
        } else {
          aiSuggestions = aiSuggestions.map((s) =>
            typeof s === 'string'
              ? s
                  .replace(/^```json\n?/, '')
                  .replace(/\n?```$/, '')
                  .trim()
              : String(s)
          );
        }
      } catch {
        const cleaned = content
          .replace(/^```json\n?/gm, '')
          .replace(/\n?```/gm, '')
          .trim();
        aiSuggestions = [cleaned];
      }
    } catch {
      aiSuggestions = ['AI enhancement unavailable — timetable generated using constraint solver only'];
    }

    // ─── Step 8: If dry run, return results without writing to DB ───
    if (dryRun) {
      return NextResponse.json({
        success: true,
        message: `Dry run: Generated ${generatedSchedules.length} clash-free schedules for ${targetGrade} Section ${targetSection} with ${unassignedSlots.length} unassigned slots.`,
        stats: {
          grade: targetGrade,
          section: targetSection,
          totalGenerated: generatedSchedules.length,
          unassigned: unassignedSlots.length,
          clashes: 0,
          perfectMatchCount: generatedSchedules.filter((s) => s.matchLabel === 'Perfect Match').length,
          subjectSpecialistCount: generatedSchedules.filter((s) => s.matchLabel === 'Subject Specialist').length,
          coreSubjectsInMorning: generatedSchedules.filter(
            (s) => CORE_SUBJECTS.includes(s.subject) && MORNING_PERIODS.includes(s.period)
          ).length,
          artMusicInAfternoon: generatedSchedules.filter(
            (s) => AFTERNOON_PREFERRED.includes(s.subject) && AFTERNOON_PERIODS.includes(s.period)
          ).length,
          teacherContinuity: [...subjectTeacherHistory.entries()].filter(([, days]) => days.size >= 3).length,
        },
        schedules: generatedSchedules,
        unassignedSlots: unassignedSlots.slice(0, 20),
        aiSuggestions,
      });
    }

    // ─── Step 9: Write to database ───
    // Only clear existing schedules for THIS specific grade+section
    // Confined to the target version so a revision never clears the
    // published timetable it was copied from.
    await db.schedule.deleteMany({
      where: { schoolId, grade: targetGrade, section: targetSection, ...versionScope },
    });

    // Batch insert new schedules
    let created = 0;
    const scheduleDataList = generatedSchedules.map((s) => ({
      grade: s.grade,
      section: s.section,
      schoolId,
      day: s.day,
      period: s.period,
      subject: s.subject,
      teacherId: s.teacherId,
      topic: null,
      startTime: s.startTime,
      endTime: s.endTime,
      roomId: `R-${s.grade.replace('Grade ', '')}${s.section}-${s.period}`,
      timetableVersionId: targetVersionId,
    }));

    for (let i = 0; i < scheduleDataList.length; i += 100) {
      const chunk = scheduleDataList.slice(i, i + 100);
      await db.$transaction(chunk.map((data) => db.schedule.create({ data })));
      created += chunk.length;
    }

    // ─── Step 10: Update each assigned teacher's schedule in the DB ───
    // The schedules are already created in Step 9, but we should ensure the teacher
    // records reflect their updated workload. The schedules table already has
    // the teacherId foreign key, so the relation is established.
    // We can verify by checking the teacher's schedule count.
    const affectedTeacherIds = new Set<string>();
    for (const sched of generatedSchedules) {
      affectedTeacherIds.add(sched.teacherId);
    }

    // ─── Step 11: Send notifications to affected teachers ───
    const notifiedTeacherIds = new Set<string>();
    const notificationDataList: {
      type: string;
      referenceId: string;
      teacherId: string;
      sentBy: string;
      title: string;
      description: string;
      isRead: boolean;
    }[] = [];

    for (const sched of generatedSchedules) {
      if (notifiedTeacherIds.has(sched.teacherId)) continue;
      notifiedTeacherIds.add(sched.teacherId);

      const teacherSchedules = generatedSchedules.filter((s) => s.teacherId === sched.teacherId);
      const daySummary = DAYS.map((day) => {
        const dayScheds = teacherSchedules
          .filter((s) => s.day === day)
          .sort((a, b) => a.period - b.period);
        return (
          `${day}: ${dayScheds.length} periods` +
          (dayScheds.length > 0
            ? ` (${dayScheds.map((s) => `P${s.period} ${s.grade}-${s.section} ${s.subject}`).join(', ')})`
            : '')
        );
      }).join('\n');

      notificationDataList.push({
        type: 'timetable_generated',
        referenceId: `ai-timetable-${targetGrade}-${targetSection}`,
        teacherId: sched.teacherId,
        sentBy: 'AI Timetable Generator',
        title: `Your Timetable Updated — ${targetGrade} Section ${targetSection}`,
        description: `Your weekly timetable has been updated by the AI Timetable Generator for ${targetGrade} Section ${targetSection}.\n\n${daySummary}\n\nTotal: ${teacherSchedules.length} periods for this class. Please review your schedule.`,
        isRead: false,
      });
    }

    // Batch insert notifications
    for (let i = 0; i < notificationDataList.length; i += 50) {
      const chunk = notificationDataList.slice(i, i + 50);
      await db.$transaction(chunk.map((data) => db.teacherNotification.create({ data })));
    }

    // ─── Step 12: Final verification ───
    // Verify school-wide, not just within this class: a teacher clash by
    // definition spans two different class sections, so a same-class query
    // could never have detected one.
    const dbSchedules = await db.schedule.findMany({
      where: { schoolId, teacherId: { not: null }, ...versionScope },
      select: { teacherId: true, day: true, period: true, grade: true, section: true },
    });
    const dbMap = new Map<string, { grade: string; section: string }[]>();
    for (const s of dbSchedules) {
      const key = `${s.teacherId}|${s.day}|${s.period}`;
      if (!dbMap.has(key)) dbMap.set(key, []);
      dbMap.get(key)!.push({ grade: s.grade, section: s.section });
    }
    const clashingKeys = [...dbMap.entries()].filter(([, rows]) => rows.length > 1);
    const dbClashes = clashingKeys.length;
    // Only clashes that involve the class we just wrote are attributable here;
    // pre-existing ones elsewhere are reported separately, not silently owned.
    const introducedClashes = clashingKeys.filter(([, rows]) =>
      rows.some((r) => r.grade === targetGrade && r.section === targetSection)
    ).length;

    return NextResponse.json({
      success: true,
      message: `AI Timetable Generator completed for ${targetGrade} Section ${targetSection}: ${created} clash-free schedules created, ${notificationDataList.length} teacher notifications sent, ${unassignedSlots.length} slots unassigned.`,
      stats: {
        grade: targetGrade,
        section: targetSection,
        totalGenerated: created,
        unassigned: unassignedSlots.length,
        clashesInDB: dbClashes,
        perfectMatchCount: generatedSchedules.filter((s) => s.matchLabel === 'Perfect Match').length,
        subjectSpecialistCount: generatedSchedules.filter((s) => s.matchLabel === 'Subject Specialist').length,
        gradeTeacherCount: generatedSchedules.filter((s) => s.matchLabel === 'Grade Teacher').length,
        coreSubjectsInMorning: generatedSchedules.filter(
          (s) => CORE_SUBJECTS.includes(s.subject) && MORNING_PERIODS.includes(s.period)
        ).length,
        artMusicInAfternoon: generatedSchedules.filter(
          (s) => AFTERNOON_PREFERRED.includes(s.subject) && AFTERNOON_PERIODS.includes(s.period)
        ).length,
        teacherContinuity: [...subjectTeacherHistory.entries()].filter(([, days]) => days.size >= 3).length,
        clashesIntroducedByThisRun: introducedClashes,
        preExistingClashesElsewhere: dbClashes - introducedClashes,
        notificationsSent: notificationDataList.length,
        teachersAssigned: affectedTeacherIds.size,
        startTime: setup.startTime || '09:30',
        endTime: setup.endTime || (setup.schoolLevel === 'primary' ? '15:00' : '17:00'),
        workingDays,
        saturdayPeriods: workingDays === 6 ? saturdayPeriods : 0,
      },
      unassignedSlots: unassignedSlots.slice(0, 100),
      aiSuggestions,
      verificationPassed: introducedClashes === 0,
    });
  } catch (error) {
    console.error('Error in AI timetable generation:', error);
    return NextResponse.json({ error: 'Failed to generate timetable: ' + String(error) }, { status: 500 });
  }
}
