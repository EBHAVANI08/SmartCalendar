import { db } from '@/lib/db';

/**
 * AI Agent Service - Enhanced Smart Teacher Substitution Engine
 *
 * Features:
 * 1. Auto-assign substitute teachers with ACCEPTED status (AI already decided)
 * 2. Smart subject swapping when no same-subject teacher is available
 * 3. Lesson planning with previous day context and suggested activities
 * 4. Enhanced notification system with full lesson plan context
 * 5. Auto-reassignment on rejection
 * 6. Weekly workload balancing - track substitutions per week
 * 7. Proximity scoring - same department/building bonus
 * 8. Smart fallback chain: same subject same grade → same subject diff grade → subject swap → cross-subject → PENDING
 * 9. Already-substituted-today penalty - teachers with other subs today get a small penalty
 * 10. Enhanced proximity scoring - same department/wing teachers get proximity bonus
 * 11. Reason tracking - store top 3 AI reasons in assignment record
 * 12. Better subject swap logic - prefer lighter topics (PE, Art, Music) over core subjects
 */

// ─── Interfaces ────────────────────────────────────────────────────────────────

interface SubstituteCandidate {
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

interface SubjectSwapOption {
  swapScheduleId: string;
  swapSubjectId: string;
  swapSubjectName: string;
  swapTeacherId: string;
  swapTeacherName: string;
  swapTimeSlotId: string;
  swapTimeSlotName: string;
  swapTimeSlotStart: string;
  swapTimeSlotEnd: string;
  absentTimeSlotId: string;
  absentTimeSlotName: string;
  absentTimeSlotStart: string;
  absentTimeSlotEnd: string;
  feasibility: number;
}

interface PreviousDayContext {
  previousDate: string | null;
  topic: string | null;
  subjectName: string;
  teacherName: string;
}

interface LessonPlan {
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

interface AutoAssignmentResult {
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

interface AISubstitutionResult {
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

// ─── Helpers ───────────────────────────────────────────────────────────────────

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

function getWeekStart(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  const day = date.getDay();
  // Monday is day 1
  const diff = day === 0 ? 6 : day - 1;
  date.setDate(date.getDate() - diff);
  return date.toISOString().split('T')[0];
}

const TOPICS: Record<string, string[]> = {
  'Mathematics': ['Algebra - Linear Equations', 'Geometry - Triangles', 'Statistics & Probability', 'Number Systems', 'Quadratic Equations', 'Trigonometry Basics', 'Mensuration', 'Coordinate Geometry', 'Arithmetic Progressions', 'Polynomials'],
  'Physics': ['Motion & Force', 'Laws of Motion', 'Gravitation', 'Work & Energy', 'Sound', 'Light - Reflection', 'Electricity', 'Magnetic Effects', 'Waves & Oscillations', 'Thermodynamics'],
  'Chemistry': ['Matter & Its Properties', 'Atoms & Molecules', 'Chemical Reactions', 'Periodic Table', 'Acids, Bases & Salts', 'Metals & Non-metals', 'Carbon Compounds', 'Chemical Bonding'],
  'Biology': ['Cell Structure', 'Tissues', 'Diversity in Living Organisms', 'Life Processes', 'Control & Coordination', 'Heredity & Evolution', 'Human Body Systems', 'Ecology'],
  'English': ['Reading Comprehension', 'Grammar - Tenses', 'Writing Skills - Essay', 'Literature - Poetry', 'Grammar - Voice & Narration', 'Creative Writing', 'Drama & Theatre', 'Public Speaking'],
  'Hindi': ['गद्य - कहानी', 'काव्य - कविता', 'व्याकरण - संज्ञा', 'निबंध लेखन', 'पत्र लेखन', 'व्याकरण - क्रिया', 'अपठित गद्यांश', 'संवाद लेखन'],
  'Social Science': ['Indian History - Ancient', 'Indian Geography', 'Civics - Constitution', 'World History', 'Economics - Basics', 'Indian Freedom Struggle', 'Political Science', 'Democracy'],
  'Computer Science': ['Introduction to Programming', 'Data Types & Variables', 'Control Structures', 'Functions & Procedures', 'Database Concepts', 'HTML & CSS', 'Networking Basics', 'Python Programming'],
  'Physical Education': ['Fitness Assessment', 'Track & Field Events', 'Team Sports', 'Yoga & Meditation', 'Sports Nutrition', 'First Aid & Safety', 'Swimming', 'Volleyball'],
  'Art': ['Drawing Basics', 'Color Theory', 'Painting Techniques', 'Clay Modeling', 'Paper Craft', 'Still Life Drawing', 'Landscape Art', 'Calligraphy'],
  'Music': ['Rhythm & Beats', 'Vocal Training', 'Instrument Basics', 'Indian Classical', 'Folk Music', 'Music Theory', 'Group Singing', 'Song Composition'],
  'Science': ['Living & Non-living', 'Food & Nutrition', 'Water Cycle', 'Simple Machines', 'Our Environment', 'Human Body', 'Plants & Animals', 'Light & Shadow'],
};

const SUGGESTED_ACTIVITIES: Record<string, string[]> = {
  'Mathematics': ['Solve practice problems on board', 'Group worksheet activity', 'Math quiz competition', 'Real-world application examples'],
  'Physics': ['Demonstrate concept with experiment', 'Show video demonstration', 'Solve numerical problems', 'Group discussion on applications'],
  'Chemistry': ['Balancing equation practice', 'Show chemical reaction video', 'Periodic table quiz', 'Lab safety discussion'],
  'Biology': ['Diagram labeling exercise', 'Show educational video', 'Q&A on life processes', 'Nature observation activity'],
  'English': ['Reading aloud exercise', 'Grammar worksheet', 'Creative writing prompt', 'Vocabulary building game'],
  'Hindi': ['पठन अभ्यास', 'व्याकरण अभ्यास', 'निबंध लेखन', 'कविता पाठ'],
  'Social Science': ['Map marking exercise', 'Timeline creation activity', 'Current affairs discussion', 'Source-based questions'],
  'Computer Science': ['Hands-on coding exercise', 'Algorithm writing practice', 'Typing practice', 'Internet safety discussion'],
  'Physical Education': ['Warm-up exercises', 'Yoga session', 'Outdoor game', 'Fitness assessment'],
  'Art': ['Free-hand sketching', 'Color mixing exercise', 'Craft activity', 'Art appreciation discussion'],
  'Music': ['Singing practice', 'Rhythm clapping exercise', 'Instrument demonstration', 'Music appreciation'],
  'Science': ['Simple experiment demonstration', 'Nature walk observation', 'Science quiz', 'Diagram drawing exercise'],
};

// ─── Core: Detect & Auto-Assign ────────────────────────────────────────────────

export async function detectAndCreateSubstitutionRequests(date: string) {
  const approvedLeaves = await db.leave.findMany({
    where: { status: 'APPROVED', startDate: { lte: date }, endDate: { gte: date } },
    include: { teacher: true },
  });

  const absentTeacherIds = new Set(approvedLeaves.map(l => l.teacherId));

  const dayOfWeek = new Date(date + 'T00:00:00').getDay();
  const scheduleDay = dayOfWeek >= 1 && dayOfWeek <= 5 ? dayOfWeek : 1;

  const results: AISubstitutionResult[] = [];

  for (const teacherId of absentTeacherIds) {
    const schedules = await db.schedule.findMany({
      where: { teacherId, dayOfWeek: scheduleDay },
      include: { subject: true, grade: true, section: true, timeSlot: true, teacher: true },
    });

    for (const schedule of schedules) {
      const existingRequest = await db.substitutionRequest.findFirst({
        where: { scheduleId: schedule.id, date, status: { in: ['PENDING', 'ASSIGNED', 'RESOLVED'] } },
      });
      if (existingRequest) continue;

      const reason = 'ABSENT';
      const reasonDetail = approvedLeaves.find(l => l.teacherId === teacherId)?.reason || '';

      // Find substitute candidates with enhanced scoring
      const candidates = await findSubstituteCandidates({
        subjectId: schedule.subjectId,
        gradeLevel: schedule.grade.level,
        date,
        dayOfWeek: scheduleDay,
        timeSlotId: schedule.timeSlotId,
        absentTeacherId: teacherId,
        sectionId: schedule.sectionId,
        absentTeacherDepartment: schedule.teacher.department || undefined,
      });

      // Get previous day context
      const previousDayContext = await getPreviousDayTopic(schedule.subjectId, schedule.sectionId, date);
      const todayTopic = await generateTopicSuggestion(schedule.subject.name, schedule.grade.level, schedule.topic, previousDayContext.topic);
      const continuationTopic = previousDayContext.topic ? `Continuation of: ${previousDayContext.topic}` : null;
      const suggestedActivities = SUGGESTED_ACTIVITIES[schedule.subject.name] || ['Review previous topic', 'Q&A session'];

      const lessonPlan: LessonPlan = {
        subjectName: schedule.subject.name,
        gradeName: schedule.grade.name,
        sectionName: schedule.section.name,
        date,
        timeSlotName: schedule.timeSlot.name,
        startTime: schedule.timeSlot.startTime,
        endTime: schedule.timeSlot.endTime,
        previousDayTopic: previousDayContext.topic,
        previousDayDate: previousDayContext.previousDate,
        todayTopic,
        continuationTopic,
        suggestedActivities,
        originalTeacherName: schedule.teacher.name,
        absenceReason: reason,
        absenceDetail: reasonDetail || null,
        isSubjectSwap: false,
      };

      // ── Smart Fallback Chain ──
      // Chain: 1) Same subject same grade → 2) Same subject diff grade → 3) Subject swap → 4) Cross-subject → 5) PENDING

      let subjectSwap: SubjectSwapOption | null = null;
      let finalReason = reason;
      let bestCandidate: SubstituteCandidate | null = null;
      let finalLessonPlan = lessonPlan;

      // Step 1: Same subject, same grade (highest priority)
      const sameSubjectSameGrade = candidates.filter(c => c.isAvailable && c.teachesSameSubject && !c.isCrossSubject && c.hasGradeExperience);
      if (sameSubjectSameGrade.length > 0) {
        bestCandidate = sameSubjectSameGrade[0];
      }

      // Step 2: Same subject, different grade (still very high - only small penalty)
      if (!bestCandidate) {
        const sameSubjectDiffGrade = candidates.filter(c => c.isAvailable && c.teachesSameSubject && !c.hasGradeExperience);
        if (sameSubjectDiffGrade.length > 0) {
          bestCandidate = sameSubjectDiffGrade[0];
        }
      }

      // Step 3: Subject swap
      if (!bestCandidate) {
        const swapOption = await findSubjectSwapOption({
          sectionId: schedule.sectionId,
          absentTimeSlotId: schedule.timeSlotId,
          absentTeacherId: teacherId,
          date,
          dayOfWeek: scheduleDay,
        });

        if (swapOption) {
          subjectSwap = swapOption;
          finalReason = 'SUBJECT_SWAP';
          finalLessonPlan = {
            ...lessonPlan,
            isSubjectSwap: true,
            swappedSubjectName: swapOption.swapSubjectName,
            swappedFromSlot: `${swapOption.swapTimeSlotStart}-${swapOption.swapTimeSlotEnd}`,
            todayTopic: await generateTopicSuggestion(swapOption.swapSubjectName, schedule.grade.level, null, null),
            continuationTopic: null,
            suggestedActivities: SUGGESTED_ACTIVITIES[swapOption.swapSubjectName] || ['Review activity'],
          };

          bestCandidate = {
            teacherId: swapOption.swapTeacherId,
            teacherName: swapOption.swapTeacherName,
            employeeId: '',
            department: '',
            designation: '',
            score: 60 + swapOption.feasibility,
            reasons: [
              `Available during absent teacher's period`,
              `Subject swap: will teach ${swapOption.swapSubjectName} instead`,
              `Original ${schedule.subject.name} class will be rescheduled`,
            ],
            conflicts: [],
            isAvailable: true,
            teachesSameSubject: false,
            isCrossSubject: true,
            hasGradeExperience: true,
            currentLoad: 0,
            freePeriodsToday: 0,
            weeklySubCount: 0,
          };
        }
      }

      // Step 4: Cross-subject free teacher (supervision only)
      if (!bestCandidate) {
        const crossSubjectCandidates = candidates.filter(c => c.isAvailable && c.isCrossSubject && !c.teachesSameSubject);
        if (crossSubjectCandidates.length > 0) {
          bestCandidate = crossSubjectCandidates[0];
          finalLessonPlan = {
            ...lessonPlan,
            todayTopic: `Supervised Study Period (original: ${todayTopic})`,
            continuationTopic: null,
            suggestedActivities: ['Supervised self-study', 'Homework completion', 'Practice problems from textbook'],
          };
        }
      }

      // Step 5: If still no candidate → PENDING (admin intervention needed)

      // ── Create the substitution request ──
      // KEY CHANGE: If we auto-assign, set request status to RESOLVED immediately
      // The AI already made the decision, so it's RESOLVED
      const initialRequestStatus = bestCandidate ? 'RESOLVED' : 'PENDING';

      const aiRecommendation = generateAIRecommendation(
        schedule.teacher.name, schedule.subject.name, schedule.grade.name,
        schedule.section.name, schedule.timeSlot.name, dayName(scheduleDay),
        reason, reasonDetail, candidates,
        bestCandidate ? { teacherName: bestCandidate.teacherName, score: bestCandidate.score, isSubjectSwap: !!subjectSwap } : null,
        subjectSwap
      );

      const request = await db.substitutionRequest.create({
        data: {
          scheduleId: schedule.id,
          originalTeacherId: teacherId,
          subjectId: schedule.subjectId,
          date,
          reason: finalReason,
          reasonDetail,
          status: initialRequestStatus,
          aiRecommendation,
        },
      });

      // ── Auto-assign with ACCEPTED status ──
      let autoAssignment: AutoAssignmentResult | null = null;

      if (bestCandidate) {
        // KEY CHANGE: Status is ACCEPTED (not PENDING) because AI already decided
        const assignment = await db.substitutionAssignment.create({
          data: {
            substitutionRequestId: request.id,
            substituteTeacherId: bestCandidate.teacherId,
            status: 'ACCEPTED', // Auto-accepted since AI made the decision
            assignedBy: 'AI_AGENT',
            topic: finalLessonPlan.todayTopic,
            reasons: JSON.stringify(bestCandidate.reasons.slice(0, 3)),
            aiConfidence: Math.min(100, Math.max(0, bestCandidate.score)),
          },
        });

        autoAssignment = {
          requestId: request.id,
          assignmentId: assignment.id,
          substituteTeacherId: bestCandidate.teacherId,
          substituteTeacherName: bestCandidate.teacherName,
          score: bestCandidate.score,
          isAutoAssigned: true,
          isSubjectSwap: !!subjectSwap,
          swappedSubjectName: subjectSwap?.swapSubjectName,
          lessonPlan: finalLessonPlan,
        };

        // Notification to the substitute teacher
        await db.notification.create({
          data: {
            type: 'TEACHER_ASSIGNED',
            title: `Auto-Assigned Substitution - ${finalLessonPlan.isSubjectSwap ? finalLessonPlan.swappedSubjectName : finalLessonPlan.subjectName}`,
            message: buildSubstituteNotificationMessage(finalLessonPlan, autoAssignment),
            data: JSON.stringify({
              assignmentId: assignment.id, requestId: request.id, lessonPlan: finalLessonPlan,
              isAutoAssigned: true, isSubjectSwap: finalLessonPlan.isSubjectSwap,
              swappedSubjectName: finalLessonPlan.swappedSubjectName,
            }),
            teacherId: bestCandidate.teacherId,
            targetRole: 'TEACHER',
            assignmentId: assignment.id,
            substitutionRequestId: request.id,
          },
        });

        // Notification to admin
        await db.notification.create({
          data: {
            type: 'AI_AUTO_ASSIGNED',
            title: `AI Auto-Assignment - ${schedule.subject.name}`,
            message: buildAdminAutoAssignmentMessage(finalLessonPlan, autoAssignment, schedule.teacher.name),
            data: JSON.stringify({
              requestId: request.id, assignmentId: assignment.id,
              substituteTeacherId: bestCandidate.teacherId,
              substituteTeacherName: bestCandidate.teacherName,
              score: bestCandidate.score, isSubjectSwap: !!subjectSwap,
              swappedSubjectName: subjectSwap?.swapSubjectName,
              candidates: candidates.filter(c => c.isAvailable).map(c => ({
                teacherId: c.teacherId, name: c.teacherName, score: c.score,
                reasons: c.reasons, teachesSameSubject: c.teachesSameSubject, isCrossSubject: c.isCrossSubject,
              })),
            }),
            targetRole: 'ADMIN',
            substitutionRequestId: request.id,
            assignmentId: assignment.id,
          },
        });

        // Student notifications removed for MVP - school admin and teachers are the primary users
        // StudentNotification model is not in the Prisma schema
      } else {
        // No auto-assignment possible - notify admin for manual intervention
        await db.notification.create({
          data: {
            type: 'SUBSTITUTION_NEEDED',
            title: `Urgent: No Auto-Assignment Available - ${schedule.subject.name}`,
            message: `${schedule.teacher.name} is ${reason.toLowerCase()} for ${dayName(scheduleDay)} ${schedule.timeSlot.name} (${schedule.timeSlot.startTime}-${schedule.timeSlot.endTime}). No same-subject teacher available and no subject swap possible. Manual intervention required for Grade ${schedule.grade.name} Section ${schedule.section.name}. ${candidates.filter(c => c.isAvailable).length} cross-subject teacher(s) available as last resort.`,
            data: JSON.stringify({
              requestId: request.id,
              candidates: candidates.filter(c => c.isAvailable).map(c => ({
                teacherId: c.teacherId, name: c.teacherName, score: c.score,
                reasons: c.reasons, isCrossSubject: c.isCrossSubject,
              })),
              schedule: {
                subject: schedule.subject.name, grade: schedule.grade.name,
                section: schedule.section.name, timeSlot: schedule.timeSlot.name,
                time: `${schedule.timeSlot.startTime}-${schedule.timeSlot.endTime}`,
              },
            }),
            targetRole: 'ADMIN',
            substitutionRequestId: request.id,
          },
        });
      }

      results.push({
        requestId: request.id,
        originalTeacher: schedule.teacher.name,
        subject: schedule.subject.name,
        grade: schedule.grade.name,
        section: schedule.section.name,
        timeSlot: schedule.timeSlot.name,
        dayOfWeek: scheduleDay,
        date,
        reason: finalReason,
        reasonDetail: reasonDetail || null,
        candidates,
        aiRecommendation,
        autoAssignment,
        subjectSwap,
        lessonPlan: finalLessonPlan,
        status: initialRequestStatus,
      });
    }
  }

  // ─── Conflict Detection (Feature 6) ─────────────────────────────────────
  // Check for teacher overload and department crisis
  await detectAndAlertConflicts(date, scheduleDay, results);

  return results;
}

// ─── Find Substitute Candidates (Enhanced) ─────────────────────────────────────

export async function findSubstituteCandidates(params: {
  subjectId: string;
  gradeLevel: number;
  date: string;
  dayOfWeek: number;
  timeSlotId: string;
  absentTeacherId: string;
  sectionId: string;
  absentTeacherDepartment?: string;
}): Promise<SubstituteCandidate[]> {
  const { subjectId, gradeLevel, date, dayOfWeek, timeSlotId, absentTeacherId, absentTeacherDepartment } = params;

  const timeSlot = await db.timeSlot.findUnique({ where: { id: timeSlotId } });
  if (!timeSlot) return [];

  // Get subject info for proximity scoring
  const subjectInfo = await db.subject.findUnique({ where: { id: subjectId } });

  // Get week boundaries for weekly workload calculation
  const weekStart = getWeekStart(date);
  const weekEndDate = new Date(weekStart + 'T00:00:00');
  weekEndDate.setDate(weekEndDate.getDate() + 4);
  const weekEnd = weekEndDate.toISOString().split('T')[0];

  const candidates: SubstituteCandidate[] = [];

  // Get teachers already substituting today (for already-subbed penalty)
  const todaySubAssignments = await db.substitutionAssignment.findMany({
    where: {
      status: 'ACCEPTED',
      createdAt: { gte: new Date(date + 'T00:00:00'), lte: new Date(date + 'T23:59:59') },
    },
    select: { substituteTeacherId: true, substitutionRequestId: true },
  });
  const todaySubCountByTeacher = new Map<string, number>();
  for (const sa of todaySubAssignments) {
    todaySubCountByTeacher.set(sa.substituteTeacherId, (todaySubCountByTeacher.get(sa.substituteTeacherId) || 0) + 1);
  }

  // Tier 1: Same subject, same grade level
  const sameSubjectSameGrade = await db.teacherSubject.findMany({
    where: { subjectId, gradeLevel },
    include: {
      teacher: {
        include: {
          leaves: { where: { status: 'APPROVED', startDate: { lte: date }, endDate: { gte: date } } },
          schedules: { where: { dayOfWeek }, include: { timeSlot: true, subject: true, section: true, grade: true } },
          substitutionsAsSubstitute: { where: { status: 'ACCEPTED', createdAt: { gte: new Date(weekStart), lte: new Date(weekEnd + 'T23:59:59') } } },
        },
      },
      subject: true,
    },
  });

  for (const qt of sameSubjectSameGrade) {
    const teacher = qt.teacher;
    if (teacher.id === absentTeacherId) continue;
    if (!teacher.isActive) continue;

    const candidate = evaluateCandidate(
      teacher, qt.subject, timeSlot, timeSlotId, gradeLevel,
      qt.isPrimary, true, false, subjectInfo, date, todaySubCountByTeacher, absentTeacherDepartment
    );
    if (candidate) candidates.push(candidate);
  }

  // Tier 2: Same subject, different grade level (HIGH score, not just -10)
  const sameSubjectDiffGrade = await db.teacherSubject.findMany({
    where: { subjectId, gradeLevel: { not: gradeLevel } },
    include: {
      teacher: {
        include: {
          leaves: { where: { status: 'APPROVED', startDate: { lte: date }, endDate: { gte: date } } },
          schedules: { where: { dayOfWeek }, include: { timeSlot: true, subject: true, section: true, grade: true } },
          substitutionsAsSubstitute: { where: { status: 'ACCEPTED', createdAt: { gte: new Date(weekStart), lte: new Date(weekEnd + 'T23:59:59') } } },
        },
      },
      subject: true,
    },
  });

  for (const bt of sameSubjectDiffGrade) {
    const teacher = bt.teacher;
    if (teacher.id === absentTeacherId) continue;
    if (!teacher.isActive) continue;
    if (candidates.some(c => c.teacherId === teacher.id)) continue;

    const candidate = evaluateCandidate(
      teacher, bt.subject, timeSlot, timeSlotId, gradeLevel,
      bt.isPrimary, true, false, subjectInfo, date, todaySubCountByTeacher, absentTeacherDepartment
    );
    if (candidate) {
      // Small penalty for different grade, not a big one - they know the subject
      const gradeDiff = Math.abs((bt.gradeLevel || gradeLevel) - gradeLevel);
      candidate.score -= (gradeDiff * 3); // Small penalty per grade difference
      candidate.hasGradeExperience = false;
      candidate.reasons.push(`Teaches ${bt.subject.name} at Grade ${bt.gradeLevel} level (${gradeDiff} grade(s) difference)`);
      candidates.push(candidate);
    }
  }

  // Tier 3: Cross-subject teachers (any available teacher - supervision only)
  const allActiveTeachers = await db.teacher.findMany({
    where: { isActive: true, id: { not: absentTeacherId } },
    include: {
      leaves: { where: { status: 'APPROVED', startDate: { lte: date }, endDate: { gte: date } } },
      schedules: { where: { dayOfWeek }, include: { timeSlot: true, subject: true, section: true, grade: true } },
      substitutionsAsSubstitute: { where: { status: 'ACCEPTED', createdAt: { gte: new Date(weekStart), lte: new Date(weekEnd + 'T23:59:59') } } },
      teacherSubjects: { include: { subject: true } },
    },
  });

  for (const teacher of allActiveTeachers) {
    if (candidates.some(c => c.teacherId === teacher.id)) continue;

    const isOnLeave = teacher.leaves.length > 0;
    if (isOnLeave) continue;

    const scheduleConflict = teacher.schedules.find(s => s.timeSlotId === timeSlotId);
    if (scheduleConflict) continue;

    const classesToday = teacher.schedules.length;
    const freePeriods = Math.max(0, 8 - classesToday);
    const weeklySubs = teacher.substitutionsAsSubstitute.length;
    let score = 15;
    const reasons: string[] = [];
    const conflicts: string[] = [];

    reasons.push('Available (cross-subject - can supervise study period)');
    const taughtSubjects = teacher.teacherSubjects.map(ts => ts.subject.name);
    if (taughtSubjects.length > 0) {
      reasons.push(`Teaches: ${taughtSubjects.join(', ')}`);
    }

    // Proximity scoring: same department as the subject
    if (subjectInfo?.category && teacher.department === subjectInfo.category) {
      score += 10;
      reasons.push('Same department (proximity bonus)');
    }

    if (teacher.designation?.includes('HOD')) {
      score += 10;
      reasons.push('Head of Department');
    }
    if (weeklySubs === 0) {
      score += 5;
      reasons.push('No substitutions this week');
    } else if (weeklySubs <= 2) {
      score += 2;
    } else {
      score -= (weeklySubs * 3);
      reasons.push(`${weeklySubs} substitutions this week (load balancing)`);
    }
    if (classesToday <= 3) {
      score += 5;
      reasons.push('Light schedule today');
    }
    if (freePeriods >= 4) {
      score += 5;
      reasons.push('Many free periods today');
    }

    candidates.push({
      teacherId: teacher.id,
      teacherName: teacher.name,
      employeeId: teacher.employeeId,
      department: teacher.department || '',
      designation: teacher.designation || '',
      score,
      reasons,
      conflicts,
      isAvailable: true,
      teachesSameSubject: false,
      isCrossSubject: true,
      hasGradeExperience: false,
      currentLoad: classesToday,
      freePeriodsToday: freePeriods,
      weeklySubCount: weeklySubs,
    });
  }

  // Sort: same-subject first (with grade experience first), then same-subject diff grade, then cross-subject
  candidates.sort((a, b) => {
    // Priority 1: Same subject with grade experience > Same subject without > Cross-subject
    const aTier = a.teachesSameSubject && a.hasGradeExperience ? 3 : a.teachesSameSubject ? 2 : a.isCrossSubject ? 1 : 0;
    const bTier = b.teachesSameSubject && b.hasGradeExperience ? 3 : b.teachesSameSubject ? 2 : b.isCrossSubject ? 1 : 0;
    if (aTier !== bTier) return bTier - aTier;
    // Within same tier, lower weekly subs first (workload balancing)
    if (a.weeklySubCount !== b.weeklySubCount) return a.weeklySubCount - b.weeklySubCount;
    return b.score - a.score;
  });

  return candidates;
}

// ─── Evaluate Candidate (Enhanced) ─────────────────────────────────────────────

function evaluateCandidate(
  teacher: {
    id: string;
    name: string;
    employeeId: string;
    designation?: string | null;
    department?: string | null;
    isActive: boolean;
    leaves: { id: string }[];
    schedules: {
      timeSlotId: string;
      timeSlot: { startTime: string; endTime: string; name: string };
      subject: { name: string };
      section: { name: string | null };
      grade: { name: string | null };
    }[];
    substitutionsAsSubstitute: { id: string; createdAt: Date }[];
  },
  subject: { name: string; category?: string | null },
  timeSlot: { startTime: string; endTime: string },
  timeSlotId: string,
  gradeLevel: number,
  isPrimary: boolean,
  teachesSameSubject: boolean,
  isCrossSubject: boolean,
  subjectInfo?: { name: string; category?: string | null } | null,
  _date?: string,
  todaySubCountByTeacher?: Map<string, number>,
  absentTeacherDepartment?: string,
): SubstituteCandidate | null {
  const conflicts: string[] = [];
  const reasons: string[] = [];
  let score = 0;

  const isOnLeave = teacher.leaves.length > 0;
  if (isOnLeave) { conflicts.push('Teacher is on approved leave today'); return null; }

  const scheduleConflict = teacher.schedules.find(s => s.timeSlotId === timeSlotId);
  if (scheduleConflict) {
    conflicts.push(`Teaching ${scheduleConflict.subject.name} for Grade ${scheduleConflict.grade?.name || ''} Section ${scheduleConflict.section?.name || ''} during ${scheduleConflict.timeSlot?.startTime}-${scheduleConflict.timeSlot?.endTime}`);
    return null;
  }

  // ── Enhanced Scoring ──

  // Primary teacher bonus
  if (isPrimary) { score += 40; reasons.push('Primary teacher for this subject and grade'); }

  // Proximity scoring: same department as subject (enhanced)
  // Teachers in the same department are likely in the same building/wing - quicker to reach class
  if (subjectInfo?.category && teacher.department === subjectInfo.category) {
    score += 20; // Increased from 15 - proximity matters more
    reasons.push('Same department (proximity bonus - likely same building/wing)');
  } else if (teacher.department && subject.category && teacher.department === subject.category) {
    score += 20;
    reasons.push('Same department expertise (proximity bonus)');
  }

  // Enhanced proximity: same department as absent teacher
  // A teacher in the same department as the absent teacher is familiar with their classes
  if (absentTeacherDepartment && teacher.department === absentTeacherDepartment && teacher.department !== subjectInfo?.category) {
    score += 10;
    reasons.push('Same department as absent teacher - familiar with their students');
  }

  // Already substituted today penalty
  // A teacher already doing a substitution for a different period is already stretched
  const todaySubCount = todaySubCountByTeacher?.get(teacher.id) || 0;
  if (todaySubCount > 0) {
    score -= (todaySubCount * 8); // 8 points penalty per existing sub today
    reasons.push(`Already has ${todaySubCount} substitution${todaySubCount > 1 ? 's' : ''} today (fatigue penalty)`);
  }

  // Senior designation
  if (teacher.designation?.includes('HOD')) { score += 20; reasons.push('Head of Department'); }
  else if (teacher.designation?.includes('Senior')) { score += 10; reasons.push('Senior teacher'); }

  // Weekly workload balancing - KEY enhancement
  const weeklySubs = teacher.substitutionsAsSubstitute.length;
  if (weeklySubs === 0) { score += 15; reasons.push('No substitutions this week - fresh availability'); }
  else if (weeklySubs <= 2) { score += 8; reasons.push('Minimal substitution load this week'); }
  else if (weeklySubs <= 4) { score -= 5; reasons.push('Moderate substitution load this week'); }
  else { score -= (weeklySubs * 5); reasons.push(`Heavy substitution load: ${weeklySubs} this week (load balancing)`); }

  // Light schedule today
  const classesToday = teacher.schedules.length;
  const freePeriods = Math.max(0, 8 - classesToday);
  if (classesToday <= 3) { score += 10; reasons.push('Light schedule today'); }
  else if (classesToday <= 5) { score += 5; }

  if (freePeriods >= 4) { score += 5; reasons.push('Many free periods available'); }

  reasons.push(`Qualified to teach ${subject.name} at Grade ${gradeLevel}`);

  return {
    teacherId: teacher.id,
    teacherName: teacher.name,
    employeeId: teacher.employeeId,
    department: teacher.department || '',
    designation: teacher.designation || '',
    score,
    reasons,
    conflicts,
    isAvailable: conflicts.length === 0,
    teachesSameSubject,
    isCrossSubject,
    hasGradeExperience: !isCrossSubject,
    currentLoad: classesToday,
    freePeriodsToday: freePeriods,
    weeklySubCount: weeklySubs,
  };
}

// ─── Subject Swap ──────────────────────────────────────────────────────────────

export async function findSubjectSwapOption(params: {
  sectionId: string;
  absentTimeSlotId: string;
  absentTeacherId: string;
  date: string;
  dayOfWeek: number;
}): Promise<SubjectSwapOption | null> {
  const { sectionId, absentTimeSlotId, absentTeacherId, date, dayOfWeek } = params;

  const absentTimeSlot = await db.timeSlot.findUnique({ where: { id: absentTimeSlotId } });
  if (!absentTimeSlot) return null;

  const sectionSchedules = await db.schedule.findMany({
    where: { sectionId, dayOfWeek },
    include: {
      subject: true,
      teacher: {
        include: {
          leaves: { where: { status: 'APPROVED', startDate: { lte: date }, endDate: { gte: date } } },
          schedules: { where: { dayOfWeek }, include: { timeSlot: true } },
        },
      },
      timeSlot: true,
    },
    orderBy: { timeSlot: { order: 'asc' } },
  });

  const absentSchedule = sectionSchedules.find(s => s.teacherId === absentTeacherId);
  if (!absentSchedule) return null;

  const swapOptions: SubjectSwapOption[] = [];

  for (const sched of sectionSchedules) {
    if (sched.teacherId === absentTeacherId) continue;
    if (sched.timeSlot.isBreak) continue;
    if (sched.timeSlotId === absentTimeSlotId) continue;

    const swapTeacher = sched.teacher;
    if (swapTeacher.leaves.length > 0) continue;
    if (swapTeacher.schedules.some(s => s.timeSlotId === absentTimeSlotId)) continue;

    let feasibility = 50;

    // Subject weight: prefer swapping lighter subjects (PE, Art, Music) over core subjects
    // Core subjects like Math, Science, English are harder to reschedule
    const LIGHT_SUBJECTS = ['Physical Education', 'Art', 'Music', 'Computer Science', 'Craft'];
    const CORE_SUBJECTS = ['Mathematics', 'Physics', 'Chemistry', 'Biology', 'English', 'Hindi', 'Social Science', 'Science'];
    const isLightSubject = LIGHT_SUBJECTS.includes(sched.subject.name);
    const isCoreSubject = CORE_SUBJECTS.includes(sched.subject.name);

    if (isLightSubject) {
      feasibility += 25; // Strong preference - easy to reschedule PE/Art/Music
    } else if (isCoreSubject) {
      feasibility -= 15; // Discourage swapping core subjects - harder to reschedule
    }

    if (swapTeacher.department === absentSchedule.subject.category) feasibility += 20;
    if (swapTeacher.designation?.includes('HOD')) feasibility += 15;
    else if (swapTeacher.designation?.includes('Senior')) feasibility += 10;
    if (Math.abs(sched.timeSlot.order - absentTimeSlot.order) <= 2) feasibility += 10;

    swapOptions.push({
      swapScheduleId: sched.id,
      swapSubjectId: sched.subjectId,
      swapSubjectName: sched.subject.name,
      swapTeacherId: swapTeacher.id,
      swapTeacherName: swapTeacher.name,
      swapTimeSlotId: sched.timeSlotId,
      swapTimeSlotName: sched.timeSlot.name,
      swapTimeSlotStart: sched.timeSlot.startTime,
      swapTimeSlotEnd: sched.timeSlot.endTime,
      absentTimeSlotId,
      absentTimeSlotName: absentTimeSlot.name,
      absentTimeSlotStart: absentTimeSlot.startTime,
      absentTimeSlotEnd: absentTimeSlot.endTime,
      feasibility,
    });
  }

  if (swapOptions.length === 0) return null;
  swapOptions.sort((a, b) => b.feasibility - a.feasibility);
  return swapOptions[0];
}

// ─── Previous Day Topic ────────────────────────────────────────────────────────

export async function getPreviousDayTopic(
  subjectId: string, sectionId: string, date: string
): Promise<PreviousDayContext> {
  let checkDate = date;
  for (let i = 0; i < 5; i++) {
    checkDate = getPreviousWorkingDay(checkDate);
    const dayOfWeek = new Date(checkDate + 'T00:00:00').getDay();
    const scheduleDay = dayOfWeek >= 1 && dayOfWeek <= 5 ? dayOfWeek : 1;

    const previousSchedule = await db.schedule.findFirst({
      where: { subjectId, sectionId, dayOfWeek: scheduleDay },
      include: { subject: true, teacher: true },
    });

    if (previousSchedule?.topic) {
      return {
        previousDate: checkDate,
        topic: previousSchedule.topic,
        subjectName: previousSchedule.subject.name,
        teacherName: previousSchedule.teacher.name,
      };
    }

    if (previousSchedule) {
      const substitution = await db.substitutionRequest.findFirst({
        where: { scheduleId: previousSchedule.id, date: checkDate, status: 'RESOLVED' },
        include: { assignments: { where: { status: 'ACCEPTED' } } },
      });
      if (substitution?.assignments[0]?.topic) {
        return {
          previousDate: checkDate,
          topic: substitution.assignments[0].topic,
          subjectName: previousSchedule.subject.name,
          teacherName: previousSchedule.teacher.name,
        };
      }
    }
  }
  return { previousDate: null, topic: null, subjectName: '', teacherName: '' };
}

// ─── Notification Builders ─────────────────────────────────────────────────────

function buildSubstituteNotificationMessage(lessonPlan: LessonPlan, assignment: AutoAssignmentResult): string {
  const swapInfo = lessonPlan.isSubjectSwap
    ? `\n\n🔄 SUBJECT SWAP: You will teach ${lessonPlan.swappedSubjectName} instead of ${lessonPlan.subjectName}.`
    : '';

  const previousDayInfo = lessonPlan.previousDayTopic
    ? `\n\n📖 Previous Day Context (${lessonPlan.previousDayDate}): Students covered "${lessonPlan.previousDayTopic}".`
    : '\n\n📖 No previous day topic found. Start with a review.';

  const activitiesInfo = lessonPlan.suggestedActivities.length > 0
    ? `\n\n🎯 Suggested Activities:\n${lessonPlan.suggestedActivities.map((a, i) => `  ${i + 1}. ${a}`).join('\n')}`
    : '';

  return `You have been AUTO-ASSIGNED as substitute teacher for:
📋 Class: Grade ${lessonPlan.gradeName} Section ${lessonPlan.sectionName}
📚 Subject: ${lessonPlan.isSubjectSwap ? lessonPlan.swappedSubjectName : lessonPlan.subjectName}
📅 Date: ${lessonPlan.date}
🕐 Time: ${lessonPlan.startTime} - ${lessonPlan.endTime}
👤 Original Teacher: ${lessonPlan.originalTeacherName}
❌ Reason: ${lessonPlan.absenceReason}${lessonPlan.absenceDetail ? ` - ${lessonPlan.absenceDetail}` : ''}${swapInfo}
${previousDayInfo}
📝 Today's Topic: ${lessonPlan.todayTopic}${lessonPlan.continuationTopic ? `\n🔗 ${lessonPlan.continuationTopic}` : ''}${activitiesInfo}`;
}

function buildAdminAutoAssignmentMessage(
  lessonPlan: LessonPlan, assignment: AutoAssignmentResult, originalTeacherName: string
): string {
  const swapInfo = lessonPlan.isSubjectSwap
    ? ` Subject swap applied: ${assignment.substituteTeacherName} will teach ${lessonPlan.swappedSubjectName} instead.`
    : '';

  return `AI Auto-Assignment Complete:
👤 Original: ${originalTeacherName} (${lessonPlan.absenceReason})
🆕 Substitute: ${assignment.substituteTeacherName} (Score: ${assignment.score}/100)
📚 Subject: ${lessonPlan.isSubjectSwap ? lessonPlan.swappedSubjectName + ' (swapped)' : lessonPlan.subjectName}
📅 Grade ${lessonPlan.gradeName} Section ${lessonPlan.sectionName}
🕐 ${lessonPlan.startTime}-${lessonPlan.endTime}${swapInfo}
📝 Topic: ${lessonPlan.todayTopic}${lessonPlan.previousDayTopic ? `\n📖 Previous: ${lessonPlan.previousDayTopic}` : ''}

Status: AUTO-ACCEPTED (AI decision applied immediately)`;
}

// ─── AI Recommendation Generator ───────────────────────────────────────────────

function generateAIRecommendation(
  originalTeacher: string, subject: string, grade: string, section: string,
  timeSlot: string, day: string, reason: string, reasonDetail: string,
  candidates: SubstituteCandidate[],
  autoAssignInfo: { teacherName: string; score: number; isSubjectSwap: boolean } | null,
  subjectSwap: SubjectSwapOption | null,
): string {
  const availableCount = candidates.filter(c => c.isAvailable && !c.isCrossSubject).length;
  const crossSubjectCount = candidates.filter(c => c.isAvailable && c.isCrossSubject).length;
  const topCandidate = candidates.find(c => c.isAvailable && !c.isCrossSubject) || candidates.find(c => c.isAvailable);

  let recommendation = `AI Analysis: ${originalTeacher} is ${reason.toLowerCase()}`;
  if (reasonDetail) recommendation += ` (${reasonDetail})`;
  recommendation += ` for ${subject} class scheduled on ${day} during ${timeSlot} for ${grade} ${section}. `;

  if (autoAssignInfo) {
    recommendation += `\n\n✅ AUTO-ASSIGNED & ACCEPTED: ${autoAssignInfo.teacherName} (Score: ${autoAssignInfo.score}/100). `;
    if (autoAssignInfo.isSubjectSwap) {
      recommendation += `Subject swap applied - a different subject will be taught during this period.`;
    }
    // Include WHY this teacher was chosen (Feature 7)
    const chosen = candidates.find(c => c.teacherName === autoAssignInfo.teacherName);
    if (chosen && chosen.reasons.length > 0) {
      recommendation += `\n\n🎯 Selected because: ${chosen.reasons.slice(0, 3).join(', ')}`;
      recommendation += `\n📊 Schedule: ${chosen.currentLoad}/8 classes today, ${chosen.freePeriodsToday} free periods, ${chosen.weeklySubCount} substitutions this week`;
    }
  } else if (availableCount === 0 && crossSubjectCount === 0) {
    recommendation += `\n\n⚠️ No substitute teachers available. Manual intervention required.`;
  } else if (availableCount === 0) {
    recommendation += `\n\n⚠️ No same-subject teacher available. ${crossSubjectCount} cross-subject teacher(s) can supervise.`;
  } else {
    recommendation += `\n\n${availableCount} same-subject substitute(s) identified. Top: ${topCandidate?.teacherName} (Score: ${topCandidate?.score}/100).`;
  }

  return recommendation;
}

// ─── Topic Suggestion ──────────────────────────────────────────────────────────

async function generateTopicSuggestion(
  subjectName: string, gradeLevel: number, currentTopic: string | null, previousDayTopic: string | null
): Promise<string> {
  const topics = TOPICS[subjectName] || ['General Review Session'];

  if (currentTopic && topics.includes(currentTopic)) {
    const idx = topics.indexOf(currentTopic);
    const nextIdx = (idx + 1) % topics.length;
    if (previousDayTopic) {
      return `Continue: ${currentTopic} (previous: ${previousDayTopic} → today: ${currentTopic}, next: ${topics[nextIdx]})`;
    }
    return `Continue: ${currentTopic} (or proceed to ${topics[nextIdx]})`;
  }

  if (previousDayTopic && topics.includes(previousDayTopic)) {
    const idx = topics.indexOf(previousDayTopic);
    const nextIdx = (idx + 1) % topics.length;
    return `Next after "${previousDayTopic}": ${topics[nextIdx]}`;
  }

  if (currentTopic) return `Continue: ${currentTopic}`;

  const gradeIndex = Math.min(Math.max(gradeLevel - 1, 0), topics.length - 1);
  return topics[gradeIndex % topics.length];
}

// ─── Manual Assignment (Admin Override) ────────────────────────────────────────

export async function assignSubstituteTeacher(
  requestId: string, substituteTeacherId: string, assignedBy: string
) {
  const request = await db.substitutionRequest.findUnique({
    where: { id: requestId },
    include: {
      schedule: { include: { subject: true, grade: true, section: true, timeSlot: true } },
      originalTeacher: true,
    },
  });

  if (!request) throw new Error('Substitution request not found');

  const teacher = await db.teacher.findUnique({ where: { id: substituteTeacherId } });
  if (!teacher) throw new Error('Teacher not found');

  const previousDayContext = await getPreviousDayTopic(
    request.schedule.subjectId, request.schedule.sectionId, request.date
  );

  const topicList = await generateTopicSuggestion(
    request.schedule.subject.name, request.schedule.grade.level,
    request.schedule.topic, previousDayContext.topic
  );

  // Admin assignments are ACCEPTED immediately
  const assignment = await db.substitutionAssignment.create({
    data: {
      substitutionRequestId: requestId,
      substituteTeacherId,
      status: 'ACCEPTED',
      assignedBy,
      topic: topicList,
      reasons: JSON.stringify(['Manually assigned by admin']),
      aiConfidence: null, // No AI confidence for manual assignments
    },
  });

  // Update request status to RESOLVED
  await db.substitutionRequest.update({
    where: { id: requestId },
    data: { status: 'RESOLVED' },
  });

  const lessonPlan: LessonPlan = {
    subjectName: request.schedule.subject.name,
    gradeName: request.schedule.grade.name,
    sectionName: request.schedule.section.name,
    date: request.date,
    timeSlotName: request.schedule.timeSlot.name,
    startTime: request.schedule.timeSlot.startTime,
    endTime: request.schedule.timeSlot.endTime,
    previousDayTopic: previousDayContext.topic,
    previousDayDate: previousDayContext.previousDate,
    todayTopic: topicList,
    continuationTopic: previousDayContext.topic ? `Continuation of: ${previousDayContext.topic}` : null,
    suggestedActivities: SUGGESTED_ACTIVITIES[request.schedule.subject.name] || ['Review previous topic'],
    originalTeacherName: request.originalTeacher.name,
    absenceReason: request.reason,
    absenceDetail: request.reasonDetail,
    isSubjectSwap: request.reason === 'SUBJECT_SWAP',
  };

  await db.notification.create({
    data: {
      type: 'TEACHER_ASSIGNED',
      title: `Substitution Assignment - ${request.schedule.subject.name}`,
      message: `You have been assigned to take ${request.schedule.subject.name} for Grade ${request.schedule.grade.name} Section ${request.schedule.section.name} on ${request.date} from ${request.schedule.timeSlot.startTime} to ${request.schedule.timeSlot.endTime}.\n\nOriginal teacher: ${request.originalTeacher.name} (${request.reason.toLowerCase()})${previousDayContext.topic ? `\n📖 Previous Day Topic: "${previousDayContext.topic}"` : ''}\n📝 Today's Topic: ${topicList}`,
      data: JSON.stringify({ assignmentId: assignment.id, requestId, lessonPlan }),
      teacherId: substituteTeacherId,
      targetRole: 'TEACHER',
      assignmentId: assignment.id,
      substitutionRequestId: requestId,
    },
  });

  return assignment;
}

// ─── Accept Substitution ───────────────────────────────────────────────────────

export async function acceptSubstitution(assignmentId: string) {
  const assignment = await db.substitutionAssignment.findUnique({
    where: { id: assignmentId },
    include: {
      substitutionRequest: {
        include: {
          schedule: { include: { subject: true, grade: true, section: true, timeSlot: true } },
          originalTeacher: true,
        },
      },
      substituteTeacher: true,
    },
  });

  if (!assignment) throw new Error('Assignment not found');

  await db.substitutionAssignment.update({
    where: { id: assignmentId },
    data: { status: 'ACCEPTED' },
  });

  await db.substitutionRequest.update({
    where: { id: assignment.substitutionRequestId },
    data: { status: 'RESOLVED' },
  });

  await db.notification.create({
    data: {
      type: 'TEACHER_ACCEPTED',
      title: `Substitution Confirmed - ${assignment.substitutionRequest.schedule.subject.name}`,
      message: `${assignment.substituteTeacher.name} has ACCEPTED the substitution for ${assignment.substitutionRequest.schedule.subject.name} (Grade ${assignment.substitutionRequest.schedule.grade.name} Section ${assignment.substitutionRequest.schedule.section.name}) on ${assignment.substitutionRequest.date}. Topic: ${assignment.topic}.`,
      data: JSON.stringify({
        assignmentId,
        teacherName: assignment.substituteTeacher.name,
        subject: assignment.substitutionRequest.schedule.subject.name,
      }),
      targetRole: 'ADMIN',
      assignmentId,
      substitutionRequestId: assignment.substitutionRequestId,
    },
  });

  // Student notifications removed for MVP - school admin and teachers are the primary users

  return assignment;
}

// ─── Reject Substitution ───────────────────────────────────────────────────────

export async function rejectSubstitution(assignmentId: string, rejectionReason: string) {
  const assignment = await db.substitutionAssignment.findUnique({
    where: { id: assignmentId },
    include: {
      substitutionRequest: {
        include: {
          schedule: { include: { subject: true, grade: true, section: true, timeSlot: true } },
          originalTeacher: true,
          assignments: { where: { status: { in: ['PENDING', 'ACCEPTED'] } }, include: { substituteTeacher: true } },
        },
      },
      substituteTeacher: true,
    },
  });

  if (!assignment) throw new Error('Assignment not found');

  await db.substitutionAssignment.update({
    where: { id: assignmentId },
    data: { status: 'REJECTED', rejectionReason },
  });

  const request = assignment.substitutionRequest;
  const schedule = request.schedule;

  // Try to find the next best candidate
  const candidates = await findSubstituteCandidates({
    subjectId: schedule.subjectId,
    gradeLevel: schedule.grade.level,
    date: request.date,
    dayOfWeek: schedule.dayOfWeek,
    timeSlotId: schedule.timeSlotId,
    absentTeacherId: request.originalTeacherId,
    sectionId: schedule.sectionId,
  });

  const rejectedTeacherIds = request.assignments
    .filter(a => a.status === 'REJECTED')
    .map(a => a.substituteTeacherId);
  rejectedTeacherIds.push(assignment.substituteTeacherId);

  const nextCandidate = candidates.find(
    c => c.isAvailable && !rejectedTeacherIds.includes(c.teacherId)
  );

  if (nextCandidate) {
    // Auto-reassign with ACCEPTED status
    const previousDayContext = await getPreviousDayTopic(schedule.subjectId, schedule.sectionId, request.date);
    const topic = await generateTopicSuggestion(schedule.subject.name, schedule.grade.level, schedule.topic, previousDayContext.topic);

    const newAssignment = await db.substitutionAssignment.create({
      data: {
        substitutionRequestId: request.id,
        substituteTeacherId: nextCandidate.teacherId,
        status: 'ACCEPTED',
        assignedBy: 'AI_AGENT',
        topic,
        reasons: JSON.stringify(nextCandidate.reasons.slice(0, 3)),
        aiConfidence: Math.min(100, Math.max(0, nextCandidate.score)),
      },
    });

    await db.substitutionRequest.update({
      where: { id: request.id },
      data: { status: 'RESOLVED' },
    });

    await db.notification.create({
      data: {
        type: 'AI_AUTO_ASSIGNED',
        title: `Re-assigned Substitute - ${schedule.subject.name}`,
        message: `After rejection by ${assignment.substituteTeacher.name}, AI has auto-assigned ${nextCandidate.teacherName} (Score: ${nextCandidate.score}/100) as substitute for ${schedule.subject.name} Grade ${schedule.grade.name} Section ${schedule.section.name}.`,
        data: JSON.stringify({
          requestId: request.id,
          assignmentId: newAssignment.id,
          rejectedTeacher: assignment.substituteTeacher.name,
          newSubstitute: nextCandidate.teacherName,
          score: nextCandidate.score,
        }),
        targetRole: 'ADMIN',
        substitutionRequestId: request.id,
        assignmentId: newAssignment.id,
      },
    });

    await db.notification.create({
      data: {
        type: 'TEACHER_ASSIGNED',
        title: `Substitution Assignment - ${schedule.subject.name}`,
        message: `You have been assigned to take ${schedule.subject.name} for Grade ${schedule.grade.name} Section ${schedule.section.name} on ${request.date} from ${schedule.timeSlot.startTime} to ${schedule.timeSlot.endTime}.\n\nOriginal teacher: ${request.originalTeacher.name}\n📝 Topic: ${topic}`,
        data: JSON.stringify({ assignmentId: newAssignment.id, requestId: request.id, topic }),
        teacherId: nextCandidate.teacherId,
        targetRole: 'TEACHER',
        assignmentId: newAssignment.id,
        substitutionRequestId: request.id,
      },
    });
  } else {
    // No more candidates - set back to PENDING for admin
    await db.substitutionRequest.update({
      where: { id: request.id },
      data: { status: 'PENDING' },
    });

    await db.notification.create({
      data: {
        type: 'SUBSTITUTION_NEEDED',
        title: `Substitution Rejected - Manual Assignment Needed`,
        message: `${assignment.substituteTeacher.name} rejected the substitution for ${schedule.subject.name} Grade ${schedule.grade.name} Section ${schedule.section.name}. No more auto-assign candidates available. Manual intervention required.`,
        data: JSON.stringify({ requestId: request.id, rejectionReason }),
        targetRole: 'ADMIN',
        substitutionRequestId: request.id,
      },
    });
  }

  return assignment;
}

// ─── Conflict Detection (Feature 6) ──────────────────────────────────────────

async function detectAndAlertConflicts(
  date: string,
  scheduleDay: number,
  results: AISubstitutionResult[],
) {
  // 1. Teacher overload: any teacher assigned 3+ substitutions in a single day
  const subCountByTeacher = new Map<string, { name: string; count: number; subjects: string[] }>();

  for (const result of results) {
    if (result.autoAssignment) {
      const existing = subCountByTeacher.get(result.autoAssignment.substituteTeacherId) || { name: result.autoAssignment.substituteTeacherName, count: 0, subjects: [] };
      existing.count++;
      existing.subjects.push(result.subject);
      subCountByTeacher.set(result.autoAssignment.substituteTeacherId, existing);
    }
  }

  for (const [teacherId, info] of subCountByTeacher) {
    if (info.count > 2) {
      await db.notification.create({
        data: {
          type: 'OVERLOAD_ALERT',
          title: `⚠️ Teacher Overload Alert: ${info.name}`,
          message: `${info.name} has been assigned ${info.count} substitutions on ${dayName(scheduleDay)}, ${date}. This exceeds the recommended limit of 2 per day. Subjects: ${info.subjects.join(', ')}. Consider redistributing to other available teachers.`,
          data: JSON.stringify({
            teacherId, teacherName: info.name, overloadCount: info.count,
            subjects: info.subjects, date, alertType: 'OVERLOAD',
          }),
          targetRole: 'ADMIN',
        },
      });
    }
  }

  // 2. Department crisis: multiple teachers from the same department absent
  const absentDepts = new Map<string, { count: number; teachers: string[] }>();
  for (const result of results) {
    const dept = result.candidates.find(c => c.teacherId === result.autoAssignment?.substituteTeacherId)?.department;
    if (dept) {
      const existing = absentDepts.get(dept) || { count: 0, teachers: [] };
      existing.count++;
      existing.teachers.push(result.originalTeacher);
      absentDepts.set(dept, existing);
    }
  }

  for (const [dept, info] of absentDepts) {
    if (info.count >= 2) {
      await db.notification.create({
        data: {
          type: 'DEPARTMENT_CRISIS',
          title: `🚨 Department Crisis: ${dept}`,
          message: `${info.count} teachers from the ${dept} department are absent on ${dayName(scheduleDay)}, ${date}: ${info.teachers.join(', ')}. The ${dept} department may have significant coverage gaps. Consider cross-department substitution support.`,
          data: JSON.stringify({
            department: dept, absentCount: info.count, teachers: info.teachers,
            date, alertType: 'DEPARTMENT_CRISIS',
          }),
          targetRole: 'ADMIN',
        },
      });
    }
  }
}
