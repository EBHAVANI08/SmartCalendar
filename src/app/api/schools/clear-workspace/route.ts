import { db } from '@/lib/db';
import { clearSchoolWorkspace } from '@/lib/clear-school-workspace';
import { resolveSchoolId } from '@/lib/school-helper';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const schoolId = await resolveSchoolId(body.schoolId);

    if (body.confirm !== true) {
      return NextResponse.json(
        { error: 'This permanently deletes all timetable, teacher, and calendar data for the school. Send confirm: true to proceed.' },
        { status: 400 },
      );
    }

    if (!schoolId) {
      return NextResponse.json({ error: 'School workspace not found.' }, { status: 404 });
    }

    const school = await db.school.findUnique({
      where: { id: schoolId },
      select: { id: true, name: true, code: true, email: true },
    });

    if (!school) {
      return NextResponse.json({ error: `School workspace not found for id ${schoolId}.` }, { status: 404 });
    }

    const cleared = await clearSchoolWorkspace(schoolId, {
      clearUnassigned: body.clearUnassigned === true,
    });

    return NextResponse.json({
      success: true,
      message: `Cleared all workspace data for ${school.name}. Login account kept; you can upload fresh data now.`,
      school,
      cleared,
    });
  } catch (error) {
    console.error('Error clearing school workspace:', error);
    return NextResponse.json({ error: `Failed to clear school workspace: ${String(error)}` }, { status: 500 });
  }
}
