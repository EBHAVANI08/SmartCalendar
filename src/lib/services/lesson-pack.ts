/**
 * Lesson context for a substitute teacher.
 *
 * What a substitute needs before walking into a class they do not normally
 * teach: which class, which period, who they are covering, and what to actually
 * do for those 40 minutes.
 *
 * Three rules shape this:
 *
 *  1. A real LessonPlan written for that grade and subject always wins. AI is a
 *     fallback, not the default.
 *  2. Generated content is labelled as generated. The substitute must be able to
 *     tell a teacher's plan from a machine's suggestion.
 *  3. Nothing is invented. No student roster and no emergency contacts are
 *     fabricated - the previous version queried an orphaned `Student` model with
 *     no tenant scoping and filled empty topics with "Introduction to Chapter".
 */

import { db } from '@/lib/db';

export type LessonContextSource = 'lesson_plan' | 'ai_generated' | 'none';

export interface LessonContext {
  assignmentId: string;
  /** Where the teaching content came from, so the UI can label it honestly. */
  source: LessonContextSource;

  date: string;
  period: number;
  grade: string;
  section: string;
  subject: string;

  regularTeacher: { id: string; name: string; email: string } | null;
  substituteTeacher: { id: string; name: string; email: string } | null;

  /** Only present when the school actually recorded them. */
  topic: string | null;
  previousTopic: string | null;

  objectives: string[];
  warmUp: string | null;
  mainActivity: string | null;
  assessment: string | null;
  homework: string | null;
  resources: string[];
  keyVocabulary: string[];

  /** Set when nothing could be offered, so the UI explains rather than shows a blank card. */
  note: string | null;
}

const asList = (raw: string | null | undefined): string[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return raw.split(/[;\n]/).map((s) => s.trim()).filter(Boolean);
  }
};

/** Lesson plans store some sections as JSON, some as prose. Render either. */
const asText = (raw: string | null | undefined): string | null => {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return trimmed;
  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed === 'string') return parsed;
    if (Array.isArray(parsed)) return parsed.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join('\n');
    if (parsed && typeof parsed === 'object') {
      return Object.entries(parsed)
        .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
        .join('\n');
    }
    return trimmed;
  } catch {
    return trimmed;
  }
};

/**
 * Build the context for one substitution.
 *
 * `schoolId` is required and enforced against the absent teacher, so this can
 * never return another school's lesson material.
 */
export async function generateLessonPack(
  assignmentId: string,
  schoolId: string
): Promise<LessonContext | null> {
  const substitution = await db.substitution.findFirst({
    where: { id: assignmentId, schoolId, absentTeacher: { schoolId } },
    include: {
      absentTeacher: { select: { id: true, name: true, email: true } },
      substitute: { select: { id: true, name: true, email: true } },
    },
  });

  if (!substitution) return null;

  const base = {
    assignmentId,
    date: substitution.date,
    period: substitution.period,
    grade: substitution.grade,
    section: substitution.section,
    subject: substitution.subject,
    regularTeacher: substitution.absentTeacher ?? null,
    substituteTeacher: substitution.substitute ?? null,
    topic: substitution.todayTopic || null,
    previousTopic: substitution.yesterdayTopic || null,
  };

  // 1. A real plan for this class and subject, most recent first. Prefer one the
  //    absent teacher wrote, then any plan for the same grade + subject.
  const plan =
    (await db.lessonPlan.findFirst({
      where: {
        teacherId: substitution.absentTeacherId,
        grade: substitution.grade,
        subject: substitution.subject,
      },
      orderBy: { updatedAt: 'desc' },
    })) ??
    (await db.lessonPlan.findFirst({
      where: {
        grade: substitution.grade,
        subject: substitution.subject,
        teacher: { schoolId },
      },
      orderBy: { updatedAt: 'desc' },
    }));

  if (plan) {
    return {
      ...base,
      source: 'lesson_plan',
      topic: base.topic ?? plan.topic ?? null,
      objectives: asList(plan.objectives),
      warmUp: asText(plan.warmUp),
      mainActivity: asText(plan.mainContent),
      assessment: asText(plan.assessment),
      homework: asText(plan.homework),
      resources: asList(plan.resources),
      keyVocabulary: asList(plan.keyVocabulary),
      note: null,
    };
  }

  // 2. Anything the school already attached to this substitution.
  const stored = asText(substitution.lessonDNA);
  if (stored) {
    return {
      ...base,
      source: 'ai_generated',
      objectives: [],
      warmUp: null,
      mainActivity: stored,
      assessment: null,
      homework: null,
      resources: [],
      keyVocabulary: [],
      note: 'Generated guidance, not a plan written by the regular teacher.',
    };
  }

  // 3. Nothing to show. Say so plainly rather than inventing a lesson.
  return {
    ...base,
    source: 'none',
    objectives: [],
    warmUp: null,
    mainActivity: null,
    assessment: null,
    homework: null,
    resources: [],
    keyVocabulary: [],
    note:
      `No lesson plan exists for ${substitution.grade} ${substitution.subject}. ` +
      'Ask the regular teacher for the current topic, or create a plan in Lesson Plans.',
  };
}
