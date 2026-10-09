import type { AuditInput } from '@/lib/timetable-audit';
import type { SolverInput, SolverResult } from '@/lib/solver/types';

/**
 * Presents a solver result to the independent validator (timetable-audit).
 * Only the data is translated; every rule is re-checked there.
 */
export function toAuditInput(input: SolverInput, result: SolverResult, rooms?: AuditInput['rooms']): AuditInput {
  const classByKey = new Map(input.classes.map((c) => [c.key, c]));
  const periodsByGrade: AuditInput['periodsByGrade'] = {};
  for (const cls of input.classes) periodsByGrade[cls.grade] = Object.fromEntries(cls.days.map((d) => [d.day, d.periods]));
  return {
    slots: result.lessons.map((lesson, index) => {
      const cls = classByKey.get(lesson.classKey)!;
      return { id: `sim-${index}`, grade: cls.grade, section: cls.section, day: lesson.day, period: lesson.period, subject: lesson.subject, teacherId: lesson.teacherId, roomId: lesson.roomId };
    }),
    sections: input.classes.map((c) => ({ grade: c.grade, section: c.section })),
    subjectRules: input.requirements.map((r) => ({
      grade: classByKey.get(r.classKey)!.grade,
      subjectName: r.subject,
      weeklyPeriods: r.weeklyPeriods,
      maxPeriodsPerDay: r.maxPerDay,
      allowConsecutive: r.allowConsecutive,
      requiredRoomType: r.requiredRoomType,
      active: true,
    })),
    teachers: input.teachers.map((t) => ({
      ...t,
      limitSource: t.maxWeekly !== null || t.maxDaily !== null || t.maxConsecutive !== null ? 'personal' as const : 'missing' as const,
    })),
    rooms: rooms ?? input.rooms.map((r) => ({ id: r.id, name: r.id, type: r.type })),
    periodsByGrade,
  };
}
