import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { detectAndCreateSubstitutionRequests } from '@/lib/services/ai-agent';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { teacherId, type, startDate, endDate, reason, approvedBy, status } = body;

    if (!teacherId) {
      return NextResponse.json(
        { success: false, error: 'Teacher ID is required' },
        { status: 400 }
      );
    }

    if (!type) {
      return NextResponse.json(
        { success: false, error: 'Leave type is required' },
        { status: 400 }
      );
    }

    if (!startDate) {
      return NextResponse.json(
        { success: false, error: 'Start date is required' },
        { status: 400 }
      );
    }

    if (!endDate) {
      return NextResponse.json(
        { success: false, error: 'End date is required' },
        { status: 400 }
      );
    }

    if (!reason) {
      return NextResponse.json(
        { success: false, error: 'Reason is required' },
        { status: 400 }
      );
    }

    // Validate date formats
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
      return NextResponse.json(
        { success: false, error: 'Invalid date format. Use YYYY-MM-DD' },
        { status: 400 }
      );
    }

    // Validate date range
    if (new Date(startDate) > new Date(endDate)) {
      return NextResponse.json(
        { success: false, error: 'Start date cannot be after end date' },
        { status: 400 }
      );
    }

    // Verify teacher exists
    const teacher = await db.teacher.findUnique({
      where: { id: teacherId },
    });

    if (!teacher) {
      return NextResponse.json(
        { success: false, error: 'Teacher not found' },
        { status: 404 }
      );
    }

    const leaveStatus = status || 'PENDING';

    // Create the leave request
    const leave = await db.leave.create({
      data: {
        teacherId,
        type,
        startDate,
        endDate,
        reason,
        status: leaveStatus,
        approvedBy: approvedBy || null,
      },
    });

    // If the leave is approved, trigger substitution detection for each date in range
    let substitutionResults: unknown[] = [];
    if (leaveStatus === 'APPROVED') {
      try {
        const start = new Date(startDate);
        const end = new Date(endDate);

        // Loop through each day in the date range
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          const dayOfWeek = d.getDay();
          // Only process weekdays (Monday-Friday)
          if (dayOfWeek >= 1 && dayOfWeek <= 5) {
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            const dateStr = `${year}-${month}-${day}`;

            const results = await detectAndCreateSubstitutionRequests(dateStr);
            substitutionResults.push({
              date: dateStr,
              substitutionsDetected: results.length,
              results,
            });
          }
        }
      } catch (detectionError) {
        console.error('[LEAVE DETECT ERROR]', detectionError);
        substitutionResults = [{
          error: 'Substitution detection failed for some dates in leave range',
        }];
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        leave,
        substitutionDetection: leaveStatus === 'APPROVED'
          ? {
              triggered: true,
              datesProcessed: substitutionResults.length,
              results: substitutionResults,
            }
          : {
              triggered: false,
              message: 'Leave is pending approval. Substitution detection will run when approved.',
            },
      },
    });
  } catch (error) {
    console.error('[LEAVES APPLY ERROR]', error);
    const message = error instanceof Error ? error.message : 'Failed to apply leave';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
