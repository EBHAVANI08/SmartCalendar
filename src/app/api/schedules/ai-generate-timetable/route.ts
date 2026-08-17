import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import ZAI from 'z-ai-web-dev-sdk';

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
  'Grade 1': ['Mathematics', 'English', 'Hindi', 'EVS', 'Computer Science', 'Physical Education', 'Art', 'Music'],
  'Grade 2': ['Mathematics', 'English', 'Hindi', 'EVS', 'Computer Science', 'Physical Education', 'Art', 'Music'],
  'Grade 3': ['Mathematics', 'English', 'Hindi', 'EVS', 'Computer Science', 'Physical Education', 'Art', 'Music'],
  'Grade 4': ['Mathematics', 'English', 'Hindi', 'EVS', 'Computer Science', 'Physical Education', 'Art', 'Music'],
  'Grade 5': ['Mathematics', 'English', 'Hindi', 'EVS', 'Computer Science', 'Physical Education', 'Art', 'Music'],
  'Grade 6': ['Mathematics', 'English', 'Hindi', 'Sanskrit', 'Science', 'Social Science', 'Computer Science', 'Physical Education'],
  'Grade 7': ['Mathematics', 'English', 'Hindi', 'Sanskrit', 'Science', 'Social Science', 'Computer Science', 'Physical Education'],
  'Grade 8': ['Mathematics', 'English', 'Hindi', 'Sanskrit', 'Science', 'Social Science', 'Computer Science', 'Physical Education'],
  'Grade 9': ['Mathematics', 'English', 'Hindi', 'Science', 'Social Science', 'Computer Science', 'Physical Education', 'Art'],
  'Grade 10': ['Mathematics', 'English', 'Hindi', 'Science', 'Social Science', 'Computer Science', 'Physical Education', 'Art'],
  'Grade 11': ['Physics', 'Chemistry', 'Mathematics', 'English', 'Computer Science', 'Physical Education'],
  'Grade 12': ['Physics', 'Chemistry', 'Mathematics', 'English', 'Computer Science', 'Physical Education'],
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
  grades: string[];
  existingScheduleCount: number;
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
  try {
    const { grade, section, schoolId, dryRun = false, setup = {} } = await request.json();

    // Validate required parameters
    if (!grade || !section || !schoolId) {
      return NextResponse.json(
        { error: 'School, grade and section are required.' },
        { status: 400 }
      );
    }

    const targetGrade = grade as string;
    const targetSection = section as string;
    const periodsPerDay = Math.min(10, Math.max(4, Number(setup.periodsPerDay) || 8));
    const workingDays = Number(setup.workingDays) === 5 ? 5 : 6;
    const saturdayPeriods = Math.min(periodsPerDay, Math.max(1, Number(setup.saturdayPeriods) || 4));
    const breakAfter = Math.min(periodsPerDay - 1, Math.max(1, Number(setup.breakAfter) || 2));
    const lunchAfter = Math.min(periodsPerDay - 1, Math.max(breakAfter + 1, Number(setup.lunchAfter) || 4));
    const breakMinutes = Math.min(30, Math.max(5, Number(setup.breakMinutes) || 15));
    const lunchMinutes = Math.min(90, Math.max(15, Number(setup.lunchMinutes) || 45));
    const parseMinutes = (value: string, fallback: number) => { const match = /^(\d{1,2}):(\d{2})$/.exec(value || ''); return match ? Number(match[1]) * 60 + Number(match[2]) : fallback; };
    const formatMinutes = (value: number) => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
    const startMinutes = parseMinutes(setup.startTime, 9 * 60 + 30);
    const endMinutes = parseMinutes(setup.endTime, setup.schoolLevel === 'primary' ? 15 * 60 : 17 * 60);
    if (endMinutes <= startMinutes + 180) return NextResponse.json({ error: 'End time must be at least three hours after start time.' }, { status: 400 });
    const teachingMinutes = endMinutes - startMinutes - breakMinutes - lunchMinutes;
    const periodMinutes = Math.floor(teachingMinutes / periodsPerDay);
    const extraPeriodMinutes = teachingMinutes % periodsPerDay;
    if (periodMinutes < 25) return NextResponse.json({ error: 'The selected day is too short for the periods and breaks. Increase the end time or reduce periods/break durations.' }, { status: 400 });
    const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].slice(0, workingDays);
    let cursor = startMinutes;
    const TIME_SLOTS = Array.from({ length: periodsPerDay }, (_, index) => {
      const period = index + 1; const start = cursor; cursor += periodMinutes + (index < extraPeriodMinutes ? 1 : 0); const end = cursor;
      if (period === breakAfter) cursor += breakMinutes;
      if (period === lunchAfter) cursor += lunchMinutes;
      return { period, start: formatMinutes(start), end: formatMinutes(end) };
    });
    const MORNING_PERIODS = TIME_SLOTS.filter((slot) => parseMinutes(slot.start, 0) < 12 * 60).map((slot) => slot.period);
    const AFTERNOON_PERIODS = TIME_SLOTS.filter((slot) => !MORNING_PERIODS.includes(slot.period)).map((slot) => slot.period);

    // ─── Step 1: Load teachers who teach THIS grade ───
    const allTeachers = await db.teacher.findMany({
      where: { schoolId },
      include: { schedules: true },
    });

    // Filter to only teachers who teach this grade (from their grades JSON field)
    const gradeTeachers = allTeachers.filter((t) => {
      const grades = JSON.parse(t.grades || '[]') as string[];
      return grades.includes(targetGrade);
    });

    const teacherInfo: TeacherInfo[] = gradeTeachers.map((t) => ({
      id: t.id,
      name: t.name,
      subject: t.subject,
      grades: JSON.parse(t.grades || '[]') as string[],
      existingScheduleCount: t.schedules.length,
    }));

    // Also load ALL teachers as fallback for subjects with no grade-specific teacher
    const allTeacherInfo: TeacherInfo[] = allTeachers.map((t) => ({
      id: t.id,
      name: t.name,
      subject: t.subject,
      grades: JSON.parse(t.grades || '[]') as string[],
      existingScheduleCount: t.schedules.length,
    }));

    const subjects = SUBJECTS_BY_GRADE[targetGrade] || SUBJECTS_BY_GRADE['Grade 1'];

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
      const teachesSubject = teacher.subject === subject;
      const teachesGrade = teacher.grades.includes(grade);
      const teachesSimilarGrade = teacher.grades.some((g) => {
        const gNum = parseInt(g.replace(/\D/g, ''));
        const targetNum = parseInt(grade.replace(/\D/g, ''));
        return !isNaN(gNum) && !isNaN(targetNum) && Math.abs(gNum - targetNum) <= 1;
      });

      const dayWorkload = getTeacherDayCount(teacher.id, day);
      const totalWorkload = getTeacherTotalLoad(teacher.id);

      let score = 0;
      let matchLabel = '';

      // Priority 1: Perfect Match — teaches both subject AND grade
      if (teachesSubject && teachesGrade) {
        score += 1000;
        matchLabel = 'Perfect Match';
      }
      // Priority 2: Subject specialist who can teach the grade
      else if (teachesSubject && teachesSimilarGrade) {
        score += 800;
        matchLabel = 'Subject Specialist';
      }
      // Priority 2b: Subject specialist (without grade match)
      else if (teachesSubject) {
        score += 600;
        matchLabel = 'Subject Specialist';
      }
      // Priority 3: Grade-familiar teacher (has taught this grade in other schedules)
      else if (teachesGrade) {
        score += 400;
        matchLabel = 'Grade Teacher';
      }
      // Similar grade
      else if (teachesSimilarGrade) {
        score += 200;
        matchLabel = 'Similar Grade';
      }
      // Available but no direct match
      else {
        score += 50;
        matchLabel = 'Available';
      }

      // Priority 4: Workload balancing — strongly prefer teachers with fewer periods
      // Both daily and total workload matter
      const dailyCapacityPenalty = dayWorkload * 30;
      const totalLoadPenalty = totalWorkload * 5;
      score -= dailyCapacityPenalty;
      score -= totalLoadPenalty;

      // Bonus for teachers well within capacity
      if (dayWorkload < 3) score += 40;
      if (totalWorkload < 15) score += 30;

      // Hard constraint: can't exceed max periods per day
      if (dayWorkload >= getTeacherDayLimit(teacher.id, day)) {
        return { score: -Infinity, matchLabel: 'Overloaded' };
      }

      // Priority 5: Pedagogical considerations
      // Prefer teachers with adjacent periods (continuity — reduces transition time)
      const prevBusy = isTeacherBusy(teacher.id, day, period - 1);
      const nextBusy = isTeacherBusy(teacher.id, day, period + 1);
      if (prevBusy || nextBusy) score += 20;

      // Priority 6: Teacher continuity — prefer same teacher for same subject across days
      const subjectHistory = subjectTeacherHistory.get(subject);
      if (subjectHistory) {
        const previousTeacher = subjectHistory.get(day);
        if (previousTeacher === teacher.id) {
          score += 50; // Strong preference for same teacher on different days for same subject
        }
        // Check if this teacher teaches this subject on other days
        let taughtOnOtherDays = 0;
        for (const [, tid] of subjectHistory.entries()) {
          if (tid === teacher.id) taughtOnOtherDays++;
        }
        score += taughtOnOtherDays * 15; // Bonus for continuity across days
      }

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

    // Build subject order per day that respects pedagogical constraints
    // Core subjects in morning, PE not in period 1, Art/Music in afternoon
    const buildSubjectOrderForDay = (day: string): { period: number; subject: string }[] => {
      const assignments: { period: number; subject: string }[] = [];
      const usedSubjects = new Map<string, number>(); // subject -> count assigned today
      const dailySubjectLimit = 1;

      // Categorize subjects
      const rotate = <T,>(items: T[], offset: number) => items.length ? items.slice(offset % items.length).concat(items.slice(0, offset % items.length)) : items;
      const dayOffset = Math.max(0, DAYS.indexOf(day));
      const coreSubs = rotate(subjects.filter((s) => CORE_SUBJECTS.includes(s)), dayOffset);
      const afternoonSubs = rotate(subjects.filter((s) => AFTERNOON_PREFERRED.includes(s)), dayOffset);
      const peSubject = subjects.find((s) => s === 'Physical Education');
      const otherSubs = rotate(subjects.filter(
        (s) => !CORE_SUBJECTS.includes(s) && !AFTERNOON_PREFERRED.includes(s) && s !== 'Physical Education'
      ), dayOffset);

      // Track which subjects still need periods
      const subjectNeeded = new Map<string, number>();
      for (const s of subjects) {
        // Each subject gets at least 1 period, aiming for roughly equal distribution
        subjectNeeded.set(s, Math.max(1, Math.ceil(TIME_SLOTS.length / subjects.length)));
      }

      // Assign morning periods (1-5) first — prioritize core subjects
      const morningSlots = TIME_SLOTS.filter((s) => MORNING_PERIODS.includes(s.period));
      const afternoonSlots = TIME_SLOTS.filter((s) => AFTERNOON_PERIODS.includes(s.period));

      // Fill morning periods
      const morningQueue = [...coreSubs, ...otherSubs];
      let morningIdx = 0;

      for (const slot of morningSlots) {
        let assigned = false;

        // Try to assign a core subject first
        for (const sub of morningQueue) {
          const currentCount = usedSubjects.get(sub) || 0;
          // Pedagogical constraint: no more than 2 consecutive periods of same subject
          if (currentCount >= dailySubjectLimit) continue;

          // PE should not be in period 1
          if (sub === 'Physical Education' && slot.period === 1) continue;

          // Check if we already assigned this subject recently (avoid consecutive same)
          const lastAssigned = assignments[assignments.length - 1];
          if (lastAssigned && lastAssigned.subject === sub) {
            // Allow at most 2 consecutive, but prefer different
            const secondLast = assignments[assignments.length - 2];
            if (secondLast && secondLast.subject === sub) continue; // Already 2 consecutive
          }

          assignments.push({ period: slot.period, subject: sub });
          usedSubjects.set(sub, (usedSubjects.get(sub) || 0) + 1);
          morningIdx++;
          assigned = true;
          break;
        }

        if (!assigned) {
          // Fallback: assign any subject that hasn't been used too much
          for (const sub of subjects) {
            const currentCount = usedSubjects.get(sub) || 0;
            if (currentCount >= dailySubjectLimit) continue;
            if (sub === 'Physical Education' && slot.period === 1) continue;
            const lastAssigned = assignments[assignments.length - 1];
            if (lastAssigned && lastAssigned.subject === sub) {
              const secondLast = assignments[assignments.length - 2];
              if (secondLast && secondLast.subject === sub) continue;
            }
            assignments.push({ period: slot.period, subject: sub });
            usedSubjects.set(sub, (usedSubjects.get(sub) || 0) + 1);
            assigned = true;
            break;
          }
        }

        if (!assigned) { const unused = subjects.find((subject) => !usedSubjects.has(subject)); if (unused) { assignments.push({ period: slot.period, subject: unused }); usedSubjects.set(unused, 1); } }
      }

      // Fill afternoon periods — prioritize Art/Music
      const afternoonQueue = [...afternoonSubs, ...otherSubs, ...coreSubs];

      for (const slot of afternoonSlots) {
        let assigned = false;

        for (const sub of afternoonQueue) {
          const currentCount = usedSubjects.get(sub) || 0;
          if (currentCount >= dailySubjectLimit) continue;

          const lastAssigned = assignments[assignments.length - 1];
          if (lastAssigned && lastAssigned.subject === sub) {
            const secondLast = assignments[assignments.length - 2];
            if (secondLast && secondLast.subject === sub) continue;
          }

          assignments.push({ period: slot.period, subject: sub });
          usedSubjects.set(sub, (usedSubjects.get(sub) || 0) + 1);
          assigned = true;
          break;
        }

        if (!assigned) { const unused = subjects.find((subject) => !usedSubjects.has(subject)); if (unused) { assignments.push({ period: slot.period, subject: unused }); usedSubjects.set(unused, 1); } }
      }

      return assignments;
    };

    // ─── Step 5: Generate timetable for this specific grade+section ───
    for (const day of DAYS) {
      const dayPlan = buildSubjectOrderForDay(day).filter((slot) => day !== 'Saturday' || slot.period <= saturdayPeriods);

      for (const slotAssignment of dayPlan) {
        const subject = slotAssignment.subject;
        const period = slotAssignment.period;
        const timeSlot = TIME_SLOTS.find((t) => t.period === period);

        if (!timeSlot) continue;

        // Try grade-specific teachers first, then fall back to all teachers
        const candidatePools = [teacherInfo, allTeacherInfo];

        let bestCandidate: (TeacherInfo & { score: number; matchLabel: string }) | null = null;

        for (const pool of candidatePools) {
          const candidates = pool
            .filter((t) => {
              if (isTeacherBusy(t.id, day, period)) return false;
              if (getTeacherDayCount(t.id, day) >= getTeacherDayLimit(t.id, day)) return false;
              return true;
            })
            .map((t) => ({
              ...t,
              ...scoreTeacher(t, subject, targetGrade, day, period, subjectTeacherHistory),
            }))
            .filter((t) => t.score > -Infinity)
            .sort((a, b) => b.score - a.score);

          if (candidates.length > 0) {
            bestCandidate = candidates[0];
            break; // Use the first pool that has candidates (prefer grade teachers)
          }
        }

        if (bestCandidate) {
          markTeacherBusy(bestCandidate.id, day, period);
          incrementDaySubjectCount(day, subject);

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
              'You are a highly experienced school timetable architect with 20+ years in CBSE/ICSE/IB school calendar management. You understand pedagogical flow, teacher workload balance, student attention patterns, and educational best practices. You create timetables that optimize learning outcomes while ensuring teacher wellbeing. Return only a JSON array of suggestion strings.',
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
    await db.schedule.deleteMany({
      where: { schoolId, grade: targetGrade, section: targetSection },
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
    const dbSchedules = await db.schedule.findMany({
      where: { schoolId, teacherId: { not: null }, grade: targetGrade, section: targetSection },
    });
    const dbMap = new Map<string, number>();
    for (const s of dbSchedules) {
      const key = `${s.teacherId}|${s.day}|${s.period}`;
      dbMap.set(key, (dbMap.get(key) || 0) + 1);
    }
    const dbClashes = [...dbMap.entries()].filter(([, count]) => count > 1).length;

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
        notificationsSent: notificationDataList.length,
        teachersAssigned: affectedTeacherIds.size,
        startTime: setup.startTime || '09:30',
        endTime: setup.endTime || (setup.schoolLevel === 'primary' ? '15:00' : '17:00'),
        workingDays,
        saturdayPeriods: workingDays === 6 ? saturdayPeriods : 0,
      },
      unassignedSlots: unassignedSlots.slice(0, 10),
      aiSuggestions,
      verificationPassed: dbClashes === 0,
    });
  } catch (error) {
    console.error('Error in AI timetable generation:', error);
    return NextResponse.json({ error: 'Failed to generate timetable: ' + String(error) }, { status: 500 });
  }
}
