import { db } from '@/lib/db';

/**
 * AI Agent Service - Smart Teacher Substitution Engine
 */

export interface SubstituteCandidate {
  teacherId: string;
  teacherName: string;
  employeeId: string;
  department: string;
  designation: string;
  score: number;
  reasons: string[];
  conflicts: string[];
  isAvailable: boolean;
  teachesSameSubject: boolean;
  isCrossSubject: boolean;
  hasGradeExperience: boolean;
  currentLoad: number;
  freePeriodsToday: number;
  weeklySubCount: number;
}

export interface SubjectSwapOption {
  swapScheduleId: string;
  swapSubjectId: string;
  swapSubjectName: string;
  swapTeacherId: string;
  swapTeacherName: string;
  swapTimeSlotId: number;
  swapTimeSlotName: string;
  swapTimeSlotStart: string;
  swapTimeSlotEnd: string;
  absentTimeSlotId: number;
  absentTimeSlotName: string;
  absentTimeSlotStart: string;
  absentTimeSlotEnd: string;
  feasibility: number;
}

export interface PreviousDayContext {
  previousDate: string | null;
  topic: string | null;
  subjectName: string;
  teacherName: string;
}

export interface LessonPlan {
  subjectName: string;
  gradeName: string;
  sectionName: string;
  date: string;
  timeSlotName: string;
  startTime: string;
  endTime: string;
  previousDayTopic: string | null;
  previousDayDate: string | null;
  todayTopic: string;
  continuationTopic: string | null;
  suggestedActivities: string[];
  originalTeacherName: string;
  absenceReason: string;
  absenceDetail: string | null;
  isSubjectSwap: boolean;
  swappedSubjectName?: string;
  swappedFromSlot?: string;
}

export interface AutoAssignmentResult {
  requestId: string;
  assignmentId: string;
  substituteTeacherId: string;
  substituteTeacherName: string;
  score: number;
  isAutoAssigned: boolean;
  isSubjectSwap: boolean;
  swappedSubjectName?: string;
  lessonPlan: LessonPlan;
}

export interface AISubstitutionResult {
  requestId: string;
  originalTeacher: string;
  subject: string;
  grade: string;
  section: string;
  timeSlot: string;
  dayOfWeek: number;
  date: string;
  reason: string;
  reasonDetail: string | null;
  candidates: SubstituteCandidate[];
  aiRecommendation: string;
  autoAssignment: AutoAssignmentResult | null;
  subjectSwap: SubjectSwapOption | null;
  lessonPlan: LessonPlan | null;
  status: string;
}

function dayName(day: number): string {
  const days = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  return days[day] || 'Unknown';
}

function getPreviousWorkingDay(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  const day = date.getDay();
  if (day === 1) date.setDate(date.getDate() - 3);
  else if (day === 0) date.setDate(date.getDate() - 2);
  else date.setDate(date.getDate() - 1);
  return date.toISOString().split('T')[0];
}

const TOPICS: Record<string, string[]> = {
  'Mathematics': ['Algebra - Linear Equations', 'Geometry - Triangles', 'Statistics & Probability', 'Number Systems', 'Quadratic Equations'],
  'Physics': ['Motion & Force', 'Laws of Motion', 'Gravitation', 'Work & Energy', 'Light - Reflection'],
  'Chemistry': ['Matter & Its Properties', 'Atoms & Molecules', 'Chemical Reactions', 'Periodic Table'],
  'Biology': ['Cell Structure', 'Tissues', 'Diversity in Living Organisms', 'Life Processes'],
  'English': ['Reading Comprehension', 'Grammar - Tenses', 'Writing Skills - Essay', 'Literature - Poetry'],
  'Science': ['Living & Non-living', 'Food & Nutrition', 'Water Cycle', 'Simple Machines'],
};

const SUGGESTED_ACTIVITIES: Record<string, string[]> = {
  'Mathematics': ['Solve practice problems on board', 'Group worksheet activity', 'Math quiz competition'],
  'Physics': ['Demonstrate concept with experiment', 'Show video demonstration', 'Solve numerical problems'],
  'Chemistry': ['Balancing equation practice', 'Show chemical reaction video'],
  'Biology': ['Diagram labeling exercise', 'Show educational video'],
  'English': ['Reading aloud exercise', 'Grammar worksheet', 'Creative writing prompt'],
  'Science': ['Simple experiment demonstration', 'Nature walk observation', 'Science quiz'],
};

export async function detectAndCreateSubstitutionRequests(date: string) {
  const approvedLeaves = await db.leaveApplication.findMany({
    where: { status: 'approved', startDate: { lte: date }, endDate: { gte: date } },
    include: { teacher: true },
  });

  const absentTeacherIds = new Set(approvedLeaves.map(l => l.teacherId));
  const dayOfWeek = new Date(date + 'T00:00:00').getDay();
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayNameStr = days[dayOfWeek] || 'Monday';

  const results: AISubstitutionResult[] = [];

  for (const teacherId of absentTeacherIds) {
    const schedules = await db.schedule.findMany({
      where: { teacherId, day: dayNameStr },
      include: { teacher: true },
    });

    for (const schedule of schedules) {
      const candidates = await findSubstituteCandidates({
        subjectId: schedule.subject,
        gradeLevel: schedule.grade,
        date,
        dayOfWeek,
        timeSlotId: schedule.period,
        absentTeacherId: teacherId,
        sectionId: schedule.section,
      });

      const bestCandidate = candidates.find(c => c.isAvailable);

      const sub = await db.substitution.create({
        data: {
          date,
          period: schedule.period,
          absentTeacherId: teacherId,
          substituteId: bestCandidate?.teacherId || null,
          grade: schedule.grade,
          section: schedule.section,
          subject: schedule.subject,
          reason: 'Teacher Absent',
          source: 'ai-agent',
          status: bestCandidate ? 'assigned' : 'pending',
        },
      });

      if (bestCandidate) {
        await db.teacherNotification.create({
          data: {
            type: 'curriculum',
            title: `AI Auto-Assigned Substitution - ${schedule.subject}`,
            description: `Assigned for Grade ${schedule.grade} ${schedule.section} on ${date}.`,
            teacherId: bestCandidate.teacherId,
            referenceId: sub.id,
          },
        });
      }

      results.push({
        requestId: sub.id,
        originalTeacher: schedule.teacher?.name || 'Absent Teacher',
        subject: schedule.subject,
        grade: schedule.grade,
        section: schedule.section,
        timeSlot: `Period ${schedule.period}`,
        dayOfWeek,
        date,
        reason: 'ABSENT',
        reasonDetail: null,
        candidates,
        aiRecommendation: bestCandidate ? `Auto-assigned ${bestCandidate.teacherName}` : 'Manual assignment needed',
        autoAssignment: bestCandidate ? {
          requestId: sub.id,
          assignmentId: sub.id,
          substituteTeacherId: bestCandidate.teacherId,
          substituteTeacherName: bestCandidate.teacherName,
          score: bestCandidate.score,
          isAutoAssigned: true,
          isSubjectSwap: false,
          lessonPlan: {
            subjectName: schedule.subject,
            gradeName: schedule.grade,
            sectionName: schedule.section,
            date,
            timeSlotName: `Period ${schedule.period}`,
            startTime: schedule.startTime,
            endTime: schedule.endTime,
            previousDayTopic: null,
            previousDayDate: null,
            todayTopic: schedule.topic || 'Review Chapter',
            continuationTopic: null,
            suggestedActivities: SUGGESTED_ACTIVITIES[schedule.subject] || ['Practice problems'],
            originalTeacherName: schedule.teacher?.name || '',
            absenceReason: 'ABSENT',
            absenceDetail: null,
            isSubjectSwap: false,
          },
        } : null,
        subjectSwap: null,
        lessonPlan: null,
        status: sub.status,
      });
    }
  }

  return results;
}

export async function findSubstituteCandidates(params: {
  subjectId: string;
  gradeLevel: string;
  date: string;
  dayOfWeek: number;
  timeSlotId: number;
  absentTeacherId: string;
  sectionId: string;
  absentTeacherDepartment?: string;
}): Promise<SubstituteCandidate[]> {
  const teachers = await db.teacher.findMany({
    include: {
      schedules: true,
      substituteSubstitutions: true,
    },
  });

  const candidates: SubstituteCandidate[] = [];

  for (const teacher of teachers) {
    if (teacher.id === params.absentTeacherId) continue;

    const teachesSameSubject = teacher.subject === params.subjectId;
    const isAvailable = !teacher.schedules.some(s => s.period === params.timeSlotId);

    let score = 50;
    const reasons: string[] = [];

    if (teachesSameSubject) {
      score += 30;
      reasons.push('Teaches same subject');
    }
    if (isAvailable) {
      score += 20;
      reasons.push('Free period during this time slot');
    }

    candidates.push({
      teacherId: teacher.id,
      teacherName: teacher.name,
      employeeId: teacher.id,
      department: teacher.subject,
      designation: teacher.role,
      score,
      reasons,
      conflicts: isAvailable ? [] : ['Busy teaching another class'],
      isAvailable,
      teachesSameSubject,
      isCrossSubject: !teachesSameSubject,
      hasGradeExperience: true,
      currentLoad: teacher.schedules.length,
      freePeriodsToday: 8 - teacher.schedules.length,
      weeklySubCount: teacher.substituteSubstitutions.length,
    });
  }

  return candidates.sort((a, b) => b.score - a.score);
}

export async function findSubjectSwapOption(params: {
  sectionId: string;
  absentTimeSlotId: number;
  absentTeacherId: string;
  date: string;
  dayOfWeek: number;
}): Promise<SubjectSwapOption | null> {
  return null;
}

export async function getPreviousDayTopic(
  subjectId: string, sectionId: string, date: string
): Promise<PreviousDayContext> {
  return { previousDate: null, topic: null, subjectName: subjectId, teacherName: '' };
}

export async function generateTopicSuggestion(
  subjectName: string, gradeLevel: string, scheduleTopic: string | null, previousTopic: string | null
): Promise<string> {
  if (scheduleTopic) return scheduleTopic;
  const list = TOPICS[subjectName] || ['General Revision'];
  return list[0];
}

export function generateAIRecommendation(...args: any[]): string {
  return 'AI Recommendation: Substitute assigned based on subject match and availability.';
}

export async function manualAssignSubstitution(
  requestId: string, substituteTeacherId: string, assignedBy: string
) {
  const substitution = await db.substitution.findUnique({ where: { id: requestId } });
  if (!substitution) throw new Error('Substitution not found');

  return db.substitution.update({
    where: { id: requestId },
    data: { substituteId: substituteTeacherId, status: 'assigned', source: assignedBy },
  });
}

export async function acceptSubstitution(assignmentId: string) {
  return db.substitution.update({
    where: { id: assignmentId },
    data: { status: 'completed' },
  });
}

export async function rejectSubstitution(assignmentId: string, rejectionReason: string) {
  return db.substitution.update({
    where: { id: assignmentId },
    data: { status: 'pending', substituteId: null, reason: rejectionReason },
  });
}
