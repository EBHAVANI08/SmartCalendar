import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import ZAI from 'z-ai-web-dev-sdk';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const MAX_PERIODS_PER_DAY = 8;
const OVERLOAD_THRESHOLD = 5; // More than 5 periods = overloaded

// Related subjects mapping
const RELATED_SUBJECTS: Record<string, string[]> = {
  'Mathematics': ['Physics', 'Computer Science', 'Economics'],
  'Physics': ['Mathematics', 'Chemistry', 'Computer Science'],
  'Chemistry': ['Physics', 'Biology', 'Mathematics'],
  'Biology': ['Chemistry', 'Physics', 'Environmental Science'],
  'English': ['Hindi', 'Social Studies', 'History'],
  'Hindi': ['English', 'Sanskrit', 'Social Studies'],
  'Sanskrit': ['Hindi', 'English', 'Social Studies'],
  'History': ['Social Studies', 'Geography', 'Civics', 'English'],
  'Geography': ['Social Studies', 'History', 'Environmental Science', 'Civics'],
  'Civics': ['Social Studies', 'History', 'Geography'],
  'Social Studies': ['History', 'Geography', 'Civics', 'English'],
  'Computer Science': ['Mathematics', 'Physics'],
  'Economics': ['Mathematics', 'Social Studies'],
  'Environmental Science': ['Biology', 'Chemistry', 'Geography'],
  'Physical Education': ['Biology', 'Science'],
  'Art': ['English', 'History'],
  'Music': ['English', 'Hindi'],
};

interface TeacherWorkloadInfo {
  teacherId: string;
  teacherName: string;
  subject: string;
  grades: string[];
  dailyPeriods: Record<string, number>;
  totalPeriods: number;
  overloadedDays: string[];
  isOverloaded: boolean;
}

interface ReassignmentPlan {
  teacherId: string;
  teacherName: string;
  fromDay: string;
  fromPeriod: number;
  scheduleId: string;
  grade: string;
  section: string;
  subject: string;
  newTeacherId: string;
  newTeacherName: string;
  newTeacherSubject: string;
  matchReason: string;
  matchScore: number;
}

export async function POST(request: Request) {
  try {
    const { teacherIds, targetMaxPeriods = OVERLOAD_THRESHOLD } = await request.json();

    // 1. Load all teachers with their complete schedules
    const allTeachers = await db.teacher.findMany({
      include: { schedules: true },
    });

    // 2. Compute workload for each teacher
    const workloadMap: Record<string, TeacherWorkloadInfo> = {};
    for (const teacher of allTeachers) {
      const dailyPeriods: Record<string, number> = {};
      let totalPeriods = 0;
      for (const day of DAYS) {
        const count = teacher.schedules.filter((s) => s.day === day).length;
        dailyPeriods[day] = count;
        totalPeriods += count;
      }

      const overloadedDays = DAYS.filter((day) => dailyPeriods[day] > targetMaxPeriods);

      workloadMap[teacher.id] = {
        teacherId: teacher.id,
        teacherName: teacher.name,
        subject: teacher.subject,
        grades: JSON.parse(teacher.grades || '[]') as string[],
        dailyPeriods,
        totalPeriods,
        overloadedDays,
        isOverloaded: overloadedDays.length > 0,
      };
    }

    // 3. Identify overloaded teachers (filter by requested IDs or all)
    const overloadedTeachers = Object.values(workloadMap).filter((t) => {
      if (teacherIds && teacherIds.length > 0) {
        return teacherIds.includes(t.teacherId) && t.isOverloaded;
      }
      return t.isOverloaded;
    });

    if (overloadedTeachers.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No overloaded teachers found. All teachers are within the workload threshold.',
        reassignments: [],
        summary: { overloadedCount: 0, reassignedCount: 0, balancedCount: 0 },
      });
    }

    // 4. Build reassignment plans
    const reassignments: ReassignmentPlan[] = [];
    const updatedWorkloadMap = JSON.parse(JSON.stringify(workloadMap)) as Record<string, TeacherWorkloadInfo>;

    for (const overloaded of overloadedTeachers) {
      // For each overloaded day, find periods that can be moved
      for (const day of overloaded.overloadedDays) {
        const currentDayPeriods = updatedWorkloadMap[overloaded.teacherId].dailyPeriods[day];

        if (currentDayPeriods <= targetMaxPeriods) continue; // Already balanced

        // Get all schedules for this teacher on this overloaded day
        const teacherSchedules = await db.schedule.findMany({
          where: {
            teacherId: overloaded.teacherId,
            day,
          },
          orderBy: { period: 'asc' },
        });

        // Try to reassign excess periods (keep only targetMaxPeriods)
        const excessCount = currentDayPeriods - targetMaxPeriods;
        let reassignedThisDay = 0;

        for (const sched of teacherSchedules) {
          if (reassignedThisDay >= excessCount) break;

          // Find the best replacement teacher for this slot
          const relatedTo = RELATED_SUBJECTS[sched.subject] || [];
          const busyAtSlot = await db.schedule.findMany({
            where: { day, period: sched.period, teacherId: { not: null } },
          });
          const busyTeacherIds = new Set(busyAtSlot.map((s) => s.teacherId!));

          // Score all available (non-busy, non-overloaded) teachers
          const candidates = allTeachers
            .filter((t) => {
              if (t.id === overloaded.teacherId) return false;
              if (busyTeacherIds.has(t.id)) return false;
              const tWorkload = updatedWorkloadMap[t.id];
              if (!tWorkload) return false;
              // Only consider teachers who won't become overloaded
              if (tWorkload.dailyPeriods[day] >= targetMaxPeriods) return false;
              return true;
            })
            .map((t) => {
              const tWorkload = updatedWorkloadMap[t.id];
              const teacherGrades = JSON.parse(t.grades || '[]') as string[];

              const teachesSubject = t.subject === sched.subject;
              const teachesRelatedSubject = relatedTo.includes(t.subject);
              const teachesGrade = teacherGrades.includes(sched.grade);
              const teachesSimilarGrade = teacherGrades.some((g: string) => {
                const gNum = parseInt(g.replace(/\D/g, ''));
                const targetNum = parseInt(sched.grade.replace(/\D/g, ''));
                return !isNaN(gNum) && !isNaN(targetNum) && Math.abs(gNum - targetNum) <= 1;
              });

              let score = 0;
              if (teachesSubject) score += 50;
              if (teachesGrade) score += 30;
              else if (teachesSimilarGrade) score += 15;
              if (teachesRelatedSubject) score += 20;
              // Strongly prefer teachers with fewer periods (balance seeking)
              score += Math.max(0, (targetMaxPeriods - tWorkload.dailyPeriods[day])) * 6;

              let matchReason = '';
              if (teachesSubject && teachesGrade) matchReason = 'Same subject & grade specialist';
              else if (teachesSubject) matchReason = 'Subject specialist';
              else if (teachesRelatedSubject && teachesGrade) matchReason = 'Related subject + same grade';
              else if (teachesRelatedSubject) matchReason = 'Related subject teacher';
              else if (teachesGrade) matchReason = 'Same grade teacher';
              else if (teachesSimilarGrade) matchReason = 'Similar grade teacher';
              else matchReason = 'Available teacher with capacity';

              return {
                teacher: t,
                score,
                matchReason,
                teachesSubject,
                teachesGrade,
                teachesRelatedSubject,
                currentDayLoad: tWorkload.dailyPeriods[day],
              };
            })
            .sort((a, b) => b.score - a.score);

          if (candidates.length > 0) {
            const best = candidates[0];

            // Verify no conflict
            const conflict = await db.schedule.findFirst({
              where: {
                teacherId: best.teacher.id,
                day,
                period: sched.period,
              },
            });

            if (!conflict) {
              reassignments.push({
                teacherId: overloaded.teacherId,
                teacherName: overloaded.teacherName,
                fromDay: day,
                fromPeriod: sched.period,
                scheduleId: sched.id,
                grade: sched.grade,
                section: sched.section,
                subject: sched.subject,
                newTeacherId: best.teacher.id,
                newTeacherName: best.teacher.name,
                newTeacherSubject: best.teacher.subject,
                matchReason: best.matchReason,
                matchScore: best.score,
              });

              // Update virtual workload map
              updatedWorkloadMap[overloaded.teacherId].dailyPeriods[day]--;
              updatedWorkloadMap[best.teacher.id].dailyPeriods[day]++;
              reassignedThisDay++;
            }
          }
        }
      }
    }

    if (reassignments.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'Overloaded teachers identified, but no suitable reassignment candidates found. Consider adding more teachers or reducing schedule commitments.',
        overloadedTeachers: overloadedTeachers.map(t => ({
          name: t.teacherName,
          subject: t.subject,
          overloadedDays: t.overloadedDays,
          dailyPeriods: t.dailyPeriods,
        })),
        reassignments: [],
        summary: { overloadedCount: overloadedTeachers.length, reassignedCount: 0, balancedCount: 0 },
      });
    }

    // 5. Execute reassignments in database
    const executionResults: { scheduleId: string; success: boolean; error?: string }[] = [];

    for (const plan of reassignments) {
      try {
        // Verify one last time before executing
        const existingSchedule = await db.schedule.findUnique({
          where: { id: plan.scheduleId },
        });

        if (!existingSchedule || existingSchedule.teacherId !== plan.teacherId) {
          executionResults.push({ scheduleId: plan.scheduleId, success: false, error: 'Schedule changed since planning' });
          continue;
        }

        // Verify replacement teacher has no conflict
        const replacementConflict = await db.schedule.findFirst({
          where: {
            teacherId: plan.newTeacherId,
            day: plan.fromDay,
            period: plan.fromPeriod,
          },
        });

        if (replacementConflict) {
          executionResults.push({ scheduleId: plan.scheduleId, success: false, error: 'New teacher has conflict' });
          continue;
        }

        // Execute the reassignment
        await db.schedule.update({
          where: { id: plan.scheduleId },
          data: { teacherId: plan.newTeacherId },
        });

        executionResults.push({ scheduleId: plan.scheduleId, success: true });
      } catch (err) {
        executionResults.push({ scheduleId: plan.scheduleId, success: false, error: String(err) });
      }
    }

    const successCount = executionResults.filter((r) => r.success).length;

    // 6. Generate AI-powered lesson plans for reassigned teachers
    let lessonPlansGenerated = 0;
    try {
      const zai = await ZAI.create();

      for (const plan of reassignments) {
        const execResult = executionResults.find((r) => r.scheduleId === plan.scheduleId);
        if (!execResult?.success) continue;

        try {
          // Get curriculum topics for context
          const curriculumTopics = await db.curriculumTopic.findMany({
            where: {
              grade: plan.grade,
              subject: plan.subject,
            },
            take: 5,
            orderBy: { sequenceOrder: 'asc' },
          });

          const topicContext = curriculumTopics.length > 0
            ? curriculumTopics.map((t) => t.topic).join(', ')
            : 'General curriculum topics';

          const lessonPlanResponse = await zai.chat.completions.create({
            messages: [
              {
                role: 'system',
                content: 'You are an expert CBSE lesson plan designer. Generate concise, practical lesson plans.',
              },
              {
                role: 'user',
                content: `Create a brief lesson plan for:
Subject: ${plan.subject}
Grade: ${plan.grade} Section ${plan.section}
Topic context: ${topicContext}
Period: ${plan.fromPeriod} on ${plan.fromDay}
Teacher: ${plan.newTeacherName} (${plan.newTeacherSubject} specialist)

Return JSON only:
{
  "objectives": ["obj1", "obj2"],
  "warmUp": "5 min activity",
  "mainContent": "20 min teaching approach",
  "assessment": "quick check method",
  "homework": "brief assignment"
}`,
              },
            ],
            temperature: 0.6,
            max_tokens: 400,
          });

          const planContent = lessonPlanResponse.choices?.[0]?.message?.content || '{}';

          // Save lesson plan
          let parsedPlan: Record<string, unknown> = {};
          try {
            parsedPlan = typeof planContent === 'string' ? JSON.parse(planContent) : (planContent as Record<string, unknown>);
          } catch {
            parsedPlan = { raw: planContent };
          }

          await db.lessonPlan.create({
            data: {
              teacherId: plan.newTeacherId,
              grade: plan.grade,
              section: plan.section,
              subject: plan.subject,
              topic: `Workload Balanced - ${plan.fromDay} P${plan.fromPeriod}`,
              board: 'CBSE',
              duration: 40,
              aiGenerated: true,
              planContent: JSON.stringify(parsedPlan),
              objectives: JSON.stringify(parsedPlan.objectives || []),
              warmUp: (parsedPlan.warmUp as string) || '',
              mainContent: (parsedPlan.mainContent as string) || '',
              differentiation: '',
              assessment: (parsedPlan.assessment as string) || '',
              resources: JSON.stringify(parsedPlan.resources || []),
              homework: (parsedPlan.homework as string) || '',
              keyVocabulary: JSON.stringify(parsedPlan.keyVocabulary || []),
            },
          });

          lessonPlansGenerated++;
        } catch (lpErr) {
          console.error('Lesson plan generation failed for reassignment:', lpErr);
          // Continue even if lesson plan fails
        }
      }
    } catch (aiErr) {
      console.error('AI initialization failed for lesson plans:', aiErr);
      // Non-critical - reassignments still happened
    }

    // 7. Send notifications to affected teachers
    const notificationsSent: string[] = [];

    for (const plan of reassignments) {
      const execResult = executionResults.find((r) => r.scheduleId === plan.scheduleId);
      if (!execResult?.success) continue;

      try {
        // Notify the new teacher
        await db.teacherNotification.create({
          data: {
            type: 'workload_reassignment',
            referenceId: plan.scheduleId,
            teacherId: plan.newTeacherId,
            sentBy: 'AI Workload Balancer',
            title: 'New Period Assignment — AI Workload Balance',
            description: `You have been assigned ${plan.subject} for ${plan.grade} ${plan.section}, ${plan.fromDay} Period ${plan.fromPeriod}. This was done to balance the workload of ${plan.teacherName} who had excessive periods. A lesson plan has been prepared for you.`,
            isRead: false,
          },
        });
        notificationsSent.push(plan.newTeacherName);

        // Notify the relieved teacher
        await db.teacherNotification.create({
          data: {
            type: 'workload_relief',
            referenceId: plan.scheduleId,
            teacherId: plan.teacherId,
            sentBy: 'AI Workload Balancer',
            title: 'Period Relieved — AI Workload Balance',
            description: `Your ${plan.subject} period for ${plan.grade} ${plan.section}, ${plan.fromDay} Period ${plan.fromPeriod} has been reassigned to ${plan.newTeacherName} to balance your workload. You now have fewer periods on ${plan.fromDay}.`,
            isRead: false,
          },
        });
        notificationsSent.push(plan.teacherName);
      } catch (notifErr) {
        console.error('Notification creation failed:', notifErr);
      }
    }

    // 8. Recompute final workload stats
    const finalTeachers = await db.teacher.findMany({
      include: { schedules: true },
    });

    const finalWorkload = finalTeachers.map((t) => {
      const dailyPeriods: Record<string, number> = {};
      for (const day of DAYS) {
        dailyPeriods[day] = t.schedules.filter((s) => s.day === day).length;
      }
      return {
        teacherId: t.id,
        teacherName: t.name,
        subject: t.subject,
        dailyPeriods,
        isOverloaded: Object.values(dailyPeriods).some((p) => p > targetMaxPeriods),
      };
    });

    const stillOverloaded = finalWorkload.filter((t) => t.isOverloaded).length;
    const nowBalanced = overloadedTeachers.length - stillOverloaded;

    // 9. Build comprehensive response
    return NextResponse.json({
      success: true,
      message: `AI Workload Balancer completed: ${successCount} period(s) reassigned, ${lessonPlansGenerated} lesson plan(s) generated, ${notificationsSent.length} notification(s) sent.`,
      reassignments: reassignments.map((r, i) => ({
        ...r,
        executed: executionResults[i]?.success || false,
        error: executionResults[i]?.error,
      })),
      summary: {
        overloadedCount: overloadedTeachers.length,
        reassignedCount: successCount,
        balancedCount: Math.max(0, nowBalanced),
        stillOverloaded,
        lessonPlansGenerated,
        notificationsSent: notificationsSent.length,
      },
      beforeWorkload: overloadedTeachers.map((t) => ({
        teacherName: t.teacherName,
        subject: t.subject,
        dailyPeriods: t.dailyPeriods,
        overloadedDays: t.overloadedDays,
      })),
      afterWorkload: finalWorkload.filter((t) =>
        overloadedTeachers.some((o) => o.teacherId === t.teacherId) || t.isOverloaded
      ),
    });
  } catch (error) {
    console.error('Error in AI workload balancing:', error);
    return NextResponse.json({ error: 'Failed to balance workload: ' + String(error) }, { status: 500 });
  }
}
