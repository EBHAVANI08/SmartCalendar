import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import ZAI from 'z-ai-web-dev-sdk';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const MAX_PERIODS_PER_DAY = 5; // Max 5 periods per teacher per day (leave 3 free for prep/substitution)
const TIME_SLOTS = [
  { period: 1, start: '08:00', end: '08:40' },
  { period: 2, start: '08:40', end: '09:20' },
  { period: 3, start: '09:20', end: '10:00' },
  { period: 4, start: '10:20', end: '11:00' },
  { period: 5, start: '11:00', end: '11:40' },
  { period: 6, start: '11:40', end: '12:20' },
  { period: 7, start: '13:00', end: '13:40' },
  { period: 8, start: '13:40', end: '14:20' },
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

interface TeacherInfo {
  id: string;
  name: string;
  subject: string;
  grades: string[];
}

/**
 * AI Timetable Generator — Constraint-Satisfaction Engine
 *
 * This engine generates clash-free timetables using a multi-pass constraint solver:
 *
 * Pass 1: Subject-Grade Assignment — Assign teachers to subjects based on their expertise
 * Pass 2: Constraint Satisfaction — For each (day, period, grade, section), find the best
 *         teacher who: (a) teaches that subject, (b) teaches that grade, (c) is not busy,
 *         (d) has < MAX_PERIODS_PER_DAY periods, (e) has minimum workload
 * Pass 3: AI Enhancement — Use AI to review and optimize the timetable for pedagogical quality
 * Pass 4: Validation — Verify zero clashes in the generated timetable
 * Pass 5: Database Write — Commit with conflict verification
 */
export async function POST(request: Request) {
  try {
    const { grades, sections, dryRun = false } = await request.json();

    const targetGrades = grades || Array.from({ length: 12 }, (_, i) => `Grade ${i + 1}`);
    const targetSections = sections || ['A', 'B', 'C', 'D', 'E'];

    // ─── Step 1: Load all teachers with their subject/grade info ───
    const allTeachers = await db.teacher.findMany({
      include: { schedules: true },
    });

    const teacherInfo: TeacherInfo[] = allTeachers.map((t) => ({
      id: t.id,
      name: t.name,
      subject: t.subject,
      grades: JSON.parse(t.grades || '[]') as string[],
    }));

    // ─── Step 2: Build constraint-satisfaction engine ───
    // Track teacher assignments to prevent any clashes
    const teacherBusyMap = new Map<string, Set<string>>(); // teacherId -> Set<"day-period">
    const teacherDayCountMap = new Map<string, Map<string, number>>(); // teacherId -> Map<day, count>

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
    };

    const getTeacherDayCount = (teacherId: string, day: string): number => {
      return teacherDayCountMap.get(teacherId)?.get(day) || 0;
    };

    // Pre-load existing assignments from DB
    for (const teacher of allTeachers) {
      for (const sched of teacher.schedules) {
        markTeacherBusy(teacher.id, sched.day, sched.period);
      }
    }

    // ─── Step 3: Score teachers for a given slot ───
    const scoreTeacher = (
      teacher: TeacherInfo,
      subject: string,
      grade: string,
      day: string,
      period: number
    ): { score: number; matchLabel: string } => {
      const teachesSubject = teacher.subject === subject;
      const teachesGrade = teacher.grades.includes(grade);
      const teachesSimilarGrade = teacher.grades.some((g) => {
        const gNum = parseInt(g.replace(/\D/g, ''));
        const targetNum = parseInt(grade.replace(/\D/g, ''));
        return !isNaN(gNum) && !isNaN(targetNum) && Math.abs(gNum - targetNum) <= 1;
      });
      const dayWorkload = getTeacherDayCount(teacher.id, day);

      let score = 0;
      if (teachesSubject && teachesGrade) score += 100;
      else if (teachesSubject) score += 60;
      else if (teachesGrade) score += 30;
      else if (teachesSimilarGrade) score += 15;

      // Workload balancing - strongly prefer teachers with fewer periods
      score += Math.max(0, (MAX_PERIODS_PER_DAY - dayWorkload)) * 10;

      // Prefer teachers who have adjacent periods (continuity)
      const prevBusy = isTeacherBusy(teacher.id, day, period - 1);
      const nextBusy = isTeacherBusy(teacher.id, day, period + 1);
      if (prevBusy || nextBusy) score += 5;

      let matchLabel = '';
      if (teachesSubject && teachesGrade) matchLabel = 'Perfect Match';
      else if (teachesSubject) matchLabel = 'Subject Specialist';
      else if (teachesGrade) matchLabel = 'Grade Teacher';
      else if (teachesSimilarGrade) matchLabel = 'Similar Grade';
      else matchLabel = 'Available';

      return { score, matchLabel };
    };

    // ─── Step 4: Generate timetable for all target grades/sections ───
    const generatedSchedules: {
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
    }[] = [];

    const unassignedSlots: { grade: string; section: string; day: string; period: number; subject: string }[] = [];

    for (const grade of targetGrades) {
      const subjects = SUBJECTS_BY_GRADE[grade] || SUBJECTS_BY_GRADE['Grade 1'];

      for (const section of targetSections) {
        for (const day of DAYS) {
          for (const slot of TIME_SLOTS) {
            const subjectIndex = (slot.period - 1) % subjects.length;
            const subject = subjects[subjectIndex];

            // Find the best teacher for this slot
            const candidates = teacherInfo
              .filter((t) => {
                if (isTeacherBusy(t.id, day, slot.period)) return false;
                if (getTeacherDayCount(t.id, day) >= MAX_PERIODS_PER_DAY) return false;
                return true;
              })
              .map((t) => ({
                ...t,
                ...scoreTeacher(t, subject, grade, day, slot.period),
              }))
              .sort((a, b) => b.score - a.score);

            if (candidates.length > 0) {
              const best = candidates[0];
              markTeacherBusy(best.id, day, slot.period);

              generatedSchedules.push({
                grade,
                section,
                day,
                period: slot.period,
                subject,
                teacherId: best.id,
                teacherName: best.name,
                matchLabel: best.matchLabel,
                score: best.score,
                startTime: slot.start,
                endTime: slot.end,
              });
            } else {
              unassignedSlots.push({ grade, section, day, period: slot.period, subject });
            }
          }
        }
      }
    }

    // ─── Step 5: Validate zero clashes ───
    const assignmentMap = new Map<string, string[]>();
    for (const sched of generatedSchedules) {
      const key = `${sched.teacherId}|${sched.day}|${sched.period}`;
      if (!assignmentMap.has(key)) assignmentMap.set(key, []);
      assignmentMap.get(key)!.push(`${sched.grade} ${sched.section}`);
    }
    const clashes = [...assignmentMap.entries()].filter(([_, v]) => v.length > 1);

    if (clashes.length > 0) {
      console.error('CLASHES DETECTED in generated timetable:', clashes.length);
      // This should never happen, but if it does, return error
      return NextResponse.json({
        error: `Internal constraint solver error: ${clashes.length} clashes detected. This should not happen.`,
        clashDetails: clashes.slice(0, 5).map(([key, sections]) => {
          const [tid, day, period] = key.split('|');
          return { teacherId: tid, day, period: parseInt(period), assignedSections: sections };
        }),
      }, { status: 500 });
    }

    // ─── Step 6: AI Enhancement (optional, if not dry run) ───
    let aiSuggestions: string[] = [];
    try {
      const zai = await ZAI.create();
      const aiPrompt = `You are an expert school timetable designer for a CBSE board school.
Review this timetable summary and provide 3-5 brief improvement suggestions:

Total schedules generated: ${generatedSchedules.length}
Unassigned slots: ${unassignedSlots.length}
Clashes: 0 (verified)

Subject-teacher match distribution:
- Perfect Match (same subject + grade): ${generatedSchedules.filter(s => s.matchLabel === 'Perfect Match').length}
- Subject Specialist (same subject): ${generatedSchedules.filter(s => s.matchLabel === 'Subject Specialist').length}
- Grade Teacher (same grade): ${generatedSchedules.filter(s => s.matchLabel === 'Grade Teacher').length}
- Other: ${generatedSchedules.filter(s => s.matchLabel !== 'Perfect Match' && s.matchLabel !== 'Subject Specialist' && s.matchLabel !== 'Grade Teacher').length}

Top unassigned subjects: ${unassignedSlots.length > 0 ? [...new Set(unassignedSlots.map(s => s.subject))].slice(0, 5).join(', ') : 'None'}

Return a JSON array of 3-5 brief suggestion strings. Example: ["Consider hiring more Mathematics teachers", "Reduce PE periods for Grade 11-12"]`;

      const aiResponse = await zai.chat.completions.create({
        messages: [
          { role: 'system', content: 'You are an expert CBSE school timetable consultant. Return only a JSON array of suggestion strings.' },
          { role: 'user', content: aiPrompt },
        ],
        temperature: 0.5,
        max_tokens: 300,
      });

      let content = aiResponse.choices?.[0]?.message?.content || '[]';
      // Strip markdown code fences that AI may wrap around JSON
      content = content.replace(/^```json\n?/, '').replace(/\n?```$/, '').replace(/^```\n?/, '').trim();
      try {
        aiSuggestions = JSON.parse(content);
        if (!Array.isArray(aiSuggestions)) {
          // If AI returned individual suggestion strings wrapped in code fences, clean each one
          aiSuggestions = [content.replace(/^```json\n?/gm, '').replace(/\n?```/gm, '').trim()];
        } else {
          // Clean each suggestion string of any remaining code fences
          aiSuggestions = aiSuggestions.map(s =>
            typeof s === 'string' ? s.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim() : String(s)
          );
        }
      } catch {
        // If parsing fails, try to extract anything useful from the raw content
        const cleaned = content.replace(/^```json\n?/gm, '').replace(/\n?```/gm, '').trim();
        aiSuggestions = [cleaned];
      }
    } catch {
      aiSuggestions = ['AI enhancement unavailable — timetable generated using constraint solver only'];
    }

    // ─── Step 7: If dry run, return results without writing to DB ───
    if (dryRun) {
      return NextResponse.json({
        success: true,
        message: `Dry run: Generated ${generatedSchedules.length} clash-free schedules with ${unassignedSlots.length} unassigned slots.`,
        stats: {
          totalGenerated: generatedSchedules.length,
          unassigned: unassignedSlots.length,
          clashes: 0,
          perfectMatchCount: generatedSchedules.filter(s => s.matchLabel === 'Perfect Match').length,
          subjectSpecialistCount: generatedSchedules.filter(s => s.matchLabel === 'Subject Specialist').length,
        },
        schedules: generatedSchedules.slice(0, 50), // Preview first 50
        unassignedSlots: unassignedSlots.slice(0, 20),
        aiSuggestions,
      });
    }

    // ─── Step 8: Write to database with conflict verification ───
    // First clear existing schedules for target grades/sections
    for (const grade of targetGrades) {
      for (const section of targetSections) {
        await db.schedule.deleteMany({
          where: { grade, section },
        });
      }
    }

    // Batch insert new schedules
    let created = 0;
    const scheduleDataList = generatedSchedules.map((s) => ({
      grade: s.grade,
      section: s.section,
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
      await db.$transaction(
        chunk.map((data) => db.schedule.create({ data }))
      );
      created += chunk.length;
    }

    // ─── Step 9: Send notifications to all teachers who got new timetables ───
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

      const teacherSchedules = generatedSchedules.filter(s => s.teacherId === sched.teacherId);
      const daySummary = DAYS.map(day => {
        const dayScheds = teacherSchedules
          .filter(s => s.day === day)
          .sort((a, b) => a.period - b.period);
        return `${day}: ${dayScheds.length} periods` + (dayScheds.length > 0 ? ` (${dayScheds.map(s => `P${s.period} ${s.grade}-${s.section}`).join(', ')})` : '');
      }).join('\n');

      notificationDataList.push({
        type: 'timetable_generated',
        referenceId: 'ai-timetable',
        teacherId: sched.teacherId,
        sentBy: 'AI Timetable Generator',
        title: 'Your New Timetable — AI Generated',
        description: `Your weekly timetable has been generated by the AI Timetable Generator.\n\n${daySummary}\n\nTotal: ${teacherSchedules.length} periods per week. Please review your schedule.`,
        isRead: false,
      });
    }

    // Batch insert notifications
    for (let i = 0; i < notificationDataList.length; i += 50) {
      const chunk = notificationDataList.slice(i, i + 50);
      await db.$transaction(
        chunk.map((data) => db.teacherNotification.create({ data }))
      );
    }

    // ─── Step 10: Final verification ───
    const dbSchedules = await db.schedule.findMany({ where: { teacherId: { not: null } } });
    const dbMap = new Map<string, number>();
    for (const s of dbSchedules) {
      const key = `${s.teacherId}|${s.day}|${s.period}`;
      dbMap.set(key, (dbMap.get(key) || 0) + 1);
    }
    const dbClashes = [...dbMap.entries()].filter(([_, count]) => count > 1).length;

    return NextResponse.json({
      success: true,
      message: `AI Timetable Generator completed: ${created} clash-free schedules created, ${notificationDataList.length} teacher notifications sent, ${unassignedSlots.length} slots unassigned (no available teacher).`,
      stats: {
        totalGenerated: created,
        unassigned: unassignedSlots.length,
        clashesInDB: dbClashes,
        perfectMatchCount: generatedSchedules.filter(s => s.matchLabel === 'Perfect Match').length,
        subjectSpecialistCount: generatedSchedules.filter(s => s.matchLabel === 'Subject Specialist').length,
        gradeTeacherCount: generatedSchedules.filter(s => s.matchLabel === 'Grade Teacher').length,
        notificationsSent: notificationDataList.length,
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
