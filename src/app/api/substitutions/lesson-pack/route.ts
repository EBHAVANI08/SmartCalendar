import { NextRequest, NextResponse } from 'next/server';
import { generateLessonPack } from '@/lib/services/lesson-pack';

/**
 * GET /api/substitutions/lesson-pack?assignmentId=xxx
 * Generate and return a lesson pack for a substitution assignment.
 */
export async function GET(request: NextRequest) {
  try {
    const assignmentId = request.nextUrl.searchParams.get('assignmentId');
    if (!assignmentId) {
      return NextResponse.json({ success: false, error: 'assignmentId is required' }, { status: 400 });
    }

    const pack = await generateLessonPack(assignmentId);
    if (!pack) {
      return NextResponse.json({ success: false, error: 'Assignment not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: pack });
  } catch (error: any) {
    console.error('Lesson pack error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
