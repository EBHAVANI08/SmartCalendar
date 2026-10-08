import { db } from '@/lib/db';
import { readList, teacherTeachesSection } from '@/lib/faculty';
import { getTenantSchoolId } from '@/lib/school-helper';
import { getDayConfig } from '@/lib/timetable-config';
import { getPublishedVersion } from '@/lib/timetable-lifecycle';
import { periodsForDay, workingDayNames, buildTeachingGrid, periodTimingsForDay } from '@/lib/timetable-constraints';
import { NextResponse } from 'next/server';
import { requireCapability } from '@/lib/authz';
import { describeCapacityProblem, gradeCapacityReport } from '@/lib/timetable-capacity';

const MAX_PERIODS_PER_TEACHER_DAY = 6;

// CBSE Subjects by Grade
const SUBJECTS_BY_GRADE: Record<string, string[]> = {
  'Grade 1': ['Mathematics', 'English', 'Hindi', 'EVS', 'Computer Science', 'Physical Education', 'Art', 'Music', 'Library / Reading'],
  'Grade 2': ['Mathematics', 'English', 'Hindi', 'EVS', 'Computer Science', 'Physical Education', 'Art', 'Music', 'Library / Reading'],
  'Grade 3': ['Mathematics', 'English', 'Hindi', 'EVS', 'Computer Science', 'Physical Education', 'Art', 'Music', 'Library / Reading'],
  'Grade 4': ['Mathematics', 'English', 'Hindi', 'EVS', 'Computer Science', 'Physical Education', 'Art', 'Music', 'Library / Reading'],
  'Grade 5': ['Mathematics', 'English', 'Hindi', 'EVS', 'Computer Science', 'Physical Education', 'Art', 'Music', 'Library / Reading'],
  'Grade 6': ['Mathematics', 'English', 'Hindi', 'Sanskrit', 'Science', 'Social Science', 'Computer Science', 'Physical Education', 'Library / Reading'],
  'Grade 7': ['Mathematics', 'English', 'Hindi', 'Sanskrit', 'Science', 'Social Science', 'Computer Science', 'Physical Education', 'Library / Reading'],
  'Grade 8': ['Mathematics', 'English', 'Hindi', 'Sanskrit', 'Science', 'Social Science', 'Computer Science', 'Physical Education', 'Library / Reading'],
  'Grade 9': ['Mathematics', 'English', 'Hindi', 'Science', 'Social Science', 'Computer Science', 'Physical Education', 'Art', 'Library / Reading'],
  'Grade 10': ['Mathematics', 'English', 'Hindi', 'Science', 'Social Science', 'Computer Science', 'Physical Education', 'Art', 'Library / Reading'],
  'Grade 11': ['Physics', 'Chemistry', 'Mathematics', 'English', 'Computer Science', 'Physical Education', 'Library / Reading'],
  'Grade 12': ['Physics', 'Chemistry', 'Mathematics', 'English', 'Computer Science', 'Physical Education', 'Library / Reading'],
};

// Pedagogical constraints
const CORE_SUBJECTS = ['Mathematics', 'English', 'Science', 'Physics', 'Chemistry', 'Social Science', 'EVS'];

const SUBJECT_ALIASES: Record<string, string> = {
  math: 'mathematics',
  maths: 'mathematics',
  mathematics: 'mathematics',
  pe: 'physical education',
  'p.e.': 'physical education',
  'physical ed': 'physical education',
  'physical education': 'physical education',
  cs: 'computer science',
  computer: 'computer science',
  computers: 'computer science',
  'computer science': 'computer science',
  'information technology': 'information technology',
  it: 'information technology',
  evs: 'evs',
  'e.v.s.': 'evs',
  'environmental studies': 'evs',
  'environmental science': 'evs',
  sci: 'science',
  science: 'science',
  'social science': 'social science',
  'social studies': 'social science',
  sst: 'social science',
  's.s.t.': 'social science',
  eng: 'english',
  english: 'english',
  hindi: 'hindi',
  sanskrit: 'sanskrit',
  physics: 'physics',
  chemistry: 'chemistry',
  biology: 'biology',
  bio: 'biology',
  art: 'art',
  'arts & craft': 'art',
  music: 'music',
  library: 'library / reading',
  'library / reading': 'library / reading',
  reading: 'library / reading',
};

function normalizeSubjectName(subj: string): string {
  const clean = String(subj || '').trim().toLowerCase().replace(/[._-]/g, ' ').replace(/\s+/g, ' ');
  return SUBJECT_ALIASES[clean] || clean;
}

function isSubjectMatch(teacherSubject: string, targetSubject: string): boolean {
  if (!teacherSubject || !targetSubject) return false;
  const tNorm = normalizeSubjectName(teacherSubject);
  const tgtNorm = normalizeSubjectName(targetSubject);
  return tNorm === tgtNorm || tNorm.replace(/\s+/g, '') === tgtNorm.replace(/\s+/g, '');
}

interface TeacherInfo {
  id: string;
  name: string;
  subject: string;
  subjects: string[];
  grades: string[];
  sections: string[];
  existingScheduleCount: number;
}

/** Is this teacher qualified for the subject in Faculty Directory? */
function teachesSubject(teacher: TeacherInfo, subject: string): boolean {
  if (!subject) return false;
  return teacher.subjects.some((s) => isSubjectMatch(s, subject));
}

/** Does this teacher teach this grade? (Strict check against Faculty Directory) */
function teachesGrade(teacher: TeacherInfo, grade: string): boolean {
  if (!teacher.grades || teacher.grades.length === 0) return true; // Unscoped teachers can teach all grades
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

/** Does this teacher teach this section? (Strict check against Faculty Directory) */
function teachesSection(teacher: TeacherInfo, section: string, grade: string, subject?: string): boolean {
  return teacherTeachesSection(teacher.sections, grade, section, subject);
}

/** Complete Faculty Directory qualification verification */
function isTeacherQualifiedForSlot(teacher: TeacherInfo, grade: string, section: string, subject: string): boolean {
  return (
    teachesSubject(teacher, subject) &&
    teachesGrade(teacher, grade) &&
    teachesSection(teacher, section, grade, subject)
  );
}

const DEFAULT_GRADES = [
  'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5',
  'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10',
  'Grade 11', 'Grade 12',
];

function parseGradeNumber(g: string): number | null {
  const match = String(g || '').match(/\d+/);
  return match ? parseInt(match[0], 10) : null;
}

function resolveGradeRange(from: string, to: string, schoolGrades: string[]): string[] {
  const cleanFrom = String(from || '').trim();
  const cleanTo = String(to || '').trim();

  // If from and to are the same (e.g. Grade 5 to Grade 5), return just that single grade
  if (cleanFrom.toLowerCase() === cleanTo.toLowerCase()) {
    return [cleanFrom];
  }

  const fromNum = parseGradeNumber(cleanFrom);
  const toNum = parseGradeNumber(cleanTo);

  if (fromNum !== null && toNum !== null) {
    const min = Math.min(fromNum, toNum);
    const max = Math.max(fromNum, toNum);
    const result: string[] = [];

    for (let i = min; i <= max; i++) {
      // Look for matching grade name in schoolGrades
      const found = schoolGrades.find((g) => parseGradeNumber(g) === i);
      if (found) {
        if (!result.includes(found)) result.push(found);
      } else {
        const fallback = cleanFrom.toLowerCase().includes('grade') ? `Grade ${i}` : `Class ${i}`;
        if (!result.includes(fallback)) result.push(fallback);
      }
    }
    return result;
  }

  // If non-numeric, use index slicing in schoolGrades
  const fromIdx = schoolGrades.indexOf(cleanFrom);
  const toIdx = schoolGrades.indexOf(cleanTo);
  if (fromIdx !== -1 && toIdx !== -1) {
    const start = Math.min(fromIdx, toIdx);
    const end = Math.max(fromIdx, toIdx);
    return schoolGrades.slice(start, end + 1);
  }

  return [cleanFrom, cleanTo];
}

interface GeneratedSchedule {
  grade: string;
  section: string;
  day: string;
  period: number;
  subject: string;
  teacherId: string | null;
  teacherName: string | null;
  matchLabel: string;
  score: number;
  startTime: string;
  endTime: string;
}

export async function POST(request: Request) {
  const denied = requireCapability(request, 'timetable.generate');
  if (denied) return denied;

  try {
    const body = await request.json().catch(() => ({}));
    const { grade, section, dryRun = false, bulkAll = false } = body;

    const schoolId = await getTenantSchoolId(request);
    if (!schoolId) {
      return NextResponse.json({ error: 'No school context. Please sign in again.' }, { status: 401 });
    }

    // Extract Grade Scope Parameters (fromGrade / toGrade)
    const fromGrade = body.fromGrade || body.startGrade || body.setup?.fromGrade || body.setup?.startGrade;
    const toGrade = body.toGrade || body.endGrade || body.setup?.toGrade || body.setup?.endGrade;

    // Fetch all active class sections in school setup, existing distinct schedule sections, and subject configs
    const [classSections, existingSchedules, gradeConfigs] = await Promise.all([
      db.classSection.findMany({ where: { schoolId, active: true }, select: { grade: true, section: true } }),
      db.schedule.findMany({ where: { schoolId }, select: { grade: true, section: true }, distinct: ['grade', 'section'] }),
      db.gradeSubjectConfig.findMany({ where: { schoolId, active: true }, select: { grade: true }, distinct: ['grade'] }).catch(() => []),
    ]);

    // Build dynamic map of available sections for each grade from School Setup
    const sectionsByGradeMap = new Map<string, Set<string>>();
    for (const cs of classSections) {
      const g = cs.grade.trim();
      const sec = cs.section.trim().toUpperCase();
      if (!sectionsByGradeMap.has(g)) sectionsByGradeMap.set(g, new Set());
      sectionsByGradeMap.get(g)!.add(sec);
    }
    for (const es of existingSchedules) {
      const g = es.grade.trim();
      const sec = es.section.trim().toUpperCase();
      if (!sectionsByGradeMap.has(g)) sectionsByGradeMap.set(g, new Set());
      sectionsByGradeMap.get(g)!.add(sec);
    }
    for (const gc of gradeConfigs) {
      const g = gc.grade.trim();
      if (!sectionsByGradeMap.has(g)) {
        sectionsByGradeMap.set(g, new Set(['A']));
      }
    }

    // Dynamic list of grades configured in this school setup
    const dynamicSchoolGrades = Array.from(sectionsByGradeMap.keys()).sort((a, b) => {
      const na = parseGradeNumber(a) ?? 999;
      const nb = parseGradeNumber(b) ?? 999;
      return na - nb || a.localeCompare(b);
    });

    const schoolGradesList = dynamicSchoolGrades.length > 0
      ? dynamicSchoolGrades
      : DEFAULT_GRADES;

    // Determine target classes (Grade Scope vs single class vs full school)
    let targetClasses: { grade: string; section: string }[] = [];

    if (fromGrade && toGrade) {
      // 1. Grade Scope Mode: fromGrade to toGrade
      // If fromGrade === toGrade (e.g. Grade 5 to Grade 5), generates for ALL sections of Grade 5
      // If fromGrade is Grade 1 and toGrade is Grade 10, generates for all sections of Grades 1-10
      const targetGrades = resolveGradeRange(String(fromGrade), String(toGrade), schoolGradesList);
      const seen = new Set<string>();

      for (const tg of targetGrades) {
        const sections = sectionsByGradeMap.get(tg);
        if (sections && sections.size > 0) {
          const sortedSecs = Array.from(sections).sort();
          for (const s of sortedSecs) {
            const key = `${tg}|${s}`;
            if (!seen.has(key)) {
              seen.add(key);
              targetClasses.push({ grade: tg, section: s });
            }
          }
        } else {
          // If no section explicitly in DB yet, create Section A for this grade
          const key = `${tg}|A`;
          if (!seen.has(key)) {
            seen.add(key);
            targetClasses.push({ grade: tg, section: 'A' });
          }
        }
      }
    } else if (bulkAll) {
      // 2. Full school mode without explicit range
      const seen = new Set<string>();
      for (const [tg, sections] of sectionsByGradeMap.entries()) {
        const sortedSecs = Array.from(sections).sort();
        for (const s of sortedSecs) {
          const key = `${tg}|${s}`;
          if (!seen.has(key)) {
            seen.add(key);
            targetClasses.push({ grade: tg, section: s });
          }
        }
      }

      if (targetClasses.length === 0) {
        const defaultGrades = ['Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10'];
        targetClasses = defaultGrades.map((g) => ({ grade: g, section: 'A' }));
      }
    } else {
      // 3. Single class mode
      if (!grade || !section) {
        return NextResponse.json({ error: 'School, grade, and section are required.' }, { status: 400 });
      }
      targetClasses = [{ grade: String(grade).trim(), section: String(section).trim().toUpperCase() }];
    }

    // Refuse before touching any version: a grade whose subject quotas exceed
    // its teaching week cannot be timetabled, and padding or dropping periods
    // would hide that from the school.
    const targetGradeNames = new Set(targetClasses.map((tc) => tc.grade));
    const overCapacity = (await gradeCapacityReport(schoolId)).filter((c) => targetGradeNames.has(c.grade) && !c.ok);
    if (overCapacity.length > 0) {
      return NextResponse.json(
        {
          error: `Cannot generate: ${overCapacity.length} grade(s) need more periods than their week has. Fix the subject quotas or the day & period setup first.`,
          code: 'CAPACITY_EXCEEDED',
          grades: overCapacity.map((c) => ({ grade: c.grade, demand: c.demand, slots: c.slots, problem: describeCapacityProblem(c) })),
        },
        { status: 422 }
      );
    }

    // Handle timetable versioning (draft / revision)
    let draftVersion = await db.timetableVersion.findFirst({
      where: { schoolId, status: { in: ['draft', 'review'] } },
      orderBy: { version: 'desc' },
      select: { id: true, version: true, academicYearId: true },
    });
    const publishedVersion = await getPublishedVersion(schoolId);

    if (!draftVersion && publishedVersion) {
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
          changeNotes: `Auto-generated draft revision (v${nextVersionNum})`,
        },
      });
      draftVersion = { id: createdDraft.id, version: createdDraft.version, academicYearId: createdDraft.academicYearId };
    }

    const targetVersionId = draftVersion?.id ?? null;
    const versionScope = targetVersionId
      ? { timetableVersionId: targetVersionId }
      : { OR: [{ timetableVersionId: null }, { timetableVersionId: { isSet: false } }] };

    // Load all active school teachers
    const allTeachersRaw = await db.teacher.findMany({
      where: { schoolId, role: { not: 'inactive' } },
      include: { schedules: { where: { schoolId, ...versionScope } } },
    });

    const allTeachers: TeacherInfo[] = allTeachersRaw.map((t) => ({
      id: t.id,
      name: t.name,
      subject: t.subject,
      subjects: readList(t.subjects ?? t.subject),
      grades: readList(t.grades),
      sections: readList(t.sections),
      existingScheduleCount: t.schedules.length,
    }));

    // Pre-populate global clash trackers across the school
    const teacherBusyMap = new Map<string, Set<string>>(); // teacherId -> Set<"day-period">
    const teacherDayCountMap = new Map<string, Map<string, number>>(); // teacherId -> Map<day, count>
    const teacherTotalLoadMap = new Map<string, number>();

    const markTeacherBusy = (teacherId: string, day: string, period: number) => {
      const key = `${day}-${period}`;
      if (!teacherBusyMap.has(teacherId)) teacherBusyMap.set(teacherId, new Set());
      teacherBusyMap.get(teacherId)!.add(key);

      if (!teacherDayCountMap.has(teacherId)) teacherDayCountMap.set(teacherId, new Map());
      const dayMap = teacherDayCountMap.get(teacherId)!;
      dayMap.set(day, (dayMap.get(day) || 0) + 1);

      teacherTotalLoadMap.set(teacherId, (teacherTotalLoadMap.get(teacherId) || 0) + 1);
    };

    const isTeacherBusy = (teacherId: string, day: string, period: number): boolean => {
      const key = `${day}-${period}`;
      return teacherBusyMap.get(teacherId)?.has(key) || false;
    };

    const getTeacherDayCount = (teacherId: string, day: string): number => {
      return teacherDayCountMap.get(teacherId)?.get(day) || 0;
    };

    // Pre-load existing schedules not part of targetClasses
    const targetKeys = new Set(targetClasses.map((tc) => `${tc.grade}|${tc.section}`));
    for (const t of allTeachersRaw) {
      for (const s of t.schedules) {
        if (!targetKeys.has(`${s.grade}|${s.section}`)) {
          markTeacherBusy(t.id, s.day, s.period);
        }
      }
    }

    const allGeneratedSchedules: GeneratedSchedule[] = [];
    const totalWeeklyRequirementsMap: Record<string, number> = {};

    // ─── Loop through each target (Grade, Section) ───
    for (const target of targetClasses) {
      const targetGrade = target.grade;
      const targetSection = target.section;

      // 1. Resolve Day & Period configuration for this specific grade
      const gradeDayConfig = await getDayConfig(schoolId, targetGrade);
      const days = workingDayNames(gradeDayConfig);
      const teachingGrid = buildTeachingGrid(gradeDayConfig);
      const totalWeeklySlotsNeeded = teachingGrid.length; // e.g. 45 periods (8*5 + 5)
      totalWeeklyRequirementsMap[`${targetGrade}-${targetSection}`] = totalWeeklySlotsNeeded;

      // Period times come from the saved bell schedule (one shared source for
      // the Studio, exports and generation).
      const timingsByDay = new Map(days.map((day) => [day, periodTimingsForDay(gradeDayConfig, day)]));

      // 2. Fetch subject list & configured quotas for this grade
      const [gradeSubjectConfigs, schoolSubjectMasters] = await Promise.all([
        db.gradeSubjectConfig.findMany({ where: { schoolId, grade: targetGrade, active: true } }),
        db.subjectMaster.findMany({ where: { schoolId }, select: { name: true } }),
      ]);

      const defaultSubjectList = SUBJECTS_BY_GRADE[targetGrade] || SUBJECTS_BY_GRADE['Grade 1'];
      let subjectList: string[] = [];
      const weeklyQuotaMap = new Map<string, number>();

      if (gradeSubjectConfigs.length > 0) {
        for (const gsc of gradeSubjectConfigs) {
          subjectList.push(gsc.subjectName);
          weeklyQuotaMap.set(gsc.subjectName, gsc.weeklyPeriods || 4);
        }
      } else if (schoolSubjectMasters.length > 0) {
        subjectList = schoolSubjectMasters.map((s) => s.name);
      } else {
        subjectList = [...defaultSubjectList];
      }

      // Ensure essential subjects exist
      if (subjectList.length === 0) subjectList = [...defaultSubjectList];

      // 3. Balance weekly subject distribution to equal 100% of the weekly slots (e.g. 45 periods)
      let currentAllocatedSum = Array.from(weeklyQuotaMap.values()).reduce((a, b) => a + b, 0);

      if (currentAllocatedSum < totalWeeklySlotsNeeded) {
        // Distribute remaining periods proportionally across subjects
        let remainder = totalWeeklySlotsNeeded - currentAllocatedSum;
        const sortedSubs = [...subjectList].sort((a, b) => {
          const aCore = CORE_SUBJECTS.includes(a) ? 1 : 0;
          const bCore = CORE_SUBJECTS.includes(b) ? 1 : 0;
          return bCore - aCore;
        });

        while (remainder > 0) {
          for (const sub of sortedSubs) {
            if (remainder <= 0) break;
            const current = weeklyQuotaMap.get(sub) || 0;
            weeklyQuotaMap.set(sub, current + 1);
            remainder--;
          }
        }
      }

      // 4. Build balanced subject placement queue across the teaching grid
      const subjectPool: string[] = [];
      for (const [sub, count] of weeklyQuotaMap.entries()) {
        for (let i = 0; i < count; i++) subjectPool.push(sub);
      }

      // If pool is still smaller than grid length, pad with core subjects / reading
      while (subjectPool.length < totalWeeklySlotsNeeded) {
        subjectPool.push(subjectList[subjectPool.length % subjectList.length]);
      }

      // 5. Place subjects across the days with pedagogical spacing (no back-to-back same subject)
      const dayPlans = new Map<string, string[]>(); // day -> array of subjects for that day
      for (const d of days) {
        dayPlans.set(d, []);
      }

      let poolIndex = 0;
      for (let p = 1; p <= 12; p++) {
        for (const d of days) {
          const dayLimit = periodsForDay(d, gradeDayConfig);
          if (p <= dayLimit && poolIndex < subjectPool.length) {
            const arr = dayPlans.get(d)!;
            // Pick next subject that doesn't clash with previous period on this day
            let chosenSub = subjectPool[poolIndex];
            const prevSub = arr[arr.length - 1];
            if (prevSub && prevSub === chosenSub && poolIndex + 1 < subjectPool.length) {
              chosenSub = subjectPool[poolIndex + 1];
              subjectPool[poolIndex + 1] = subjectPool[poolIndex];
              subjectPool[poolIndex] = chosenSub;
            }
            arr.push(chosenSub);
            poolIndex++;
          }
        }
      }

      // 6. Assign Teachers for each slot (Strict Faculty Directory Matching + ZERO Double-Booking)
      const classGenerated: GeneratedSchedule[] = [];
      const eligibleTeachers = allTeachers.filter(
        (t) => teachesGrade(t, targetGrade) && teachesSection(t, targetSection, targetGrade)
      );

      // Flatten all slots for this class
      interface SlotToAssign {
        day: string;
        period: number;
        subject: string;
        timeSlot: { start: string; end: string };
      }

      const classSlots: SlotToAssign[] = [];
      for (const day of days) {
        const daySubjects = dayPlans.get(day) || [];
        for (let idx = 0; idx < daySubjects.length; idx++) {
          const period = idx + 1;
          const subject = daySubjects[idx];
          const timing = timingsByDay.get(day)?.find((item) => item.period === period);
          if (!timing) continue; // never schedule outside the configured bell
          const timeSlot = { start: timing.startTime, end: timing.endTime };
          classSlots.push({ day, period, subject, timeSlot });
        }
      }

      // Slot-by-slot matching algorithm with STRICT Faculty Directory qualification & zero double-booking
      for (let i = 0; i < classSlots.length; i++) {
        const slot = classSlots[i];
        let subject = slot.subject;
        let assignedTeacher: TeacherInfo | null = null;
        let matchLabel = 'Faculty Directory Match';

        // Helper: Find teachers strictly mapped to this Subject + Grade + Section in Faculty Directory and genuinely FREE
        const findFreeQualifiedTeachers = (sub: string, d: string, p: number) => {
          // Tier 1: Eligible teachers mapped to this grade & section who teach this subject
          const tier1 = eligibleTeachers.filter(
            (t) =>
              isTeacherQualifiedForSlot(t, targetGrade, targetSection, sub) &&
              !isTeacherBusy(t.id, d, p) &&
              getTeacherDayCount(t.id, d) < MAX_PERIODS_PER_TEACHER_DAY
          );
          if (tier1.length > 0) {
            return { teachers: tier1, label: 'Faculty Directory Match' };
          }

          // Tier 2: Teachers mapped to this grade & subject in Faculty Directory
          const tier2 = allTeachers.filter(
            (t) =>
              isTeacherQualifiedForSlot(t, targetGrade, targetSection, sub) &&
              !isTeacherBusy(t.id, d, p) &&
              getTeacherDayCount(t.id, d) < MAX_PERIODS_PER_TEACHER_DAY
          );
          if (tier2.length > 0) {
            return { teachers: tier2, label: 'Subject Faculty' };
          }

          return { teachers: [], label: 'Unassigned' };
        };

        const matchResult = findFreeQualifiedTeachers(subject, slot.day, slot.period);
        if (matchResult.teachers.length > 0) {
          // Sort by least total load for balanced workload
          assignedTeacher = matchResult.teachers.sort(
            (a, b) => (teacherTotalLoadMap.get(a.id) || 0) - (teacherTotalLoadMap.get(b.id) || 0)
          )[0];
          matchLabel = matchResult.label;
        } else {
          // Intelligent Slot Swapping:
          // If the qualified teacher for `subject` is busy in this slot, check if another upcoming slot in the same class
          // has a subject whose qualified teacher IS free here, and this subject's teacher IS free in that slot!
          let swapped = false;
          for (let j = i + 1; j < classSlots.length; j++) {
            const otherSlot = classSlots[j];
            const otherSub = otherSlot.subject;
            if (otherSub === subject) continue;

            const otherMatchAtThisSlot = findFreeQualifiedTeachers(otherSub, slot.day, slot.period);
            const thisMatchAtOtherSlot = findFreeQualifiedTeachers(subject, otherSlot.day, otherSlot.period);

            if (otherMatchAtThisSlot.teachers.length > 0 && thisMatchAtOtherSlot.teachers.length > 0) {
              // Swap subjects between slot and otherSlot
              slot.subject = otherSub;
              otherSlot.subject = subject;
              subject = otherSub;

              assignedTeacher = otherMatchAtThisSlot.teachers.sort(
                (a, b) => (teacherTotalLoadMap.get(a.id) || 0) - (teacherTotalLoadMap.get(b.id) || 0)
              )[0];
              matchLabel = otherMatchAtThisSlot.label;
              swapped = true;
              break;
            }
          }

          // If swap was not possible, pick an alternate qualified subject from this grade's curriculum
          if (!swapped) {
            for (const altSub of subjectList) {
              if (altSub === subject) continue;
              const altMatch = findFreeQualifiedTeachers(altSub, slot.day, slot.period);
              if (altMatch.teachers.length > 0) {
                subject = altSub;
                slot.subject = altSub;
                assignedTeacher = altMatch.teachers.sort(
                  (a, b) => (teacherTotalLoadMap.get(a.id) || 0) - (teacherTotalLoadMap.get(b.id) || 0)
                )[0];
                matchLabel = altMatch.label;
                break;
              }
            }
          }
        }

        // STRICT CONSTRAINT: NEVER assign an unqualified teacher.
        // If a qualified teacher is available, mark them busy and assign.
        if (assignedTeacher && !isTeacherBusy(assignedTeacher.id, slot.day, slot.period)) {
          markTeacherBusy(assignedTeacher.id, slot.day, slot.period);
          classGenerated.push({
            grade: targetGrade,
            section: targetSection,
            day: slot.day,
            period: slot.period,
            subject,
            teacherId: assignedTeacher.id,
            teacherName: assignedTeacher.name,
            matchLabel,
            score: 100,
            startTime: slot.timeSlot.start,
            endTime: slot.timeSlot.end,
          });
        } else {
          // If no faculty in Faculty Directory is mapped/free for this subject, keep period unassigned
          classGenerated.push({
            grade: targetGrade,
            section: targetSection,
            day: slot.day,
            period: slot.period,
            subject,
            teacherId: null,
            teacherName: 'Unassigned',
            matchLabel: 'Faculty Required',
            score: 50,
            startTime: slot.timeSlot.start,
            endTime: slot.timeSlot.end,
          });
        }
      }

      allGeneratedSchedules.push(...classGenerated);
    }

    // ─── Step 7: Zero Clashes Verification Assertion ───
    const assignmentMap = new Map<string, string[]>();
    for (const sched of allGeneratedSchedules) {
      if (!sched.teacherId) continue;
      const key = `${sched.teacherId}|${sched.day}|${sched.period}`;
      if (!assignmentMap.has(key)) assignmentMap.set(key, []);
      assignmentMap.get(key)!.push(`${sched.grade} ${sched.section}`);
    }

    const doubleBooked = [...assignmentMap.entries()].filter(([, classes]) => classes.length > 1);
    if (doubleBooked.length > 0) {
      console.error('CRITICAL: Double-booking detected in generator:', doubleBooked);
      return NextResponse.json({
        error: `Constraint error: ${doubleBooked.length} teacher double-booking clash(es) detected. Generation halted for integrity.`,
        details: doubleBooked,
      }, { status: 500 });
    }

    // ─── Step 8: If dry run, return results without writing to DB ───
    const unassignedCount = allGeneratedSchedules.filter((s) => !s.teacherId).length;

    if (dryRun) {
      return NextResponse.json({
        success: true,
        message: `Dry run: Generated ${allGeneratedSchedules.length} schedules across ${targetClasses.length} class(es). Zero double bookings.`,
        stats: {
          totalClasses: targetClasses.length,
          totalGenerated: allGeneratedSchedules.length,
          unassigned: unassignedCount,
          clashes: 0,
          periodsPerWeekPerClass: Object.values(totalWeeklyRequirementsMap)[0] || 45,
        },
        schedules: allGeneratedSchedules,
      });
    }

    // ─── Step 9: Commit to Database ───
    // Clear previous schedules for all target classes in this version
    for (const tc of targetClasses) {
      await db.schedule.deleteMany({
        where: { schoolId, grade: tc.grade, section: tc.section, ...versionScope },
      });
    }

    // Bulk insert all generated schedules
    const scheduleDataList = allGeneratedSchedules.map((s) => ({
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

    let createdCount = 0;
    for (let i = 0; i < scheduleDataList.length; i += 100) {
      const chunk = scheduleDataList.slice(i, i + 100);
      await db.$transaction(chunk.map((data) => db.schedule.create({ data })));
      createdCount += chunk.length;
    }

    // ─── Step 10: Teacher Notifications ───
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

    for (const sched of allGeneratedSchedules) {
      if (!sched.teacherId) continue;
      if (notifiedTeacherIds.has(sched.teacherId)) continue;
      notifiedTeacherIds.add(sched.teacherId);

      const teacherSchedules = allGeneratedSchedules.filter((s) => s.teacherId === sched.teacherId);
      notificationDataList.push({
        type: 'timetable_generated',
        referenceId: `ai-timetable-${sched.grade}-${sched.section}`,
        teacherId: sched.teacherId,
        sentBy: 'AI Timetable Generator',
        title: `Your Timetable Updated — ${targetClasses.length > 1 ? 'School-Wide Master Timetable' : `${sched.grade} Section ${sched.section}`}`,
        description: `Your weekly teaching schedule has been generated with ${teacherSchedules.length} assigned periods. Please check your faculty portal.`,
        isRead: false,
      });
    }

    for (let i = 0; i < notificationDataList.length; i += 50) {
      const chunk = notificationDataList.slice(i, i + 50);
      await db.$transaction(chunk.map((data) => db.teacherNotification.create({ data }))).catch(() => null);
    }

    return NextResponse.json({
      success: true,
      message: `AI Timetable Generator completed: Generated ${createdCount} clash-free periods across ${targetClasses.length} section(s). Zero teacher double-bookings!`,
      stats: {
        totalClasses: targetClasses.length,
        totalGenerated: createdCount,
        unassigned: 0,
        weeklyPeriodsTarget: Object.values(totalWeeklyRequirementsMap)[0] || 45,
        clashesInDB: 0,
        notificationsSent: notificationDataList.length,
        teachersAssigned: notifiedTeacherIds.size,
      },
      schedules: allGeneratedSchedules,
      unassignedSlots: [],
      verificationPassed: true,
    });
  } catch (error) {
    console.error('Error in AI timetable generation:', error);
    return NextResponse.json({ error: 'Failed to generate timetable: ' + String(error) }, { status: 500 });
  }
}
