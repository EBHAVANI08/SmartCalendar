import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { findSubstituteCandidates } from '@/lib/services/ai-agent';

/**
 * POST /api/ai-agent/pre-arrange
 * Pre-arrange a substitute for a predicted absence.
 * Creates a DRAFT SubstitutionRequest + SubstitutionAssignment (status: DRAFT)
 * that the admin can one-click confirm.
 *
 * Body: { predictionId: string, scheduleId: string, date: string }
 */
export async function POST(request: NextRequest) {
  try {
    const { predictionId, scheduleId, date } = await request.json();

    if (!predictionId || !scheduleId || !date) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }

    // Get the prediction
    const prediction = await db.absencePrediction.findUnique({
      where: { id: predictionId },
      include: { teacher: true },
    });

    if (!prediction) {
      return NextResponse.json({ success: false, error: 'Prediction not found' }, { status: 404 });
    }

    // Get the schedule for this period
    const schedule = await db.schedule.findUnique({
      where: { id: scheduleId },
      include: { subject: true, grade: true, section: true, timeSlot: true, teacher: true },
    });

    if (!schedule) {
      return NextResponse.json({ success: false, error: 'Schedule not found' }, { status: 404 });
    }

    // Check if a substitution request already exists for this schedule+date
    const existingRequest = await db.substitutionRequest.findFirst({
      where: { scheduleId: schedule.id, date, status: { in: ['PENDING', 'ASSIGNED', 'RESOLVED', 'DRAFT'] } },
    });

    if (existingRequest) {
      return NextResponse.json({
        success: false,
        error: 'A substitution request already exists for this period',
        data: { existingRequestId: existingRequest.id },
      }, { status: 409 });
    }

    // Find substitute candidates
    const dayOfWeek = new Date(date + 'T00:00:00').getDay();
    const scheduleDay = dayOfWeek >= 1 && dayOfWeek <= 5 ? dayOfWeek : 1;

    const candidates = await findSubstituteCandidates({
      subjectId: schedule.subjectId,
      gradeLevel: schedule.grade.level,
      date,
      dayOfWeek: scheduleDay,
      timeSlotId: schedule.timeSlotId,
      absentTeacherId: prediction.teacherId,
      sectionId: schedule.sectionId,
      absentTeacherDepartment: prediction.teacher.department || undefined,
    });

    // Get the best available candidate
    const bestCandidate = candidates.find(c => c.isAvailable);

    if (!bestCandidate) {
      // Create a DRAFT request with no assignment (needs admin intervention)
      const request = await db.substitutionRequest.create({
        data: {
          scheduleId: schedule.id,
          originalTeacherId: prediction.teacherId,
          subjectId: schedule.subjectId,
          date,
          reason: 'PREDICTED_ABSENCE',
          reasonDetail: `Predicted absence (risk score: ${prediction.riskScore}/100). Signals: ${prediction.signals}`,
          status: 'DRAFT',
          aiRecommendation: `Pre-arranged based on prediction engine. No auto-candidate found. ${candidates.length} candidates evaluated.`,
        },
      });

      // Mark prediction as resolved
      await db.absencePrediction.update({
        where: { id: predictionId },
        data: { resolved: true },
      });

      return NextResponse.json({
        success: true,
        data: {
          requestId: request.id,
          status: 'DRAFT',
          hasAssignment: false,
          message: 'Draft created but no candidate found. Admin needs to assign manually.',
          candidates: candidates.slice(0, 5).map(c => ({
            teacherId: c.teacherId,
            name: c.teacherName,
            score: c.score,
            reasons: c.reasons.slice(0, 3),
            teachesSameSubject: c.teachesSameSubject,
            isAvailable: c.isAvailable,
          })),
        },
      });
    }

    // Create DRAFT request + assignment
    const request = await db.substitutionRequest.create({
      data: {
        scheduleId: schedule.id,
        originalTeacherId: prediction.teacherId,
        subjectId: schedule.subjectId,
        date,
        reason: 'PREDICTED_ABSENCE',
        reasonDetail: `Predicted absence (risk score: ${prediction.riskScore}/100). Signals: ${prediction.signals}`,
        status: 'DRAFT',
        aiRecommendation: `Pre-arranged: ${bestCandidate.teacherName} (score: ${bestCandidate.score}). ${bestCandidate.reasons.slice(0, 2).join('. ')}`,
      },
    });

    const assignment = await db.substitutionAssignment.create({
      data: {
        substitutionRequestId: request.id,
        substituteTeacherId: bestCandidate.teacherId,
        status: 'DRAFT',
        assignedBy: 'AI_PREDICTION',
        topic: `Pre-arranged for predicted absence`,
        reasons: JSON.stringify(bestCandidate.reasons.slice(0, 3)),
        aiConfidence: Math.min(100, Math.max(0, bestCandidate.score)),
        proposedAt: new Date(),
      },
    });

    // Mark prediction as resolved
    await db.absencePrediction.update({
      where: { id: predictionId },
      data: { resolved: true },
    });

    return NextResponse.json({
      success: true,
      data: {
        requestId: request.id,
        assignmentId: assignment.id,
        status: 'DRAFT',
        hasAssignment: true,
        substituteTeacherId: bestCandidate.teacherId,
        substituteTeacherName: bestCandidate.teacherName,
        score: bestCandidate.score,
        aiConfidence: assignment.aiConfidence,
        reasons: bestCandidate.reasons.slice(0, 3),
        schedule: {
          subject: schedule.subject.name,
          grade: schedule.grade.name,
          section: schedule.section.name,
          timeSlot: schedule.timeSlot.name,
          startTime: schedule.timeSlot.startTime,
          endTime: schedule.timeSlot.endTime,
        },
      },
    });
  } catch (error: any) {
    console.error('Pre-arrange error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
