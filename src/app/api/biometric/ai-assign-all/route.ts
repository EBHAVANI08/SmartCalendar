import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import ZAI from 'z-ai-web-dev-sdk';

const MAX_PERIODS_PER_DAY = 8;

// AI-powered bulk substitution assignment
// Uses a hybrid approach:
// 1. Algorithmic scoring for fast, deterministic filtering (subject, grade, workload, familiarity)
// 2. AI reasoning for context-aware, pedagogically intelligent final selection
export async function POST(request: Request) {
  try {
    const { date } = await request.json();
    const assignDate = date || new Date().toISOString().split('T')[0];

    // Get day of week
    const dateObj = new Date(assignDate + 'T00:00:00');
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayName = dayNames[dateObj.getDay()];

    // Get all pending biometric substitutions for this date
    const pendingSubs = await db.substitution.findMany({
      where: {
        date: assignDate,
        source: 'biometric',
        status: 'pending',
      },
      include: {
        absentTeacher: true,
      },
      orderBy: { period: 'asc' },
    });

    if (pendingSubs.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No pending biometric substitutions to assign',
        assigned: 0,
        failed: 0,
        assignments: [],
      });
    }

    // Get all teachers with their schedules for today
    const allTeachers = await db.teacher.findMany({
      include: {
        schedules: {
          where: { day: dayName },
        },
      },
    });

    // Get already-assigned substitutions for today (to track workload)
    const todayAssignedSubs = await db.substitution.findMany({
      where: {
        date: assignDate,
        status: 'assigned',
      },
    });

    // Get all biometric records for today (batch query instead of per-teacher)
    const allBiometricRecords = await db.biometricAttendance.findMany({
      where: { date: assignDate },
    });
    const absentTeacherIds = new Set(
      allBiometricRecords
        .filter(r => r.status === 'absent' || r.status === 'half-day')
        .map(r => r.teacherId)
    );

    // Build a workload map: teacherId -> { regularPeriods: Set, substitutionPeriods: Set }
    const workloadMap = new Map<string, { regularPeriods: Set<number>; substitutionPeriods: Set<number> }>();

    for (const teacher of allTeachers) {
      const regularPeriods = new Set(teacher.schedules.map(s => s.period));
      const substitutionPeriods = new Set<number>();

      for (const sub of todayAssignedSubs) {
        if (sub.substituteId === teacher.id) {
          substitutionPeriods.add(sub.period);
        }
      }

      workloadMap.set(teacher.id, { regularPeriods, substitutionPeriods });
    }

    // ── PHASE 1: Algorithmic Scoring for ALL pending substitutions ──
    const allEligiblePools = new Map<string, {
      teacher: typeof allTeachers[0];
      score: number;
      teachesSubject: boolean;
      teachesGrade: boolean;
      teachesSimilarGrade: boolean;
      totalWorkload: number;
      hasClassFamiliarity: boolean;
    }[]>();

    for (const sub of pendingSubs) {
      const { period, grade, section, subject, absentTeacherId } = sub;
      const eligibleTeachers = [];

      for (const teacher of allTeachers) {
        // Skip absent teacher
        if (teacher.id === absentTeacherId) continue;

        const workload = workloadMap.get(teacher.id);
        if (!workload) continue;

        // Check availability: not busy at this period (regular or substitution)
        const isBusyAtPeriod = workload.regularPeriods.has(period) || workload.substitutionPeriods.has(period);
        if (isBusyAtPeriod) continue;

        // Check total workload doesn't exceed max
        const totalWorkload = workload.regularPeriods.size + workload.substitutionPeriods.size;
        if (totalWorkload >= MAX_PERIODS_PER_DAY) continue;

        // Check if this teacher is absent today (using batch query)
        if (absentTeacherIds.has(teacher.id)) continue;

        // Scoring system
        const teacherGrades = JSON.parse(teacher.grades || '[]') as string[];
        const teachesSubject = teacher.subject === subject;
        const teachesGrade = teacherGrades.includes(grade);
        const teachesSimilarGrade = teacherGrades.some(g => {
          const gNum = parseInt(g.replace(/\D/g, ''));
          const targetNum = parseInt(grade.replace(/\D/g, ''));
          return Math.abs(gNum - targetNum) <= 1;
        });

        let score = 0;
        if (teachesSubject) score += 40;
        if (teachesGrade) score += 25;
        if (!teachesGrade && teachesSimilarGrade) score += 15;
        const workloadRatio = totalWorkload / MAX_PERIODS_PER_DAY;
        score += Math.round((1 - workloadRatio) * 10);
        const hasClassFamiliarity = teacher.schedules.some(
          s => s.grade === grade && s.section === section
        );
        if (hasClassFamiliarity) score += 10;
        if (workload.substitutionPeriods.size > 0) {
          score -= workload.substitutionPeriods.size * 2;
        }

        eligibleTeachers.push({
          teacher,
          score,
          teachesSubject,
          teachesGrade,
          teachesSimilarGrade,
          totalWorkload,
          hasClassFamiliarity,
        });
      }

      eligibleTeachers.sort((a, b) => b.score - a.score);
      allEligiblePools.set(sub.id, eligibleTeachers);
    }

    // ── PHASE 2: AI Reasoning for Intelligent Selection ──
    // Build context for AI to make pedagogically sound decisions
    let aiDecisions: Record<string, { teacherId: string; reasoning: string }> = {};

    try {
      const zai = await ZAI.create();

      // Build a concise summary of all substitutions and their top candidates for AI
      const aiContext = pendingSubs.map(sub => {
        const pool = allEligiblePools.get(sub.id) || [];
        const topCandidates = pool.slice(0, 5).map(c => ({
          id: c.teacher.id,
          name: c.teacher.name,
          subject: c.teacher.subject,
          grades: JSON.parse(c.teacher.grades || '[]'),
          score: c.score,
          teachesSubject: c.teachesSubject,
          teachesGrade: c.teachesGrade,
          hasClassFamiliarity: c.hasClassFamiliarity,
          currentWorkload: c.totalWorkload,
          todayClasses: c.teacher.schedules.map(s => `P${s.period} ${s.grade}-${s.section} ${s.subject}`),
        }));

        return {
          substitutionId: sub.id,
          period: sub.period,
          grade: sub.grade,
          section: sub.section,
          subject: sub.subject,
          absentTeacher: sub.absentTeacher?.name || 'Unknown',
          absentTeacherSubject: sub.absentTeacher?.subject || 'Unknown',
          yesterdayTopic: sub.yesterdayTopic,
          todayExpectedTopic: sub.todayTopic,
          topCandidates,
        };
      });

      const aiPrompt = `You are an expert school substitution scheduler. Your job is to select the BEST substitute teacher for each absent teacher's class period.

KEY PRINCIPLES:
1. Subject continuity is paramount — a student should ideally be taught by someone who knows the subject
2. Grade familiarity matters — teachers who already teach that grade understand the students' level
3. Workload balance — don't overload one teacher with too many substitutions
4. Pedagogical value — if the absent teacher taught Math, a Physics teacher is better than a History teacher
5. Class familiarity — teachers who already teach that specific section know the students

For each substitution below, select the best teacher from the top candidates and explain WHY in one line.

Respond ONLY with valid JSON in this exact format:
{
  "substitutionId": { "teacherId": "id-of-best-teacher", "reasoning": "one-line explanation" }
}

SUBSTITUTIONS TO ASSIGN:
${JSON.stringify(aiContext, null, 2)}`;

      const completion = await zai.chat.completions.create({
        messages: [
          { role: 'system', content: 'You are an intelligent school scheduling AI. Always respond with valid JSON only. No markdown, no explanations outside JSON.' },
          { role: 'user', content: aiPrompt },
        ],
        temperature: 0.3,
        max_tokens: 2000,
      });

      const aiResponse = completion.choices?.[0]?.message?.content;
      if (aiResponse) {
        // Clean the response - remove any markdown code fences and extra text
        let cleaned = aiResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        // Try to extract JSON object if there's extra text around it
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          cleaned = jsonMatch[0];
        }
        // Try multiple JSON parse strategies for robustness
        try {
          aiDecisions = JSON.parse(cleaned);
        } catch {
          // Try fixing common JSON issues: trailing commas, single quotes, unquoted keys
          const fixed = cleaned
            .replace(/,\s*([}\]])/g, '$1')  // Remove trailing commas
            .replace(/'/g, '"')             // Single to double quotes
            .replace(/(\w+)\s*:/g, '"$1":') // Quote unquoted keys
            .replace(/""/g, '"');           // Fix double-quoted quotes
          try {
            aiDecisions = JSON.parse(fixed);
          } catch {
            // Last resort: try to extract individual key-value pairs
            const pairs: Record<string, { teacherId: string; reasoning: string }> = {};
            const pairRegex = /"([^"]+)"\s*:\s*\{[^}]*"teacherId"\s*:\s*"([^"]+)"[^}]*"reasoning"\s*:\s*"([^"]*)"[^}]*\}/g;
            let match;
            while ((match = pairRegex.exec(cleaned)) !== null) {
              pairs[match[1]] = { teacherId: match[2], reasoning: match[3] };
            }
            if (Object.keys(pairs).length > 0) {
              aiDecisions = pairs;
            } else {
              console.warn('[AI Auto-Assign] Could not parse AI response, using algorithmic fallback');
            }
          }
        }
        if (Object.keys(aiDecisions).length > 0) {
          console.log('[AI Auto-Assign] AI decisions received:', Object.keys(aiDecisions).length, 'assignments');
        }
      }
    } catch (aiError) {
      console.warn('[AI Auto-Assign] AI reasoning failed, falling back to algorithmic scoring:', aiError);
      // Fall back to pure algorithmic approach — no AI decisions
    }

    // ── PHASE 3: Execute Assignments ──
    const assignments = [];
    let assigned = 0;
    let failed = 0;

    for (const sub of pendingSubs) {
      const { period, grade, section, subject, absentTeacherId } = sub;
      const pool = allEligiblePools.get(sub.id) || [];

      if (pool.length === 0) {
        failed++;
        assignments.push({
          substitutionId: sub.id,
          period: sub.period,
          grade: sub.grade,
          section: sub.section,
          subject: sub.subject,
          assignedTeacher: null,
          assignedTeacherSubject: null,
          score: 0,
          reason: 'No eligible teacher found — requires manual assignment',
          aiReasoning: null,
        });
        continue;
      }

      // Try to use AI decision first, fall back to top algorithmic score
      const aiDecision = aiDecisions[sub.id];
      let best;

      if (aiDecision && aiDecision.teacherId) {
        // Verify AI's choice is actually eligible
        const aiChoice = pool.find(c => c.teacher.id === aiDecision.teacherId);
        if (aiChoice) {
          best = aiChoice;
          // Append AI reasoning to the reason
          const algoReason = buildAssignmentReason(best);
          best = {
            ...best,
            aiReasoning: aiDecision.reasoning || null,
            reason: aiDecision.reasoning
              ? `${algoReason} | AI: ${aiDecision.reasoning}`
              : algoReason,
          };
        } else {
          // AI chose an ineligible teacher — fall back to top algorithmic
          best = { ...pool[0], aiReasoning: null, reason: buildAssignmentReason(pool[0]) };
        }
      } else {
        // No AI decision for this substitution — use algorithmic top pick
        best = { ...pool[0], aiReasoning: null, reason: buildAssignmentReason(pool[0]) };
      }

      // Check if the chosen teacher is still available (might have been assigned in a previous iteration)
      const currentWorkload = workloadMap.get(best.teacher.id);
      if (currentWorkload && (currentWorkload.regularPeriods.has(period) || currentWorkload.substitutionPeriods.has(period))) {
        // Teacher got busy since initial check — try next candidate
        const nextBest = pool.find(c => {
          const wl = workloadMap.get(c.teacher.id);
          if (!wl) return false;
          return !wl.regularPeriods.has(period) && !wl.substitutionPeriods.has(period);
        });

        if (nextBest) {
          best = { ...nextBest, aiReasoning: null, reason: buildAssignmentReason(nextBest) };
        } else {
          failed++;
          assignments.push({
            substitutionId: sub.id,
            period: sub.period,
            grade: sub.grade,
            section: sub.section,
            subject: sub.subject,
            assignedTeacher: null,
            assignedTeacherSubject: null,
            score: 0,
            reason: 'Teacher became unavailable during assignment — requires manual assignment',
            aiReasoning: null,
          });
          continue;
        }
      }

      // Assign the best teacher
      await db.substitution.update({
        where: { id: sub.id },
        data: {
          substituteId: best.teacher.id,
          status: 'assigned',
        },
        include: {
          absentTeacher: true,
          substitute: true,
        },
      });

      // Update workload map for this teacher
      const workload = workloadMap.get(best.teacher.id);
      if (workload) {
        workload.substitutionPeriods.add(period);
      }

      assignments.push({
        substitutionId: sub.id,
        period: sub.period,
        grade: sub.grade,
        section: sub.section,
        subject: sub.subject,
        assignedTeacher: best.teacher.name,
        assignedTeacherSubject: best.teacher.subject,
        score: best.score,
        reason: best.reason || buildAssignmentReason(best),
        aiReasoning: best.aiReasoning,
      });

      assigned++;
    }

    // Generate substitute context for all assigned substitutions (fire-and-forget)
    for (const assignment of assignments) {
      if (assignment.assignedTeacher) {
        try {
          fetch('/api/biometric/generate-sub-context', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ substitutionId: assignment.substitutionId }),
          }).catch(() => {});
        } catch {
          // Non-critical
        }
      }
    }

    return NextResponse.json({
      success: true,
      date: assignDate,
      totalPending: pendingSubs.length,
      assigned,
      failed,
      assignments,
      message: `AI assigned ${assigned} of ${pendingSubs.length} substitutions${failed > 0 ? `. ${failed} require manual assignment.` : ''}`,
    });
  } catch (error) {
    console.error('Error in AI bulk assignment:', error);
    return NextResponse.json({ error: 'Failed to assign substitutes' }, { status: 500 });
  }
}

function buildAssignmentReason(best: {
  teacher?: { subject?: string; name?: string };
  teachesSubject?: boolean;
  teachesGrade?: boolean;
  teachesSimilarGrade?: boolean;
  totalWorkload?: number;
  hasClassFamiliarity?: boolean;
  score?: number;
}): string {
  const reasons: string[] = [];
  if (best.teachesSubject) reasons.push('Subject specialist match');
  if (best.teachesGrade) reasons.push('Teaches this grade');
  else if (best.teachesSimilarGrade) reasons.push('Teaches similar grade');
  if (best.hasClassFamiliarity) reasons.push('Familiar with this class/section');
  if (best.totalWorkload !== undefined) reasons.push(`Workload: ${best.totalWorkload}/${MAX_PERIODS_PER_DAY} periods`);
  if (reasons.length === 0) reasons.push(`Score: ${best.score || 0}`);
  return reasons.join(' \u2022 ');
}
