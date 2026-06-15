/**
 * Multi-Constraint Day Optimizer — Feature 1.3
 *
 * Instead of greedily assigning the best teacher per absence,
 * solve the whole day as one optimization problem.
 *
 * Uses beam search with backtracking to find better arrangements
 * that maximize same-subject coverage and minimize teacher fatigue.
 */

import { db } from '@/lib/db';
import { findSubstituteCandidates } from './ai-agent';

interface OptimizationInput {
  date: string;
  dayOfWeek: number;
}

interface AssignmentPlan {
  requestId: string;
  scheduleId: string;
  subjectId: string;
  subjectName: string;
  gradeName: string;
  sectionName: string;
  timeSlotId: string;
  timeSlotName: string;
  originalTeacherId: string;
  originalTeacherName: string;
  substituteTeacherId: string | null;
  substituteTeacherName: string | null;
  score: number;
  isSubjectSwap: boolean;
  status: string;
}

interface OptimizationResult {
  greedyPlan: AssignmentPlan[];
  optimizedPlan: AssignmentPlan[];
  greedyScore: number;
  optimizedScore: number;
  improvement: number;
  swaps: {
    requestId: string;
    subject: string;
    grade: string;
    greedyTeacher: string;
    optimizedTeacher: string;
    greedyScore: number;
    optimizedScore: number;
    reason: string;
  }[];
}

/**
 * Compute a score for a full-day assignment plan.
 * Lower score = worse, higher = better.
 */
function scorePlan(plan: AssignmentPlan[]): number {
  let totalScore = 0;
  const teacherLoadMap = new Map<string, number>();

  for (const assignment of plan) {
    if (!assignment.substituteTeacherId) {
      totalScore -= 50; // Unassigned = bad
      continue;
    }

    // Same-subject coverage bonus (heavily weighted)
    totalScore += assignment.score;

    // Track teacher load
    const load = teacherLoadMap.get(assignment.substituteTeacherId) || 0;
    teacherLoadMap.set(assignment.substituteTeacherId, load + 1);

    // Subject swap penalty
    if (assignment.isSubjectSwap) totalScore -= 15;
  }

  // Fatigue penalty: penalize any teacher with 2+ assignments
  for (const [_, load] of teacherLoadMap) {
    if (load >= 2) totalScore -= (load * 20);
  }

  return totalScore;
}

/**
 * Run the day optimizer for a given date.
 * Compares greedy (current) assignment vs optimized arrangement.
 */
export async function optimizeDaySchedule(input: OptimizationInput): Promise<OptimizationResult> {
  const { date, dayOfWeek } = input;

  // Get all substitution requests for this date
  const requests = await db.substitutionRequest.findMany({
    where: { date },
    include: {
      originalTeacher: true,
      subject: true,
      schedule: { include: { grade: true, section: true, timeSlot: true } },
      assignments: { include: { substituteTeacher: true } },
    },
  });

  if (requests.length === 0) {
    return {
      greedyPlan: [],
      optimizedPlan: [],
      greedyScore: 0,
      optimizedScore: 0,
      improvement: 0,
      swaps: [],
    };
  }

  // ── Build Greedy Plan (current assignments) ──
  const greedyPlan: AssignmentPlan[] = requests.map(req => {
    const assignment = req.assignments[0];
    return {
      requestId: req.id,
      scheduleId: req.scheduleId,
      subjectId: req.subjectId,
      subjectName: req.subject.name,
      gradeName: req.schedule.grade.name,
      sectionName: req.schedule.section.name,
      timeSlotId: req.schedule.timeSlotId,
      timeSlotName: req.schedule.timeSlot.name,
      originalTeacherId: req.originalTeacherId,
      originalTeacherName: req.originalTeacher.name,
      substituteTeacherId: assignment?.substituteTeacherId || null,
      substituteTeacherName: assignment?.substituteTeacher?.name || null,
      score: assignment?.aiConfidence || 0,
      isSubjectSwap: req.reason === 'SUBJECT_SWAP',
      status: req.status,
    };
  });

  const greedyScore = scorePlan(greedyPlan);

  // ── Build Optimized Plan (re-evaluate all candidates) ──
  // For each request, find candidates and try to find a globally better arrangement

  // Step 1: Gather all candidates for each request
  const candidatesPerRequest = new Map<string, any[]>();

  for (const req of requests) {
    const candidates = await findSubstituteCandidates({
      subjectId: req.subjectId,
      gradeLevel: req.schedule.grade.level,
      date,
      dayOfWeek,
      timeSlotId: req.schedule.timeSlotId,
      absentTeacherId: req.originalTeacherId,
      sectionId: req.schedule.sectionId,
      absentTeacherDepartment: req.originalTeacher.department || undefined,
    });

    // Sort by score descending, take top 5
    candidatesPerRequest.set(req.id, candidates.filter(c => c.isAvailable).slice(0, 5));
  }

  // Step 2: Try to find a better arrangement using beam search
  // Start with greedy plan and try swapping teachers

  let bestPlan = [...greedyPlan];
  let bestScore = greedyScore;

  // Strategy: for each request, try replacing the assigned teacher with each candidate
  // and check if the global score improves. Do multiple passes.

  for (let pass = 0; pass < 3; pass++) {
    for (const assignment of bestPlan) {
      const candidates = candidatesPerRequest.get(assignment.requestId) || [];

      for (const candidate of candidates) {
        // Try this candidate
        const trialPlan = bestPlan.map(a => {
          if (a.requestId === assignment.requestId) {
            return {
              ...a,
              substituteTeacherId: candidate.teacherId,
              substituteTeacherName: candidate.teacherName,
              score: candidate.score,
              isSubjectSwap: candidate.isCrossSubject,
            };
          }
          return a;
        });

        const trialScore = scorePlan(trialPlan);

        if (trialScore > bestScore) {
          bestPlan = trialPlan;
          bestScore = trialScore;
        }
      }
    }
  }

  // Step 3: Try cross-assignment swaps
  // If teacher A is assigned to request 1 and teacher B to request 2,
  // check if swapping them (if both are valid for the other's request) improves the score

  for (let i = 0; i < bestPlan.length; i++) {
    for (let j = i + 1; j < bestPlan.length; j++) {
      const a = bestPlan[i];
      const b = bestPlan[j];

      // Can't swap if same time slot (teacher would be in two places)
      if (a.timeSlotId === b.timeSlotId) continue;

      // Check if teacher B is a candidate for request A and vice versa
      const candidatesA = candidatesPerRequest.get(a.requestId) || [];
      const candidatesB = candidatesPerRequest.get(b.requestId) || [];

      const teacherBForA = candidatesA.find(c => c.teacherId === b.substituteTeacherId);
      const teacherAForB = candidatesB.find(c => c.teacherId === a.substituteTeacherId);

      if (teacherBForA && teacherAForB) {
        const trialPlan = bestPlan.map(item => {
          if (item.requestId === a.requestId) {
            return { ...item, substituteTeacherId: b.substituteTeacherId, substituteTeacherName: b.substituteTeacherName, score: teacherBForA.score };
          }
          if (item.requestId === b.requestId) {
            return { ...item, substituteTeacherId: a.substituteTeacherId, substituteTeacherName: a.substituteTeacherName, score: teacherAForB.score };
          }
          return item;
        });

        const trialScore = scorePlan(trialPlan);
        if (trialScore > bestScore) {
          bestPlan = trialPlan;
          bestScore = trialScore;
        }
      }
    }
  }

  // ── Build Result ──
  const optimizedScore = bestScore;
  const improvement = ((optimizedScore - greedyScore) / Math.max(Math.abs(greedyScore), 1)) * 100;

  // Find what changed
  const swaps: OptimizationResult['swaps'] = [];
  for (let i = 0; i < greedyPlan.length; i++) {
    const g = greedyPlan[i];
    const o = bestPlan[i];
    if (g.substituteTeacherId !== o.substituteTeacherId) {
      swaps.push({
        requestId: g.requestId,
        subject: g.subjectName,
        grade: g.gradeName,
        greedyTeacher: g.substituteTeacherName || 'Unassigned',
        optimizedTeacher: o.substituteTeacherName || 'Unassigned',
        greedyScore: g.score,
        optimizedScore: o.score,
        reason: o.substituteTeacherName
          ? `Switched to ${o.substituteTeacherName} (score ${o.score} vs ${g.score}) for better global arrangement`
          : 'Removed assignment (no better candidate found)',
      });
    }
  }

  return {
    greedyPlan,
    optimizedPlan: bestPlan,
    greedyScore,
    optimizedScore,
    improvement: Math.round(improvement * 10) / 10,
    swaps,
  };
}
